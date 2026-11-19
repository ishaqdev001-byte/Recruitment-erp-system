insert into public.permissions (code, description)
values (
  'finance.delete',
  'Delete cash-in and cash-out finance transactions'
)
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'finance.delete'
from public.company_roles role
where lower(btrim(role.name)) = 'chairman'
on conflict (role_id, permission_code) do nothing;

create or replace function private.seed_chairman_finance_delete_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_system_default and lower(btrim(new.name)) = 'chairman' then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'finance.delete')
    on conflict (role_id, permission_code) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.seed_chairman_finance_delete_permission()
  from public, anon, authenticated;

drop trigger if exists company_roles_seed_finance_delete_permission
  on public.company_roles;
create trigger company_roles_seed_finance_delete_permission
  after insert or update of name, is_system_default on public.company_roles
  for each row
  execute function private.seed_chairman_finance_delete_permission();

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
  if actor_id is null
    or not public.current_user_has_company_permission(
      requested_company_id,
      'finance.delete'
    )
  then
    raise exception 'Finance delete permission required.'
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

create or replace function public.delete_finance_transaction(
  requested_company_id uuid,
  requested_record_type text,
  requested_record_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  receipt_row public.financial_receipts%rowtype;
  payment_row public.invoice_payments%rowtype;
  invoice_row public.invoices%rowtype;
  affected_invoice_ids uuid[];
begin
  if actor_id is null
    or not public.current_user_has_company_permission(
      requested_company_id,
      'finance.delete'
    )
  then
    raise exception 'Finance delete permission required.'
      using errcode = '42501';
  end if;

  if requested_record_id is null
    or requested_record_type is null
    or requested_record_type not in ('receipt', 'invoice_payment', 'company_expense')
  then
    raise exception 'Unsupported finance transaction type.'
      using errcode = '22023';
  end if;

  if requested_record_type = 'company_expense' then
    perform public.delete_company_expense(
      requested_company_id,
      requested_record_id
    );

    return jsonb_build_object(
      'recordType', requested_record_type,
      'recordId', requested_record_id
    );
  end if;

  if requested_record_type = 'receipt' then
    select *
    into receipt_row
    from public.financial_receipts receipt
    where receipt.id = requested_record_id
      and receipt.company_id = requested_company_id
    for update;

    if not found then
      raise exception 'Financial receipt not found.'
        using errcode = 'P0002';
    end if;

    select coalesce(
      array_agg(distinct allocation.invoice_id order by allocation.invoice_id),
      array[]::uuid[]
    )
    into affected_invoice_ids
    from public.invoice_deposit_allocations allocation
    where allocation.company_id = requested_company_id
      and allocation.receipt_id = requested_record_id;

    perform invoice.id
    from public.invoices invoice
    where invoice.company_id = requested_company_id
      and invoice.id = any(affected_invoice_ids)
    order by invoice.id
    for update of invoice;

    delete from public.workspace_notifications
    where company_id = requested_company_id
      and source_type = 'finance.receipt'
      and source_id = receipt_row.id;

    delete from public.company_account_transactions
    where company_id = requested_company_id
      and source_type = 'financial_receipts'
      and source_id = receipt_row.id;

    delete from public.invoice_deposit_allocations
    where company_id = requested_company_id
      and receipt_id = receipt_row.id;

    delete from public.financial_receipts
    where id = receipt_row.id
      and company_id = requested_company_id;

    update public.invoices invoice
    set status = case
          when invoice.status in ('draft', 'cancelled') then invoice.status
          when coalesce((
            select sum(payment.amount)
            from public.invoice_payments payment
            where payment.company_id = invoice.company_id
              and payment.invoice_id = invoice.id
          ), 0) + coalesce((
            select sum(allocation.amount)
            from public.invoice_deposit_allocations allocation
            where allocation.company_id = invoice.company_id
              and allocation.invoice_id = invoice.id
          ), 0) >= invoice.amount then 'paid'
          when coalesce((
            select sum(payment.amount)
            from public.invoice_payments payment
            where payment.company_id = invoice.company_id
              and payment.invoice_id = invoice.id
          ), 0) + coalesce((
            select sum(allocation.amount)
            from public.invoice_deposit_allocations allocation
            where allocation.company_id = invoice.company_id
              and allocation.invoice_id = invoice.id
          ), 0) > 0 then 'partially_paid'
          else 'sent'
        end,
        updated_at = now()
    where invoice.company_id = requested_company_id
      and invoice.id = any(affected_invoice_ids);

    return jsonb_build_object(
      'recordType', requested_record_type,
      'recordId', receipt_row.id,
      'amount', receipt_row.amount,
      'accountId', receipt_row.account_id
    );
  end if;

  select *
  into payment_row
  from public.invoice_payments payment
  where payment.id = requested_record_id
    and payment.company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Invoice payment not found.'
      using errcode = 'P0002';
  end if;

  select *
  into invoice_row
  from public.invoices invoice
  where invoice.id = payment_row.invoice_id
    and invoice.company_id = requested_company_id
  for update;

  if not found then
    raise exception 'Invoice not found.'
      using errcode = 'P0002';
  end if;

  delete from public.workspace_notifications
  where company_id = requested_company_id
    and source_type = 'finance.invoice.payment'
    and source_id = payment_row.id;

  delete from public.company_account_transactions
  where company_id = requested_company_id
    and source_type = 'invoice_payments'
    and source_id = payment_row.id;

  delete from public.invoice_payments
  where id = payment_row.id
    and company_id = requested_company_id;

  update public.invoices invoice
  set status = case
        when invoice.status in ('draft', 'cancelled') then invoice.status
        when coalesce((
          select sum(payment.amount)
          from public.invoice_payments payment
          where payment.company_id = invoice.company_id
            and payment.invoice_id = invoice.id
        ), 0) + coalesce((
          select sum(allocation.amount)
          from public.invoice_deposit_allocations allocation
          where allocation.company_id = invoice.company_id
            and allocation.invoice_id = invoice.id
        ), 0) >= invoice.amount then 'paid'
        when coalesce((
          select sum(payment.amount)
          from public.invoice_payments payment
          where payment.company_id = invoice.company_id
            and payment.invoice_id = invoice.id
        ), 0) + coalesce((
          select sum(allocation.amount)
          from public.invoice_deposit_allocations allocation
          where allocation.company_id = invoice.company_id
            and allocation.invoice_id = invoice.id
        ), 0) > 0 then 'partially_paid'
        else 'sent'
      end,
      updated_at = now()
  where invoice.id = invoice_row.id
    and invoice.company_id = requested_company_id;

  return jsonb_build_object(
    'recordType', requested_record_type,
    'recordId', payment_row.id,
    'amount', payment_row.amount,
    'accountId', payment_row.account_id,
    'invoiceId', invoice_row.id
  );
end;
$function$;

revoke all on function public.delete_finance_transaction(uuid, text, uuid)
  from public, anon;
grant execute on function public.delete_finance_transaction(uuid, text, uuid)
  to authenticated;