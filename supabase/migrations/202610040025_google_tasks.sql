create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  position integer not null default 0 check (position >= 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  list_id uuid not null,
  parent_task_id uuid,
  title text not null check (length(trim(title)) between 1 and 300),
  notes text not null default '' check (length(notes) <= 10000),
  due_at timestamptz,
  reminder_at timestamptz,
  reminder_sent_at timestamptz,
  assigned_to uuid,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  is_completed boolean not null default false,
  is_starred boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (list_id, company_id) references public.task_lists (id, company_id) on delete cascade,
  foreign key (parent_task_id, company_id) references public.tasks (id, company_id) on delete cascade,
  foreign key (company_id, assigned_to) references public.company_memberships (company_id, user_id) on delete set null (assigned_to)
);

create table public.task_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  task_id uuid not null,
  recipient_id uuid not null,
  title text not null,
  body text not null,
  remind_at timestamptz not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (task_id, company_id) references public.tasks (id, company_id) on delete cascade,
  foreign key (company_id, recipient_id) references public.company_memberships (company_id, user_id) on delete cascade,
  unique (task_id, recipient_id, remind_at)
);

create index task_lists_company_position_idx on public.task_lists (company_id, position, name);
create index tasks_company_list_due_idx on public.tasks (company_id, list_id, due_at);
create index tasks_company_assignee_idx on public.tasks (company_id, assigned_to, is_completed);
create index tasks_due_reminders_idx on public.tasks (reminder_at) where reminder_at is not null and reminder_sent_at is null;
create index task_notifications_recipient_sent_idx on public.task_notifications (company_id, recipient_id, sent_at desc);

create trigger tasks_set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

insert into public.permissions (code, description) values
  ('tasks.view', 'View company tasks and task reminders'),
  ('tasks.create', 'Create company tasks and task lists'),
  ('tasks.edit', 'Edit and complete company tasks'),
  ('tasks.delete', 'Delete company tasks and task lists')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name in ('Company Owner / Primary Administrator', 'General Manager', 'CEO', 'Administrator', 'Recruitment Manager')
  and permission.code in ('tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name in ('Recruitment Agent', 'Branch Manager', 'Finance Manager', 'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer', 'Viewer')
  and permission.code = 'tasks.view'
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name in ('Recruitment Agent', 'Branch Manager', 'Finance Manager', 'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer')
  and permission.code in ('tasks.create', 'tasks.edit')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_task_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name in ('Company Owner / Primary Administrator', 'General Manager', 'CEO', 'Administrator', 'Recruitment Manager') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'tasks.view'),
      (new.id, new.company_id, 'tasks.create'),
      (new.id, new.company_id, 'tasks.edit'),
      (new.id, new.company_id, 'tasks.delete')
    on conflict (role_id, permission_code) do nothing;
  elsif new.name in ('Recruitment Agent', 'Branch Manager', 'Finance Manager', 'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'tasks.view'),
      (new.id, new.company_id, 'tasks.create'),
      (new.id, new.company_id, 'tasks.edit')
    on conflict (role_id, permission_code) do nothing;
  elsif new.name = 'Viewer' then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'tasks.view')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_task_permissions on public.company_roles;
create trigger company_roles_seed_task_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_task_permissions_for_role();
revoke all on function public.seed_task_permissions_for_role() from public, anon, authenticated;

alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_notifications enable row level security;

create policy "Task lists are tenant and permission scoped" on public.task_lists
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.view'));
create policy "Authorized users can create task lists" on public.task_lists
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'tasks.create')
  );
create policy "Authorized users can rename task lists" on public.task_lists
  for update to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.edit'))
  with check (public.current_user_has_company_permission(company_id, 'tasks.edit'));
create policy "Authorized users can delete task lists" on public.task_lists
  for delete to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.delete'));

create policy "Tasks are tenant and permission scoped" on public.tasks
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.view'));
create policy "Authorized users can create tasks" on public.tasks
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'tasks.create')
  );
create policy "Authorized users can edit tasks" on public.tasks
  for update to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.edit'))
  with check (public.current_user_has_company_permission(company_id, 'tasks.edit'));
create policy "Authorized users can delete tasks" on public.tasks
  for delete to authenticated using (public.current_user_has_company_permission(company_id, 'tasks.delete'));

create policy "Task notifications are recipient scoped" on public.task_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'tasks.view')
  );
create policy "Task reminders can be delivered within company" on public.task_notifications
  for insert to authenticated with check (
    public.current_user_has_company_permission(company_id, 'tasks.view')
  );
create policy "Recipients can mark task notifications read" on public.task_notifications
  for update to authenticated using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));