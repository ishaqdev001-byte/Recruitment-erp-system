insert into public.permissions (code, description)
values (
  'reports.view',
  'Access Reports & Analytics for the company'
)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'reports.view'
from public.company_roles role
where lower(role.name) in (
  'chairman',
  'ceo',
  'company owner / primary administrator',
  'primary administrator'
)
on conflict (role_id, permission_code) do nothing;

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
    ('Chairman', 'Creator and owner of the company. Holds full control over all branches, roles, operations, and approvals.'),
    ('General Manager', 'Oversees day-to-day company operations, recruitment, finance, and team activity across all branches.'),
    ('CEO', 'Provides executive oversight across company operations, users, finance, and reporting.'),
    ('Finance Manager', 'Manages finance records, approvals, and finance team activity.'),
    ('Documents Officer', 'Maintains candidate documents and verifies document records.'),
    ('Document Officer', 'Maintains candidate documents and verifies document records.'),
    ('Medical Officer', 'Manages candidate medical-document access and related candidate records.'),
    ('Doctor', 'Reviews and examines booked candidates, records examination results and uploads medical reports.'),
    ('Branch Manager', 'Oversees candidate, document, passport, and team activity for a branch. First-level approver.'),
    ('Supervisor', 'Main branch supervisor. Second-level approver. Appointed by the Chairman.'),
    ('Administrator', 'Administers company operations, records, permissions, and user access.'),
    ('Finance User', 'Records and reviews day-to-day company finance activity.'),
    ('Recruitment Manager', 'Manages recruitment agents and pipeline activity.'),
    ('Recruitment Agent', 'Registers and supports candidates through recruitment.'),
    ('Finance Officer', 'Handles day-to-day finance records and transactions.')
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
      (
        company_role.name in ('Chairman', 'General Manager', 'CEO', 'Administrator')
        and permission.code <> 'reports.view'
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
        company_role.name = 'Finance Officer'
        and permission.code in ('finance.view', 'finance.create', 'finance.edit')
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
          'users.view', 'audit.view', 'finance.view', 'branches.view',
          'approvals.view', 'approvals.manage'
        )
      )
      or (
        company_role.name = 'Supervisor'
        and permission.code in (
          'candidates.view', 'documents.view', 'documents.download',
          'passport.view', 'users.view', 'audit.view', 'finance.view',
          'branches.view', 'approvals.view', 'approvals.manage'
        )
      )
      or (
        company_role.name = 'Recruitment Manager'
        and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit', 'documents.view', 'documents.upload', 'documents.download', 'users.view')
      )
      or (
        company_role.name = 'Recruitment Agent'
        and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit')
      )
      or (
        lower(company_role.name) in ('chairman', 'ceo', 'company owner / primary administrator', 'primary administrator')
        and permission.code = 'reports.view'
      )
      or (
        lower(company_role.name) in ('chairman', 'company owner / primary administrator', 'primary administrator')
        and permission.code = 'candidates.sources.manage'
      )
    )
  on conflict (role_id, permission_code) do nothing;
end;
$$;