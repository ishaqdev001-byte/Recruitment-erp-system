-- ═══════════════════════════════════════════════════════════════════════════
-- Visa Received & Ticketing pipeline stages
-- Adds:
--   • visa_locked column on candidates (prevents re-submission to other projects)
--   • candidate_travel_sms_queue table (scheduled SMS delivery via pg_cron)
--   • pg_cron + pg_net extensions (must be enabled in Supabase Dashboard first)
--   • A cron job firing every minute to process due SMS rows via pg_net HTTP call
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Lock visa-received candidates from re-submission ───────────────────

alter table public.candidates
  add column if not exists visa_locked boolean not null default false;

-- Mark any candidate whose visaStatus is already 'Received' as locked.
update public.candidates
set visa_locked = true
where trim(coalesce(details ->> 'visaStatus', '')) = 'Received';

-- ─── 2. candidate_travel_sms_queue ─────────────────────────────────────────
-- Each row is one scheduled SMS. The cron job picks rows where
-- send_at <= now() and status = 'queued', sends via SMSUG, then marks done.

create table if not exists public.candidate_travel_sms_queue (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  candidate_id    uuid not null references public.candidates (id) on delete cascade,
  phone           text not null,
  sms_title       text not null check (length(trim(sms_title)) between 1 and 100),
  message         text not null check (length(trim(message)) between 1 and 480),
  sms_type        text not null check (sms_type in (
                    'visa_received',
                    'checkin_reminder',
                    'departure_reminder',
                    'post_departure_thanks'
                  )),
  send_at         timestamptz not null,
  status          text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  sent_at         timestamptz,
  provider_token  text,
  provider_error  text,
  created_at      timestamptz not null default now()
);

create index if not exists candidate_travel_sms_queue_due_idx
  on public.candidate_travel_sms_queue (send_at, status)
  where status = 'queued';

create index if not exists candidate_travel_sms_queue_candidate_idx
  on public.candidate_travel_sms_queue (candidate_id, sms_type);

alter table public.candidate_travel_sms_queue enable row level security;
-- Only accessible via service role; no authenticated RLS policies needed.
grant select, insert, update, delete on public.candidate_travel_sms_queue to service_role;

-- ─── 3. Agent-notification helper table ───────────────────────────────────
-- When visa is received, a task_notification is inserted for the agent user.
-- Reuses the existing task_notifications table (already exists).

-- ─── 4. Enable pg_cron and pg_net extensions ──────────────────────────────
-- IMPORTANT: You must first enable both extensions in the Supabase Dashboard:
--   Database → Extensions → search "pg_cron"  → Enable
--   Database → Extensions → search "pg_net"   → Enable
-- Then run this migration.

create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

-- ─── 5. Store the app base URL in Supabase Vault (run once after deploy) ──
-- Run this in the Supabase SQL editor, replacing the URL with your production URL:
--   select vault.create_secret('https://your-app.com', 'app_base_url');
-- The cron job reads it at runtime.

-- ─── 6. Function called by the cron job ────────────────────────────────────
-- Reads due queued rows, calls the Next.js internal route via pg_net HTTP POST,
-- then marks rows as 'sending' (the route marks them 'sent' or 'failed').

create or replace function public.process_travel_sms_queue()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url      text;
  service_key  text;
  row_rec      record;
begin
  -- Fetch the app base URL from Vault
  select decrypted_secret into app_url
  from vault.decrypted_secrets
  where name = 'app_base_url'
  limit 1;

  if app_url is null then
    raise notice 'process_travel_sms_queue: app_base_url secret not set in Vault. Skipping.';
    return;
  end if;

  -- Read the service role key from Vault
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'supabase_service_role_key'
  limit 1;

  if service_key is null then
    raise notice 'process_travel_sms_queue: supabase_service_role_key secret not set in Vault. Skipping.';
    return;
  end if;

  -- Claim up to 20 due rows atomically
  for row_rec in
    select id
    from public.candidate_travel_sms_queue
    where status = 'queued'
      and send_at <= now()
    order by send_at
    limit 20
    for update skip locked
  loop
    update public.candidate_travel_sms_queue
    set status = 'sending'
    where id = row_rec.id;

    -- Fire HTTP POST to the Next.js internal route
    perform extensions.http_post(
      app_url || '/api/internal/travel-sms',
      json_build_object('id', row_rec.id)::text,
      'application/json',
      ARRAY[
        extensions.http_header('x-internal-secret', service_key),
        extensions.http_header('Content-Type', 'application/json')
      ]
    );
  end loop;
end;
$$;

revoke all on function public.process_travel_sms_queue() from public, anon, authenticated;

-- ─── 7. Schedule the cron job — every minute ───────────────────────────────
-- Remove any existing job first to avoid duplicates on re-run.
select cron.unschedule('process-travel-sms-queue') where exists (
  select 1 from cron.job where jobname = 'process-travel-sms-queue'
);

select cron.schedule(
  'process-travel-sms-queue',
  '* * * * *',
  $$ select public.process_travel_sms_queue(); $$
);

-- ─── 8. Vault secrets to set manually after enabling extensions ────────────
-- Run these in the Supabase SQL editor (replace values with your real ones):
--
--   select vault.create_secret(
--     'https://your-production-app.com',
--     'app_base_url',
--     'Base URL for internal API calls from pg_cron'
--   );
--
--   select vault.create_secret(
--     '<your-service-role-key>',
--     'supabase_service_role_key',
--     'Supabase service role key for internal API auth'
--   );
--
-- These are read at runtime by process_travel_sms_queue().
