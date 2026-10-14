create or replace function public.ensure_company_staff_member(
  requested_company_id uuid,
  requested_user_id uuid,
  requested_role_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_owner_id uuid;
  company_owner_name text;
  employee_name text;
  employee_position text;
  initials text;
  prefix text;
  assigned_sequence integer;
  staff_member_id uuid;
begin
  select company.primary_admin_user_id into company_owner_id
  from public.companies company where company.id = requested_company_id;

  select coalesce(nullif(profile.display_name, ''), nullif(owner_user.raw_user_meta_data ->> 'full_name', ''), 'Staff')
  into company_owner_name
  from auth.users owner_user
  left join public.profiles profile on profile.id = owner_user.id
  where owner_user.id = company_owner_id;
  company_owner_name := coalesce(company_owner_name, 'Staff');

  select coalesce(nullif(profile.display_name, ''), nullif(member_user.raw_user_meta_data ->> 'full_name', ''), 'New Staff Member')
  into employee_name
  from auth.users member_user
  left join public.profiles profile on profile.id = member_user.id
  where member_user.id = requested_user_id;
  employee_name := coalesce(employee_name, 'New Staff Member');

  select role.name into employee_position
  from public.company_roles role
  where role.id = requested_role_id and role.company_id = requested_company_id;
  employee_position := coalesce(employee_position, 'Staff Member');

  select string_agg(upper(left(parts.part, 1)), '' order by parts.ordinality)
  into initials
  from regexp_split_to_table(company_owner_name, '\s+') with ordinality as parts(part, ordinality)
  where parts.part <> '';
  prefix := left(regexp_replace(coalesce(initials, 'STAFF'), '[^A-Z0-9]', '', 'g'), 10);
  if prefix !~ '^[A-Z][A-Z0-9]{0,9}$' then prefix := 'STAFF'; end if;

  insert into public.company_staff_id_settings (company_id, staff_id_prefix, next_sequence)
  values (requested_company_id, prefix, 1)
  on conflict (company_id) do nothing;

  select staff.id into staff_member_id
  from public.company_staff_members staff
  where staff.company_id = requested_company_id and staff.linked_user_id = requested_user_id;

  if staff_member_id is null then
    update public.company_staff_id_settings settings
    set next_sequence = settings.next_sequence + 1
    where settings.company_id = requested_company_id
    returning settings.next_sequence - 1 into assigned_sequence;

    insert into public.company_staff_members (
      company_id, staff_id, name, position, date_joined, linked_user_id, created_by
    ) values (
      requested_company_id,
      (select settings.staff_id_prefix from public.company_staff_id_settings settings where settings.company_id = requested_company_id)
        || '-' || lpad(assigned_sequence::text, 4, '0'),
      employee_name, employee_position, current_date, requested_user_id, requested_user_id
    ) returning id into staff_member_id;
  else
    update public.company_staff_members
    set position = employee_position
    where id = staff_member_id and company_id = requested_company_id;
  end if;

  return staff_member_id;
end;
$$;

alter table public.company_staff_members
  drop constraint if exists company_staff_members_phone_check;
alter table public.company_staff_members
  add constraint company_staff_members_phone_check check (length(trim(phone)) <= 60);

revoke all on function public.ensure_company_staff_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_company_staff_member(uuid, uuid, uuid) to service_role;

create or replace function public.sync_company_membership_staff_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('active', 'invited') then
    perform public.ensure_company_staff_member(new.company_id, new.user_id, new.role_id);
  end if;
  return new;
end;
$$;

drop trigger if exists company_memberships_sync_staff_record on public.company_memberships;
create trigger company_memberships_sync_staff_record
  after insert or update of role_id on public.company_memberships
  for each row execute function public.sync_company_membership_staff_record();
revoke all on function public.sync_company_membership_staff_record() from public, anon, authenticated;

select public.ensure_company_staff_member(membership.company_id, membership.user_id, membership.role_id)
from public.company_memberships membership
where membership.status in ('active', 'invited');

create table if not exists public.company_staff_paychecks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_member_id uuid not null,
  pay_period date not null check (date_trunc('month', pay_period)::date = pay_period),
  base_salary numeric(14, 2) not null check (base_salary >= 0),
  earnings jsonb not null default '[]'::jsonb check (jsonb_typeof(earnings) = 'array'),
  benefits jsonb not null default '[]'::jsonb check (jsonb_typeof(benefits) = 'array'),
  deductions jsonb not null default '[]'::jsonb check (jsonb_typeof(deductions) = 'array'),
  gross_amount numeric(14, 2) not null check (gross_amount >= 0),
  benefits_total numeric(14, 2) not null check (benefits_total >= 0),
  deductions_total numeric(14, 2) not null check (deductions_total >= 0),
  net_amount numeric(14, 2) not null check (net_amount >= 0),
  payment_date date not null,
  payment_method text not null check (length(trim(payment_method)) between 1 and 60),
  payment_reference text not null default '' check (length(payment_reference) <= 200),
  payslip_path text not null unique,
  paid_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (staff_member_id, company_id)
    references public.company_staff_members (id, company_id) on delete restrict,
  unique (company_id, staff_member_id, pay_period),
  check (net_amount = gross_amount + benefits_total - deductions_total),
  check (payslip_path like 'company/' || company_id::text || '/finance/%'),
  check (payslip_path not like '%..%'),
  check (position(E'\\' in payslip_path) = 0)
);

create index if not exists company_staff_paychecks_company_period_idx
  on public.company_staff_paychecks (company_id, pay_period desc, payment_date desc);

alter table public.company_staff_paychecks enable row level security;
revoke all on public.company_staff_paychecks from public, anon, authenticated;
grant select, insert, update, delete on public.company_staff_paychecks to service_role;