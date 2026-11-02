insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'candidates.view'
from public.company_roles role
where lower(trim(role.name)) in ('finance manager', 'finance officer', 'finance user')
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
        'audit.view', 'requisitions.view', 'requisitions.create', 'requisitions.verify',
        'candidates.view'
      ];
    when 'finance officer' then
      seeded_permissions := array[
        'finance.view', 'finance.create', 'finance.edit',
        'requisitions.view', 'requisitions.create', 'requisitions.verify',
        'candidates.view'
      ];
    when 'finance user' then
      seeded_permissions := array[
        'finance.view', 'finance.create',
        'requisitions.view', 'requisitions.create', 'requisitions.verify',
        'candidates.view'
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

create or replace function public.replace_company_role_permissions(
  requested_role_id uuid,
  requested_company_id uuid,
  requested_permissions text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_permissions text[];
begin
  if requested_role_id is null or requested_company_id is null
    or requested_permissions is null
    or array_position(requested_permissions, null) is not null then
    raise exception 'A role, company, and valid permission list are required.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.company_roles role
    where role.id = requested_role_id
      and role.company_id = requested_company_id
  ) then
    raise exception 'The role does not belong to the requested company.'
      using errcode = '23503';
  end if;

  if exists (
    select 1
    from unnest(requested_permissions) requested(permission_code)
    left join public.permissions permission
      on permission.code = requested.permission_code
    where permission.code is null
  ) then
    raise exception 'The permission list contains an unknown permission.'
      using errcode = '22023';
  end if;

  delete from public.role_permissions role_permission
  where role_permission.role_id = requested_role_id
    and role_permission.company_id = requested_company_id;

  insert into public.role_permissions (role_id, company_id, permission_code)
  select requested_role_id, requested_company_id, requested.permission_code
  from (
    select distinct requested.permission_code
    from unnest(requested_permissions) as requested(permission_code)
  ) requested
  on conflict (role_id, permission_code) do nothing;

  select coalesce(array_agg(role_permission.permission_code order by role_permission.permission_code), array[]::text[])
  into saved_permissions
  from public.role_permissions role_permission
  where role_permission.role_id = requested_role_id
    and role_permission.company_id = requested_company_id;

  return saved_permissions;
end;
$$;

revoke all on function public.replace_company_role_permissions(uuid, uuid, text[])
  from public, anon, authenticated;
grant execute on function public.replace_company_role_permissions(uuid, uuid, text[])
  to service_role;