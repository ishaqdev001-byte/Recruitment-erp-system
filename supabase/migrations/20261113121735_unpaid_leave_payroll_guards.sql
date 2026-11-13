alter table public.company_leave_types
  add column is_paid boolean not null default true;

update public.company_leave_types
set is_paid = name not ilike '%unpaid%';

alter table public.leave_requests
  add column is_paid boolean not null default true;

update public.leave_requests request
set is_paid = leave_type.is_paid
from public.company_leave_types leave_type
where request.company_id = leave_type.company_id
  and request.leave_type_id = leave_type.id;

update public.leave_requests
set is_paid = leave_type not ilike '%unpaid%'
where leave_type_id is null;

create index if not exists leave_requests_approved_payroll_lookup_idx
  on public.leave_requests (company_id, employee_id, start_date, end_date)
  where status = 'approved';

create or replace function public.set_leave_request_paid_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_is_paid boolean;
begin
  if new.leave_type_id is not null then
    select leave_type.is_paid
    into configured_is_paid
    from public.company_leave_types leave_type
    where leave_type.id = new.leave_type_id
      and leave_type.company_id = new.company_id;
  end if;

  new.is_paid := coalesce(
    configured_is_paid,
    new.leave_type not ilike '%unpaid%'
  );
  return new;
end;
$$;

revoke all on function public.set_leave_request_paid_status()
  from public, anon, authenticated;

create trigger set_leave_request_paid_status_before_write
  before insert or update of company_id, leave_type_id, leave_type
  on public.leave_requests
  for each row
  execute function public.set_leave_request_paid_status();

create or replace function public.prevent_paycheck_during_unpaid_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_user_id uuid;
  pay_month_start date;
  pay_month_end date;
begin
  select staff.linked_user_id
  into employee_user_id
  from public.company_staff_members staff
  where staff.id = new.staff_member_id
    and staff.company_id = new.company_id;

  if employee_user_id is null then
    return new;
  end if;

  pay_month_start := date_trunc('month', new.pay_period)::date;
  pay_month_end := (pay_month_start + interval '1 month')::date;

  if exists (
    select 1
    from public.leave_requests request
    where request.company_id = new.company_id
      and request.employee_id = employee_user_id
      and request.status = 'approved'
      and request.is_paid = false
      and coalesce(
        nullif(request.days_count, 0),
        request.end_date - request.start_date + 1
      ) > 6
      and request.start_date < pay_month_end
      and request.end_date >= pay_month_start
  ) then
    raise exception 'No payroll payment is due for a month with more than six days of approved unpaid leave.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.leave_requests request
    where request.company_id = new.company_id
      and request.employee_id = employee_user_id
      and request.status = 'approved'
      and request.is_paid = false
      and (
        new.payment_date between request.start_date and request.end_date
        or current_date between request.start_date and request.end_date
      )
  ) then
    raise exception 'Payroll payments are blocked during approved unpaid leave.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_paycheck_during_unpaid_leave()
  from public, anon, authenticated;

create trigger prevent_paycheck_during_unpaid_leave_before_write
  before insert or update of company_id, staff_member_id, pay_period, payment_date
  on public.company_staff_paychecks
  for each row
  execute function public.prevent_paycheck_during_unpaid_leave();

create or replace function public.prevent_benefit_during_unpaid_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_user_id uuid;
  pay_month_start date;
  pay_month_end date;
begin
  if new.adjustment_type <> 'benefit' then
    return new;
  end if;

  select staff.linked_user_id
  into employee_user_id
  from public.company_staff_members staff
  where staff.id = new.staff_member_id
    and staff.company_id = new.company_id;

  if employee_user_id is null then
    return new;
  end if;

  pay_month_start := date_trunc('month', new.pay_period)::date;
  pay_month_end := (pay_month_start + interval '1 month')::date;

  if exists (
    select 1
    from public.leave_requests request
    where request.company_id = new.company_id
      and request.employee_id = employee_user_id
      and request.status = 'approved'
      and request.is_paid = false
      and coalesce(
        nullif(request.days_count, 0),
        request.end_date - request.start_date + 1
      ) > 6
      and request.start_date < pay_month_end
      and request.end_date >= pay_month_start
  ) then
    raise exception 'Benefits are blocked for a payroll month with more than six days of approved unpaid leave.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.leave_requests request
    where request.company_id = new.company_id
      and request.employee_id = employee_user_id
      and request.status = 'approved'
      and request.is_paid = false
      and current_date between request.start_date and request.end_date
  ) then
    raise exception 'Benefits cannot be recorded during approved unpaid leave.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_benefit_during_unpaid_leave()
  from public, anon, authenticated;

create trigger prevent_benefit_during_unpaid_leave_before_write
  before insert or update of company_id, staff_member_id, pay_period, adjustment_type
  on public.company_staff_payroll_adjustments
  for each row
  execute function public.prevent_benefit_during_unpaid_leave();