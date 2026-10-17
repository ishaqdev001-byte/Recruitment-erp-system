do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'service_charge'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'candidate_service_charge'
  ) then
    alter table public.projects rename column service_charge to candidate_service_charge;
  end if;
end;
$$;
alter table public.projects
  add column if not exists contractor_service_charge numeric(12, 2) not null default 0 check (contractor_service_charge >= 0),
  add column if not exists account_id uuid;

create or replace function public.ensure_project_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_id uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.account_id is null then
    if creator_id is null or not exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id and role.company_id = membership.company_id
      where membership.company_id = new.company_id
        and membership.user_id = creator_id
        and membership.status = 'active'
        and role.name in ('Company Owner / Primary Administrator', 'CEO', 'Finance Manager')
    ) then
      raise exception 'Project accounts may only be created by the company owner, CEO, or Finance Manager' using errcode = '42501';
    end if;

    insert into public.company_accounts (company_id, name, account_type, description, created_by)
    values (
      new.company_id,
      left('Project: ' || new.project_name, 106) || ' #' || right(replace(new.id::text, '-', ''), 12),
      'project',
      'Project book for ' || new.project_name,
      creator_id
    )
    on conflict (company_id, lower(name)) do update
      set account_type = 'project', description = excluded.description
    returning id into new.account_id;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_ensure_account on public.projects;
create trigger projects_ensure_account before insert on public.projects
  for each row execute function public.ensure_project_account();
revoke all on function public.ensure_project_account() from public, anon, authenticated;

do $$
declare
  project_row record;
  project_account_id uuid;
  original_auth_user_id text := current_setting('request.jwt.claim.sub', true);
begin
  for project_row in
    select project.id, project.company_id, project.project_name, project.created_by, company.primary_admin_user_id
    from public.projects project
    join public.companies company on company.id = project.company_id
    where project.account_id is null
  loop
    if project_row.primary_admin_user_id is null then
      raise exception 'Project accounts require a company owner or primary administrator to be assigned';
    end if;

    perform set_config('request.jwt.claim.sub', project_row.primary_admin_user_id::text, true);

    insert into public.company_accounts (company_id, name, account_type, description, created_by)
    values (
      project_row.company_id,
      left('Project: ' || project_row.project_name, 106) || ' #' || right(replace(project_row.id::text, '-', ''), 12),
      'project',
      'Project book for ' || project_row.project_name,
      project_row.primary_admin_user_id
    )
    on conflict (company_id, lower(name)) do update
      set account_type = 'project', description = excluded.description
    returning id into project_account_id;

    update public.projects set account_id = project_account_id where id = project_row.id;
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(original_auth_user_id, ''), true);
end;
$$;

create unique index if not exists projects_id_company_uidx on public.projects (id, company_id);
alter table public.projects alter column account_id set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_account_company_fk' and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_account_company_fk
      foreign key (account_id, company_id) references public.company_accounts (id, company_id) on delete restrict;
  end if;
end;
$$;

alter table public.invoices
  add column if not exists project_id uuid,
  add column if not exists project_account_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_project_company_fk' and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_project_company_fk
      foreign key (project_id, company_id) references public.projects (id, company_id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_project_account_company_fk' and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_project_account_company_fk
      foreign key (project_account_id, company_id) references public.company_accounts (id, company_id) on delete restrict;
  end if;
end;
$$;

update public.invoices invoice
set project_id = project.id, project_account_id = project.account_id
from public.candidates candidate
join lateral (
  select project_row.id, project_row.account_id
  from public.projects project_row
  where project_row.company_id = candidate.company_id
    and project_row.project_name = nullif(trim(coalesce(candidate.details ->> 'assignedContracts', '')), '')
  order by project_row.created_at desc
  limit 1
) project on true
where invoice.visa_candidate_id = candidate.id
  and invoice.company_id = candidate.company_id;

alter table public.financial_receipts add column if not exists project_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'financial_receipts_project_company_fk' and conrelid = 'public.financial_receipts'::regclass
  ) then
    alter table public.financial_receipts
      add constraint financial_receipts_project_company_fk
      foreign key (project_id, company_id) references public.projects (id, company_id) on delete restrict;
  end if;
end;
$$;

create table if not exists public.project_contractor_charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null,
  contractor_id uuid,
  contractor_name text not null check (length(trim(contractor_name)) between 1 and 200),
  candidate_id uuid not null,
  candidate_name text not null check (length(trim(candidate_name)) between 1 and 200),
  amount numeric(12, 2) not null check (amount >= 0),
  visa_received_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, candidate_id),
  foreign key (project_id, company_id) references public.projects (id, company_id) on delete restrict,
  foreign key (contractor_id, company_id) references public.employers (id, company_id) on delete restrict,
  foreign key (candidate_id, company_id) references public.candidates (id, company_id) on delete restrict
);

create index if not exists project_contractor_charges_company_project_idx
  on public.project_contractor_charges (company_id, project_id, visa_received_at desc);
create index if not exists project_contractor_charges_company_contractor_idx
  on public.project_contractor_charges (company_id, contractor_id, visa_received_at desc);

insert into public.project_contractor_charges (
  company_id, project_id, contractor_id, contractor_name, candidate_id, candidate_name, amount, created_by
)
select candidate.company_id,
  project.id,
  project.contractor_id,
  project.contractor_name,
  candidate.id,
  concat_ws(' ', candidate.first_name, candidate.last_name),
  project.contractor_service_charge,
  candidate.created_by
from public.candidates candidate
join lateral (
  select project_row.id, project_row.contractor_id, project_row.contractor_name, project_row.contractor_service_charge
  from public.projects project_row
  where project_row.company_id = candidate.company_id
    and project_row.project_name = nullif(trim(coalesce(candidate.details ->> 'assignedContracts', '')), '')
    and project_row.status = 'active'
  order by project_row.created_at desc
  limit 1
) project on true
where trim(coalesce(candidate.details ->> 'visaStatus', '')) = 'Received'
on conflict (company_id, candidate_id) do nothing;

alter table public.project_contractor_charges enable row level security;
drop policy if exists "Project contractor charges are finance scoped" on public.project_contractor_charges;
create policy "Project contractor charges are finance scoped" on public.project_contractor_charges
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );
grant select on public.project_contractor_charges to authenticated;
grant select, insert, update, delete on public.project_contractor_charges to service_role;

create or replace function public.list_project_contractor_finance(requested_company_id uuid)
returns table (
  contractor_id uuid,
  project_id uuid,
  project_name text,
  visa_count bigint,
  contractor_service_charge numeric,
  amount_due numeric,
  account_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select project.contractor_id,
    project.id,
    project.project_name,
    count(charge.id),
    project.contractor_service_charge,
    coalesce(sum(charge.amount), 0)::numeric(14, 2),
    project.account_id
  from public.projects project
  left join public.project_contractor_charges charge
    on charge.company_id = project.company_id and charge.project_id = project.id
  where project.company_id = requested_company_id
    and project.contractor_id is not null
    and public.current_user_has_company_permission(requested_company_id, 'finance.view')
  group by project.id
  order by project.project_name;
$$;
revoke all on function public.list_project_contractor_finance(uuid) from public, anon;
grant execute on function public.list_project_contractor_finance(uuid) to authenticated;

drop trigger if exists financial_receipts_assign_project_account on public.financial_receipts;
create or replace function public.assign_candidate_receipt_to_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_project_id uuid;
  assigned_account_id uuid;
begin
  if new.entry_type <> 'candidate_deposit' then
    return new;
  end if;

  select project.id, project.account_id
  into assigned_project_id, assigned_account_id
  from public.candidates candidate
  join public.projects project
    on project.company_id = candidate.company_id
   and project.project_name = nullif(trim(coalesce(candidate.details ->> 'assignedContracts', '')), '')
   and project.status = 'active'
  where candidate.id = new.candidate_id and candidate.company_id = new.company_id
  order by project.created_at desc
  limit 1;

  if assigned_project_id is not null then
    if new.account_id is not null and new.account_id <> assigned_account_id then
      raise exception 'Candidate receipts must be recorded in the assigned project account' using errcode = '23514';
    end if;
    new.project_id := assigned_project_id;
    new.account_id := assigned_account_id;
  end if;
  return new;
end;
$$;

create trigger financial_receipts_assign_project_account before insert on public.financial_receipts
  for each row execute function public.assign_candidate_receipt_to_project();
revoke all on function public.assign_candidate_receipt_to_project() from public, anon, authenticated;

drop function if exists public.list_finance_candidates(uuid);
create function public.list_finance_candidates(requested_company_id uuid)
returns table (candidate_id uuid, file_number text, candidate_name text, account_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.id, candidate.file_number, concat_ws(' ', candidate.first_name, candidate.last_name), project.account_id
  from public.candidates candidate
  left join lateral (
    select project_row.account_id
    from public.projects project_row
    where project_row.company_id = candidate.company_id
      and project_row.project_name = nullif(trim(coalesce(candidate.details ->> 'assignedContracts', '')), '')
      and project_row.status = 'active'
    order by project_row.created_at desc
    limit 1
  ) project on true
  where candidate.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'finance.create')
  order by candidate.created_at desc;
$$;
revoke all on function public.list_finance_candidates(uuid) from public, anon;
grant execute on function public.list_finance_candidates(uuid) to authenticated;

create or replace function public.create_candidate_visa_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_project text := nullif(trim(coalesce(new.details ->> 'assignedContracts', '')), '');
  issued_visa boolean := trim(coalesce(new.details ->> 'visaStatus', '')) = 'Received';
  project_record public.projects%rowtype;
  invoice_id uuid;
  remaining_credit numeric(14, 2);
  receipt_record record;
  allocation_amount numeric(14, 2);
  candidate_position text := nullif(trim(coalesce(new.position, '')), '');
begin
  if not issued_visa or assigned_project is null then
    return new;
  end if;

  select * into project_record
  from public.projects project
  where project.company_id = new.company_id
    and project.project_name = assigned_project
    and project.status = 'active'
  order by project.created_at desc
  limit 1;

  if not found then
    raise exception 'Visa charges could not be recorded: select an active assigned project.';
  end if;

  if candidate_position is null then
    candidate_position := assigned_project;
  end if;

  perform 1 from public.invoices invoice where invoice.visa_candidate_id = new.id;
  if not found and project_record.candidate_service_charge > 0 then
    insert into public.invoices (
      company_id, recipient_type, recipient_id, recipient_name, description,
      amount, due_date, status, created_by, visa_candidate_id, project_id, project_account_id
    ) values (
      new.company_id, 'candidate', new.id, concat_ws(' ', new.first_name, new.last_name),
      'Visa payment for ' || candidate_position, project_record.candidate_service_charge, current_date, 'sent',
      coalesce((select auth.uid()), new.created_by), new.id, project_record.id, project_record.account_id
    )
    on conflict (visa_candidate_id) where visa_candidate_id is not null do nothing
    returning id into invoice_id;

    if invoice_id is not null then
      remaining_credit := project_record.candidate_service_charge;
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
    end if;
  end if;

  insert into public.project_contractor_charges (
    company_id, project_id, contractor_id, contractor_name,
    candidate_id, candidate_name, amount, created_by
  ) values (
    new.company_id, project_record.id, project_record.contractor_id, project_record.contractor_name,
    new.id, concat_ws(' ', new.first_name, new.last_name), project_record.contractor_service_charge,
    coalesce((select auth.uid()), new.created_by)
  ) on conflict (company_id, candidate_id) do nothing;

  return new;
end;
$$;

drop trigger if exists candidates_create_visa_invoice on public.candidates;
create trigger candidates_create_visa_invoice after insert or update of position, details on public.candidates
  for each row execute function public.create_candidate_visa_invoice();
revoke all on function public.create_candidate_visa_invoice() from public, anon, authenticated;

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
  required_account_id uuid;
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
  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '22023';
  end if;

  select project.account_id into required_account_id
  from public.projects project
  where project.id = invoice_record.project_id and project.company_id = invoice_record.company_id;
  if required_account_id is not null and requested_account_id <> required_account_id then
    raise exception 'Candidate invoice payments must be recorded in the assigned project account' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.company_accounts account
    where account.id = requested_account_id and account.company_id = invoice_record.company_id and account.status = 'active'
  ) then raise exception 'Active account not found for this company' using errcode = '23503'; end if;

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
    when previous_payments + allocated_deposits + payment_amount >= invoice_record.amount then 'paid'
    else 'partially_paid' end
  where id = invoice_record.id;
  return payment_id;
end;
$$;
revoke all on function public.record_invoice_payment(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric, uuid) to authenticated;