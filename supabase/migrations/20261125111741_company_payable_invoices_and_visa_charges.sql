create table public.company_payable_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number bigint generated always as identity unique,
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.company_branches (id) on delete set null,
  vendor_type text not null check (vendor_type in ('contractor', 'partner')),
  vendor_id uuid,
  vendor_name text not null check (length(btrim(vendor_name)) between 1 and 200),
  vendor_invoice_number text check (
    vendor_invoice_number is null
    or length(btrim(vendor_invoice_number)) between 1 and 100
  ),
  description text not null check (length(btrim(description)) between 1 and 500),
  amount numeric(14, 2) not null check (amount > 0),
  invoice_date date not null default current_date,
  due_date date,
  source_type text not null check (source_type in ('manual', 'visa')),
  source_charge_id uuid references public.project_contractor_charges (id) on delete restrict,
  project_id uuid references public.projects (id) on delete set null,
  project_name text,
  candidate_id uuid references public.candidates (id) on delete set null,
  candidate_name text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (source_type = 'visa' and source_charge_id is not null)
    or (source_type = 'manual' and source_charge_id is null and vendor_id is not null)
  )
);

create index company_payable_invoices_company_branch_date_idx
  on public.company_payable_invoices (company_id, branch_id, invoice_date desc);

create unique index company_payable_invoices_source_charge_idx
  on public.company_payable_invoices (source_charge_id)
  where source_charge_id is not null;

create unique index company_payable_invoices_vendor_reference_idx
  on public.company_payable_invoices (
    company_id,
    vendor_type,
    vendor_id,
    lower(btrim(vendor_invoice_number))
  )
  where vendor_invoice_number is not null and vendor_id is not null;

alter table public.company_payable_invoices enable row level security;
revoke all on public.company_payable_invoices from public, anon, authenticated;
grant select on public.company_payable_invoices to service_role;
grant usage, select on sequence public.company_payable_invoices_invoice_number_seq
  to service_role;

alter table public.company_expenses
  add column payable_invoice_id uuid
    references public.company_payable_invoices (id) on delete set null;

create index company_expenses_payable_invoice_idx
  on public.company_expenses (company_id, payable_invoice_id)
  where payable_invoice_id is not null;

create or replace function public.record_company_payable_invoice(
  requested_company_id uuid,
  requested_vendor_type text,
  requested_vendor_id uuid,
  requested_vendor_invoice_number text,
  requested_description text,
  requested_amount numeric,
  requested_invoice_date date,
  requested_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  membership_branch_id uuid;
  is_main_branch_user boolean;
  vendor_name text;
  invoice_row public.company_payable_invoices%rowtype;
begin
  if actor_id is null
    or not public.current_user_has_company_permission(
      requested_company_id,
      'finance.create'
    )
  then
    raise exception 'Finance create permission required.'
      using errcode = '42501';
  end if;

  select membership.branch_id
  into membership_branch_id
  from public.company_memberships membership
  where membership.company_id = requested_company_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  if not found then
    raise exception 'Active company membership not found.'
      using errcode = '42501';
  end if;

  is_main_branch_user :=
    public.current_user_is_main_branch_user(requested_company_id);
  if not is_main_branch_user and membership_branch_id is null then
    raise exception 'Your company branch could not be verified.'
      using errcode = '42501';
  end if;

  if requested_vendor_type = 'contractor' then
    select employer.company_name
    into vendor_name
    from public.employers employer
    where employer.id = requested_vendor_id
      and employer.company_id = requested_company_id;
  elsif requested_vendor_type = 'partner' then
    select supplier.supplier_name
    into vendor_name
    from public.suppliers supplier
    where supplier.id = requested_vendor_id
      and supplier.company_id = requested_company_id
      and supplier.status = 'active';
  else
    raise exception 'Select a contractor or partner from this company.'
      using errcode = '22023';
  end if;

  if vendor_name is null then
    raise exception 'Select an active contractor or partner from this company.'
      using errcode = '22023';
  end if;

  if requested_description is null
    or length(btrim(requested_description)) not between 1 and 500
    or requested_amount is null
    or round(requested_amount, 2) <= 0
    or requested_amount > 999999999999.99
    or requested_invoice_date is null
    or coalesce(length(btrim(requested_vendor_invoice_number)), 0) > 100
  then
    raise exception 'Enter a valid invoice description, amount, and date.'
      using errcode = '22023';
  end if;

  insert into public.company_payable_invoices (
    company_id,
    branch_id,
    vendor_type,
    vendor_id,
    vendor_name,
    vendor_invoice_number,
    description,
    amount,
    invoice_date,
    due_date,
    source_type,
    created_by
  )
  values (
    requested_company_id,
    membership_branch_id,
    requested_vendor_type,
    requested_vendor_id,
    btrim(vendor_name),
    nullif(btrim(requested_vendor_invoice_number), ''),
    btrim(requested_description),
    round(requested_amount, 2),
    requested_invoice_date,
    requested_due_date,
    'manual',
    actor_id
  )
  returning * into invoice_row;

  return jsonb_build_object(
    'id', invoice_row.id,
    'invoiceNumber', invoice_row.invoice_number::text,
    'amount', invoice_row.amount
  );
end;
$function$;

revoke all on function public.record_company_payable_invoice(
  uuid, text, uuid, text, text, numeric, date, date
) from public, anon;
grant execute on function public.record_company_payable_invoice(
  uuid, text, uuid, text, text, numeric, date, date
) to authenticated;

create or replace function public.record_company_payable_invoice_payment(
  requested_company_id uuid,
  requested_invoice_id uuid,
  requested_account_id uuid,
  requested_expense_category_id uuid,
  requested_item_name text,
  requested_description text,
  requested_amount numeric,
  requested_payment_method text,
  requested_reference text,
  requested_paid_at date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  membership_branch_id uuid;
  is_main_branch_user boolean;
  invoice_row public.company_payable_invoices%rowtype;
  expense_result jsonb;
  expense_id uuid;
  paid_amount numeric(14, 2);
  payment_amount numeric(14, 2);
begin
  if actor_id is null
    or not public.current_user_has_company_permission(
      requested_company_id,
      'finance.create'
    )
  then
    raise exception 'Finance create permission required.'
      using errcode = '42501';
  end if;

  select membership.branch_id
  into membership_branch_id
  from public.company_memberships membership
  where membership.company_id = requested_company_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  if not found then
    raise exception 'Active company membership not found.'
      using errcode = '42501';
  end if;

  is_main_branch_user :=
    public.current_user_is_main_branch_user(requested_company_id);
  if not is_main_branch_user and membership_branch_id is null then
    raise exception 'Your company branch could not be verified.'
      using errcode = '42501';
  end if;

  select *
  into invoice_row
  from public.company_payable_invoices invoice
  where invoice.id = requested_invoice_id
    and invoice.company_id = requested_company_id
    and (
      is_main_branch_user
      or invoice.branch_id is not distinct from membership_branch_id
    )
  for update;

  if not found then
    raise exception 'Payable invoice not found.'
      using errcode = 'P0002';
  end if;

  if requested_amount is null or requested_amount > 999999999999.99 then
    raise exception 'Enter a valid payment amount.'
      using errcode = '22023';
  end if;

  payment_amount := round(requested_amount, 2);
  if payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.'
      using errcode = '22023';
  end if;

  select coalesce(sum(expense.amount), 0)
  into paid_amount
  from public.company_expenses expense
  where expense.company_id = requested_company_id
    and expense.payable_invoice_id = invoice_row.id;

  if payment_amount > invoice_row.amount - paid_amount then
    raise exception 'Payment exceeds the payable invoice balance.'
      using errcode = '22023';
  end if;

  expense_result := public.record_company_expense(
    requested_company_id,
    invoice_row.branch_id,
    requested_account_id,
    requested_expense_category_id,
    requested_description,
    invoice_row.vendor_name,
    requested_payment_method,
    requested_reference,
    requested_paid_at,
    jsonb_build_array(
      jsonb_build_object(
        'description', requested_item_name,
        'quantity', 1,
        'rate', payment_amount
      )
    )
  );

  expense_id := nullif(expense_result ->> 'expense_id', '')::uuid;
  if expense_id is null then
    raise exception 'Expense was not recorded.'
      using errcode = 'P0001';
  end if;

  update public.company_expenses
  set payable_invoice_id = invoice_row.id
  where id = expense_id
    and company_id = requested_company_id;

  return jsonb_build_object(
    'invoiceId', invoice_row.id,
    'invoiceNumber', invoice_row.invoice_number::text,
    'expenseId', expense_id,
    'amount', payment_amount,
    'balanceDue', invoice_row.amount - paid_amount - payment_amount
  );
end;
$function$;

revoke all on function public.record_company_payable_invoice_payment(
  uuid, uuid, uuid, uuid, text, text, numeric, text, text, date
) from public, anon;
grant execute on function public.record_company_payable_invoice_payment(
  uuid, uuid, uuid, uuid, text, text, numeric, text, text, date
) to authenticated;

create or replace function private.create_company_payable_invoice_from_project_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  project_row public.projects%rowtype;
  payable_vendor_type text;
  payable_vendor_id uuid;
  payable_vendor_name text;
  payable_amount numeric(14, 2);
begin
  select *
  into project_row
  from public.projects project
  where project.id = new.project_id
    and project.company_id = new.company_id;

  if not found then
    raise exception 'Visa payable invoice project could not be found.';
  end if;

  if project_row.project_source_type = 'partner' then
    payable_vendor_type := 'partner';
    payable_vendor_id := project_row.partner_id;
    payable_amount := project_row.partner_service_charge;

    select supplier.supplier_name
    into payable_vendor_name
    from public.suppliers supplier
    where supplier.id = project_row.partner_id
      and supplier.company_id = new.company_id;
  else
    payable_vendor_type := 'contractor';
    payable_vendor_id := project_row.contractor_id;
    payable_vendor_name := nullif(btrim(project_row.contractor_name), '');
    payable_amount := new.amount;

    if payable_vendor_id is not null then
      select employer.company_name
      into payable_vendor_name
      from public.employers employer
      where employer.id = payable_vendor_id
        and employer.company_id = new.company_id;
    end if;
  end if;

  if payable_amount is null or payable_amount <= 0 then
    return new;
  end if;

  if payable_vendor_name is null then
    raise exception 'Visa payable invoice provider could not be found.';
  end if;

  insert into public.company_payable_invoices (
    company_id,
    branch_id,
    vendor_type,
    vendor_id,
    vendor_name,
    description,
    amount,
    invoice_date,
    source_type,
    source_charge_id,
    project_id,
    project_name,
    candidate_id,
    candidate_name,
    created_by
  )
  values (
    new.company_id,
    project_row.branch_id,
    payable_vendor_type,
    payable_vendor_id,
    payable_vendor_name,
    'Visa service charge for ' || new.candidate_name || ' - ' || project_row.project_name,
    payable_amount,
    new.visa_received_at::date,
    'visa',
    new.id,
    new.project_id,
    project_row.project_name,
    new.candidate_id,
    new.candidate_name,
    new.created_by
  )
  on conflict (source_charge_id)
    where source_charge_id is not null
  do nothing;

  return new;
end;
$function$;

revoke all on function private.create_company_payable_invoice_from_project_charge()
  from public, anon, authenticated;

create trigger project_contractor_charges_create_payable_invoice
  after insert on public.project_contractor_charges
  for each row
  execute function private.create_company_payable_invoice_from_project_charge();

insert into public.company_payable_invoices (
  company_id,
  branch_id,
  vendor_type,
  vendor_id,
  vendor_name,
  description,
  amount,
  invoice_date,
  source_type,
  source_charge_id,
  project_id,
  project_name,
  candidate_id,
  candidate_name,
  created_by
)
select
  charge.company_id,
  project.branch_id,
  case
    when project.project_source_type = 'partner' then 'partner'
    else 'contractor'
  end,
  case
    when project.project_source_type = 'partner' then project.partner_id
    else project.contractor_id
  end,
  case
    when project.project_source_type = 'partner' then supplier.supplier_name
    else coalesce(nullif(btrim(employer.company_name), ''), nullif(btrim(project.contractor_name), ''))
  end,
  'Visa service charge for ' || charge.candidate_name || ' - ' || project.project_name,
  case
    when project.project_source_type = 'partner' then project.partner_service_charge
    else charge.amount
  end,
  charge.visa_received_at::date,
  'visa',
  charge.id,
  project.id,
  project.project_name,
  charge.candidate_id,
  charge.candidate_name,
  charge.created_by
from public.project_contractor_charges charge
join public.projects project
  on project.id = charge.project_id
  and project.company_id = charge.company_id
left join public.employers employer
  on employer.id = project.contractor_id
  and employer.company_id = project.company_id
left join public.suppliers supplier
  on supplier.id = project.partner_id
  and supplier.company_id = project.company_id
where project.project_source_type in ('contractor', 'partner')
  and case
    when project.project_source_type = 'partner' then project.partner_service_charge
    else charge.amount
  end > 0
  and case
    when project.project_source_type = 'partner' then supplier.supplier_name
    else coalesce(nullif(btrim(employer.company_name), ''), nullif(btrim(project.contractor_name), ''))
  end is not null
on conflict (source_charge_id)
  where source_charge_id is not null
do nothing;