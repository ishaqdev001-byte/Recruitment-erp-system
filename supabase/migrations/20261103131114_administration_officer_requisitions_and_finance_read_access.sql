insert into public.permissions (code, description)
values
  ('requisitions.create', 'Create company requisitions'),
  ('employers.view', 'View company contractors'),
  ('employers.create', 'Create company contractors'),
  ('employers.edit', 'Edit company contractors'),
  ('employers.delete', 'Delete company contractors'),
  ('projects.view', 'View company projects'),
  ('projects.create', 'Create company projects'),
  ('projects.edit', 'Edit company projects'),
  ('projects.delete', 'Delete company projects'),
  ('projects.status', 'Change company project status')
on conflict (code) do nothing;

create or replace function public.normalize_administration_officer_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.name = 'Administration Officer'
    and (new.name <> old.name or new.is_system_default is not true) then
    raise exception 'The Administration Officer system role cannot be renamed or disabled.';
  end if;

  if lower(btrim(new.name)) in ('administrator', 'administration officer') then
    if new.is_system_default is not true then
      raise exception 'Administration Officer is a protected system role.';
    end if;

    new.name := 'Administration Officer';
  end if;

  return new;
end;
$$;

drop trigger if exists company_roles_normalize_administration_officer
  on public.company_roles;
create trigger company_roles_normalize_administration_officer
  before insert or update of name, is_system_default on public.company_roles
  for each row
  execute function public.normalize_administration_officer_role();

create or replace function public.guard_company_role_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_role public.company_roles%rowtype;
begin
  select role.*
  into target_role
  from public.company_roles role
  where role.id = new.role_id
    and role.company_id = new.company_id;

  if not found then
    raise exception 'Role permission must reference a role in the same company.';
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

drop trigger if exists company_role_permissions_access_guard
  on public.role_permissions;
create trigger company_role_permissions_access_guard
  before insert or update of role_id, company_id, permission_code
  on public.role_permissions
  for each row
  execute function public.guard_company_role_permissions();

create or replace function public.seed_administration_officer_and_finance_manager_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name = 'Administration Officer' and new.is_system_default then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    on conflict (role_id, permission_code) do nothing;
  else
    delete from public.role_permissions role_permission
    where role_permission.role_id = new.id
      and role_permission.permission_code = 'requisitions.create';
  end if;

  if new.name = 'Finance Manager' then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    where permission.code in ('employers.view', 'projects.view')
    on conflict (role_id, permission_code) do nothing;

    delete from public.role_permissions role_permission
    where role_permission.role_id = new.id
      and role_permission.permission_code = any(array[
        'employers.create', 'employers.edit', 'employers.delete',
        'projects.create', 'projects.edit', 'projects.delete', 'projects.status'
      ]);
  end if;

  return new;
end;
$$;

revoke all on function public.seed_administration_officer_and_finance_manager_permissions()
  from public, anon, authenticated;

drop trigger if exists company_roles_seed_administration_and_finance_permissions
  on public.company_roles;
create trigger company_roles_seed_administration_and_finance_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row
  execute function public.seed_administration_officer_and_finance_manager_permissions();

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
    ('Administration Officer', 'Administers company operations, records, permissions, and user access.'),
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
        company_role.name in ('Chairman', 'General Manager', 'CEO', 'Administration Officer')
        and permission.code not in ('reports.view', 'requisitions.create')
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

do $$
declare
  legacy_role record;
  canonical_role_id uuid;
begin
  for legacy_role in
    select role.id, role.company_id
    from public.company_roles role
    where lower(btrim(role.name)) = 'administrator'
  loop
    select role.id
    into canonical_role_id
    from public.company_roles role
    where role.company_id = legacy_role.company_id
      and role.id <> legacy_role.id
      and lower(btrim(role.name)) = 'administration officer'
    limit 1;

    if canonical_role_id is null then
      update public.company_roles
      set name = 'Administration Officer',
          is_system_default = true
      where id = legacy_role.id;
    else
      update public.company_roles
      set is_system_default = true
      where id = canonical_role_id;

      insert into public.role_permissions (role_id, company_id, permission_code)
      select canonical_role_id, permission.company_id, permission.permission_code
      from public.role_permissions permission
      where permission.role_id = legacy_role.id
      on conflict (role_id, permission_code) do nothing;

      update public.company_memberships
      set role_id = canonical_role_id
      where role_id = legacy_role.id;

      delete from public.company_roles
      where id = legacy_role.id;
    end if;

    canonical_role_id := null;
  end loop;
end;
$$;

delete from public.role_permissions permission
using public.company_roles role
where permission.role_id = role.id
  and permission.company_id = role.company_id
  and permission.permission_code = 'requisitions.create'
  and not (
    role.name = 'Administration Officer'
    and role.is_system_default
  );

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join (
  values ('employers.view'), ('projects.view')
) as permission(code)
where role.name = 'Finance Manager'
on conflict (role_id, permission_code) do nothing;

delete from public.role_permissions permission
using public.company_roles role
where permission.role_id = role.id
  and permission.company_id = role.company_id
  and role.name = 'Finance Manager'
  and permission.permission_code = any(array[
    'employers.create', 'employers.edit', 'employers.delete',
    'projects.create', 'projects.edit', 'projects.delete', 'projects.status'
  ]);

create or replace function public.require_administration_officer_for_requisition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is distinct from (select auth.uid()) then
    raise exception 'The authenticated user must be the requisition creator.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
      and role.company_id = membership.company_id
    where membership.company_id = new.company_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role.name = 'Administration Officer'
      and role.is_system_default
  ) or not public.current_user_has_company_permission(
    new.company_id,
    'requisitions.create'
  ) then
    raise exception 'Only the Administration Officer can create requisitions.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.require_administration_officer_for_requisition()
  from public, anon, authenticated;

drop trigger if exists company_requisitions_require_administration_officer
  on public.company_requisitions;
create trigger company_requisitions_require_administration_officer
  before insert on public.company_requisitions
  for each row
  execute function public.require_administration_officer_for_requisition();