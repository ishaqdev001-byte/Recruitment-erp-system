insert into public.permissions (code, description)
values
  ('projects.assign', 'Assign company projects to staff'),
  ('employers.edit', 'Edit company contractor details')
on conflict (code) do update
set description = excluded.description;

alter table public.projects
  add column if not exists project_manager_user_id uuid
    references auth.users (id) on delete set null,
  add column if not exists assigned_staff_id uuid
    references public.company_staff_members (id) on delete set null;

create index if not exists projects_company_manager_idx
  on public.projects (company_id, project_manager_user_id)
  where project_manager_user_id is not null;

create index if not exists projects_company_assigned_staff_idx
  on public.projects (company_id, assigned_staff_id)
  where assigned_staff_id is not null;

insert into public.company_roles (company_id, name, description, is_system_default)
select
  company.id,
  'Projects Manager',
  'Receives projects from the Chairman and assigns them to company staff.',
  true
from public.companies company
where not exists (
  select 1
  from public.company_roles role
  where role.company_id = company.id
    and lower(btrim(role.name)) in ('projects manager', 'project manager')
    and role.is_system_default
)
on conflict (company_id, name) do nothing;

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
    where permission.code in ('projects.view', 'projects.assign')
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

drop trigger if exists company_roles_seed_projects_manager_permissions
  on public.company_roles;
create trigger company_roles_seed_projects_manager_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row
  execute function public.seed_projects_manager_role_permissions();

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join (
  values ('projects.view'), ('projects.assign')
) as permission(code)
where lower(btrim(role.name)) in ('projects manager', 'project manager')
  and role.is_system_default
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'employers.edit'
from public.company_roles role
where lower(btrim(role.name)) in (
    'chairman',
    'company owner / primary administrator',
    'primary administrator'
  )
  and role.is_system_default
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select membership.role_id, membership.company_id, 'employers.edit'
from public.companies company
join public.company_memberships membership
  on membership.company_id = company.id
  and membership.user_id = company.primary_admin_user_id
  and membership.status = 'active'
on conflict (role_id, permission_code) do nothing;

delete from public.role_permissions permission
using public.company_roles role
where permission.role_id = role.id
  and permission.company_id = role.company_id
  and permission.permission_code = 'projects.assign'
  and (
    lower(btrim(role.name)) not in ('projects manager', 'project manager')
    or not role.is_system_default
  );

create or replace function public.create_projects_manager_role_for_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_roles (company_id, name, description, is_system_default)
  select
    new.id,
    'Projects Manager',
    'Receives projects from the Chairman and assigns them to company staff.',
    true
  where not exists (
    select 1
    from public.company_roles role
    where role.company_id = new.id
      and lower(btrim(role.name)) in ('projects manager', 'project manager')
      and role.is_system_default
  )
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;

revoke all on function public.create_projects_manager_role_for_company()
  from public, anon, authenticated;

drop trigger if exists companies_create_projects_manager_role
  on public.companies;
create trigger companies_create_projects_manager_role
  after insert on public.companies
  for each row
  execute function public.create_projects_manager_role_for_company();

create or replace function public.guard_project_role_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.project_manager_user_id is not null then
      if actor_id is not null and not exists (
        select 1
        from public.companies company
        where company.id = new.company_id
          and company.primary_admin_user_id = actor_id
      ) then
        raise exception 'Only the Chairman can assign a Projects Manager.'
          using errcode = '42501';
      end if;

      if not exists (
        select 1
        from public.company_memberships membership
        join public.company_roles role
          on role.id = membership.role_id
          and role.company_id = membership.company_id
        where membership.company_id = new.company_id
          and membership.user_id = new.project_manager_user_id
          and membership.status = 'active'
          and role.is_system_default
          and lower(btrim(role.name)) in ('projects manager', 'project manager')
      ) then
        raise exception 'The selected Projects Manager is not active in this company.'
          using errcode = '23514';
      end if;
    end if;

    if new.assigned_staff_id is not null and actor_id is not null then
      raise exception 'Staff can only be assigned to a project by its Projects Manager.'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.project_manager_user_id is distinct from old.project_manager_user_id then
      if actor_id is not null and not exists (
        select 1
        from public.companies company
        where company.id = new.company_id
          and company.primary_admin_user_id = actor_id
      ) then
        raise exception 'Only the Chairman can change the Projects Manager.'
          using errcode = '42501';
      end if;

      if new.project_manager_user_id is not null and not exists (
        select 1
        from public.company_memberships membership
        join public.company_roles role
          on role.id = membership.role_id
          and role.company_id = membership.company_id
        where membership.company_id = new.company_id
          and membership.user_id = new.project_manager_user_id
          and membership.status = 'active'
          and role.is_system_default
          and lower(btrim(role.name)) in ('projects manager', 'project manager')
      ) then
        raise exception 'The selected Projects Manager is not active in this company.'
          using errcode = '23514';
      end if;
    end if;

    if new.assigned_staff_id is distinct from old.assigned_staff_id
      and actor_id is not null
      and not (
        exists (
          select 1
          from public.companies company
          where company.id = new.company_id
            and company.primary_admin_user_id = actor_id
        )
        or (
          old.project_manager_user_id = actor_id
          and exists (
            select 1
            from public.company_memberships membership
            join public.company_roles role
              on role.id = membership.role_id
              and role.company_id = membership.company_id
            where membership.company_id = new.company_id
              and membership.user_id = actor_id
              and membership.status = 'active'
              and role.is_system_default
              and lower(btrim(role.name)) in ('projects manager', 'project manager')
          )
          and public.current_user_has_company_permission(
            new.company_id,
            'projects.assign'
          )
        )
      ) then
      raise exception 'Only the Chairman or assigned Projects Manager can assign staff to this project.'
        using errcode = '42501';
    end if;
  end if;

  if new.assigned_staff_id is not null
    and (
      tg_op = 'INSERT'
      or new.assigned_staff_id is distinct from old.assigned_staff_id
    )
    and not exists (
      select 1
      from public.company_staff_members staff
      where staff.id = new.assigned_staff_id
        and staff.company_id = new.company_id
        and staff.status = 'Active'
    ) then
    raise exception 'The selected staff member is not active in this company.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_role_assignments()
  from public, anon, authenticated;

drop trigger if exists projects_guard_role_assignments
  on public.projects;
create trigger projects_guard_role_assignments
  before insert or update of project_manager_user_id, assigned_staff_id
  on public.projects
  for each row
  execute function public.guard_project_role_assignments();