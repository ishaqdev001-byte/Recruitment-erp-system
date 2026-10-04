alter table public.company_roles
  add column if not exists description text not null default '';

create function public.seed_company_default_roles(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_roles (company_id, name, description)
  select target_company_id, default_role.name, default_role.description
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
    set description = excluded.description
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

create function public.seed_company_default_roles_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_company_default_roles(new.id);
  return new;
end;
$$;

create trigger companies_seed_default_roles
  after insert on public.companies
  for each row execute function public.seed_company_default_roles_after_insert();

select public.seed_company_default_roles(company.id)
from public.companies company;

revoke all on function public.seed_company_default_roles(uuid) from public, anon, authenticated;
revoke all on function public.seed_company_default_roles_after_insert() from public, anon, authenticated;