insert into public.permissions (code, description)
values ('tasks.reassign', 'Reassign or cancel tasks created by other company members')
on conflict (code) do nothing;

alter table public.tasks
  add column is_cancelled boolean not null default false,
  add column last_overdue_reminder_at timestamptz;

alter table public.tasks
  add constraint tasks_completed_cancelled_check
  check (not (is_completed and is_cancelled));

create index tasks_overdue_reminders_idx
  on public.tasks (due_at, last_overdue_reminder_at)
  where is_completed = false and is_cancelled = false;

alter table public.task_notifications
  drop constraint if exists task_notifications_notification_type_check;

alter table public.task_notifications
  add constraint task_notifications_notification_type_check
  check (notification_type in (
    'assignment',
    'acknowledgement_reminder',
    'progress_reminder',
    'due_reminder',
    'completion',
    'case_handler_copy',
    'overdue_reminder'
  ));

drop trigger if exists tasks_prevent_reassignment on public.tasks;
create or replace function public.prevent_task_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.created_by is distinct from old.created_by then
      raise exception 'The task creator cannot be changed.';
    end if;

    if new.assigned_to is distinct from old.assigned_to
      and auth.uid() <> old.created_by
      and not public.current_user_has_company_permission(old.company_id, 'tasks.reassign') then
      raise exception 'Only the task creator or a user with tasks.reassign can reassign this task.';
    end if;

    if new.is_cancelled is distinct from old.is_cancelled
      and auth.uid() <> old.created_by
      and not public.current_user_has_company_permission(old.company_id, 'tasks.reassign') then
      raise exception 'Only the task creator or a user with tasks.reassign can cancel this task.';
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is not null and not exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = new.company_id
        and membership.user_id = new.assigned_to
        and membership.status = 'active'
    ) then
      raise exception 'Tasks can only be assigned to an active member of the same company.';
    end if;

    new.assigned_at := now();
    new.assignment_acknowledged_at := null;
    new.last_progress_reminder_at := null;
    new.last_overdue_reminder_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_task_reassignment() from public, anon, authenticated;

create trigger tasks_prevent_reassignment
  before update of assigned_to, created_by, is_cancelled on public.tasks
  for each row execute function public.prevent_task_reassignment();

drop trigger if exists tasks_notify_assignment on public.tasks;
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
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    update public.task_notifications notification
    set sms_status = 'not_requested'
    where notification.task_id = new.id
      and notification.company_id = new.company_id
      and notification.recipient_id = old.assigned_to
      and notification.notification_type in (
        'due_reminder',
        'acknowledgement_reminder',
        'progress_reminder',
        'overdue_reminder'
      )
      and notification.sms_status = 'queued';
  end if;

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
      and lower(trim(role.name)) in ('general manager', 'supervisor', 'projects manager', 'project manager')
    on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_task_assignment() from public, anon, authenticated;

create trigger tasks_notify_assignment
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_task_assignment();

create or replace function public.cancel_task_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_cancelled and not old.is_cancelled then
    update public.task_notifications notification
    set sms_status = 'not_requested'
    where notification.task_id = new.id
      and notification.company_id = new.company_id
      and notification.notification_type in (
        'due_reminder',
        'acknowledgement_reminder',
        'progress_reminder',
        'overdue_reminder'
      )
      and notification.sms_status = 'queued';
  end if;

  return new;
end;
$$;

revoke all on function public.cancel_task_reminders() from public, anon, authenticated;

create trigger tasks_cancel_queued_reminders
  after update of is_cancelled on public.tasks
  for each row execute function public.cancel_task_reminders();

create or replace function public.dispatch_due_task_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_time timestamptz := now();
  task_row record;
begin
  insert into public.task_notifications (
    company_id, task_id, recipient_id, title, body, remind_at, sms_status, notification_type
  )
  select task.company_id,
    task.id,
    coalesce(task.assigned_to, task.created_by),
    task.title,
    case
      when task.due_at is null then 'Task reminder.'
      else 'Task reminder. Due ' || to_char(task.due_at, 'FMMonth DD, YYYY HH12:MI AM') || '.'
    end,
    task.reminder_at,
    case when task.sms_reminder_enabled then 'queued' else 'not_requested' end,
    'due_reminder'
  from public.tasks task
  join public.company_memberships membership
    on membership.company_id = task.company_id
   and membership.user_id = coalesce(task.assigned_to, task.created_by)
   and membership.status = 'active'
  where task.is_completed = false
    and task.is_cancelled = false
    and task.reminder_at is not null
    and task.reminder_at <= dispatch_time
    and task.reminder_at > task.assigned_at
  order by task.reminder_at
  limit 100
  on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

  insert into public.task_notifications (
    company_id, task_id, recipient_id, title, body, remind_at, sms_status, notification_type
  )
  select task.company_id,
    task.id,
    task.assigned_to,
    'Please review your assigned task',
    format('This task is still waiting for your acknowledgement: "%s".', task.title),
    task.assigned_at + interval '3 minutes',
    'queued',
    'acknowledgement_reminder'
  from public.tasks task
  join public.company_memberships membership
    on membership.company_id = task.company_id
   and membership.user_id = task.assigned_to
   and membership.status = 'active'
  where task.created_by <> task.assigned_to
    and task.is_completed = false
    and task.is_cancelled = false
    and task.assignment_acknowledged_at is null
    and task.assigned_at <= dispatch_time - interval '3 minutes'
  order by task.assigned_at
  limit 100
  on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

  for task_row in
    select task.id, task.company_id, task.assigned_to, task.created_by, task.title,
      task.due_at, task.last_overdue_reminder_at
    from public.tasks task
    where task.is_completed = false
      and task.is_cancelled = false
      and task.due_at is not null
      and task.due_at <= dispatch_time
      and (
        task.last_overdue_reminder_at is null
        or task.last_overdue_reminder_at <= dispatch_time - interval '10 minutes'
      )
    order by task.last_overdue_reminder_at nulls first, task.due_at
    limit 100
    for update skip locked
  loop
    if exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = task_row.company_id
        and membership.user_id = coalesce(task_row.assigned_to, task_row.created_by)
        and membership.status = 'active'
    ) then
      insert into public.task_notifications (
        company_id, task_id, recipient_id, title, body, remind_at, sms_status, notification_type
      )
      values (
        task_row.company_id,
        task_row.id,
        coalesce(task_row.assigned_to, task_row.created_by),
        'Task overdue',
        format('This task is overdue and still incomplete: "%s".', task_row.title),
        dispatch_time,
        'not_requested',
        'overdue_reminder'
      )
      on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

      update public.tasks
      set last_overdue_reminder_at = dispatch_time
      where id = task_row.id
        and company_id = task_row.company_id;
    end if;
  end loop;

  for task_row in
    select task.id, task.company_id, task.assigned_to, task.title,
      task.assigned_at, task.last_progress_reminder_at
    from public.tasks task
    where task.created_by <> task.assigned_to
      and task.is_completed = false
      and task.is_cancelled = false
      and (task.due_at is null or task.due_at > dispatch_time)
      and task.assigned_at <= dispatch_time - interval '10 minutes'
      and (
        task.last_progress_reminder_at is null
        or task.last_progress_reminder_at <= dispatch_time - interval '10 minutes'
      )
    order by task.last_progress_reminder_at nulls first, task.assigned_at
    limit 100
    for update skip locked
  loop
    if exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = task_row.company_id
        and membership.user_id = task_row.assigned_to
        and membership.status = 'active'
    ) then
      insert into public.task_notifications (
        company_id, task_id, recipient_id, title, body, remind_at, notification_type
      )
      values (
        task_row.company_id,
        task_row.id,
        task_row.assigned_to,
        'Task still incomplete',
        format('Please complete or update your task: "%s".', task_row.title),
        dispatch_time,
        'progress_reminder'
      )
      on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

      update public.tasks
      set last_progress_reminder_at = dispatch_time
      where id = task_row.id
        and company_id = task_row.company_id;
    end if;
  end loop;
end;
$$;

revoke all on function public.dispatch_due_task_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_due_task_notifications() to service_role;