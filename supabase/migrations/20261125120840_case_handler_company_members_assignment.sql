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
          join public.company_roles company_role
            on company_role.company_id = membership.company_id
           and company_role.id = membership.role_id
          where membership.company_id = new.company_id
            and membership.user_id = actor_id
            and membership.status = 'active'
            and lower(trim(company_role.name)) in (
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

  if new.case_handler_user_id is not null and not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = new.case_handler_user_id
      and membership.status = 'active'
  ) then
    raise exception 'Choose an active member in this company.'
      using errcode = '23514';
  end if;

  new.case_handler_assigned_by := actor_id;
  new.case_handler_assigned_at := now();
  return new;
end;
$$;

create or replace function public.dispatch_due_case_handler_followups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_time timestamptz := now();
  candidate_row record;
  followup_id uuid;
  followup_task_list_id uuid;
  new_task_id uuid;
  assigner_id uuid;
  assigner_name text;
  handler_name text;
  task_title text;
begin
  for candidate_row in
    select candidate.company_id,
      candidate.id as candidate_id,
      candidate.case_handler_user_id,
      candidate.case_handler_assigned_by,
      candidate.file_number,
      concat_ws(' ', candidate.first_name, candidate.last_name) as candidate_name,
      activity.last_activity_at
    from public.candidates candidate
    join public.companies company
      on company.id = candidate.company_id
     and company.case_handlers_enabled
    join public.company_memberships handler_membership
      on handler_membership.company_id = candidate.company_id
     and handler_membership.user_id = candidate.case_handler_user_id
     and handler_membership.status = 'active'
    left join public.candidate_activity_summaries summary
      on summary.company_id = candidate.company_id
     and summary.candidate_id = candidate.id
    cross join lateral (
      select greatest(
        coalesce(summary.last_activity_at, candidate.updated_at, candidate.created_at),
        coalesce(candidate.case_handler_assigned_at, candidate.updated_at, candidate.created_at)
      ) as last_activity_at
    ) activity
    where candidate.case_handler_user_id is not null
      and activity.last_activity_at <= dispatch_time - interval '14 days'
      and not exists (
        select 1
        from public.candidate_case_handler_followups followup
        where followup.company_id = candidate.company_id
          and followup.candidate_id = candidate.id
          and followup.handler_user_id = candidate.case_handler_user_id
          and followup.activity_at = activity.last_activity_at
      )
    order by activity.last_activity_at
    limit 100
    for update of candidate skip locked
  loop
    insert into public.candidate_case_handler_followups (
      company_id, candidate_id, handler_user_id, activity_at
    )
    values (
      candidate_row.company_id,
      candidate_row.candidate_id,
      candidate_row.case_handler_user_id,
      candidate_row.last_activity_at
    )
    on conflict (company_id, candidate_id, handler_user_id, activity_at) do nothing
    returning id into followup_id;

    if followup_id is null then
      continue;
    end if;

    assigner_id := coalesce(
      candidate_row.case_handler_assigned_by,
      candidate_row.case_handler_user_id
    );

    select coalesce(nullif(trim(profile.display_name), ''), 'a company administrator')
      into assigner_name
    from public.profiles profile
    where profile.id = assigner_id;
    assigner_name := coalesce(assigner_name, 'a company administrator');

    select coalesce(nullif(trim(profile.display_name), ''), 'the assigned handler')
      into handler_name
    from public.profiles profile
    where profile.id = candidate_row.case_handler_user_id;
    handler_name := coalesce(handler_name, 'the assigned handler');

    task_title := left(
      format(
        'Follow up: %s (%s)',
        candidate_row.candidate_name,
        coalesce(nullif(candidate_row.file_number, ''), 'candidate')
      ),
      300
    );

    insert into public.task_lists (company_id, name, position, created_by)
    values (
      candidate_row.company_id,
      'Case Handler Follow-ups',
      coalesce((
        select max(task_list.position) + 1
        from public.task_lists task_list
        where task_list.company_id = candidate_row.company_id
      ), 0),
      assigner_id
    )
    on conflict (company_id, name) do nothing;

    select task_list.id into followup_task_list_id
    from public.task_lists task_list
    where task_list.company_id = candidate_row.company_id
      and task_list.name = 'Case Handler Follow-ups';

    insert into public.tasks (
      company_id,
      list_id,
      title,
      notes,
      due_at,
      reminder_at,
      assigned_to,
      priority,
      created_by
    )
    values (
      candidate_row.company_id,
      followup_task_list_id,
      task_title,
      format(
        'Assigned by %s. Follow up with %s; there has been no recorded candidate activity since %s. Complete one follow-up during this inactivity period.',
        assigner_name,
        candidate_row.candidate_name,
        to_char(candidate_row.last_activity_at, 'FMMonth DD, YYYY HH12:MI AM')
      ),
      dispatch_time,
      dispatch_time,
      candidate_row.case_handler_user_id,
      'High',
      assigner_id
    )
    returning id into new_task_id;

    update public.candidate_case_handler_followups
    set task_id = new_task_id
    where id = followup_id;

    insert into public.task_notifications (
      company_id,
      task_id,
      recipient_id,
      title,
      body,
      remind_at,
      notification_type
    )
    select candidate_row.company_id,
      new_task_id,
      membership.user_id,
      'Case-handler follow-up reminder',
      format(
        '%s has had no recorded activity for 14 days. A follow-up task was assigned to %s.',
        candidate_row.candidate_name,
        handler_name
      ),
      dispatch_time,
      'case_handler_copy'
    from public.company_memberships membership
    join public.role_permissions copy_permission
      on copy_permission.company_id = membership.company_id
     and copy_permission.role_id = membership.role_id
     and copy_permission.permission_code = 'candidates.case_handler.reminders.copy'
    join public.role_permissions candidate_permission
      on candidate_permission.company_id = membership.company_id
     and candidate_permission.role_id = membership.role_id
     and candidate_permission.permission_code = 'candidates.view'
    where membership.company_id = candidate_row.company_id
      and membership.status = 'active'
      and membership.user_id <> candidate_row.case_handler_user_id
    on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;
  end loop;
end;
$$;

revoke all on function public.dispatch_due_case_handler_followups()
  from public, anon, authenticated;
grant execute on function public.dispatch_due_case_handler_followups()
  to service_role;