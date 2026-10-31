create table public.notification_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  endpoint text not null check (length(endpoint) <= 4000 and endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, user_id)
    references public.company_memberships (company_id, user_id) on delete cascade,
  unique (endpoint)
);

create index notification_push_subscriptions_user_idx
  on public.notification_push_subscriptions (company_id, user_id);

alter table public.notification_push_subscriptions enable row level security;
revoke all on public.notification_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.notification_push_subscriptions to service_role;

create table public.notification_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  notification_type text not null
    check (notification_type in ('task', 'candidate_inquiry', 'leave', 'requisition')),
  notification_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'delivered')),
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  delivered_at timestamptz,
  last_error text not null default '',
  foreign key (company_id, user_id)
    references public.company_memberships (company_id, user_id) on delete cascade,
  unique (company_id, user_id, notification_type, notification_id)
);

create index notification_push_deliveries_recent_idx
  on public.notification_push_deliveries (delivered_at desc);

alter table public.notification_push_deliveries enable row level security;
revoke all on public.notification_push_deliveries from public, anon, authenticated;
grant select, insert, update on public.notification_push_deliveries to service_role;

create or replace function public.claim_notification_push_delivery(
  requested_company_id uuid,
  requested_user_id uuid,
  requested_notification_type text,
  requested_notification_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
begin
  insert into public.notification_push_deliveries (
    company_id, user_id, notification_type, notification_id
  )
  values (
    requested_company_id, requested_user_id, requested_notification_type, requested_notification_id
  )
  on conflict (company_id, user_id, notification_type, notification_id) do nothing;

  update public.notification_push_deliveries
  set status = 'sending',
      lease_expires_at = now() + interval '2 minutes',
      attempt_count = attempt_count + 1,
      last_error = ''
  where company_id = requested_company_id
    and user_id = requested_user_id
    and notification_type = requested_notification_type
    and notification_id = requested_notification_id
    and (
      status = 'pending'
      or (status = 'sending' and lease_expires_at < now())
    )
  returning id into claimed_id;

  return claimed_id is not null;
end;
$$;

revoke all on function public.claim_notification_push_delivery(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_notification_push_delivery(uuid, uuid, text, uuid) to service_role;

create or replace function public.list_pending_push_notifications(
  requested_user_id uuid default null,
  requested_company_id uuid default null
)
returns table (
  id uuid,
  company_id uuid,
  recipient_id uuid,
  notification_type text,
  title text,
  body text
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.company_id, notification.recipient_id,
    'task'::text, notification.title, notification.body
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
    'candidate_inquiry'::text, notification.title, notification.body
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
    'leave'::text, notification.title, notification.body
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
    'requisition'::text, notification.title, notification.body
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

create or replace function public.dispatch_due_task_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.task_notifications (
    company_id, task_id, recipient_id, title, body, remind_at, sms_status
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
    case when task.sms_reminder_enabled then 'queued' else 'not_requested' end
  from public.tasks task
  join public.company_memberships membership
    on membership.company_id = task.company_id
   and membership.user_id = coalesce(task.assigned_to, task.created_by)
   and membership.status = 'active'
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  join public.role_permissions permission
    on permission.role_id = membership.role_id
   and permission.company_id = membership.company_id
   and permission.permission_code = 'tasks.view'
  where task.is_completed = false
    and task.reminder_at is not null
    and task.reminder_at <= now()
    and lower(trim(role.name)) <> 'recruitment agent'
  order by task.reminder_at
  limit 100
  on conflict (task_id, recipient_id, remind_at) do nothing;
$$;

revoke all on function public.dispatch_due_task_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_due_task_notifications() to service_role;

create or replace function public.dispatch_due_candidate_inquiry_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_inquiry record;
  candidate_names text;
  reminder_body text;
begin
  for due_inquiry in
    select inquiry.id, inquiry.company_id, inquiry.first_name, inquiry.last_name
    from public.candidate_inquiries inquiry
    where inquiry.status = 'inquiry'
      and inquiry.created_at <= now() - interval '15 days'
      and (inquiry.last_reminded_at is null or inquiry.last_reminded_at <= now() - interval '15 days')
    order by inquiry.created_at
    for update skip locked
    limit 100
  loop
    candidate_names := concat_ws(' ', due_inquiry.first_name, due_inquiry.last_name);
    reminder_body := 'Kindly follow up on candidate ' || candidate_names
      || ', who came on inquiry but has not registered yet.';

    insert into public.candidate_inquiry_notifications (
      company_id, recipient_id, title, body
    )
    select due_inquiry.company_id,
      membership.user_id,
      'Candidate inquiry follow-up',
      reminder_body
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions permission
      on permission.role_id = membership.role_id
     and permission.company_id = membership.company_id
     and permission.permission_code = 'candidates.view'
    where membership.company_id = due_inquiry.company_id
      and membership.status = 'active'
      and role.name in ('General Manager', 'Supervisor', 'Recruitment Manager');

    update public.candidate_inquiries
    set last_reminded_at = now()
    where id = due_inquiry.id;
  end loop;
end;
$$;

revoke all on function public.dispatch_due_candidate_inquiry_notifications() from public, anon, authenticated;
grant execute on function public.dispatch_due_candidate_inquiry_notifications() to service_role;