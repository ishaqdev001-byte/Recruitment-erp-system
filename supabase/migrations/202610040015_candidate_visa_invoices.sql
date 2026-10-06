alter table public.invoices
  add column if not exists visa_candidate_id uuid references public.candidates (id) on delete set null;

create unique index if not exists invoices_visa_candidate_uidx
  on public.invoices (visa_candidate_id)
  where visa_candidate_id is not null;

create unique index if not exists financial_receipts_id_company_uidx
  on public.financial_receipts (id, company_id);

create table if not exists public.invoice_deposit_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null,
  receipt_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  foreign key (invoice_id, company_id) references public.invoices (id, company_id) on delete cascade,
  foreign key (receipt_id, company_id) references public.financial_receipts (id, company_id) on delete restrict,
  unique (receipt_id)
);

create index if not exists invoice_deposit_allocations_company_invoice_idx
  on public.invoice_deposit_allocations (company_id, invoice_id);

alter table public.invoice_deposit_allocations enable row level security;
drop policy if exists "Invoice deposit allocations are tenant and permission scoped" on public.invoice_deposit_allocations;
create policy "Invoice deposit allocations are tenant and permission scoped" on public.invoice_deposit_allocations
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );
grant select on public.invoice_deposit_allocations to authenticated;

create or replace function public.lock_candidate_for_deposit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type = 'candidate_deposit' then
    perform 1
    from public.candidates candidate
    where candidate.id = new.candidate_id and candidate.company_id = new.company_id
    for update;
    if not found then
      raise exception 'Candidate must belong to the same company' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_receipts_lock_candidate on public.financial_receipts;
create trigger financial_receipts_lock_candidate
  before insert on public.financial_receipts
  for each row execute function public.lock_candidate_for_deposit();
revoke all on function public.lock_candidate_for_deposit() from public, anon, authenticated;

create or replace function public.record_invoice_payment(requested_invoice_id uuid, payment_amount numeric)
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
  select coalesce(sum(allocation.amount), 0)::numeric(14, 2) into allocated_deposits
  from public.invoice_deposit_allocations allocation
  where allocation.invoice_id = invoice_record.id and allocation.company_id = invoice_record.company_id;
  if payment_amount > invoice_record.amount - previous_payments - allocated_deposits then
    raise exception 'Payment exceeds the outstanding invoice balance' using errcode = '22023';
  end if;

  insert into public.invoice_payments (company_id, invoice_id, amount, received_by)
  values (invoice_record.company_id, invoice_record.id, payment_amount, (select auth.uid()))
  returning id into payment_id;

  update public.invoices
  set status = case
    when previous_payments + allocated_deposits + payment_amount >= invoice_record.amount then 'paid'
    else 'partially_paid'
  end
  where id = invoice_record.id;

  return payment_id;
end;
$$;
revoke all on function public.record_invoice_payment(uuid, numeric) from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric) to authenticated;

create or replace function public.create_candidate_visa_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_project text := nullif(trim(coalesce(new.details ->> 'assignedContracts', '')), '');
  issued_visa boolean := trim(coalesce(new.details ->> 'visaStatus', '')) = 'Received';
  project_charge numeric(14, 2);
  invoice_id uuid;
  remaining_credit numeric(14, 2);
  receipt_record record;
  allocation_amount numeric(14, 2);
  visa_position text := nullif(trim(coalesce(new.position, '')), '');
begin
  if not issued_visa or assigned_project is null then
    return new;
  end if;

  perform 1 from public.invoices invoice where invoice.visa_candidate_id = new.id;
  if found then
    return new;
  end if;

  select project.service_charge
  into project_charge
  from public.projects project
  where project.company_id = new.company_id
    and project.project_name = assigned_project
    and project.status = 'active'
  order by project.created_at desc
  limit 1;

  if project_charge is null or project_charge <= 0 then
    raise exception 'Visa invoice could not be created: select an active assigned project with a service charge before marking the visa received.';
  end if;

  if visa_position is null then
    visa_position := assigned_project;
  end if;

  insert into public.invoices (
    company_id, recipient_type, recipient_id, recipient_name, description,
    amount, due_date, status, created_by, visa_candidate_id
  ) values (
    new.company_id, 'candidate', new.id, concat_ws(' ', new.first_name, new.last_name),
    'Visa payment for ' || visa_position, project_charge, current_date, 'sent',
    coalesce((select auth.uid()), new.created_by), new.id
  )
  on conflict (visa_candidate_id) where visa_candidate_id is not null do nothing
  returning id into invoice_id;

  if invoice_id is null then
    return new;
  end if;

  remaining_credit := project_charge;
  for receipt_record in
    select receipt.id, receipt.amount
    from public.financial_receipts receipt
    where receipt.company_id = new.company_id
      and receipt.candidate_id = new.id
      and receipt.entry_type = 'candidate_deposit'
      and receipt.received_at <= clock_timestamp()
      and not exists (
        select 1 from public.invoice_deposit_allocations allocation where allocation.receipt_id = receipt.id
      )
    order by receipt.received_at, receipt.created_at, receipt.id
  loop
    exit when remaining_credit <= 0;
    allocation_amount := least(remaining_credit, receipt_record.amount);
    insert into public.invoice_deposit_allocations (company_id, invoice_id, receipt_id, amount)
    values (new.company_id, invoice_id, receipt_record.id, allocation_amount);
    remaining_credit := remaining_credit - allocation_amount;
  end loop;

  return new;
end;
$$;

drop trigger if exists candidates_create_visa_invoice on public.candidates;
create trigger candidates_create_visa_invoice
  after insert or update of position, details on public.candidates
  for each row execute function public.create_candidate_visa_invoice();
revoke all on function public.create_candidate_visa_invoice() from public, anon, authenticated;