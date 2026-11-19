alter function public.delete_company_expense(uuid, uuid)
  set schema private;
alter function private.delete_company_expense(uuid, uuid)
  rename to delete_company_expense_impl;

alter function public.delete_finance_transaction(uuid, text, uuid)
  set schema private;
alter function private.delete_finance_transaction(uuid, text, uuid)
  rename to delete_finance_transaction_impl;

grant usage on schema private to authenticated;

revoke all on function private.delete_company_expense_impl(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.delete_company_expense_impl(uuid, uuid)
  to authenticated;

revoke all on function private.delete_finance_transaction_impl(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function private.delete_finance_transaction_impl(uuid, text, uuid)
  to authenticated;

create or replace function public.delete_company_expense(
  requested_company_id uuid,
  requested_expense_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.delete_company_expense_impl(
    requested_company_id,
    requested_expense_id
  );
$function$;

revoke all on function public.delete_company_expense(uuid, uuid)
  from public, anon;
grant execute on function public.delete_company_expense(uuid, uuid)
  to authenticated;

create or replace function public.delete_finance_transaction(
  requested_company_id uuid,
  requested_record_type text,
  requested_record_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private.delete_finance_transaction_impl(
    requested_company_id,
    requested_record_type,
    requested_record_id
  );
$function$;

revoke all on function public.delete_finance_transaction(uuid, text, uuid)
  from public, anon;
grant execute on function public.delete_finance_transaction(uuid, text, uuid)
  to authenticated;