alter table public.company_staff_members
  add column if not exists linked_user_id uuid references auth.users (id) on delete set null,
  add column if not exists sex text check (sex in ('Female', 'Male', 'Other', 'Prefer not to say')),
  add column if not exists local_address text not null default '',
  add column if not exists permanent_address text not null default '',
  add column if not exists emergency_contact_address text not null default '',
  add column if not exists passport_number text not null default '',
  add column if not exists passport_expiry date,
  add column if not exists national_id_number text not null default '',
  add column if not exists national_id_expiry date,
  add column if not exists academic_qualifications jsonb not null default '[]'::jsonb check (jsonb_typeof(academic_qualifications) = 'array'),
  add column if not exists professional_qualifications jsonb not null default '[]'::jsonb check (jsonb_typeof(professional_qualifications) = 'array'),
  add column if not exists work_experience jsonb not null default '[]'::jsonb check (jsonb_typeof(work_experience) = 'array'),
  add column if not exists languages text[] not null default '{}',
  add column if not exists has_criminal_record boolean not null default false,
  add column if not exists criminal_case_type text not null default '',
  add column if not exists criminal_case_year integer,
  add column if not exists criminal_case_status text not null default '';

alter table public.company_staff_members
  alter column date_of_birth drop not null,
  alter column phone set default '';

create unique index if not exists company_staff_members_linked_user_uidx
  on public.company_staff_members (company_id, linked_user_id)
  where linked_user_id is not null;

create table if not exists public.company_staff_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_member_id uuid not null,
  document_type text not null check (document_type in (
    'passport', 'national_id', 'academic_qualification', 'professional_qualification', 'employment_record', 'other'
  )),
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  file_type text not null check (length(file_type) between 1 and 12),
  mime_type text not null check (length(mime_type) between 1 and 127),
  file_size bigint not null check (file_size > 0),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (staff_member_id, company_id)
    references public.company_staff_members (id, company_id) on delete cascade,
  check (storage_path like 'company/' || company_id::text || '/users/' || uploaded_by::text || '/%'),
  check (storage_path not like '%..%'),
  check (position(E'\\' in storage_path) = 0)
);

create index if not exists company_staff_documents_staff_created_idx
  on public.company_staff_documents (company_id, staff_member_id, created_at desc);

alter table public.company_staff_documents enable row level security;
revoke all on public.company_staff_documents from public, anon, authenticated;
grant select, insert, update, delete on public.company_staff_members, public.company_staff_documents to service_role;