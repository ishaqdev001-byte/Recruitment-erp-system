create or replace function public.is_company_drive_admin(requested_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_company_permission(requested_company_id, 'drive.delete.any');
$$;
revoke all on function public.is_company_drive_admin(uuid) from public, anon;
grant execute on function public.is_company_drive_admin(uuid) to authenticated;

create or replace function public.is_company_drive_finance_user(requested_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_company_permission(requested_company_id, 'drive.finance.view');
$$;
revoke all on function public.is_company_drive_finance_user(uuid) from public, anon;
grant execute on function public.is_company_drive_finance_user(uuid) to authenticated;

create or replace function public.seed_company_drive_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_system_default then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'drive.view'),
      (new.id, new.company_id, 'drive.upload'),
      (new.id, new.company_id, 'drive.edit'),
      (new.id, new.company_id, 'drive.move'),
      (new.id, new.company_id, 'drive.delete.own')
    on conflict (role_id, permission_code) do nothing;

    if new.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager') then
      insert into public.role_permissions (role_id, company_id, permission_code)
      values (new.id, new.company_id, 'drive.delete.any')
      on conflict (role_id, permission_code) do nothing;
    end if;

    if new.name in (
      'Company Owner / Primary Administrator',
      'Primary Administrator',
      'CEO',
      'General Manager',
      'Finance Manager',
      'Finance User'
    ) then
      insert into public.role_permissions (role_id, company_id, permission_code)
      values (new.id, new.company_id, 'drive.finance.view')
      on conflict (role_id, permission_code) do nothing;
    end if;

    if new.name in ('Company Owner / Primary Administrator', 'Finance Manager') then
      insert into public.role_permissions (role_id, company_id, permission_code)
      values (new.id, new.company_id, 'drive.finance.manage')
      on conflict (role_id, permission_code) do nothing;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.seed_company_drive_permissions_for_role() from public, anon, authenticated;

drop trigger if exists company_roles_seed_company_drive_permissions on public.company_roles;
create trigger company_roles_seed_company_drive_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row execute function public.seed_company_drive_permissions_for_role();