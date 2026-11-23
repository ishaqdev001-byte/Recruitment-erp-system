alter table public.companies
  add column if not exists case_handlers_enabled boolean not null default false;

alter table public.candidates
  add column if not exists case_handler_user_id uuid references auth.users (id) on delete set null,
  add column if not exists case_handler_assigned_by uuid references auth.users (id) on delete set null,
  add column if not exists case_handler_assigned_at timestamptz;

insert into public.permissions (code, description)
values
  ('candidates.case_handler.assign', 'Assign candidates to case handlers'),
  ('candidates.case_handler.reminders.copy', 'Receive copies of case-handler follow-up reminders')
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
join public.permissions permission
  on permission.code in (
    'candidates.case_handler.assign',
    'candidates.case_handler.reminders.copy'
  )
where lower(trim(role.name)) in (
  'chairman',
  'company owner / primary administrator'
)
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_case_handler_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(trim(new.name)) in (
    'chairman',
    'company owner / primary administrator'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    where permission.code in (
      'candidates.case_handler.assign',
      'candidates.case_handler.reminders.copy'
    )
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.seed_case_handler_permissions_for_role()
  from public, anon, authenticated;

drop trigger if exists company_roles_seed_case_handler_permissions
  on public.company_roles;
create trigger company_roles_seed_case_handler_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_case_handler_permissions_for_role();

create table if not exists public.candidate_activity_summaries (
  company_id uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid not null,
  last_activity_at timestamptz not null,
  last_activity_type text not null,
  primary key (company_id, candidate_id),
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade
);

create index if not exists candidate_activity_summaries_recent_idx
  on public.candidate_activity_summaries (company_id, last_activity_at desc);

alter table public.candidate_activity_summaries enable row level security;
revoke all on public.candidate_activity_summaries from public, anon, authenticated;
grant all on public.candidate_activity_summaries to service_role;

create schema if not exists private;

create or replace function private.mark_candidate_activity(
  requested_company_id uuid,
  requested_candidate_id uuid,
  requested_activity_type text,
  requested_activity_at timestamptz default now()
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.candidate_activity_summaries as current_activity (
    company_id, candidate_id, last_activity_at, last_activity_type
  )
  select
    requested_company_id,
    requested_candidate_id,
    least(coalesce(requested_activity_at, now()), now()),
    requested_activity_type
  where exists (
    select 1
    from public.candidates candidate
    where candidate.company_id = requested_company_id
      and candidate.id = requested_candidate_id
  )
  on conflict (company_id, candidate_id) do update
  set last_activity_at = greatest(
        current_activity.last_activity_at,
        excluded.last_activity_at
      ),
      last_activity_type = case
        when excluded.last_activity_at >= current_activity.last_activity_at
          then excluded.last_activity_type
        else current_activity.last_activity_type
      end;
$$;

revoke all on function private.mark_candidate_activity(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

create or replace function private.track_candidate_row_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  perform private.mark_candidate_activity(
    new.company_id,
    new.id,
    'candidate_record',
    now()
  );
  return new;
end;
$$;

revoke all on function private.track_candidate_row_activity()
  from public, anon, authenticated;

drop trigger if exists candidates_track_case_handler_activity
  on public.candidates;
create trigger candidates_track_case_handler_activity
  after insert or update on public.candidates
  for each row execute function private.track_candidate_row_activity();

create or replace function private.track_candidate_related_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_company_id uuid;
  activity_candidate_id uuid;
begin
  if tg_op = 'DELETE' then
    activity_company_id := old.company_id;
    activity_candidate_id := old.candidate_id;
  else
    activity_company_id := new.company_id;
    activity_candidate_id := new.candidate_id;
  end if;

  if activity_company_id is not null and activity_candidate_id is not null then
    perform private.mark_candidate_activity(
      activity_company_id,
      activity_candidate_id,
      tg_table_name,
      now()
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.track_candidate_related_activity()
  from public, anon, authenticated;

drop trigger if exists candidate_stage_events_track_activity
  on public.candidate_stage_events;
create trigger candidate_stage_events_track_activity
  after insert or update or delete on public.candidate_stage_events
  for each row execute function private.track_candidate_related_activity();

drop trigger if exists candidate_documents_track_activity
  on public.candidate_documents;
create trigger candidate_documents_track_activity
  after insert or update or delete on public.candidate_documents
  for each row execute function private.track_candidate_related_activity();

drop trigger if exists workspace_communications_track_candidate_activity
  on public.workspace_communications;
create trigger workspace_communications_track_candidate_activity
  after insert or update or delete on public.workspace_communications
  for each row execute function private.track_candidate_related_activity();

drop trigger if exists candidate_project_submissions_track_activity
  on public.candidate_project_submissions;
create trigger candidate_project_submissions_track_activity
  after insert or update or delete on public.candidate_project_submissions
  for each row execute function private.track_candidate_related_activity();

create or replace function private.track_candidate_agent_note_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  note_company_id uuid;
  note_candidate_ids uuid[];
  note_candidate_id uuid;
begin
  if tg_op = 'DELETE' then
    note_company_id := old.company_id;
    note_candidate_ids := old.candidate_ids;
  else
    note_company_id := new.company_id;
    note_candidate_ids := new.candidate_ids;
  end if;

  foreach note_candidate_id in array coalesce(note_candidate_ids, array[]::uuid[])
  loop
    perform private.mark_candidate_activity(
      note_company_id,
      note_candidate_id,
      'candidate_agent_note',
      now()
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.track_candidate_agent_note_activity()
  from public, anon, authenticated;

drop trigger if exists candidate_agent_notes_track_activity
  on public.candidate_agent_notes;
create trigger candidate_agent_notes_track_activity
  after insert or update or delete on public.candidate_agent_notes
  for each row execute function private.track_candidate_agent_note_activity();

insert into public.candidate_activity_summaries as current_activity (
  company_id, candidate_id, last_activity_at, last_activity_type
)
select activity.company_id,
  activity.candidate_id,
  max(activity.activity_at),
  'existing_activity'
from (
  select candidate.company_id, candidate.id as candidate_id,
    coalesce(candidate.updated_at, candidate.created_at) as activity_at
  from public.candidates candidate

  union all

  select event.company_id, event.candidate_id, least(event.occurred_at, now())
  from public.candidate_stage_events event

  union all

  select document.company_id, document.candidate_id,
    greatest(document.created_at, coalesce(document.updated_at, document.created_at))
  from public.candidate_documents document

  union all

  select communication.company_id, communication.candidate_id, communication.created_at
  from public.workspace_communications communication
  where communication.candidate_id is not null

  union all

  select note.company_id, candidate.id, note.created_at
  from public.candidate_agent_notes note
  cross join lateral unnest(note.candidate_ids) as note_candidate(candidate_id)
  join public.candidates candidate
    on candidate.company_id = note.company_id
   and candidate.id = note_candidate.candidate_id

  union all

  select submission.company_id, submission.candidate_id, submission.submitted_at
  from public.candidate_project_submissions submission
) activity
where activity.activity_at is not null
group by activity.company_id, activity.candidate_id
on conflict (company_id, candidate_id) do update
set last_activity_at = greatest(
      current_activity.last_activity_at,
      excluded.last_activity_at
    ),
    last_activity_type = case
      when excluded.last_activity_at >= current_activity.last_activity_at
        then excluded.last_activity_type
      else current_activity.last_activity_type
    end;

create index if not exists candidate_documents_case_handler_activity_idx
  on public.candidate_documents (company_id, candidate_id, created_at desc);
create index if not exists workspace_communications_candidate_activity_idx
  on public.workspace_communications (company_id, candidate_id, created_at desc)
  where candidate_id is not null;
create index if not exists candidate_agent_notes_candidate_ids_idx
  on public.candidate_agent_notes using gin (candidate_ids);

create table if not exists public.candidate_case_handler_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid not null,
  handler_user_id uuid not null references auth.users (id) on delete cascade,
  activity_at timestamptz not null,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade,
  unique (company_id, candidate_id, handler_user_id, activity_at)
);

create index if not exists candidate_case_handler_followups_task_idx
  on public.candidate_case_handler_followups (task_id)
  where task_id is not null;

alter table public.candidate_case_handler_followups enable row level security;
revoke all on public.candidate_case_handler_followups from public, anon, authenticated;
grant all on public.candidate_case_handler_followups to service_role;

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
    from public.company_staff_members staff
    join public.company_memberships membership
      on membership.company_id = staff.company_id
     and membership.user_id = staff.linked_user_id
     and membership.status = 'active'
    where staff.company_id = new.company_id
      and staff.linked_user_id = new.case_handler_user_id
      and lower(trim(staff.status)) = 'active'
  ) then
    raise exception 'Choose an active, linked Staff member in this company.'
      using errcode = '23514';
  end if;

  new.case_handler_assigned_by := actor_id;
  new.case_handler_assigned_at := now();
  return new;
end;
$$;

revoke all on function private.guard_candidate_case_handler_assignment()
  from public, anon, authenticated;

drop trigger if exists candidates_guard_case_handler_assignment
  on public.candidates;
create trigger candidates_guard_case_handler_assignment
  before insert or update on public.candidates
  for each row execute function private.guard_candidate_case_handler_assignment();

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
    join public.company_staff_members staff
      on staff.company_id = candidate.company_id
     and staff.linked_user_id = candidate.case_handler_user_id
     and lower(trim(staff.status)) = 'active'
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
    'case_handler_copy'
  ));

drop policy if exists "Task notification recipients can read their notifications"
  on public.task_notifications;
create policy "Task notification recipients can read their notifications"
  on public.task_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'tasks.view')
  );

create or replace function private.create_project_assignment_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  manager_changed boolean;
  staff_changed boolean;
  assignment record;
  project_task_list_id uuid;
  actor_id uuid;
  actor_name text;
begin
  if tg_op = 'INSERT' then
    manager_changed := true;
    staff_changed := true;
  else
    manager_changed := new.project_manager_user_id is distinct from old.project_manager_user_id;
    staff_changed := new.assigned_staff_id is distinct from old.assigned_staff_id;
  end if;

  if not manager_changed and not staff_changed then
    return new;
  end if;

  for assignment in
    select target.recipient_id,
      string_agg(target.assignment_label, ' and ' order by target.assignment_label) as assignment_labels
    from (
      select new.project_manager_user_id as recipient_id,
        'Projects Manager'::text as assignment_label
      where manager_changed
        and new.project_manager_user_id is not null

      union all

      select staff.linked_user_id as recipient_id,
        'assigned staff member'::text as assignment_label
      from public.company_staff_members staff
      where staff.id = new.assigned_staff_id
        and staff.company_id = new.company_id
        and lower(trim(staff.status)) = 'active'
        and staff.linked_user_id is not null
        and staff_changed
    ) target
    join public.company_memberships membership
      on membership.company_id = new.company_id
     and membership.user_id = target.recipient_id
     and membership.status = 'active'
    group by target.recipient_id
  loop
    actor_id := coalesce((select auth.uid()), new.created_by, assignment.recipient_id);

    select coalesce(nullif(trim(profile.display_name), ''), 'a company administrator')
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

    insert into public.tasks (
      company_id,
      list_id,
      title,
      notes,
      assigned_to,
      priority,
      created_by
    )
    values (
      new.company_id,
      project_task_list_id,
      left(format('Project assignment: %s', new.project_name), 300),
      format(
        'Assigned by %s as %s. Review and manage project "%s".',
        actor_name,
        assignment.assignment_labels,
        new.project_name
      ),
      assignment.recipient_id,
      'Medium',
      actor_id
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.create_project_assignment_tasks()
  from public, anon, authenticated;

drop trigger if exists projects_create_assignment_tasks
  on public.projects;
create trigger projects_create_assignment_tasks
  after insert or update of project_manager_user_id, assigned_staff_id
  on public.projects
  for each row execute function private.create_project_assignment_tasks();