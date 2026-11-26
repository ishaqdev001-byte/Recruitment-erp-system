-- Allow any active company member (not just linked staff) to be assigned as Assistant Staff
-- This change removes the requirement that Assistant Staff members must have a linked company membership

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

  -- Allow any active staff member as Assistant Staff (no linking requirement)
  if new.assigned_staff_id is not null
    and not exists (
      select 1
      from public.company_staff_members staff
      where staff.id = new.assigned_staff_id
        and staff.company_id = new.company_id
        and staff.status = 'Active'
    ) then
    raise exception 'The selected Assistant Staff member must be active in this company.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Update the notification trigger to handle staff members that may not be linked
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
  staff_user_id uuid;
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

-- Update the task creation trigger to handle staff members that may not be linked
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
