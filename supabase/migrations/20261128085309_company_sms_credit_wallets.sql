insert into public.permissions (code, description)
values
  ('communications.sms.credit.view', 'View company SMS credit balance and usage'),
  ('communications.sms.credit.manage', 'Top up company SMS credits')
on conflict (code) do update
set description = excluded.description;

create table public.company_sms_wallets (
  company_id uuid primary key references public.companies(id) on delete cascade,
  currency text not null check (currency in ('UGX', 'KES', 'RWF', 'CDF', 'ZMW', 'XAF', 'XOF', 'SLE')),
  balance numeric(18, 6) not null default 0 check (balance >= 0),
  reserved_balance numeric(18, 6) not null default 0 check (reserved_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved_balance <= balance)
);

create table public.company_sms_topups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference uuid not null unique,
  provider_reference text unique,
  created_by uuid references auth.users(id) on delete set null,
  method text not null check (method in ('mobile_money', 'card')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  wallet_currency text not null check (wallet_currency in ('UGX', 'KES', 'RWF', 'CDF', 'ZMW', 'XAF', 'XOF', 'SLE')),
  requested_credit_amount numeric(18, 6) not null check (requested_credit_amount > 0),
  payment_amount numeric(18, 6) not null check (payment_amount > 0),
  payment_currency text not null check (payment_currency in ('UGX', 'KES', 'RWF', 'CDF', 'ZMW', 'XAF', 'XOF', 'SLE')),
  credit_fx_rate numeric(18, 10) not null check (credit_fx_rate > 0),
  fx_rate_timestamp timestamptz,
  provider_transaction_id text,
  provider_gross_amount numeric(18, 6),
  provider_fee_amount numeric(18, 6),
  provider_net_amount numeric(18, 6),
  credited_amount numeric(18, 6),
  provider_response jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (company_id, reference)
);

create index company_sms_topups_company_created_idx
  on public.company_sms_topups (company_id, created_at desc);

create table public.company_sms_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reference uuid not null,
  entry_type text not null check (entry_type in ('sms_usage', 'topup', 'adjustment')),
  status text not null check (status in ('reserved', 'unknown', 'settled', 'failed')),
  amount numeric(18, 6) not null check (amount > 0),
  currency text not null check (currency in ('UGX', 'KES', 'RWF', 'CDF', 'ZMW', 'XAF', 'XOF', 'SLE')),
  unit_price numeric(18, 6),
  fx_rate numeric(18, 10),
  fx_rate_timestamp timestamptz,
  segment_count integer not null default 0 check (segment_count >= 0),
  recipient_count integer not null default 0 check (recipient_count >= 0),
  source text not null,
  provider_token text,
  details jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (company_id, reference)
);

create index company_sms_credit_ledger_company_created_idx
  on public.company_sms_credit_ledger (company_id, created_at desc);
create index company_sms_credit_ledger_usage_idx
  on public.company_sms_credit_ledger (company_id, created_at desc)
  where entry_type = 'sms_usage' and status = 'settled';

alter table public.sms_queue drop constraint if exists sms_queue_status_check;
alter table public.sms_queue
  add constraint sms_queue_status_check
  check (status = any (array['pending', 'sending', 'sent', 'failed', 'unknown']));

alter table public.company_sms_wallets enable row level security;
alter table public.company_sms_topups enable row level security;
alter table public.company_sms_credit_ledger enable row level security;
revoke all on public.company_sms_wallets, public.company_sms_topups, public.company_sms_credit_ledger
  from public, anon, authenticated;
grant select, insert, update, delete on public.company_sms_wallets, public.company_sms_topups,
  public.company_sms_credit_ledger to service_role;

create function public.reserve_company_sms_credit(
  requested_company_id uuid,
  requested_reference uuid,
  requested_amount numeric,
  requested_currency text,
  requested_unit_price numeric,
  requested_fx_rate numeric,
  requested_fx_rate_timestamp timestamptz,
  requested_segments integer,
  requested_recipients integer,
  requested_source text,
  requested_created_by uuid
)
returns table (outcome text, available_balance numeric, ledger_id uuid)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  wallet public.company_sms_wallets%rowtype;
  existing public.company_sms_credit_ledger%rowtype;
  new_ledger_id uuid;
begin
  if requested_company_id is null or requested_reference is null
    or requested_amount is null or requested_amount <= 0
    or requested_currency is null or requested_unit_price is null
    or requested_unit_price <= 0 or requested_fx_rate is null
    or requested_fx_rate <= 0 or requested_segments is null
    or requested_segments <= 0 or requested_recipients is null
    or requested_recipients <= 0 or requested_source is null then
    raise exception 'Valid company SMS credit reservation details are required.';
  end if;

  insert into public.company_sms_wallets (company_id, currency)
  values (requested_company_id, requested_currency)
  on conflict (company_id) do nothing;

  select * into wallet
  from public.company_sms_wallets
  where company_id = requested_company_id
  for update;

  if wallet.currency <> requested_currency then
    raise exception 'The company SMS wallet currency does not match its company country.';
  end if;

  select * into existing
  from public.company_sms_credit_ledger
  where company_id = requested_company_id and reference = requested_reference;

  if found then
    return query select 'duplicate', wallet.balance - wallet.reserved_balance, existing.id;
    return;
  end if;

  if wallet.balance - wallet.reserved_balance < requested_amount then
    return query select 'insufficient', wallet.balance - wallet.reserved_balance, null::uuid;
    return;
  end if;

  insert into public.company_sms_credit_ledger (
    company_id, reference, entry_type, status, amount, currency, unit_price,
    fx_rate, fx_rate_timestamp, segment_count, recipient_count, source, created_by
  )
  values (
    requested_company_id, requested_reference, 'sms_usage', 'reserved',
    requested_amount, requested_currency, requested_unit_price, requested_fx_rate,
    requested_fx_rate_timestamp, requested_segments, requested_recipients,
    requested_source, requested_created_by
  )
  returning id into new_ledger_id;

  update public.company_sms_wallets
  set reserved_balance = reserved_balance + requested_amount,
      updated_at = now()
  where company_id = requested_company_id;

  return query select 'reserved', wallet.balance - wallet.reserved_balance - requested_amount, new_ledger_id;
end;
$$;

create function public.settle_company_sms_credit(
  requested_ledger_id uuid,
  requested_actual_amount numeric,
  requested_segments integer,
  requested_recipients integer,
  requested_provider_token text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  ledger public.company_sms_credit_ledger%rowtype;
  company_wallet public.company_sms_wallets%rowtype;
  target_company_id uuid;
begin
  select company_id into target_company_id
  from public.company_sms_credit_ledger
  where id = requested_ledger_id;
  if target_company_id is null then
    raise exception 'SMS credit reservation was not found.';
  end if;

  select * into company_wallet
  from public.company_sms_wallets
  where company_id = target_company_id
  for update;

  select * into ledger
  from public.company_sms_credit_ledger
  where id = requested_ledger_id
  for update;

  if ledger.status <> 'reserved' then
    return false;
  end if;
  if requested_actual_amount is null or requested_actual_amount <= 0
    or requested_actual_amount > ledger.amount or requested_segments < 1
    or requested_recipients < 1 then
    raise exception 'Confirmed SMS usage exceeds its reserved credit.';
  end if;

  update public.company_sms_wallets
  set balance = balance - requested_actual_amount,
      reserved_balance = reserved_balance - ledger.amount,
      updated_at = now()
  where company_id = target_company_id;

  update public.company_sms_credit_ledger
  set amount = requested_actual_amount,
      segment_count = requested_segments,
      recipient_count = requested_recipients,
      provider_token = requested_provider_token,
      status = 'settled',
      settled_at = now()
  where id = requested_ledger_id;

  return true;
end;
$$;

create function public.release_company_sms_credit(
  requested_ledger_id uuid,
  requested_status text,
  requested_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  ledger public.company_sms_credit_ledger%rowtype;
  target_company_id uuid;
begin
  if requested_status not in ('unknown', 'failed') then
    raise exception 'SMS credit reservation status is invalid.';
  end if;

  select company_id into target_company_id
  from public.company_sms_credit_ledger
  where id = requested_ledger_id;
  if target_company_id is null then
    raise exception 'SMS credit reservation was not found.';
  end if;

  perform 1 from public.company_sms_wallets
  where company_id = target_company_id
  for update;

  select * into ledger
  from public.company_sms_credit_ledger
  where id = requested_ledger_id
  for update;

  if ledger.status <> 'reserved' then
    return false;
  end if;

  if requested_status = 'failed' then
    update public.company_sms_wallets
    set reserved_balance = reserved_balance - ledger.amount,
        updated_at = now()
    where company_id = target_company_id;
  end if;

  update public.company_sms_credit_ledger
  set status = requested_status, details = requested_details
  where id = requested_ledger_id;
  return true;
end;
$$;

create function public.finalize_company_sms_topup(
  requested_reference uuid,
  requested_status text,
  requested_gross_amount numeric,
  requested_net_amount numeric,
  requested_currency text,
  requested_fee_amount numeric,
  requested_provider_transaction_id text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  topup public.company_sms_topups%rowtype;
  credited numeric(18, 6);
begin
  select * into topup
  from public.company_sms_topups
  where reference = requested_reference;
  if not found then
    raise exception 'SMS top-up was not found.';
  end if;

  perform 1 from public.company_sms_wallets
  where company_id = topup.company_id
  for update;

  select * into topup
  from public.company_sms_topups
  where reference = requested_reference
  for update;

  if topup.status <> 'pending' then
    return false;
  end if;

  if requested_status = 'paid' then
    if requested_currency <> topup.payment_currency
      or requested_gross_amount is distinct from topup.payment_amount
      or requested_net_amount is null or requested_net_amount <= 0
      or requested_net_amount > requested_gross_amount
      or requested_fee_amount is null or requested_fee_amount < 0
      or requested_fee_amount > requested_gross_amount then
      raise exception 'MarzPay settlement does not match the SMS top-up.';
    end if;

    credited := round(requested_net_amount * topup.credit_fx_rate, 6);
    if credited <= 0 then
      raise exception 'The settled SMS top-up credit is invalid.';
    end if;

    update public.company_sms_wallets
    set balance = balance + credited, updated_at = now()
    where company_id = topup.company_id;

    insert into public.company_sms_credit_ledger (
      company_id, reference, entry_type, status, amount, currency, source,
      fx_rate, fx_rate_timestamp, details, created_by, settled_at
    )
    values (
      topup.company_id, topup.reference, 'topup', 'settled', credited,
      topup.wallet_currency, 'marzpay_' || topup.method, topup.credit_fx_rate,
      topup.fx_rate_timestamp,
      jsonb_build_object(
        'provider_gross_amount', requested_gross_amount,
        'provider_net_amount', requested_net_amount,
        'provider_fee_amount', requested_fee_amount,
        'provider_currency', requested_currency,
        'provider_transaction_id', requested_provider_transaction_id
      ),
      topup.created_by, now()
    );

    update public.company_sms_topups
    set status = 'paid',
        provider_transaction_id = requested_provider_transaction_id,
        provider_gross_amount = requested_gross_amount,
        provider_fee_amount = requested_fee_amount,
        provider_net_amount = requested_net_amount,
        credited_amount = credited,
        settled_at = now()
    where id = topup.id;
    return true;
  end if;

  if requested_status not in ('failed', 'cancelled') then
    raise exception 'SMS top-up status is invalid.';
  end if;

  update public.company_sms_topups
  set status = requested_status,
      provider_transaction_id = requested_provider_transaction_id,
      settled_at = now()
  where id = topup.id;
  return true;
end;
$$;

revoke all on function public.reserve_company_sms_credit(uuid, uuid, numeric, text, numeric, numeric, timestamptz, integer, integer, text, uuid)
  from public, anon, authenticated;
revoke all on function public.settle_company_sms_credit(uuid, numeric, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.release_company_sms_credit(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_company_sms_topup(uuid, text, numeric, numeric, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.reserve_company_sms_credit(uuid, uuid, numeric, text, numeric, numeric, timestamptz, integer, integer, text, uuid) to service_role;
grant execute on function public.settle_company_sms_credit(uuid, numeric, integer, integer, text) to service_role;
grant execute on function public.release_company_sms_credit(uuid, text, jsonb) to service_role;
grant execute on function public.finalize_company_sms_topup(uuid, text, numeric, numeric, text, numeric, text) to service_role;

drop function if exists public.recruit_admin_company_usage();
create function public.recruit_admin_company_usage()
returns table (
  company_id uuid,
  active_members bigint,
  candidate_count bigint,
  project_count bigint,
  ai_tokens bigint,
  sms_message_count bigint,
  sms_segment_count bigint,
  sms_spent numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with member_usage as (
    select membership.company_id, count(*)::bigint as active_members
    from public.company_memberships membership
    where membership.status = 'active'
    group by membership.company_id
  ),
  candidate_usage as (
    select candidate.company_id, count(*)::bigint as candidate_count
    from public.candidates candidate
    group by candidate.company_id
  ),
  project_usage as (
    select project.company_id, count(*)::bigint as project_count
    from public.projects project
    group by project.company_id
  ),
  ai_usage as (
    select usage.company_id,
      coalesce(sum(usage.input_tokens::numeric + usage.output_tokens::numeric), 0)::bigint as ai_tokens
    from public.ai_usage_logs usage
    group by usage.company_id
  ),
  sms_usage as (
    select ledger.company_id,
      coalesce(sum(ledger.recipient_count) filter (where ledger.status = 'settled'), 0)::bigint as sms_message_count,
      coalesce(sum(ledger.segment_count::bigint * ledger.recipient_count) filter (where ledger.status = 'settled'), 0)::bigint as sms_segment_count,
      coalesce(sum(ledger.amount) filter (where ledger.status = 'settled'), 0) as sms_spent
    from public.company_sms_credit_ledger ledger
    where ledger.entry_type = 'sms_usage'
    group by ledger.company_id
  )
  select company.id,
    coalesce(members.active_members, 0),
    coalesce(candidates.candidate_count, 0),
    coalesce(projects.project_count, 0),
    coalesce(ai.ai_tokens, 0),
    coalesce(sms.sms_message_count, 0),
    coalesce(sms.sms_segment_count, 0),
    coalesce(sms.sms_spent, 0)
  from public.companies company
  left join member_usage members on members.company_id = company.id
  left join candidate_usage candidates on candidates.company_id = company.id
  left join project_usage projects on projects.company_id = company.id
  left join ai_usage ai on ai.company_id = company.id
  left join sms_usage sms on sms.company_id = company.id;
$$;

revoke all on function public.recruit_admin_company_usage() from public, anon, authenticated;
grant execute on function public.recruit_admin_company_usage() to service_role;