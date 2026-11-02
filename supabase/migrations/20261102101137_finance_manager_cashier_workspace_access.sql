insert into public.permissions (code, description)
values
  ('requisitions.create', 'Submit purchase requisitions'),
  ('requisitions.verify', 'Second-stage financial verification (Finance/Cashier)'),
  ('requisitions.view', 'View company purchase requisitions')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, granted.permission_code
from public.company_roles role
join (
  values
    ('finance manager', 'finance.view'),
    ('finance manager', 'finance.create'),
    ('finance manager', 'finance.edit'),
    ('finance manager', 'finance.approve'),
    ('finance manager', 'audit.view'),
    ('finance manager', 'requisitions.view'),
    ('finance manager', 'requisitions.create'),
    ('finance manager', 'requisitions.verify'),
    ('finance officer', 'finance.view'),
    ('finance officer', 'finance.create'),
    ('finance officer', 'finance.edit'),
    ('finance officer', 'requisitions.view'),
    ('finance officer', 'requisitions.create'),
    ('finance officer', 'requisitions.verify'),
    ('finance user', 'finance.view'),
    ('finance user', 'finance.create'),
    ('finance user', 'requisitions.view'),
    ('finance user', 'requisitions.create'),
    ('finance user', 'requisitions.verify')
) as granted(role_name, permission_code)
  on granted.role_name = lower(trim(role.name))
join public.permissions permission
  on permission.code = granted.permission_code
on conflict (role_id, permission_code) do nothing;

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
        'audit.view', 'requisitions.view', 'requisitions.create', 'requisitions.verify'
      ];
    when 'finance officer' then
      seeded_permissions := array[
        'finance.view', 'finance.create', 'finance.edit',
        'requisitions.view', 'requisitions.create', 'requisitions.verify'
      ];
    when 'finance user' then
      seeded_permissions := array[
        'finance.view', 'finance.create',
        'requisitions.view', 'requisitions.create', 'requisitions.verify'
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

revoke all on function public.seed_finance_workspace_permissions_for_role()
  from public, anon, authenticated;

drop trigger if exists company_roles_seed_finance_workspace_permissions
  on public.company_roles;
create trigger company_roles_seed_finance_workspace_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_finance_workspace_permissions_for_role();