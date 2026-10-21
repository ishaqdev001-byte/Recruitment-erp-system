-- Role management: mark seeded roles as system defaults and allow full CRUD on roles
-- for primary owners and users with the new roles.manage permission.

-- ─── Add is_system_default flag to company_roles ────────────────────────────────

alter table public.company_roles
  add column if not exists is_system_default boolean not null default false;

-- Mark all known seeded role names as system defaults for every company.
-- This is idempotent — new companies get it from the seed trigger (updated below).
update public.company_roles
set is_system_default = true
where name in (
  'Company Owner / Primary Administrator',
  'General Manager',
  'CEO',
  'Finance Manager',
  'Documents Officer',
  'Document Officer',
  'Medical Officer',
  'Branch Manager',
  'Administrator',
  'Finance User',
  'Recruitment Manager',
  'Recruitment Agent',
  'Finance Officer'
);

-- ─── New permission: roles.manage ────────────────────────────────────────────────

insert into public.permissions (code, description)
values ('roles.manage', 'Create, edit, and delete company roles and their permissions')
on conflict (code) do nothing;

-- Grant roles.manage to the four full-access roles on every existing company.
insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, 'roles.manage'
from public.company_roles cr
where cr.name in (
  'Company Owner / Primary Administrator',
  'General Manager',
  'CEO',
  'Administrator'
)
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_id = cr.id
    and rp.permission_code = 'roles.manage'
)
on conflict do nothing;

-- ─── Update seed function to set is_system_default and include roles.manage ──────

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
    ('Branch Manager', 'Oversees candidate, document, passport, and team activity for a branch.'),
    ('Administrator', 'Administers company operations, records, permissions, and user access.'),
    ('Finance User', 'Records and reviews day-to-day company finance activity.')
  ) as default_role(name, description)
  on conflict (company_id, name) do update
    set description = excluded.description,
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
