alter table public.company_roles
  add column if not exists is_system_default boolean not null default false;

create or replace function public.seed_attendance_leave_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_system_default is not true then
    return new;
  end if;

  insert into public.role_permissions (role_id, company_id, permission_code)
  values
    (new.id, new.company_id, 'attendance.clock'),
    (new.id, new.company_id, 'leave.create')
  on conflict (role_id, permission_code) do nothing;

  if new.name in (
    'Company Owner / Primary Administrator', 'General Manager', 'CEO',
    'Administrator', 'Recruitment Manager', 'Branch Manager'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'attendance.view'),
      (new.id, new.company_id, 'attendance.manage'),
      (new.id, new.company_id, 'leave.view'),
      (new.id, new.company_id, 'leave.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.seed_attendance_leave_permissions_for_role() from public, anon, authenticated;

drop trigger if exists company_roles_seed_attendance_leave_permissions on public.company_roles;
create trigger company_roles_seed_attendance_leave_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_attendance_leave_permissions_for_role();

drop trigger if exists company_roles_seed_employer_project_permissions on public.company_roles;
create trigger company_roles_seed_employer_project_permissions
  after insert or update on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_employer_project_permissions_for_role();

drop trigger if exists company_roles_seed_supplier_permissions on public.company_roles;
create trigger company_roles_seed_supplier_permissions
  after insert or update on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_supplier_permissions_for_role();

drop trigger if exists company_roles_seed_task_permissions on public.company_roles;
create trigger company_roles_seed_task_permissions
  after insert or update of name on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_task_permissions_for_role();

drop trigger if exists company_roles_seed_sms_permission on public.company_roles;
create trigger company_roles_seed_sms_permission
  after insert or update of name on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_sms_permission_for_role();

drop trigger if exists company_roles_seed_email_permissions on public.company_roles;
create trigger company_roles_seed_email_permissions
  after insert or update of name on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_email_permissions_for_role();

drop trigger if exists company_roles_seed_whatsapp_permissions on public.company_roles;
create trigger company_roles_seed_whatsapp_permissions
  after insert or update of name on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_whatsapp_permissions_for_role();

drop trigger if exists company_roles_seed_company_drive_permissions on public.company_roles;
create trigger company_roles_seed_company_drive_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row
  when (new.is_system_default is true)
  execute function public.seed_company_drive_permissions_for_role();

delete from public.role_permissions role_permission
using public.company_roles role
where role.id = role_permission.role_id
  and role.company_id = role_permission.company_id
  and role.is_system_default is not true
  and role_permission.permission_code in ('attendance.clock', 'leave.create');