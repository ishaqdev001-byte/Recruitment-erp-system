insert into public.permissions (code, description)
values
  ('suppliers.view', 'View company suppliers'),
  ('suppliers.create', 'Register company suppliers')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name in (
  'Chairman',
  'Company Owner / Primary Administrator',
  'General Manager',
  'CEO',
  'Administrator',
  'Recruitment Manager',
  'Branch Manager'
)
  and permission.code in ('suppliers.view', 'suppliers.create')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_supplier_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name in (
    'Chairman',
    'Company Owner / Primary Administrator',
    'General Manager',
    'CEO',
    'Administrator',
    'Recruitment Manager',
    'Branch Manager'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'suppliers.view'),
      (new.id, new.company_id, 'suppliers.create')
    on conflict (role_id, permission_code) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.seed_supplier_permissions_for_role()
  from public, anon, authenticated;