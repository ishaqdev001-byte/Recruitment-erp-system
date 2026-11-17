create or replace function public.delete_company_expense(
  requested_company_id uuid,
  requested_expense_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  expense_row public.company_expenses%rowtype;
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
    raise exception 'Only the company Chairman can delete company expenses.'
      using errcode = '42501';
  end if;

  select *
  into expense_row
  from public.company_expenses expense
  where expense.id = requested_expense_id
    and expense.company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Company expense not found.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.expense_requests request
    where request.company_expense_id = expense_row.id
  ) then
    raise exception 'This expense is linked to an Expense Request and cannot be deleted.'
      using errcode = '23503';
  end if;

  delete from public.workspace_notifications
  where company_id = requested_company_id
    and source_type = 'finance.expense'
    and source_id = expense_row.id;

  delete from public.company_account_transactions
  where company_id = requested_company_id
    and source_type = 'company_expenses'
    and source_id = expense_row.id;

  delete from public.company_expenses
  where id = expense_row.id
    and company_id = requested_company_id;

  return jsonb_build_object('expenseId', expense_row.id);
end;
$function$;

revoke all on function public.delete_company_expense(uuid, uuid)
  from public, anon;
grant execute on function public.delete_company_expense(uuid, uuid)
  to authenticated;