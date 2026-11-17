create or replace function public.delete_company_staff_paycheck(
  requested_company_id uuid,
  requested_paycheck_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  paycheck_row public.company_staff_paychecks%rowtype;
begin
  if actor_id is null or not exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    where membership.company_id = requested_company_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and lower(btrim(role.name)) = 'chairman'
  ) then
    raise exception 'Only the company Chairman can delete paychecks.'
      using errcode = '42501';
  end if;

  select *
  into paycheck_row
  from public.company_staff_paychecks paycheck
  where paycheck.id = requested_paycheck_id
    and paycheck.company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Company paycheck not found.'
      using errcode = 'P0002';
  end if;

  delete from public.workspace_notifications
  where company_id = requested_company_id
    and source_type = 'finance.paycheck'
    and source_id = paycheck_row.id;

  delete from public.company_account_transactions
  where company_id = requested_company_id
    and source_type = 'company_staff_paychecks'
    and source_id = paycheck_row.id;

  delete from public.company_staff_paychecks
  where id = paycheck_row.id
    and company_id = requested_company_id;

  return jsonb_build_object(
    'paycheckId', paycheck_row.id,
    'payslipPath', paycheck_row.payslip_path
  );
end;
$function$;

revoke all on function public.delete_company_staff_paycheck(uuid, uuid)
  from public, anon;
grant execute on function public.delete_company_staff_paycheck(uuid, uuid)
  to authenticated;
