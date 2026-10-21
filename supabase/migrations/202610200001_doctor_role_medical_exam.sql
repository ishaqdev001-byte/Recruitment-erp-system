-- ═══════════════════════════════════════════════════════════════════════════
-- Doctor role & medical examination workflow
--
-- Adds:
--   • 'Doctor' system-default role with medical_documents.view + candidates.view
--     + documents.upload permissions
--   • medical_exam_result column on medical_appointments (fit | unfit | pending)
--   • medical_exam_notes column for the doctor's findings
--   • medical_examined_at / medical_examined_by columns
--   • 'Medical Examination' pipeline stage tracked in candidates.details JSONB
--   • RLS policy allowing Doctor role to read/update their assigned appointments
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Add examination columns to medical_appointments ───────────────────

alter table public.medical_appointments
  add column if not exists exam_result      text
    check (exam_result in ('pending', 'fit', 'unfit'))
    default 'pending',
  add column if not exists exam_notes       text,
  add column if not exists examined_at      timestamptz,
  add column if not exists examined_by      uuid references auth.users (id) on delete set null;

-- Backfill: completed appointments that pre-date this migration default to pending
update public.medical_appointments
set exam_result = 'pending'
where exam_result is null;

-- ─── 2. Add the Doctor system-default role if it doesn't already exist ────

-- Ensure the permission codes required by the Doctor role are registered
insert into public.permissions (code, description)
values
  ('medical.view',   'View candidate medical appointments and examination queue'),
  ('medical.update', 'Record medical examination results and upload medical reports')
on conflict (code) do nothing;

-- Insert Doctor role for every existing company (idempotent via ON CONFLICT)
insert into public.company_roles (company_id, name, description, is_system_default)
select c.id,
       'Doctor',
       'Reviews and examines booked candidates, records examination results (fit/unfit), and uploads medical reports.',
       true
from public.companies c
on conflict (company_id, name) do update
  set description      = excluded.description,
      is_system_default = true
where public.company_roles.description = '';

-- Grant permissions to the Doctor role for every company
insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, perm.code
from public.company_roles cr
cross join (
  select unnest(array[
    'candidates.view',
    'documents.view',
    'documents.upload',
    'documents.download',
    'medical_documents.view',
    'medical.view',
    'medical.update'
  ]) as code
) perm
where cr.name = 'Doctor'
on conflict (role_id, permission_code) do nothing;

-- ─── 3. Update seed function to include Doctor role ──────────────────────

create or replace function public.seed_company_default_roles(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_roles (company_id, name, description, is_system_default)
  select target_company_id, default_role.name, default_role.description, true
  from (values
    ('Company Owner / Primary Administrator', 'Owns the company workspace and manages its users, roles, and operations.'),
    ('General Manager', 'Oversees day-to-day company operations, recruitment, finance, and team activity.'),
    ('CEO', 'Provides executive oversight across company operations, users, finance, and reporting.'),
    ('Finance Manager', 'Manages finance records, approvals, and finance team activity.'),
    ('Documents Officer', 'Maintains candidate documents and verifies document records.'),
    ('Document Officer', 'Maintains candidate documents and verifies document records.'),
    ('Medical Officer', 'Manages candidate medical-document access and related candidate records.'),
    ('Doctor', 'Reviews and examines booked candidates, records examination results (fit/unfit), and uploads medical reports.'),
    ('Branch Manager', 'Oversees candidate, document, passport, and team activity for a branch.'),
    ('Administrator', 'Administers company operations, records, permissions, and user access.'),
    ('Finance User', 'Records and reviews day-to-day company finance activity.')
  ) as default_role(name, description)
  on conflict (company_id, name) do update
    set description      = excluded.description,
        is_system_default = true
    where public.company_roles.description = '';

  insert into public.role_permissions (role_id, company_id, permission_code)
  select company_role.id, target_company_id, permission.code
  from public.company_roles company_role
  cross join public.permissions permission
  where company_role.company_id = target_company_id
    and (
      company_role.name in (
        'Company Owner / Primary Administrator', 'General Manager', 'CEO', 'Administrator'
      )
      or (
        company_role.name = 'Finance Manager'
        and permission.code in ('finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'audit.view')
      )
      or (
        company_role.name = 'Finance User'
        and permission.code in ('finance.view', 'finance.create')
      )
      or (
        company_role.name in ('Documents Officer', 'Document Officer')
        and permission.code in ('candidates.view', 'documents.view', 'documents.upload', 'documents.download', 'documents.edit')
      )
      or (
        company_role.name = 'Medical Officer'
        and permission.code in ('candidates.view', 'documents.view', 'documents.upload', 'documents.download', 'medical_documents.view')
      )
      or (
        company_role.name = 'Doctor'
        and permission.code in (
          'candidates.view', 'documents.view', 'documents.upload', 'documents.download',
          'medical_documents.view', 'medical.view', 'medical.update'
        )
      )
      or (
        company_role.name = 'Branch Manager'
        and permission.code in (
          'candidates.view', 'candidates.create', 'candidates.edit', 'documents.view',
          'documents.upload', 'documents.download', 'passport.view', 'passport.edit',
          'users.view', 'audit.view'
        )
      )
    )
  on conflict (role_id, permission_code) do nothing;
end;
$$;

-- ─── 4. Allow Doctor-role users to read appointments and update exam fields ─

-- Read: any user with medical.view can see their company's appointments
drop policy if exists "Doctor can view medical appointments" on public.medical_appointments;
create policy "Doctor can view medical appointments"
  on public.medical_appointments
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'medical.view')
  );

-- Update: restrict to exam_result / exam_notes / examined_at / examined_by fields
-- (finance.edit is used for full edits; medical.update is for exam recording only)
drop policy if exists "Doctor can record examination results" on public.medical_appointments;
create policy "Doctor can record examination results"
  on public.medical_appointments
  for update to authenticated
  using  (public.current_user_has_company_permission(company_id, 'medical.update'))
  with check (public.current_user_has_company_permission(company_id, 'medical.update'));

-- Authenticated read for the new exam columns (grant is already on the table)
grant update (exam_result, exam_notes, examined_at, examined_by, status) on public.medical_appointments to authenticated;
