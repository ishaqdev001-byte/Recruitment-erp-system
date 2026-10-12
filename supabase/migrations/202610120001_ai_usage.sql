create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  document_type text not null check (document_type in ('cv', 'medical', 'academic', 'chat')),
  model text not null check (length(model) between 1 and 100),
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

alter table public.ai_usage_logs
  drop constraint if exists ai_usage_logs_document_type_check;
alter table public.ai_usage_logs
  add constraint ai_usage_logs_document_type_check
  check (document_type in ('cv', 'medical', 'academic', 'chat'));

create index if not exists ai_usage_logs_company_created_idx
  on public.ai_usage_logs (company_id, created_at desc);

alter table public.ai_usage_logs enable row level security;
revoke all on public.ai_usage_logs from public, anon;
grant select, insert on public.ai_usage_logs to authenticated;

drop policy if exists "AI usage is visible to candidate viewers" on public.ai_usage_logs;
create policy "AI usage is visible to candidate viewers" on public.ai_usage_logs
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'candidates.view')
  );

drop policy if exists "Candidate viewers can record AI usage" on public.ai_usage_logs;
create policy "Candidate viewers can record AI usage" on public.ai_usage_logs
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'candidates.view')
  );

create or replace function public.company_ai_usage_total(requested_company_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(input_tokens::bigint + output_tokens::bigint), 0)::bigint
  from public.ai_usage_logs
  where company_id = requested_company_id;
$$;

revoke all on function public.company_ai_usage_total(uuid) from public, anon;
grant execute on function public.company_ai_usage_total(uuid) to authenticated;