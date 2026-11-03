alter table public.tasks
  add column assigned_at timestamptz not null default now(),
  add column assignment_acknowledged_at timestamptz,
  add column last_progress_reminder_at timestamptz;

alter table public.task_notifications
  add column notification_type text not null default 'due_reminder'
    check (notification_type in ('assignment', 'acknowledgement_reminder', 'progress_reminder', 'due_reminder', 'completion'));

alter table public.task_notifications
  drop constraint if exists task_notifications_task_id_recipient_id_remind_at_key;

alter table public.task_notifications
  add constraint task_notifications_event_unique
    unique (task_id, recipient_id, notification_type, remind_at);

create index tasks_assigned_progress_reminders_idx
  on public.tasks (assigned_at, last_progress_reminder_at)
  where assigned_to is not null and assigned_to <> created_by and is_completed = false;

drop policy if exists "Members can create personal tasks" on public.tasks;
create policy "Members can create personal or assigned tasks" on public.tasks
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'tasks.create')
  );

create or replace function public.validate_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = new.assigned_to
      and membership.status = 'active'
  ) then
    raise exception 'Tasks can only be assigned to an active member of the same company.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_task_assignee() from public, anon, authenticated;

create trigger tasks_validate_assignee
  before insert on public.tasks
  for each row execute function public.validate_task_assignee();

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
      and lower(trim(role.name)) in ('general manager', 'supervisor', 'projects manager', 'project manager')
    on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_task_assignment() from public, anon, authenticated;

create trigger tasks_notify_assignment
  after insert on public.tasks
  for each row execute function public.notify_task_assignment();

create or replace function public.acknowledge_assigned_task_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.read_at is null
    and new.read_at is not null
    and new.notification_type in ('assignment', 'acknowledgement_reminder') then
    update public.tasks task
    set assignment_acknowledged_at = coalesce(task.assignment_acknowledged_at, new.read_at)
    where task.id = new.task_id
      and task.company_id = new.company_id
      and task.assigned_to = new.recipient_id;

    update public.task_notifications notification
    set sms_status = 'not_requested'
    where notification.task_id = new.task_id
      and notification.company_id = new.company_id
      and notification.recipient_id = new.recipient_id
      and notification.notification_type = 'acknowledgement_reminder'
      and notification.sms_status = 'queued';
  end if;

  return new;
end;
$$;

revoke all on function public.acknowledge_assigned_task_notification() from public, anon, authenticated;

create trigger task_notifications_acknowledge_assignment
  after update of read_at on public.task_notifications
  for each row execute function public.acknowledge_assigned_task_notification();

create or replace function public.notify_task_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  completer_name text;
  completer_id uuid;
begin
  if old.is_completed or not new.is_completed
    or new.assigned_to is null
    or new.assigned_to = new.created_by then
    return new;
  end if;

  update public.task_notifications notification
  set sms_status = 'not_requested'
  where notification.task_id = new.id
    and notification.company_id = new.company_id
    and notification.notification_type = 'acknowledgement_reminder'
    and notification.sms_status = 'queued';

  completer_id := coalesce(auth.uid(), new.assigned_to);

  select coalesce(nullif(trim(profile.display_name), ''), 'A colleague')
  into completer_name
  from public.profiles profile
  where profile.id = completer_id;
  completer_name := coalesce(completer_name, 'A colleague');

  insert into public.task_notifications (
    company_id, task_id, recipient_id, title, body, remind_at, notification_type
  )
  select new.company_id,
    new.id,
    recipients.user_id,
    'Task completed',
    format('%s completed the task "%s".', completer_name, new.title),
    now(),
    'completion'
  from (
    select new.created_by as user_id
    union
    select notification.recipient_id
    from public.task_notifications notification
    where notification.task_id = new.id
      and notification.company_id = new.company_id
      and notification.notification_type = 'assignment'
      and notification.recipient_id <> new.assigned_to
  ) recipients
  join public.company_memberships membership
    on membership.company_id = new.company_id
   and membership.user_id = recipients.user_id
   and membership.status = 'active'
  where recipients.user_id <> new.assigned_to
  on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

  return new;
end;
$$;

revoke all on function public.notify_task_completion() from public, anon, authenticated;

create trigger tasks_notify_completion
  after update of is_completed on public.tasks
  for each row execute function public.notify_task_completion();

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
    and task.reminder_at is not null
    and task.reminder_at <= dispatch_time
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
    and task.assignment_acknowledged_at is null
    and task.assigned_at <= dispatch_time - interval '3 minutes'
  order by task.assigned_at
  limit 100
  on conflict (task_id, recipient_id, notification_type, remind_at) do nothing;

  for task_row in
    select task.id, task.company_id, task.assigned_to, task.created_by, task.title,
      task.assigned_at, task.last_progress_reminder_at
    from public.tasks task
    where task.created_by <> task.assigned_to
      and task.is_completed = false
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

drop function if exists public.list_pending_push_notifications(uuid, uuid);

create function public.list_pending_push_notifications(
  requested_user_id uuid default null,
  requested_company_id uuid default null
)
returns table (
  id uuid,
  company_id uuid,
  recipient_id uuid,
  notification_type text,
  title text,
  body text,
  task_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.company_id, notification.recipient_id,
    'task'::text, notification.title, notification.body, notification.task_id
  from public.task_notifications notification
  where notification.read_at is null
    and notification.sent_at >= now() - interval '7 days'
    and (requested_user_id is null or notification.recipient_id = requested_user_id)
    and (requested_company_id is null or notification.company_id = requested_company_id)
    and not exists (
      select 1 from public.notification_push_deliveries delivery
      where delivery.company_id = notification.company_id
        and delivery.user_id = notification.recipient_id
        and delivery.notification_type = 'task'
        and delivery.notification_id = notification.id
        and delivery.status = 'delivered'
    )
  union all
  select notification.id, notification.company_id, notification.recipient_id,
    'candidate_inquiry'::text, notification.title, notification.body, null::uuid
  from public.candidate_inquiry_notifications notification
  where notification.read_at is null
    and notification.sent_at >= now() - interval '7 days'
    and (requested_user_id is null or notification.recipient_id = requested_user_id)
    and (requested_company_id is null or notification.company_id = requested_company_id)
    and not exists (
      select 1 from public.notification_push_deliveries delivery
      where delivery.company_id = notification.company_id
        and delivery.user_id = notification.recipient_id
        and delivery.notification_type = 'candidate_inquiry'
        and delivery.notification_id = notification.id
        and delivery.status = 'delivered'
    )
  union all
  select notification.id, notification.company_id, notification.recipient_id,
    'leave'::text, notification.title, notification.body, null::uuid
  from public.leave_notifications notification
  where notification.read_at is null
    and notification.sent_at >= now() - interval '7 days'
    and (requested_user_id is null or notification.recipient_id = requested_user_id)
    and (requested_company_id is null or notification.company_id = requested_company_id)
    and not exists (
      select 1 from public.notification_push_deliveries delivery
      where delivery.company_id = notification.company_id
        and delivery.user_id = notification.recipient_id
        and delivery.notification_type = 'leave'
        and delivery.notification_id = notification.id
        and delivery.status = 'delivered'
    )
  union all
  select notification.id, notification.company_id, notification.recipient_id,
    'requisition'::text, notification.title, notification.body, null::uuid
  from public.requisition_notifications notification
  where notification.is_read = false
    and notification.created_at >= now() - interval '7 days'
    and (requested_user_id is null or notification.recipient_id = requested_user_id)
    and (requested_company_id is null or notification.company_id = requested_company_id)
    and not exists (
      select 1 from public.notification_push_deliveries delivery
      where delivery.company_id = notification.company_id
        and delivery.user_id = notification.recipient_id
        and delivery.notification_type = 'requisition'
        and delivery.notification_id = notification.id
        and delivery.status = 'delivered'
    )
  limit 1000;
$$;

revoke all on function public.list_pending_push_notifications(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_pending_push_notifications(uuid, uuid) to service_role;