alter table public.companies
  add column if not exists registration_number text not null default '',
  add column if not exists country text not null default '',
  add column if not exists city text not null default '',
  add column if not exists office_address text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists website text not null default '';

create table if not exists public.invoice_sequences (
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_year integer not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (company_id, invoice_year)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_number text not null,
  recipient_type text not null check (recipient_type in ('contractor', 'supplier', 'candidate')),
  recipient_id uuid not null,
  recipient_name text not null check (length(trim(recipient_name)) between 1 and 200),
  description text not null check (length(trim(description)) between 1 and 2000),
  amount numeric(14, 2) not null check (amount > 0),
  due_date date not null,
  issued_at date not null default current_date,
  status text not null default 'sent' check (status in ('draft', 'sent', 'partially_paid', 'paid')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, invoice_number)
);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  invoice_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  received_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (invoice_id, company_id) references public.invoices (id, company_id) on delete cascade
);

create index if not exists invoices_company_issued_idx on public.invoices (company_id, issued_at desc);
create index if not exists invoice_payments_company_invoice_idx on public.invoice_payments (company_id, invoice_id, paid_at desc);
drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create or replace function public.validate_invoice_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_type = 'contractor' then
    select contractor.company_name into new.recipient_name
    from public.employers contractor
    where contractor.id = new.recipient_id and contractor.company_id = new.company_id;
  elsif new.recipient_type = 'supplier' then
    select supplier.supplier_name into new.recipient_name
    from public.suppliers supplier
    where supplier.id = new.recipient_id and supplier.company_id = new.company_id;
  else
    select concat_ws(' ', candidate.first_name, candidate.last_name) into new.recipient_name
    from public.candidates candidate
    where candidate.id = new.recipient_id and candidate.company_id = new.company_id;
  end if;

  if new.recipient_name is null then
    raise exception 'Invoice recipient must belong to the same company' using errcode = '23503';
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_validate_recipient on public.invoices;
create trigger invoices_validate_recipient before insert on public.invoices
  for each row execute function public.validate_invoice_recipient();
revoke all on function public.validate_invoice_recipient() from public, anon, authenticated;

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sequence_year integer := extract(year from coalesce(new.issued_at, current_date))::integer;
  sequence_number integer;
begin
  insert into public.invoice_sequences (company_id, invoice_year, last_number)
  values (new.company_id, sequence_year, 1)
  on conflict (company_id, invoice_year) do update
    set last_number = public.invoice_sequences.last_number + 1
  returning last_number into sequence_number;

  new.invoice_number := 'INV-' || sequence_year::text || '-' || lpad(sequence_number::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists invoices_assign_invoice_number on public.invoices;
create trigger invoices_assign_invoice_number before insert on public.invoices
  for each row execute function public.assign_invoice_number();
revoke all on function public.assign_invoice_number() from public, anon, authenticated;

drop function if exists public.list_invoice_recipients();
create or replace function public.list_invoice_recipients(requested_company_id uuid)
returns table (recipient_type text, recipient_id uuid, recipient_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'contractor'::text, contractor.id, contractor.company_name
  from public.employers contractor
  where contractor.company_id = requested_company_id
    and public.current_user_has_company_permission(contractor.company_id, 'finance.view')
  union all
  select 'supplier'::text, supplier.id, supplier.supplier_name
  from public.suppliers supplier
  where supplier.company_id = requested_company_id
    and public.current_user_has_company_permission(supplier.company_id, 'finance.view')
  union all
  select 'candidate'::text, candidate.id, concat_ws(' ', candidate.first_name, candidate.last_name)
  from public.candidates candidate
  where candidate.company_id = requested_company_id
    and public.current_user_has_company_permission(candidate.company_id, 'finance.view');
$$;
revoke all on function public.list_invoice_recipients(uuid) from public, anon;
grant execute on function public.list_invoice_recipients(uuid) to authenticated;

create or replace function public.record_invoice_payment(requested_invoice_id uuid, payment_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_record public.invoices%rowtype;
  previous_payments numeric(14, 2);
  payment_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into invoice_record
  from public.invoices invoice
  where invoice.id = requested_invoice_id
  for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not public.current_user_has_company_permission(invoice_record.company_id, 'finance.create') then
    raise exception 'Finance permission required' using errcode = '42501';
  end if;
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  select coalesce(sum(payment.amount), 0)::numeric(14, 2) into previous_payments
  from public.invoice_payments payment
  where payment.invoice_id = invoice_record.id and payment.company_id = invoice_record.company_id;
  if payment_amount > invoice_record.amount - previous_payments then
    raise exception 'Payment exceeds the outstanding invoice balance' using errcode = '22023';
  end if;

  insert into public.invoice_payments (company_id, invoice_id, amount, received_by)
  values (invoice_record.company_id, invoice_record.id, payment_amount, (select auth.uid()))
  returning id into payment_id;

  update public.invoices
  set status = case
    when previous_payments + payment_amount >= invoice_record.amount then 'paid'
    else 'partially_paid'
  end
  where id = invoice_record.id;

  return payment_id;
end;
$$;
revoke all on function public.record_invoice_payment(uuid, numeric) from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric) to authenticated;

alter table public.invoices enable row level security;
alter table public.invoice_payments enable row level security;

drop policy if exists "Invoices are tenant and permission scoped" on public.invoices;
create policy "Invoices are tenant and permission scoped" on public.invoices
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );
drop policy if exists "Authorized users can create invoices" on public.invoices;
create policy "Authorized users can create invoices" on public.invoices
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );
drop policy if exists "Invoice payments are tenant and permission scoped" on public.invoice_payments;
create policy "Invoice payments are tenant and permission scoped" on public.invoice_payments
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

drop policy if exists "Finance users can view company invoice details" on public.companies;
create policy "Finance users can view company invoice details" on public.companies
  for select to authenticated using (
    public.current_user_has_company_permission(id, 'finance.view')
  );

grant select, insert on public.invoices to authenticated;
grant select on public.invoice_payments to authenticated;