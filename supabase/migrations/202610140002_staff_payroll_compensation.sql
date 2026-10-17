alter table public.company_staff_members
  add column if not exists pay_type text not null default 'payroll',
  add column if not exists base_salary numeric(14, 2) not null default 0,
  add column if not exists weekly_transport_allowance numeric(14, 2) not null default 0,
  add column if not exists transport_account_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_staff_members_pay_type_check'
      and conrelid = 'public.company_staff_members'::regclass
  ) then
    alter table public.company_staff_members
      add constraint company_staff_members_pay_type_check
      check (pay_type in ('payroll', 'project', 'no_payroll'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_staff_members_base_salary_check'
      and conrelid = 'public.company_staff_members'::regclass
  ) then
    alter table public.company_staff_members
      add constraint company_staff_members_base_salary_check check (base_salary >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_staff_members_weekly_transport_allowance_check'
      and conrelid = 'public.company_staff_members'::regclass
  ) then
    alter table public.company_staff_members
      add constraint company_staff_members_weekly_transport_allowance_check check (weekly_transport_allowance >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_staff_members_non_payroll_compensation_check'
      and conrelid = 'public.company_staff_members'::regclass
  ) then
    alter table public.company_staff_members
      add constraint company_staff_members_non_payroll_compensation_check
      check (pay_type = 'payroll' or (base_salary = 0 and weekly_transport_allowance = 0 and transport_account_id is null));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_staff_members_transport_account_required_check'
      and conrelid = 'public.company_staff_members'::regclass
  ) then
    alter table public.company_staff_members
      add constraint company_staff_members_transport_account_required_check
      check (weekly_transport_allowance = 0 or transport_account_id is not null);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_staff_members_transport_account_company_fk'
      and conrelid = 'public.company_staff_members'::regclass
  ) then
    alter table public.company_staff_members
      add constraint company_staff_members_transport_account_company_fk
      foreign key (transport_account_id, company_id)
      references public.company_accounts (id, company_id) on delete restrict;
  end if;
end;
$$;