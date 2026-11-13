create or replace function public.seed_projects_manager_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.name)) in ('projects manager', 'project manager')
    and new.is_system_default then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    where permission.code in (
      'projects.view',
      'projects.assign',
      'candidates.view',
      'candidates.edit',
      'candidates.stage',
      'candidates.project_submit',
      'candidate_inquiries.view',
      'candidate_inquiries.create',
      'documents.view',
      'documents.upload',
      'documents.download',
      'documents.edit',
      'documents.delete',
      'passport.view'
    )
    on conflict (role_id, permission_code) do nothing;
  else
    delete from public.role_permissions permission
    where permission.role_id = new.id
      and permission.company_id = new.company_id
      and permission.permission_code = 'projects.assign';
  end if;
  return new;
end;
$$;

revoke all on function public.seed_projects_manager_role_permissions()
  from public, anon, authenticated;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join (
  values
    ('projects.view'),
    ('projects.assign'),
    ('candidates.view'),
    ('candidates.edit'),
    ('candidates.stage'),
    ('candidates.project_submit'),
    ('candidate_inquiries.view'),
    ('candidate_inquiries.create'),
    ('documents.view'),
    ('documents.upload'),
    ('documents.download'),
    ('documents.edit'),
    ('documents.delete'),
    ('passport.view')
) as permission(code)
join public.permissions catalog
  on catalog.code = permission.code
where lower(btrim(role.name)) in ('projects manager', 'project manager')
  and role.is_system_default
on conflict (role_id, permission_code) do nothing;