-- Hospitals/Medical Centers: Manage medical service providers (doctors and hospitals)
-- Allows registering hospitals, linking doctors to hospitals, and tracking medical service fees

-- Create hospitals table (medical centers/facilities)
create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 255),
  contact_phone text check (length(trim(contact_phone)) between 1 and 100),
  contact_email text check (length(trim(contact_email)) between 1 and 255),
  address text,
  city text,
  country text,
  description text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create index if not exists hospitals_company_active_idx
  on public.hospitals (company_id, is_active);
create index if not exists hospitals_company_idx
  on public.hospitals (company_id);

-- Unique index on hospital name (case-insensitive per company)
create unique index if not exists hospitals_company_name_unique_idx
  on public.hospitals (company_id, lower(name));

drop trigger if exists hospitals_set_updated_at on public.hospitals;
create trigger hospitals_set_updated_at before update on public.hospitals
  for each row execute function public.set_updated_at();

-- Link doctors to hospitals (a doctor can work at multiple hospitals)
create table if not exists public.doctor_hospital_affiliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  doctor_user_id uuid not null references auth.users (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  fee_to_doctor numeric(14, 2) not null check (fee_to_doctor >= 0),
  -- The amount paid to the doctor/hospital for providing the medical service
  -- This is deducted from the total candidate payment
  is_primary boolean not null default false,
  -- Primary hospital for this doctor (default in dropdowns)
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  unique (doctor_user_id, hospital_id, company_id),
  foreign key (company_id, doctor_user_id)
    references public.company_memberships (company_id, user_id) on delete cascade
);

create index if not exists doctor_hospital_affiliations_doctor_idx
  on public.doctor_hospital_affiliations (company_id, doctor_user_id);
create index if not exists doctor_hospital_affiliations_hospital_idx
  on public.doctor_hospital_affiliations (company_id, hospital_id);
create index if not exists doctor_hospital_affiliations_primary_idx
  on public.doctor_hospital_affiliations (company_id, is_primary);

drop trigger if exists doctor_hospital_affiliations_set_updated_at on public.doctor_hospital_affiliations;
create trigger doctor_hospital_affiliations_set_updated_at before update on public.doctor_hospital_affiliations
  for each row execute function public.set_updated_at();

-- Enhance medical_appointments table with doctor fee and hospital tracking
alter table if exists public.medical_appointments
  add column if not exists doctor_user_id uuid references auth.users (id) on delete set null,
  add column if not exists hospital_id uuid references public.hospitals (id) on delete set null,
  add column if not exists doctor_fee_amount numeric(14, 2) check (doctor_fee_amount >= 0),
  add column if not exists candidate_amount_after_doctor_fee numeric(14, 2) check (candidate_amount_after_doctor_fee >= 0),
  add column if not exists appointment_slip_generated boolean not null default false,
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null,
  add column if not exists remarks text,
  add column if not exists received_by_name text,
  add column if not exists booked_by_name text;

create index if not exists medical_appointments_doctor_idx
  on public.medical_appointments (company_id, doctor_user_id);
create index if not exists medical_appointments_hospital_idx
  on public.medical_appointments (company_id, hospital_id);
create index if not exists medical_appointments_invoice_idx
  on public.medical_appointments (invoice_id);

-- Enable RLS on new tables
alter table public.hospitals enable row level security;
alter table public.doctor_hospital_affiliations enable row level security;

revoke all on public.hospitals, public.doctor_hospital_affiliations from public, anon, authenticated;
grant select, insert, update, delete on public.hospitals, public.doctor_hospital_affiliations to service_role;

-- Hospitals: Finance staff with finance.view can see hospitals
drop policy if exists "Hospitals are tenant scoped" on public.hospitals;
create policy "Hospitals are tenant scoped"
  on public.hospitals
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

-- Finance staff with finance.create can add hospitals
drop policy if exists "Authorized users can create hospitals" on public.hospitals;
create policy "Authorized users can create hospitals"
  on public.hospitals
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

-- Finance staff with finance.edit can update hospitals
drop policy if exists "Authorized users can update hospitals" on public.hospitals;
create policy "Authorized users can update hospitals"
  on public.hospitals
  for update to authenticated
  using (public.current_user_has_company_permission(company_id, 'finance.edit'))
  with check (public.current_user_has_company_permission(company_id, 'finance.edit'));

grant select, insert, update on public.hospitals to authenticated;

-- Doctor hospital affiliations: Finance staff can view
drop policy if exists "Doctor hospital affiliations are tenant scoped" on public.doctor_hospital_affiliations;
create policy "Doctor hospital affiliations are tenant scoped"
  on public.doctor_hospital_affiliations
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

-- Doctors can view their own affiliations
drop policy if exists "Doctors can view their own affiliations" on public.doctor_hospital_affiliations;
create policy "Doctors can view their own affiliations"
  on public.doctor_hospital_affiliations
  for select to authenticated using (
    (doctor_user_id = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'doctor.view')
  );

-- Finance staff with finance.create can add doctor affiliations
drop policy if exists "Authorized users can create doctor affiliations" on public.doctor_hospital_affiliations;
create policy "Authorized users can create doctor affiliations"
  on public.doctor_hospital_affiliations
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

-- Finance staff with finance.edit can update affiliations
drop policy if exists "Authorized users can update doctor affiliations" on public.doctor_hospital_affiliations;
create policy "Authorized users can update doctor affiliations"
  on public.doctor_hospital_affiliations
  for update to authenticated
  using (public.current_user_has_company_permission(company_id, 'finance.edit'))
  with check (public.current_user_has_company_permission(company_id, 'finance.edit'));

grant select, insert, update on public.doctor_hospital_affiliations to authenticated;

-- Update medical_appointments RLS to allow access to new fields
drop policy if exists "Medical appointments are tenant and permission scoped" on public.medical_appointments;
create policy "Medical appointments are tenant and permission scoped"
  on public.medical_appointments
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

drop policy if exists "Authorized users can book medical appointments" on public.medical_appointments;
create policy "Authorized users can book medical appointments"
  on public.medical_appointments
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

drop policy if exists "Authorized users can update medical appointments" on public.medical_appointments;
create policy "Authorized users can update medical appointments"
  on public.medical_appointments
  for update to authenticated
  using (public.current_user_has_company_permission(company_id, 'finance.edit'))
  with check (public.current_user_has_company_permission(company_id, 'finance.edit'));
