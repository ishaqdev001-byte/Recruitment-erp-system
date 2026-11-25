alter table public.companies
  add column if not exists assistant_staff_enabled boolean not null default false;

create or replace function public.seed_projects_manager_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.name)) in ('project handler', 'projects manager', 'project manager')
    and new.is_system_default then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    where permission.code in (
      'projects.view', 'projects.assign', 'candidates.view', 'candidates.edit',
      'candidates.stage', 'candidates.project_submit', 'candidate_inquiries.view',
      'candidate_inquiries.create', 'documents.view', 'documents.upload',
      'documents.download', 'documents.edit', 'documents.delete', 'passport.view'
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
    'Project Handler',
    'Receives project assignments and coordinates project progress.',
    true
  where not exists (
    select 1
    from public.company_roles role
    where role.company_id = new.id
      and lower(btrim(role.name)) in ('project handler', 'projects manager', 'project manager')
      and role.is_system_default
  )
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;

do $$
declare
  old_role record;
  handler_role_id uuid;
begin
  for old_role in
    select role.id, role.company_id
    from public.company_roles role
    where role.is_system_default
      and lower(btrim(role.name)) in ('projects manager', 'project manager')
  loop
    select role.id into handler_role_id
    from public.company_roles role
    where role.company_id = old_role.company_id
      and role.is_system_default
      and lower(btrim(role.name)) = 'project handler'
    limit 1;

    if handler_role_id is null then
      update public.company_roles
      set name = 'Project Handler',
          description = 'Receives project assignments and coordinates project progress.'
      where id = old_role.id;
      handler_role_id := old_role.id;
    else
      update public.company_memberships
      set role_id = handler_role_id
      where role_id = old_role.id
        and company_id = old_role.company_id;

      insert into public.role_permissions (role_id, company_id, permission_code)
      select handler_role_id, permission.company_id, permission.permission_code
      from public.role_permissions permission
      where permission.role_id = old_role.id
        and permission.company_id = old_role.company_id
      on conflict (role_id, permission_code) do nothing;

      delete from public.role_permissions
      where role_id = old_role.id
        and company_id = old_role.company_id;

      delete from public.company_roles where id = old_role.id;
    end if;

    insert into public.role_permissions (role_id, company_id, permission_code)
    select handler_role_id, old_role.company_id, permission.code
    from (values
      ('projects.view'), ('projects.assign'), ('candidates.view'), ('candidates.edit'),
      ('candidates.stage'), ('candidates.project_submit'), ('candidate_inquiries.view'),
      ('candidate_inquiries.create'), ('documents.view'), ('documents.upload'),
      ('documents.download'), ('documents.edit'), ('documents.delete'), ('passport.view')
    ) as permission(code)
    where exists (
      select 1 from public.permissions existing where existing.code = permission.code
    )
    on conflict (role_id, permission_code) do nothing;
  end loop;
end;
$$;

insert into public.company_roles (company_id, name, description, is_system_default)
select company.id, 'Project Handler',
  'Receives project assignments and coordinates project progress.', true
from public.companies company
where not exists (
  select 1
  from public.company_roles role
  where role.company_id = company.id
    and role.is_system_default
    and lower(btrim(role.name)) in ('project handler', 'projects manager', 'project manager')
)
on conflict (company_id, name) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join (values
  ('projects.view'), ('projects.assign'), ('candidates.view'), ('candidates.edit'),
  ('candidates.stage'), ('candidates.project_submit'), ('candidate_inquiries.view'),
  ('candidate_inquiries.create'), ('documents.view'), ('documents.upload'),
  ('documents.download'), ('documents.edit'), ('documents.delete'), ('passport.view')
) as permission(code)
join public.permissions existing on existing.code = permission.code
where role.is_system_default
  and lower(btrim(role.name)) = 'project handler'
on conflict (role_id, permission_code) do nothing;

create or replace function public.guard_project_role_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_chairman boolean;
  actor_can_assign boolean;
begin
  select exists (
    select 1
    from public.companies company
    where company.id = new.company_id
      and company.primary_admin_user_id = actor_id
  ) into actor_is_chairman;

  actor_can_assign := actor_id is not null
    and public.current_user_has_company_permission(new.company_id, 'projects.assign');

  if tg_op = 'INSERT' then
    if (new.project_manager_user_id is not null or new.assigned_staff_id is not null)
      and actor_id is not null
      and not (actor_is_chairman or actor_can_assign) then
      raise exception 'Only the Chairman or a user with projects.assign can assign project staff.'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' and (
    new.project_manager_user_id is distinct from old.project_manager_user_id
    or new.assigned_staff_id is distinct from old.assigned_staff_id
  ) then
    if actor_id is not null and not (actor_is_chairman or actor_can_assign) then
      raise exception 'Only the Chairman or a user with projects.assign can assign project staff.'
        using errcode = '42501';
    end if;
  end if;

  if new.project_manager_user_id is not null
    and not exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = new.company_id
        and membership.user_id = new.project_manager_user_id
        and membership.status = 'active'
    ) then
    raise exception 'The selected Project Handler is not an active member of this company.'
      using errcode = '23514';
  end if;

  if new.assigned_staff_id is not null
    and not exists (
      select 1
      from public.company_staff_members staff
      join public.company_memberships membership
        on membership.company_id = staff.company_id
       and membership.user_id = staff.linked_user_id
       and membership.status = 'active'
      where staff.id = new.assigned_staff_id
        and staff.company_id = new.company_id
        and staff.status = 'Active'
    ) then
    raise exception 'The selected Assistant Staff member must be active and linked to this company.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create table if not exists public.task_progress_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  reported_by uuid not null references auth.users(id) on delete restrict,
  progress_percent integer not null check (progress_percent between 0 and 100),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists task_progress_reports_task_created_idx
  on public.task_progress_reports (company_id, task_id, created_at desc);

alter table public.task_progress_reports enable row level security;
revoke all on public.task_progress_reports from public, anon, authenticated;
grant select, insert on public.task_progress_reports to authenticated;

drop policy if exists "Task participants and company owner can read progress reports"
  on public.task_progress_reports;
create policy "Task participants and company owner can read progress reports"
  on public.task_progress_reports for select to authenticated
  using (
    exists (
      select 1
      from public.tasks task
      where task.id = task_progress_reports.task_id
        and task.company_id = task_progress_reports.company_id
        and (
          task.created_by = (select auth.uid())
          or task.assigned_to = (select auth.uid())
          or exists (
            select 1
            from public.companies company
            where company.id = task_progress_reports.company_id
              and company.primary_admin_user_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Assigned task owners can submit progress reports"
  on public.task_progress_reports;
create policy "Assigned task owners can submit progress reports"
  on public.task_progress_reports for insert to authenticated
  with check (
    reported_by = (select auth.uid())
    and exists (
      select 1
      from public.tasks task
      join public.company_memberships membership
        on membership.company_id = task_progress_reports.company_id
       and membership.user_id = (select auth.uid())
       and membership.status = 'active'
      where task.id = task_progress_reports.task_id
        and task.company_id = task_progress_reports.company_id
        and task.assigned_to = (select auth.uid())
    )
  );

create or replace function private.notify_project_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  handler_changed boolean;
  staff_changed boolean;
  assignment record;
  communication_id uuid;
  assignment_body text;
  assigner_name text;
begin
  if tg_op = 'INSERT' then
    handler_changed := true;
    staff_changed := true;
  else
    handler_changed := new.project_manager_user_id is distinct from old.project_manager_user_id;
    staff_changed := new.assigned_staff_id is distinct from old.assigned_staff_id;
  end if;

  if not handler_changed and not staff_changed then return new; end if;

  select coalesce(nullif(btrim(profile.display_name), ''), 'a company administrator')
  into assigner_name
  from public.profiles profile
  where profile.id = coalesce((select auth.uid()), new.created_by);
  assigner_name := coalesce(assigner_name, 'a company administrator');

  for assignment in
    select target.recipient_id,
      string_agg(target.assignment_label, ' and ' order by target.assignment_label) as assignment_labels
    from (
      select new.project_manager_user_id as recipient_id,
        'Project Handler'::text as assignment_label
      where handler_changed and new.project_manager_user_id is not null

      union all

      select staff.linked_user_id as recipient_id,
        'Assistant Staff'::text as assignment_label
      from public.company_staff_members staff
      where staff.id = new.assigned_staff_id
        and staff.company_id = new.company_id
        and staff.status = 'Active'
        and staff.linked_user_id is not null
        and staff_changed
    ) target
    join public.company_memberships membership
      on membership.company_id = new.company_id
     and membership.user_id = target.recipient_id
     and membership.status = 'active'
    group by target.recipient_id
  loop
    assignment_body := format(
      'Assigned by %s as %s to project "%s". Country: %s. Vacancies: %s. Salary range: %s.',
      assigner_name,
      assignment.assignment_labels,
      new.project_name,
      coalesce(nullif(new.country, ''), 'Not specified'),
      new.total_demand,
      coalesce(nullif(new.salary_range, ''), 'Not specified')
    );

    insert into public.workspace_communications (
      company_id, recipient_id, candidate_id, project_id, submission_id,
      event_type, subject, body
    )
    values (
      new.company_id, assignment.recipient_id, null, new.id, null,
      'project_assignment', 'Project assigned: ' || new.project_name, assignment_body
    )
    returning id into communication_id;

    insert into public.workspace_notifications (
      company_id, recipient_id, required_permission, category, title, body,
      source_type, source_id
    )
    values (
      new.company_id, assignment.recipient_id, 'projects.view', 'communications',
      'Project assigned to you', assignment_body, 'project.assignment', communication_id
    );
  end loop;

  return new;
end;
$$;

create or replace function private.create_project_assignment_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  handler_changed boolean;
  staff_changed boolean;
  assignment record;
  project_task_list_id uuid;
  actor_id uuid;
  actor_name text;
begin
  if tg_op = 'INSERT' then
    handler_changed := true;
    staff_changed := true;
  else
    handler_changed := new.project_manager_user_id is distinct from old.project_manager_user_id;
    staff_changed := new.assigned_staff_id is distinct from old.assigned_staff_id;
  end if;

  if not handler_changed and not staff_changed then return new; end if;

  actor_id := coalesce((select auth.uid()), new.created_by);
  select coalesce(nullif(btrim(profile.display_name), ''), 'a company administrator')
  into actor_name
  from public.profiles profile
  where profile.id = actor_id;
  actor_name := coalesce(actor_name, 'a company administrator');

  insert into public.task_lists (company_id, name, position, created_by)
  values (
    new.company_id,
    'Project Assignments',
    coalesce((
      select max(task_list.position) + 1
      from public.task_lists task_list
      where task_list.company_id = new.company_id
    ), 0),
    actor_id
  )
  on conflict (company_id, name) do nothing;

  select task_list.id into project_task_list_id
  from public.task_lists task_list
  where task_list.company_id = new.company_id
    and task_list.name = 'Project Assignments';

  for assignment in
    select target.recipient_id,
      string_agg(target.assignment_label, ' and ' order by target.assignment_label) as assignment_labels
    from (
      select new.project_manager_user_id as recipient_id,
        'Project Handler'::text as assignment_label
      where handler_changed and new.project_manager_user_id is not null

      union all

      select staff.linked_user_id as recipient_id,
        'Assistant Staff'::text as assignment_label
      from public.company_staff_members staff
      where staff.id = new.assigned_staff_id
        and staff.company_id = new.company_id
        and staff.status = 'Active'
        and staff.linked_user_id is not null
        and staff_changed
    ) target
    join public.company_memberships membership
      on membership.company_id = new.company_id
     and membership.user_id = target.recipient_id
     and membership.status = 'active'
    group by target.recipient_id
  loop
    insert into public.tasks (
      company_id, list_id, title, notes, assigned_to, priority, created_by
    )
    values (
      new.company_id,
      project_task_list_id,
      left(format('Project assignment: %s', new.project_name), 300),
      format(
        'Assigned by %s as %s. Project: %s. Country: %s. Vacancies: %s. Salary range: %s. Report progress by submitting a percentage and a dated update.',
        actor_name,
        assignment.assignment_labels,
        new.project_name,
        coalesce(nullif(new.country, ''), 'Not specified'),
        new.total_demand,
        coalesce(nullif(new.salary_range, ''), 'Not specified')
      ),
      assignment.recipient_id,
      'Medium',
      actor_id
    );
  end loop;

  return new;
end;
$$;

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  creator_name text;
  assignee_name text;
  creator_branch_id uuid;
begin
  if new.assigned_to is null or new.assigned_to = new.created_by then
    return new;
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), 'A colleague')
  into creator_name
  from public.profiles profile
  where profile.id = new.created_by;
  creator_name := coalesce(creator_name, 'A colleague');

  select coalesce(nullif(trim(profile.display_name), ''), 'the assigned staff member')
  into assignee_name
  from public.profiles profile
  where profile.id = new.assigned_to;
  assignee_name := coalesce(assignee_name, 'the assigned staff member');

  select membership.branch_id
  into creator_branch_id
  from public.company_memberships membership
  where membership.company_id = new.company_id
    and membership.user_id = new.created_by
    and membership.status = 'active'
  limit 1;

  insert into public.task_notifications (
    company_id, task_id, recipient_id, title, body, remind_at, notification_type
  )
  values (
    new.company_id,
    new.id,
    new.assigned_to,
    'New task assigned to you',
    format('Dear %s, you have been assigned "%s" by %s. Kindly review the task and take action.', assignee_name, new.title, creator_name),
    new.assigned_at,
    'assignment'
  )
  on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

  if creator_branch_id is not null then
    insert into public.task_notifications (
      company_id, task_id, recipient_id, title, body, remind_at, notification_type
    )
    select distinct
      new.company_id,
      new.id,
      membership.user_id,
      'Task assigned to ' || assignee_name,
      format('%s assigned "%s" to %s.', creator_name, new.title, assignee_name),
      new.assigned_at,
      'assignment'
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    where membership.company_id = new.company_id
      and membership.branch_id = creator_branch_id
      and membership.status = 'active'
      and membership.user_id <> new.assigned_to
      and lower(trim(role.name)) in (
        'general manager', 'supervisor', 'project handler',
        'projects manager', 'project manager'
      )
    on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;
  end if;

  return new;
end;
$$;