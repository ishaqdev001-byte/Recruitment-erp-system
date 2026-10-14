create table if not exists public.company_payroll_reference_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  reference_prefix text not null check (reference_prefix ~ '^[A-Z][A-Z0-9]{0,9}$'),
  next_sequence bigint not null default 1 check (next_sequence between 1 and 999999999),
  updated_at timestamptz not null default now()
);

drop trigger if exists company_payroll_reference_settings_set_updated_at on public.company_payroll_reference_settings;
create trigger company_payroll_reference_settings_set_updated_at before update on public.company_payroll_reference_settings
  for each row execute function public.set_updated_at();

create or replace function public.allocate_company_payroll_reference(requested_company_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_prefix text;
  assigned_sequence bigint;
begin
  insert into public.company_payroll_reference_settings (company_id, reference_prefix, next_sequence)
  select company.id,
    coalesce(nullif(left(regexp_replace((
      select string_agg(upper(left(parts.part, 1)), '' order by parts.ordinality)
      from regexp_split_to_table(company.name, '\s+') with ordinality as parts(part, ordinality)
      where parts.part <> ''
    ), '[^A-Z0-9]', '', 'g'), 10), ''), 'PAY'),
    1
  from public.companies company
  where company.id = requested_company_id
  on conflict (company_id) do nothing;

  update public.company_payroll_reference_settings settings
  set next_sequence = settings.next_sequence + 1
  where settings.company_id = requested_company_id
  returning settings.reference_prefix, settings.next_sequence - 1
  into assigned_prefix, assigned_sequence;

  if assigned_prefix is null then
    raise exception 'Payroll reference settings could not be allocated for this company';
  end if;

  return assigned_prefix || '-' || lpad(assigned_sequence::text, 6, '0');
end;
$$;

revoke all on function public.allocate_company_payroll_reference(uuid) from public, anon, authenticated;
grant execute on function public.allocate_company_payroll_reference(uuid) to service_role;

create table if not exists public.company_staff_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_member_id uuid not null,
  pay_period date not null check (date_trunc('month', pay_period)::date = pay_period),
  adjustment_type text not null check (adjustment_type in ('benefit', 'deduction')),
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (length(trim(payment_method)) between 1 and 60),
  payment_reference text not null check (length(trim(payment_reference)) between 1 and 40),
  description text not null check (length(trim(description)) between 1 and 200),
  paycheck_id uuid references public.company_staff_paychecks (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (staff_member_id, company_id)
    references public.company_staff_members (id, company_id) on delete restrict,
  unique (company_id, payment_reference, staff_member_id)
);

create index if not exists company_staff_payroll_adjustments_period_idx
  on public.company_staff_payroll_adjustments (company_id, pay_period desc, adjustment_type, staff_member_id);

create unique index if not exists company_staff_paychecks_reference_uidx
  on public.company_staff_paychecks (company_id, payment_reference)
  where payment_reference <> '';

alter table public.company_payroll_reference_settings enable row level security;
alter table public.company_staff_payroll_adjustments enable row level security;
revoke all on public.company_payroll_reference_settings, public.company_staff_payroll_adjustments from public, anon, authenticated;
grant select, insert, update, delete on public.company_payroll_reference_settings, public.company_staff_payroll_adjustments to service_role;