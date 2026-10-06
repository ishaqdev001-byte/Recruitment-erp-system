create table if not exists public.receipt_sequences (
  company_id uuid not null references public.companies (id) on delete cascade,
  receipt_year integer not null,
  last_number integer not null default 0 check (last_number >= 0),
  primary key (company_id, receipt_year)
);

create table if not exists public.financial_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  receipt_number text not null,
  entry_type text not null check (entry_type in ('candidate_deposit', 'other_income')),
  candidate_id uuid,
  received_from text not null check (length(trim(received_from)) between 1 and 200),
  category text not null check (length(trim(category)) between 1 and 100),
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('Cash', 'Bank transfer', 'Mobile money', 'Cheque', 'Other')),
  external_reference text not null default '' check (length(external_reference) <= 200),
  notes text not null default '' check (length(notes) <= 2000),
  received_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (company_id, receipt_number),
  foreign key (candidate_id, company_id) references public.candidates (id, company_id),
  check ((entry_type = 'candidate_deposit' and candidate_id is not null)
    or (entry_type = 'other_income' and candidate_id is null))
);

create index if not exists financial_receipts_company_received_idx on public.financial_receipts (company_id, received_at desc);
create index if not exists financial_receipts_company_candidate_idx on public.financial_receipts (company_id, candidate_id, received_at desc) where candidate_id is not null;

create or replace function public.prepare_financial_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_receipt_year integer := extract(year from coalesce(new.received_at, now()))::integer;
  sequence_number integer;
begin
  if new.entry_type = 'candidate_deposit' then
    select concat_ws(' ', candidate.first_name, candidate.last_name) into new.received_from
    from public.candidates candidate
    where candidate.id = new.candidate_id and candidate.company_id = new.company_id;
    if new.received_from is null or length(trim(new.received_from)) = 0 then
      raise exception 'Candidate must belong to the same company' using errcode = '23503';
    end if;
  end if;

  insert into public.receipt_sequences (company_id, receipt_year, last_number)
  values (new.company_id, target_receipt_year, 1)
  on conflict (company_id, receipt_year) do update
    set last_number = public.receipt_sequences.last_number + 1
  returning last_number into sequence_number;
  new.receipt_number := 'RCT-' || target_receipt_year::text || '-' || lpad(sequence_number::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists financial_receipts_prepare on public.financial_receipts;
create trigger financial_receipts_prepare before insert on public.financial_receipts
  for each row execute function public.prepare_financial_receipt();
revoke all on function public.prepare_financial_receipt() from public, anon, authenticated;

create or replace function public.list_finance_candidates(requested_company_id uuid)
returns table (candidate_id uuid, file_number text, candidate_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.id, candidate.file_number, concat_ws(' ', candidate.first_name, candidate.last_name)
  from public.candidates candidate
  where candidate.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'finance.create')
  order by candidate.created_at desc;
$$;
revoke all on function public.list_finance_candidates(uuid) from public, anon;
grant execute on function public.list_finance_candidates(uuid) to authenticated;

alter table public.financial_receipts enable row level security;

drop policy if exists "Financial receipts are tenant and permission scoped" on public.financial_receipts;
create policy "Financial receipts are tenant and permission scoped" on public.financial_receipts
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );
drop policy if exists "Authorized users can record financial receipts" on public.financial_receipts;
create policy "Authorized users can record financial receipts" on public.financial_receipts
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

grant select, insert on public.financial_receipts to authenticated;