create table if not exists public.company_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  account_type text not null check (account_type in ('cash', 'bank', 'mobile_money', 'project', 'other')),
  account_number text not null default '' check (length(account_number) <= 100),
  description text not null default '' check (length(description) <= 500),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create unique index if not exists company_accounts_name_uidx
  on public.company_accounts (company_id, lower(name));
create index if not exists company_accounts_company_status_idx
  on public.company_accounts (company_id, status, lower(name));

create table if not exists public.company_account_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null,
  transaction_type text not null check (transaction_type in ('opening_balance', 'deposit', 'withdrawal', 'income', 'expense', 'invoice_payment', 'payroll')),
  direction text not null check (direction in ('credit', 'debit')),
  amount numeric(14, 2) not null check (amount > 0),
  transaction_date date not null default current_date,
  payment_method text not null default 'Other' check (length(trim(payment_method)) between 1 and 60),
  reference text not null check (length(trim(reference)) between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 500),
  source_type text not null,
  source_id uuid,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (account_id, company_id)
    references public.company_accounts (id, company_id) on delete restrict
);

create unique index if not exists company_account_transactions_source_uidx
  on public.company_account_transactions (company_id, source_type, source_id)
  where source_id is not null;
create index if not exists company_account_transactions_account_date_idx
  on public.company_account_transactions (company_id, account_id, transaction_date desc, created_at desc);

create table if not exists public.company_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  account_id uuid not null,
  expense_type text not null check (length(trim(expense_type)) between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 500),
  paid_to text not null default '' check (length(paid_to) <= 200),
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (length(trim(payment_method)) between 1 and 60),
  reference text not null check (length(trim(reference)) between 1 and 100),
  paid_at date not null default current_date,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (account_id, company_id)
    references public.company_accounts (id, company_id) on delete restrict
);

create index if not exists company_expenses_company_paid_idx
  on public.company_expenses (company_id, paid_at desc);

alter table public.financial_receipts add column if not exists account_id uuid;
alter table public.financial_receipts
  add constraint financial_receipts_account_company_fk
  foreign key (account_id, company_id) references public.company_accounts (id, company_id) on delete restrict;

alter table public.invoice_payments add column if not exists account_id uuid;
alter table public.invoice_payments
  add constraint invoice_payments_account_company_fk
  foreign key (account_id, company_id) references public.company_accounts (id, company_id) on delete restrict;

alter table public.company_staff_paychecks add column if not exists account_id uuid;
alter table public.company_staff_paychecks
  add constraint company_staff_paychecks_account_company_fk
  foreign key (account_id, company_id) references public.company_accounts (id, company_id) on delete restrict;

drop trigger if exists company_accounts_set_updated_at on public.company_accounts;
create trigger company_accounts_set_updated_at before update on public.company_accounts
  for each row execute function public.set_updated_at();

create or replace function public.post_company_account_ledger_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_kind text;
  entry_direction text;
  entry_amount numeric(14, 2);
  entry_date date;
  entry_method text;
  entry_reference text;
  entry_description text;
  entry_actor uuid;
begin
  if new.account_id is null then
    raise exception 'Select a company account for this transaction' using errcode = '23502';
  end if;
  if not exists (
    select 1 from public.company_accounts account
    where account.id = new.account_id and account.company_id = new.company_id and account.status = 'active'
  ) then
    raise exception 'Select an active account for this company' using errcode = '23503';
  end if;

  if tg_table_name = 'financial_receipts' then
    transaction_kind := 'income';
    entry_direction := 'credit';
    entry_amount := new.amount;
    entry_date := new.received_at::date;
    entry_method := new.payment_method;
    entry_reference := new.receipt_number;
    entry_description := new.category || ': ' || new.received_from;
    entry_actor := new.created_by;
  elsif tg_table_name = 'invoice_payments' then
    transaction_kind := 'invoice_payment';
    entry_direction := 'credit';
    entry_amount := new.amount;
    entry_date := new.paid_at::date;
    entry_method := 'Invoice';
    select invoice.invoice_number into entry_reference
    from public.invoices invoice where invoice.id = new.invoice_id and invoice.company_id = new.company_id;
    entry_description := 'Invoice payment';
    entry_actor := new.received_by;
  elsif tg_table_name = 'company_expenses' then
    transaction_kind := 'expense';
    entry_direction := 'debit';
    entry_amount := new.amount;
    entry_date := new.paid_at;
    entry_method := new.payment_method;
    entry_reference := new.reference;
    entry_description := new.expense_type || ': ' || new.description;
    entry_actor := new.created_by;
  else
    transaction_kind := 'payroll';
    entry_direction := 'debit';
    entry_amount := new.net_amount;
    entry_date := new.payment_date;
    entry_method := new.payment_method;
    entry_reference := new.payment_reference;
    entry_description := 'Monthly paycheck';
    entry_actor := new.paid_by;
  end if;

  insert into public.company_account_transactions (
    company_id, account_id, transaction_type, direction, amount, transaction_date,
    payment_method, reference, description, source_type, source_id, created_by
  ) values (
    new.company_id, new.account_id, transaction_kind, entry_direction, entry_amount, entry_date,
    coalesce(nullif(entry_method, ''), 'Other'), coalesce(nullif(entry_reference, ''), upper(left(transaction_kind, 3)) || '-' || new.id::text),
    entry_description, tg_table_name, new.id, entry_actor
  );
  return new;
end;
$$;

drop trigger if exists financial_receipts_post_account on public.financial_receipts;
create trigger financial_receipts_post_account after insert on public.financial_receipts
  for each row execute function public.post_company_account_ledger_entry();
drop trigger if exists invoice_payments_post_account on public.invoice_payments;
create trigger invoice_payments_post_account after insert on public.invoice_payments
  for each row execute function public.post_company_account_ledger_entry();
drop trigger if exists company_expenses_post_account on public.company_expenses;
create trigger company_expenses_post_account after insert on public.company_expenses
  for each row execute function public.post_company_account_ledger_entry();
drop trigger if exists company_staff_paychecks_post_account on public.company_staff_paychecks;
create trigger company_staff_paychecks_post_account after insert on public.company_staff_paychecks
  for each row execute function public.post_company_account_ledger_entry();
revoke all on function public.post_company_account_ledger_entry() from public, anon, authenticated;

create or replace function public.record_invoice_payment(
  requested_invoice_id uuid,
  payment_amount numeric,
  requested_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_record public.invoices%rowtype;
  previous_payments numeric(14, 2);
  allocated_deposits numeric(14, 2);
  payment_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into invoice_record from public.invoices invoice where invoice.id = requested_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not public.current_user_has_company_permission(invoice_record.company_id, 'finance.create') then
    raise exception 'Finance permission required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.company_accounts account
    where account.id = requested_account_id and account.company_id = invoice_record.company_id and account.status = 'active'
  ) then raise exception 'Active account not found for this company' using errcode = '23503'; end if;
  if payment_amount is null or payment_amount <= 0 then raise exception 'Payment amount must be greater than zero' using errcode = '22023'; end if;

  select coalesce(sum(payment.amount), 0)::numeric(14, 2) into previous_payments
  from public.invoice_payments payment where payment.invoice_id = invoice_record.id and payment.company_id = invoice_record.company_id;
  select coalesce(sum(allocation.amount), 0)::numeric(14, 2) into allocated_deposits
  from public.invoice_deposit_allocations allocation where allocation.invoice_id = invoice_record.id and allocation.company_id = invoice_record.company_id;
  if payment_amount > invoice_record.amount - previous_payments - allocated_deposits then
    raise exception 'Payment exceeds the outstanding invoice balance' using errcode = '22023';
  end if;

  insert into public.invoice_payments (company_id, invoice_id, amount, received_by, account_id)
  values (invoice_record.company_id, invoice_record.id, payment_amount, (select auth.uid()), requested_account_id)
  returning id into payment_id;
  update public.invoices set status = case
    when previous_payments + allocated_deposits + payment_amount >= invoice_record.amount then 'paid' else 'partially_paid' end
  where id = invoice_record.id;
  return payment_id;
end;
$$;

drop function if exists public.record_invoice_payment(uuid, numeric);
revoke all on function public.record_invoice_payment(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric, uuid) to authenticated;

alter table public.company_accounts enable row level security;
alter table public.company_account_transactions enable row level security;
alter table public.company_expenses enable row level security;
revoke all on public.company_accounts, public.company_account_transactions, public.company_expenses from public, anon, authenticated;
grant select, insert, update, delete on public.company_accounts, public.company_account_transactions, public.company_expenses to service_role;