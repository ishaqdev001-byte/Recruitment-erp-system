insert into public.permissions (code, description)
values
  ('tasks.view', 'View company tasks and task reminders'),
  ('tasks.create', 'Create personal tasks and task lists'),
  ('tasks.edit', 'Edit and complete personal tasks')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where permission.code in ('tasks.view', 'tasks.create', 'tasks.edit')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_task_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role_permissions (role_id, company_id, permission_code)
  values
    (new.id, new.company_id, 'tasks.view'),
    (new.id, new.company_id, 'tasks.create'),
    (new.id, new.company_id, 'tasks.edit')
  on conflict (role_id, permission_code) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_task_permissions_for_role() from public, anon, authenticated;

drop trigger if exists company_roles_seed_task_permissions on public.company_roles;
create trigger company_roles_seed_task_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_task_permissions_for_role();

create or replace function public.prevent_task_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and tg_op = 'UPDATE'
    and (
      new.assigned_to is distinct from old.assigned_to
      or new.created_by is distinct from old.created_by
    ) then
    raise exception 'Task ownership cannot be transferred to another user.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_task_reassignment() from public, anon, authenticated;

create trigger tasks_prevent_reassignment
  before update of assigned_to, created_by on public.tasks
  for each row execute function public.prevent_task_reassignment();

create or replace function public.current_user_has_company_permission(
  requested_company_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and role_permission.permission_code = requested_permission
      and (
        requested_permission not in ('medical.view', 'medical.update', 'medical_documents.view')
        or (
          role.is_system_default
          and lower(trim(role.name)) in ('doctor', 'medical examiner')
        )
      )
      and not (
        lower(trim(role.name)) = 'recruitment agent'
        and (
          requested_permission = 'human_resources.view'
          or requested_permission like 'attendance.%'
          or requested_permission like 'approvals.%'
          or requested_permission like 'communications.%'
          or requested_permission like 'drive.%'
          or requested_permission like 'finance.%'
          or requested_permission like 'leave.%'
          or requested_permission like 'requisitions.%'
        )
      )
  );
$$;

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
  order by task.reminder_at
  limit 100
  on conflict (task_id, recipient_id, remind_at) do nothing;
$$;

drop policy if exists "Authorized users can create tasks" on public.tasks;
create policy "Members can create personal tasks" on public.tasks
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and assigned_to = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'tasks.create')
  );

drop policy if exists "Authorized users can edit tasks" on public.tasks;
create policy "Members can edit their own tasks" on public.tasks
  for update to authenticated
  using (
    (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'tasks.edit')
  )
  with check (
    (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'tasks.edit')
  );

create policy "Members can delete their own tasks" on public.tasks
  for delete to authenticated
  using (
    (created_by = (select auth.uid()) or assigned_to = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'tasks.edit')
  );

drop policy if exists "Authorized users can rename task lists" on public.task_lists;
create policy "Authorized users can rename task lists" on public.task_lists
  for update to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.delete'))
  with check (public.current_user_has_company_permission(company_id, 'tasks.delete'));

drop policy if exists "Task reminders can be delivered within company" on public.task_notifications;
create policy "Members can create reminders for their own tasks" on public.task_notifications
  for insert to authenticated with check (
    recipient_id = (select auth.uid())
    and public.current_user_has_company_permission(task_notifications.company_id, 'tasks.view')
    and exists (
      select 1
      from public.tasks task
      where task.id = task_notifications.task_id
        and task.company_id = task_notifications.company_id
        and (task.created_by = (select auth.uid()) or task.assigned_to = (select auth.uid()))
    )
  );

create index if not exists tasks_company_creator_idx
  on public.tasks (company_id, created_by, due_at);