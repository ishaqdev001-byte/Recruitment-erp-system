-- Link medical appointments to the candidates table and auto-record income transactions

-- Add candidate_id FK so bookings are tied to a registered candidate
alter table public.medical_appointments
  add column if not exists candidate_id uuid,
  add column if not exists payment_reference text not null default '',
  add column if not exists transaction_id uuid;

-- Soft FK — candidate may be from pipeline or inquiry (both are in candidates table)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'medical_appointments_candidate_company_fk'
      and conrelid = 'public.medical_appointments'::regclass
  ) then
    alter table public.medical_appointments
      add constraint medical_appointments_candidate_company_fk
      foreign key (candidate_id, company_id)
        references public.candidates (id, company_id) on delete set null;
  end if;
end;
$$;

-- Index so we can quickly list appointments per candidate
create index if not exists medical_appointments_candidate_idx
  on public.medical_appointments (company_id, candidate_id)
  where candidate_id is not null;

-- Grant service_role write access to account transactions so the booking
-- API can record the income credit atomically
grant insert on public.company_account_transactions to service_role;
