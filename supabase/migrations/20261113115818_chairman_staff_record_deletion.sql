create or replace function public.delete_company_staff_member_and_membership(
  requested_company_id uuid,
  requested_staff_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_user_id uuid;
  primary_admin_user_id uuid;
begin
  select company.primary_admin_user_id
  into primary_admin_user_id
  from public.companies company
  where company.id = requested_company_id;

  if not found then
    raise exception 'Company not found.'
      using errcode = 'P0002';
  end if;

  select staff.linked_user_id
  into linked_user_id
  from public.company_staff_members staff
  where staff.id = requested_staff_member_id
    and staff.company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Staff member not found.'
      using errcode = 'P0002';
  end if;

  if linked_user_id = primary_admin_user_id then
    raise exception 'The Chairman staff record cannot be deleted.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.company_staff_members report
    where report.company_id = requested_company_id
      and report.line_manager_staff_id = requested_staff_member_id
      and report.status <> 'Inactive'
  ) then
    raise exception 'Reassign this staff member''s direct reports before deleting their record.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.company_staff_paychecks paycheck
    where paycheck.company_id = requested_company_id
      and paycheck.staff_member_id = requested_staff_member_id
  ) or exists (
    select 1
    from public.company_staff_payroll_adjustments adjustment
    where adjustment.company_id = requested_company_id
      and adjustment.staff_member_id = requested_staff_member_id
  ) then
    raise exception 'This staff member has payroll history. Deactivate the record instead to preserve it.'
      using errcode = 'P0001';
  end if;

  if linked_user_id is not null and exists (
    select 1
    from public.leave_requests request
    where request.company_id = requested_company_id
      and request.reviewed_by = linked_user_id
  ) then
    raise exception 'Reassign leave requests reviewed by this user before removing their company membership.'
      using errcode = 'P0001';
  end if;

  delete from public.company_staff_members
  where id = requested_staff_member_id
    and company_id = requested_company_id;

  if linked_user_id is not null then
    delete from public.company_memberships
    where company_id = requested_company_id
      and user_id = linked_user_id;
  end if;

  return linked_user_id;
end;
$$;

revoke all on function public.delete_company_staff_member_and_membership(
  uuid, uuid
) from public, anon, authenticated;
grant execute on function public.delete_company_staff_member_and_membership(
  uuid, uuid
) to service_role;