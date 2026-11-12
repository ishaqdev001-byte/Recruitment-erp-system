create or replace function public.seed_finance_workspace_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seeded_permissions text[];
begin
  if new.is_system_default is not true then
    return new;
  end if;

  case lower(trim(new.name))
    when 'finance manager' then
      seeded_permissions := array[
        'finance.view', 'finance.create', 'finance.edit', 'finance.approve',
        'audit.view', 'requisitions.view', 'requisitions.verify',
        'candidates.view'
      ];
    when 'finance officer' then
      seeded_permissions := array[
        'finance.view', 'finance.create', 'finance.edit',
        'requisitions.view', 'requisitions.verify', 'candidates.view'
      ];
    when 'finance user' then
      seeded_permissions := array[
        'finance.view', 'finance.create',
        'requisitions.view', 'requisitions.verify', 'candidates.view'
      ];
    else
      return new;
  end case;

  insert into public.role_permissions (role_id, company_id, permission_code)
  select new.id, new.company_id, permission.code
  from public.permissions permission
  where permission.code = any(seeded_permissions)
  on conflict (role_id, permission_code) do nothing;

  return new;
end;
$$;

delete from public.role_permissions role_permission
using public.company_roles role
where role_permission.role_id = role.id
  and role_permission.company_id = role.company_id
  and role_permission.permission_code = 'requisitions.create'
  and not (
    role.name = 'Administration Officer'
    and role.is_system_default is true
  );

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
join public.permissions permission
  on permission.code = 'requisitions.create'
where role.name = 'Administration Officer'
  and role.is_system_default is true
on conflict (role_id, permission_code) do nothing;