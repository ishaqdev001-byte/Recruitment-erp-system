create table public.company_assignment_eligibility (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assignment_type text not null check (assignment_type in ('case_handler', 'assistant_staff')),
  user_id uuid references auth.users(id) on delete cascade,
  staff_id uuid references public.company_staff_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint company_assignment_eligibility_target_check check (
    (assignment_type = 'case_handler' and user_id is not null and staff_id is null)
    or (
      assignment_type = 'assistant_staff'
      and ((user_id is not null and staff_id is null) or (user_id is null and staff_id is not null))
    )
  )
);

create unique index company_assignment_eligibility_user_idx
  on public.company_assignment_eligibility (company_id, assignment_type, user_id)
  where user_id is not null;

create unique index company_assignment_eligibility_staff_idx
  on public.company_assignment_eligibility (company_id, assignment_type, staff_id)
  where staff_id is not null;

create index company_assignment_eligibility_company_type_idx
  on public.company_assignment_eligibility (company_id, assignment_type);

alter table public.company_assignment_eligibility enable row level security;
revoke all on public.company_assignment_eligibility from public, anon, authenticated;
grant all on public.company_assignment_eligibility to service_role;

alter table public.projects
  add column if not exists assigned_staff_user_id uuid references auth.users(id) on delete set null;

create index if not exists projects_assigned_staff_user_idx
  on public.projects (company_id, assigned_staff_user_id)
  where assigned_staff_user_id is not null;

alter table public.projects
  add constraint projects_single_assistant_staff_target
  check (assigned_staff_id is null or assigned_staff_user_id is null);

insert into public.company_assignment_eligibility (
  company_id, assignment_type, user_id
)
select distinct candidate.company_id, 'case_handler', candidate.case_handler_user_id
from public.candidates candidate
where candidate.case_handler_user_id is not null
  and not exists (
    select 1
    from public.company_assignment_eligibility eligibility
    where eligibility.company_id = candidate.company_id
      and eligibility.assignment_type = 'case_handler'
      and eligibility.user_id = candidate.case_handler_user_id
  );

insert into public.company_assignment_eligibility (
  company_id, assignment_type, staff_id
)
select distinct project.company_id, 'assistant_staff', project.assigned_staff_id
from public.projects project
where project.assigned_staff_id is not null
  and not exists (
    select 1
    from public.company_assignment_eligibility eligibility
    where eligibility.company_id = project.company_id
      and eligibility.assignment_type = 'assistant_staff'
      and eligibility.staff_id = project.assigned_staff_id
  );

create or replace function private.guard_candidate_case_handler_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  assignment_changed boolean;
begin
  if tg_op = 'INSERT' then
    assignment_changed :=
      new.case_handler_user_id is not null
      or new.case_handler_assigned_by is not null
      or new.case_handler_assigned_at is not null;
  else
    assignment_changed :=
      new.case_handler_user_id is distinct from old.case_handler_user_id
      or new.case_handler_assigned_by is distinct from old.case_handler_assigned_by
      or new.case_handler_assigned_at is distinct from old.case_handler_assigned_at;
  end if;

  if not assignment_changed then
    return new;
  end if;

  actor_id := coalesce((select auth.uid()), new.case_handler_assigned_by);
  if actor_id is null or not exists (
    select 1
    from public.companies company
    where company.id = new.company_id
      and (
        company.primary_admin_user_id = actor_id
        or exists (
          select 1
          from public.company_memberships membership
          join public.company_roles role
            on role.company_id = membership.company_id
           and role.id = membership.role_id
          where membership.company_id = new.company_id
            and membership.user_id = actor_id
            and membership.status = 'active'
            and lower(trim(role.name)) in (
              'chairman',
              'company owner / primary administrator'
            )
        )
        or exists (
          select 1
          from public.company_memberships membership
          join public.role_permissions permission
            on permission.company_id = membership.company_id
           and permission.role_id = membership.role_id
           and permission.permission_code = 'candidates.case_handler.assign'
          where membership.company_id = new.company_id
            and membership.user_id = actor_id
            and membership.status = 'active'
        )
      )
  ) then
    raise exception 'You do not have permission to assign candidate case handlers.'
      using errcode = '42501';
  end if;

  if new.case_handler_user_id is not null and (
    not exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = new.company_id
        and membership.user_id = new.case_handler_user_id
        and membership.status = 'active'
    )
    or not exists (
      select 1
      from public.company_assignment_eligibility eligibility
      where eligibility.company_id = new.company_id
        and eligibility.assignment_type = 'case_handler'
        and eligibility.user_id = new.case_handler_user_id
    )
  ) then
    raise exception 'Choose an active person on the case-handler list in this company.'
      using errcode = '23514';
  end if;

  new.case_handler_assigned_by := actor_id;
  new.case_handler_assigned_at := now();
  return new;
end;
$$;

revoke all on function private.guard_candidate_case_handler_assignment()
  from public, anon, authenticated;

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
    if (new.project_manager_user_id is not null
        or new.assigned_staff_id is not null
        or new.assigned_staff_user_id is not null)
      and actor_id is not null
      and not (actor_is_chairman or actor_can_assign) then
      raise exception 'Only the Chairman or a user with projects.assign can assign project staff.'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' and (
    new.project_manager_user_id is distinct from old.project_manager_user_id
    or new.assigned_staff_id is distinct from old.assigned_staff_id
    or new.assigned_staff_user_id is distinct from old.assigned_staff_user_id
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

  if new.assigned_staff_id is not null and not exists (
    select 1
    from public.company_staff_members staff
    join public.company_assignment_eligibility eligibility
      on eligibility.company_id = staff.company_id
     and eligibility.assignment_type = 'assistant_staff'
     and eligibility.staff_id = staff.id
    where staff.id = new.assigned_staff_id
      and staff.company_id = new.company_id
      and lower(trim(staff.status)) = 'active'
  ) then
    raise exception 'The selected Assistant Staff member is not active and eligible in this company.'
      using errcode = '23514';
  end if;

  if new.assigned_staff_user_id is not null and (
    not exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = new.company_id
        and membership.user_id = new.assigned_staff_user_id
        and membership.status = 'active'
    )
    or not exists (
      select 1
      from public.company_assignment_eligibility eligibility
      where eligibility.company_id = new.company_id
        and eligibility.assignment_type = 'assistant_staff'
        and eligibility.user_id = new.assigned_staff_user_id
    )
  ) then
    raise exception 'The selected Assistant Staff member is not active and eligible in this company.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_guard_role_assignments on public.projects;
create trigger projects_guard_role_assignments
  before insert or update of project_manager_user_id, assigned_staff_id, assigned_staff_user_id
  on public.projects
  for each row execute function public.guard_project_role_assignments();

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
    staff_changed :=
      new.assigned_staff_id is distinct from old.assigned_staff_id
      or new.assigned_staff_user_id is distinct from old.assigned_staff_user_id;
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
        and lower(trim(staff.status)) = 'active'
        and staff.linked_user_id is not null
        and staff_changed

      union all

      select new.assigned_staff_user_id as recipient_id,
        'Assistant Staff'::text as assignment_label
      where staff_changed and new.assigned_staff_user_id is not null
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

drop trigger if exists projects_notify_assignment on public.projects;
create trigger projects_notify_assignment
  after insert or update of project_manager_user_id, assigned_staff_id, assigned_staff_user_id
  on public.projects
  for each row execute function private.notify_project_assignment();

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
    staff_changed :=
      new.assigned_staff_id is distinct from old.assigned_staff_id
      or new.assigned_staff_user_id is distinct from old.assigned_staff_user_id;
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
        and lower(trim(staff.status)) = 'active'
        and staff.linked_user_id is not null
        and staff_changed

      union all

      select new.assigned_staff_user_id as recipient_id,
        'Assistant Staff'::text as assignment_label
      where staff_changed and new.assigned_staff_user_id is not null
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

drop trigger if exists projects_create_assignment_tasks on public.projects;
create trigger projects_create_assignment_tasks
  after insert or update of project_manager_user_id, assigned_staff_id, assigned_staff_user_id
  on public.projects
  for each row execute function private.create_project_assignment_tasks();