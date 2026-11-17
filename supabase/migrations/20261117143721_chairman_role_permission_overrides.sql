create schema if not exists app_private;

create table app_private.company_role_permission_overrides (
  transaction_id bigint not null,
  role_id uuid not null,
  company_id uuid not null,
  primary key (transaction_id, role_id, company_id)
);

revoke all on table app_private.company_role_permission_overrides
  from public, anon, authenticated, service_role;

create or replace function public.guard_company_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role public.company_roles%rowtype;
  has_primary_admin_override boolean;
begin
  select role.*
  into target_role
  from public.company_roles role
  where role.id = new.role_id
    and role.company_id = new.company_id;

  if not found then
    raise exception 'Role permission must reference a role in the same company.';
  end if;

  select exists (
    select 1
    from app_private.company_role_permission_overrides permission_override
    where permission_override.transaction_id = pg_catalog.txid_current()
      and permission_override.role_id = new.role_id
      and permission_override.company_id = new.company_id
  )
  into has_primary_admin_override;

  if has_primary_admin_override then
    return new;
  end if;

  if new.permission_code = 'requisitions.create'
    and not (
      target_role.name = 'Administration Officer'
      and target_role.is_system_default
    ) then
    raise exception 'Only the Administration Officer can create requisitions.';
  end if;

  if target_role.name = 'Finance Manager'
    and new.permission_code = any(array[
      'employers.create', 'employers.edit', 'employers.delete',
      'projects.create', 'projects.edit', 'projects.delete', 'projects.status'
    ]) then
    raise exception 'Finance Managers have read-only access to contractors and projects.';
  end if;

  return new;
end;
$$;

create or replace function public.replace_company_role_permissions_for_primary_admin(
  requested_role_id uuid,
  requested_company_id uuid,
  requested_permissions text[],
  requested_actor_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_permissions text[];
begin
  if not exists (
    select 1
    from public.companies company
    where company.id = requested_company_id
      and company.primary_admin_user_id = requested_actor_id
  ) then
    raise exception 'Only the primary company administrator can override protected role permissions.'
      using errcode = '42501';
  end if;

  insert into app_private.company_role_permission_overrides (
    transaction_id,
    role_id,
    company_id
  )
  values (
    pg_catalog.txid_current(),
    requested_role_id,
    requested_company_id
  )
  on conflict do nothing;

  saved_permissions := public.replace_company_role_permissions(
    requested_role_id,
    requested_company_id,
    requested_permissions
  );

  delete from app_private.company_role_permission_overrides permission_override
  where permission_override.transaction_id = pg_catalog.txid_current()
    and permission_override.role_id = requested_role_id
    and permission_override.company_id = requested_company_id;

  return saved_permissions;
end;
$$;

revoke all on function public.replace_company_role_permissions_for_primary_admin(
  uuid, uuid, text[], uuid
) from public, anon, authenticated;
grant execute on function public.replace_company_role_permissions_for_primary_admin(
  uuid, uuid, text[], uuid
) to service_role;