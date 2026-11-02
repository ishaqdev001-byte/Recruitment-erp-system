alter table public.candidate_passports
  add column if not exists status_changed_at timestamptz not null default now();

update public.candidate_passports
set status_changed_at = case passport_status
  when 'withdrawn' then withdrawn_at::timestamp at time zone 'UTC'
  when 'transferred' then transferred_at::timestamp at time zone 'UTC'
  else status_changed_at
end
where passport_status in ('withdrawn', 'transferred')
  and status_changed_at > case passport_status
    when 'withdrawn' then withdrawn_at::timestamp at time zone 'UTC'
    when 'transferred' then transferred_at::timestamp at time zone 'UTC'
    else status_changed_at
  end;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where lower(trim(role.name)) in (
  'chairman', 'company owner / primary administrator', 'general manager', 'supervisor'
)
  and permission.code in ('passport.view', 'passport.edit')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_passport_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(trim(new.name)) in (
    'chairman', 'company owner / primary administrator', 'general manager', 'supervisor'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    where permission.code in ('passport.view', 'passport.edit')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_passport_permissions on public.company_roles;
create trigger company_roles_seed_passport_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_passport_permissions_for_role();
revoke all on function public.seed_passport_permissions_for_role() from public, anon, authenticated;

create table if not exists public.candidate_stage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid not null,
  event_type text not null check (event_type in ('stage', 'medical_appointment', 'medical_result')),
  label text not null check (length(trim(label)) between 1 and 200),
  occurred_at timestamptz not null default now(),
  recorded_by uuid references auth.users (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade
);

create index if not exists candidate_stage_events_candidate_idx
  on public.candidate_stage_events (company_id, candidate_id, occurred_at desc);

alter table public.candidate_stage_events enable row level security;
revoke all on public.candidate_stage_events from public, anon, authenticated;
grant select on public.candidate_stage_events to authenticated;
grant all on public.candidate_stage_events to service_role;

create policy "Candidate status events require candidate view permission"
  on public.candidate_stage_events for select to authenticated
  using (public.current_user_has_company_permission(company_id, 'candidates.view'));

create or replace function public.record_candidate_stage_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_stage text;
  next_stage text;
begin
  previous_stage := case when tg_op = 'UPDATE' then coalesce(old.details ->> 'stage', '') else '' end;
  next_stage := coalesce(new.details ->> 'stage', 'Registration');
  if tg_op = 'INSERT' or previous_stage is distinct from next_stage then
    insert into public.candidate_stage_events (
      company_id, candidate_id, event_type, label, recorded_by
    ) values (
      new.company_id, new.id, 'stage', next_stage, coalesce((select auth.uid()), new.updated_by, new.created_by)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_record_stage_event on public.candidates;
create trigger candidates_record_stage_event
  after insert or update of details on public.candidates
  for each row execute function public.record_candidate_stage_event();
revoke all on function public.record_candidate_stage_event() from public, anon, authenticated;

create or replace function public.record_candidate_medical_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
  result_label text;
begin
  if new.candidate_id is null then
    return new;
  end if;

  select concat_ws(' ', candidate.first_name, candidate.last_name)
    into candidate_name
  from public.candidates candidate
  where candidate.id = new.candidate_id and candidate.company_id = new.company_id;

  if candidate_name is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.candidate_stage_events (
      company_id, candidate_id, event_type, label, occurred_at, recorded_by, metadata
    ) values (
      new.company_id, new.candidate_id, 'medical_appointment', 'Medical appointment',
      new.appointment_at, new.created_by,
      jsonb_build_object('appointmentAt', new.appointment_at, 'status', new.status)
    );
  elsif new.status is distinct from old.status
    or new.exam_result is distinct from old.exam_result then
    result_label := case
      when new.exam_result = 'fit' then 'Medical result: Fit'
      when new.exam_result = 'unfit' then 'Medical result: Unfit'
      when new.status = 'cancelled' then 'Medical appointment cancelled'
      when new.status = 'completed' then 'Medical examination completed'
      else 'Medical appointment updated'
    end;
    insert into public.candidate_stage_events (
      company_id, candidate_id, event_type, label, occurred_at, recorded_by, metadata
    ) values (
      new.company_id, new.candidate_id, 'medical_result', result_label,
      coalesce(new.examined_at, now()), coalesce(new.examined_by, (select auth.uid()), new.created_by),
      jsonb_build_object(
        'appointmentAt', new.appointment_at,
        'status', new.status,
        'examResult', new.exam_result,
        'examinedAt', new.examined_at
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists medical_appointments_record_candidate_event on public.medical_appointments;
create trigger medical_appointments_record_candidate_event
  after insert or update of status, exam_result on public.medical_appointments
  for each row execute function public.record_candidate_medical_event();
revoke all on function public.record_candidate_medical_event() from public, anon, authenticated;

create table if not exists public.candidate_project_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  candidate_id uuid not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null,
  project_handler_id uuid references auth.users (id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'cancellation_requested', 'cancelled')),
  submitted_at timestamptz not null default now(),
  cancellation_requested_at timestamptz,
  cancelled_at timestamptz,
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade
);

create index if not exists candidate_project_submissions_active_idx
  on public.candidate_project_submissions (company_id, candidate_id, status);
create unique index if not exists candidate_project_submissions_active_project_idx
  on public.candidate_project_submissions (candidate_id, project_id)
  where status = 'active';

alter table public.candidate_project_submissions enable row level security;
revoke all on public.candidate_project_submissions from public, anon, authenticated;
grant select on public.candidate_project_submissions to authenticated;
grant all on public.candidate_project_submissions to service_role;

create policy "Project submissions require candidate view permission"
  on public.candidate_project_submissions for select to authenticated
  using (public.current_user_has_company_permission(company_id, 'candidates.view'));

insert into public.candidate_project_submissions (
  company_id, candidate_id, project_id, submitted_by, project_handler_id, submitted_at
)
select candidate.company_id, candidate.id, project.id,
  coalesce(candidate.updated_by, candidate.created_by, project.created_by),
  project.created_by, coalesce(candidate.updated_at, candidate.created_at)
from public.candidates candidate
join public.projects project
  on project.company_id = candidate.company_id
 and project.id::text = candidate.details ->> 'assignedProjectId'
where coalesce(candidate.details ->> 'assignedProjectId', '') ~* '^[0-9a-f-]{36}$'
on conflict do nothing;

create table if not exists public.passport_project_followups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  submission_id uuid not null references public.candidate_project_submissions (id) on delete cascade,
  candidate_id uuid not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  followup_kind text not null check (followup_kind in ('cancellation', 'reminder')),
  due_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade,
  unique (submission_id, recipient_id, followup_kind)
);

create index if not exists passport_project_followups_due_idx
  on public.passport_project_followups (due_at)
  where sent_at is null;

alter table public.passport_project_followups enable row level security;
revoke all on public.passport_project_followups from public, anon, authenticated;
grant all on public.passport_project_followups to service_role;

create table if not exists public.workspace_communications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_id uuid not null,
  candidate_id uuid not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  submission_id uuid not null references public.candidate_project_submissions (id) on delete cascade,
  event_type text not null check (event_type in ('cancellation', 'reminder')),
  subject text not null check (length(trim(subject)) between 1 and 250),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (company_id, recipient_id)
    references public.company_memberships (company_id, user_id) on delete cascade,
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade,
  unique (submission_id, recipient_id, event_type)
);

create index if not exists workspace_communications_recipient_idx
  on public.workspace_communications (company_id, recipient_id, created_at desc);

alter table public.workspace_communications enable row level security;
revoke all on public.workspace_communications from public, anon, authenticated;
grant select on public.workspace_communications to authenticated;
grant all on public.workspace_communications to service_role;

create policy "Workspace communications are recipient and candidate permission scoped"
  on public.workspace_communications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'candidates.view')
  );

create or replace function public.enforce_passport_status_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  is_authorized boolean;
begin
  if new.passport_status is not distinct from old.passport_status then
    new.status_changed_at := old.status_changed_at;
    new.status_updated_by := old.status_updated_by;
    return new;
  end if;

  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id and role.company_id = membership.company_id
    left join public.companies company on company.id = membership.company_id
    where membership.company_id = new.company_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and (
        company.primary_admin_user_id = actor_id
        or lower(trim(role.name)) in (
          'chairman', 'company owner / primary administrator', 'general manager', 'supervisor'
        )
      )
  ) into is_authorized;

  if actor_id is null or not is_authorized then
    raise exception 'Only the Chairman, General Manager, or Supervisor can change passport status.'
      using errcode = '42501';
  end if;

  if new.passport_status = 'available'
    and old.passport_status in ('withdrawn', 'transferred')
    and old.status_changed_at > now() - interval '30 days' then
    raise exception 'A withdrawn or transferred passport can be restored only after 30 days.'
      using errcode = '23514';
  end if;

  new.status_updated_by := actor_id;
  new.status_changed_at := now();
  return new;
end;
$$;

drop trigger if exists candidate_passports_enforce_status_access on public.candidate_passports;
create trigger candidate_passports_enforce_status_access
  before update on public.candidate_passports
  for each row execute function public.enforce_passport_status_access();
revoke all on function public.enforce_passport_status_access() from public, anon, authenticated;

create or replace function public.enforce_candidate_passport_restoration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_stage text := coalesce(old.details ->> 'stage', '');
  next_stage text := coalesce(new.details ->> 'stage', '');
  passport_record record;
  actor_id uuid := (select auth.uid());
  normalized_status text;
begin
  if coalesce(old.details ->> 'passportStatus', '') is distinct from coalesce(new.details ->> 'passportStatus', '') then
    normalized_status := case lower(trim(new.details ->> 'passportStatus'))
      when 'with agent' then 'with_agent'
      else lower(trim(new.details ->> 'passportStatus'))
    end;
    if normalized_status not in ('available', 'with_agent', 'withdrawn', 'transferred') then
      raise exception 'Choose a valid passport status.'
        using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id and role.company_id = membership.company_id
      left join public.companies company on company.id = membership.company_id
      where membership.company_id = new.company_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and (
          company.primary_admin_user_id = actor_id
          or lower(trim(role.name)) in (
            'chairman', 'company owner / primary administrator', 'general manager', 'supervisor'
          )
        )
    ) then
      raise exception 'Only the Chairman, General Manager, or Supervisor can change passport status.'
        using errcode = '42501';
    end if;

    if not exists (
      select 1 from public.candidate_passports passport
      where passport.candidate_id = new.id
        and passport.company_id = new.company_id
        and passport.passport_status = normalized_status
    ) then
      raise exception 'Update passport status through Passport Custody.'
        using errcode = '23514';
    end if;
  end if;

  if previous_stage = 'Withdrawn' and next_stage = 'Registration' then
    select passport_status, status_changed_at
      into passport_record
    from public.candidate_passports
    where candidate_id = new.id and company_id = new.company_id;

    if not found or passport_record.passport_status <> 'available' then
      raise exception 'The candidate passport must be restored to available before registration can resume.'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id and role.company_id = membership.company_id
      left join public.companies company on company.id = membership.company_id
      where membership.company_id = new.company_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and (
          company.primary_admin_user_id = actor_id
          or lower(trim(role.name)) in (
            'chairman', 'company owner / primary administrator', 'general manager', 'supervisor'
          )
        )
    ) then
      raise exception 'Only the Chairman, General Manager, or Supervisor can restore a withdrawn candidate.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists candidates_enforce_passport_restoration on public.candidates;
create trigger candidates_enforce_passport_restoration
  before update of details on public.candidates
  for each row execute function public.enforce_candidate_passport_restoration();
revoke all on function public.enforce_candidate_passport_restoration() from public, anon, authenticated;

create or replace function public.sync_candidate_passport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  passport_number_value text := trim(coalesce(new.details ->> 'passportNumber', ''));
  requested_status text := lower(trim(coalesce(new.details ->> 'passportStatus', '')));
  normalized_status text;
  branch_value text := trim(coalesce(new.details ->> 'passportBranch', ''));
  location_value text := trim(coalesce(new.details ->> 'passportStorageLocation', ''));
  issue_value date;
  expiry_value date;
begin
  if passport_number_value = '' then
    return new;
  end if;

  if requested_status = 'available' then
    normalized_status := 'available';
  elsif requested_status in ('with agent', 'with_agent') then
    return new;
  else
    return new;
  end if;

  if normalized_status = 'available' and (branch_value = '' or location_value = '') then
    raise exception 'Available passports require a storage branch and location.'
      using errcode = '23514';
  end if;

  if coalesce(new.details ->> 'passportIssue', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    issue_value := (new.details ->> 'passportIssue')::date;
  end if;
  if coalesce(new.details ->> 'passportExpiry', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    expiry_value := (new.details ->> 'passportExpiry')::date;
  end if;

  insert into public.candidate_passports (
    company_id, candidate_id, passport_number, issue_date, expiry_date,
    passport_status, storage_branch, storage_location, status_updated_by
  ) values (
    new.company_id, new.id, passport_number_value, issue_value, expiry_value,
    normalized_status, branch_value, location_value, (select auth.uid())
  )
  on conflict (candidate_id, company_id) do update set
    passport_number = excluded.passport_number,
    issue_date = excluded.issue_date,
    expiry_date = excluded.expiry_date,
    storage_branch = case
      when candidate_passports.passport_status in ('available', 'with_agent') then excluded.storage_branch
      else candidate_passports.storage_branch
    end,
    storage_location = case
      when candidate_passports.passport_status in ('available', 'with_agent') then excluded.storage_location
      else candidate_passports.storage_location
    end;
  return new;
end;
$$;

drop trigger if exists candidates_sync_passport on public.candidates;
create trigger candidates_sync_passport
  after insert or update on public.candidates
  for each row execute function public.sync_candidate_passport();
revoke all on function public.sync_candidate_passport() from public, anon, authenticated;

create or replace function public.record_candidate_project_submission(
  requested_candidate_id uuid,
  requested_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company_id_value uuid;
  project_handler_id_value uuid;
  candidate_record public.candidates%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select candidate.company_id into company_id_value
  from public.candidates candidate
  where candidate.id = requested_candidate_id;

  if company_id_value is null
    or not exists (
      select 1 from public.company_memberships membership
      where membership.company_id = company_id_value
        and membership.user_id = actor_id
        and membership.status = 'active'
    )
    or not public.current_user_has_company_permission(company_id_value, 'candidates.edit') then
    raise exception 'You do not have permission to submit candidates to projects.'
      using errcode = '42501';
  end if;

  select project.created_by into project_handler_id_value
  from public.projects project
  where project.id = requested_project_id
    and project.company_id = company_id_value
    and project.status = 'active';
  if not found then
    raise exception 'The selected active project was not found.'
      using errcode = '23503';
  end if;

  select candidate.* into candidate_record
  from public.candidates candidate
  where candidate.id = requested_candidate_id
    and candidate.company_id = company_id_value
  for update;
  if not found then
    raise exception 'The candidate was not found in your company.'
      using errcode = '23503';
  end if;

  if candidate_record.visa_locked
    or coalesce(candidate_record.details ->> 'stage', 'Registration') not in (
      'Registration', 'Project Submission', 'Submitted to Project'
    ) then
    raise exception 'The candidate is not eligible for project submission.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.candidate_passports passport
    where passport.candidate_id = requested_candidate_id
      and passport.company_id = company_id_value
      and passport.passport_status in ('withdrawn', 'transferred')
  ) then
    raise exception 'The candidate passport is withdrawn or transferred and cannot be submitted.'
      using errcode = '23514';
  end if;

  update public.candidates
  set details = candidate_record.details || jsonb_build_object(
    'stage', 'Submitted to Project',
    'assignedProjectId', requested_project_id,
    'assignedContracts', (select project.project_name from public.projects project where project.id = requested_project_id),
    'contracts', (select project.project_name from public.projects project where project.id = requested_project_id)
  )
  where id = requested_candidate_id and company_id = company_id_value;

  update public.candidate_project_submissions
  set status = 'cancelled', cancelled_at = now()
  where candidate_id = requested_candidate_id
    and company_id = company_id_value
    and status = 'active'
    and project_id <> requested_project_id;

  insert into public.candidate_project_submissions (
    company_id, candidate_id, project_id, submitted_by, project_handler_id
  ) values (
    company_id_value, requested_candidate_id, requested_project_id, actor_id, project_handler_id_value
  )
  on conflict do nothing;
end;
$$;

revoke all on function public.record_candidate_project_submission(uuid, uuid) from public, anon;
grant execute on function public.record_candidate_project_submission(uuid, uuid) to authenticated;

create or replace function public.handle_passport_withdrawal_or_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_name text;
  actor_id uuid := coalesce(new.status_updated_by, (select auth.uid()));
  submission record;
  recipient_ids uuid[];
  task_list_id uuid;
  task_due_at timestamptz := now() + interval '24 hours';
  change_label text;
begin
  if new.passport_status is not distinct from old.passport_status then
    return new;
  end if;

  if new.passport_status not in ('withdrawn', 'transferred')
    and not (new.passport_status = 'available' and old.passport_status in ('withdrawn', 'transferred')) then
    update public.candidates
    set details = details || jsonb_build_object(
      'passportStatus',
      case new.passport_status when 'with_agent' then 'With Agent' else 'Available' end
    )
    where id = new.candidate_id and company_id = new.company_id;
    return new;
  end if;

  if new.passport_status = 'available' and old.passport_status in ('withdrawn', 'transferred') then
    update public.candidates
    set details = details || jsonb_build_object(
      'passportStatus', 'Available',
      'passportBranch', new.storage_branch,
      'passportStorageLocation', new.storage_location,
      'stage', 'Registration',
      'assignedProjectId', '',
      'assignedContracts', '',
      'contracts', ''
    )
    where id = new.candidate_id and company_id = new.company_id;
    return new;
  end if;

  if new.passport_status not in ('withdrawn', 'transferred') then
    return new;
  end if;

  select concat_ws(' ', candidate.first_name, candidate.last_name)
    into candidate_name
  from public.candidates candidate
  where candidate.id = new.candidate_id and candidate.company_id = new.company_id;
  change_label := case when new.passport_status = 'withdrawn' then 'withdrawn' else 'transferred' end;

  update public.candidates
  set details = details || jsonb_build_object(
    'passportStatus', case new.passport_status
      when 'withdrawn' then 'Withdrawn'
      when 'transferred' then 'Transferred'
      when 'with_agent' then 'With Agent'
      else 'Available'
    end,
    'stage', 'Withdrawn',
    'assignedProjectId', '',
    'assignedContracts', '',
    'contracts', ''
  )
  where id = new.candidate_id and company_id = new.company_id;

  for submission in
    select assignment.id, assignment.project_id, assignment.submitted_by,
      assignment.project_handler_id, project.project_name, project.contractor_name
    from public.candidate_project_submissions assignment
    join public.projects project
      on project.id = assignment.project_id and project.company_id = assignment.company_id
    where assignment.candidate_id = new.candidate_id
      and assignment.company_id = new.company_id
      and assignment.status = 'active'
  loop
    update public.candidate_project_submissions
    set status = 'cancellation_requested', cancellation_requested_at = now()
    where id = submission.id;

    select array_agg(distinct recipient_id) into recipient_ids
    from unnest(array[submission.submitted_by, submission.project_handler_id]) recipient_id
    where recipient_id is not null;

    insert into public.workspace_communications (
      company_id, recipient_id, candidate_id, project_id, submission_id,
      event_type, subject, body
    )
    select new.company_id, membership.user_id, new.candidate_id, submission.project_id, submission.id,
      'cancellation',
      'Urgent: cancel candidate from project',
      format(
        '%s passport was %s. Immediately cancel the candidate from project "%s" with contractor "%s" and send the contractor the cancellation email. This is an internal instruction; no email was sent automatically.',
        candidate_name, change_label, submission.project_name, submission.contractor_name
      )
    from unnest(coalesce(recipient_ids, '{}'::uuid[])) recipients(recipient_id)
    join public.company_memberships membership
      on membership.company_id = new.company_id
     and membership.user_id = recipients.recipient_id
     and membership.status = 'active'
    on conflict (submission_id, recipient_id, event_type) do nothing;

    insert into public.passport_project_followups (
      company_id, submission_id, candidate_id, project_id, recipient_id, followup_kind, due_at
    )
    select new.company_id, submission.id, new.candidate_id, submission.project_id,
      membership.user_id, 'reminder', task_due_at
    from unnest(coalesce(recipient_ids, '{}'::uuid[])) recipients(recipient_id)
    join public.company_memberships membership
      on membership.company_id = new.company_id
     and membership.user_id = recipients.recipient_id
     and membership.status = 'active'
    on conflict (submission_id, recipient_id, followup_kind) do nothing;

    perform private.queue_workspace_notification(
      new.company_id,
      recipient_ids,
      'candidates.view',
      'communications',
      'Urgent: passport ' || change_label,
      candidate_name || ' passport was ' || change_label || '. Cancel the candidate from ' || submission.project_name || ' and notify the contractor.',
      'passport_project_cancellation',
      submission.id
    );
  end loop;

  if exists (
    select 1 from public.candidate_project_submissions assignment
    where assignment.candidate_id = new.candidate_id
      and assignment.company_id = new.company_id
      and assignment.status = 'cancellation_requested'
  ) then
    insert into public.task_lists (company_id, name, position, created_by)
    values (
      new.company_id, 'Passport Follow-ups',
      coalesce((select max(list.position) + 1 from public.task_lists list where list.company_id = new.company_id), 0),
      actor_id
    )
    on conflict (company_id, name) do nothing;

    select id into task_list_id
    from public.task_lists
    where company_id = new.company_id and name = 'Passport Follow-ups';

    if task_list_id is not null then
      insert into public.tasks (
        company_id, list_id, title, notes, due_at, reminder_at, assigned_to, priority, created_by
      )
      select new.company_id, task_list_id,
        'Cancel ' || candidate_name || ' from ' || project.project_name,
        'Passport ' || change_label || '. Cancel the candidate from this project, email the contractor, and record the cancellation outcome.',
        task_due_at, task_due_at, recipients.recipient_id, 'High', actor_id
      from (
        select distinct assignment.submitted_by as recipient_id, assignment.project_id
        from public.candidate_project_submissions assignment
        where assignment.candidate_id = new.candidate_id
          and assignment.company_id = new.company_id
          and assignment.status = 'cancellation_requested'
          and assignment.submitted_by is not null
        union
        select distinct membership.user_id, assignment.project_id
        from public.candidate_project_submissions assignment
        join public.company_roles role
          on role.company_id = assignment.company_id
         and lower(trim(role.name)) = 'general manager'
        join public.company_memberships membership
          on membership.company_id = role.company_id
         and membership.role_id = role.id
         and membership.status = 'active'
        where assignment.candidate_id = new.candidate_id
          and assignment.company_id = new.company_id
          and assignment.status = 'cancellation_requested'
      ) recipients
      join public.projects project on project.id = recipients.project_id
      where exists (
        select 1 from public.company_memberships membership
        where membership.company_id = new.company_id
          and membership.user_id = recipients.recipient_id
          and membership.status = 'active'
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists candidate_passports_notify_withdrawal on public.candidate_passports;
create trigger candidate_passports_notify_withdrawal
  after update on public.candidate_passports
  for each row execute function public.handle_passport_withdrawal_or_transfer();
revoke all on function public.handle_passport_withdrawal_or_transfer() from public, anon, authenticated;

create or replace function public.dispatch_due_passport_followups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  followup record;
  candidate_name text;
  project_name text;
  dispatched integer := 0;
begin
  for followup in
    select queue.id, queue.company_id, queue.submission_id, queue.candidate_id,
      queue.project_id, queue.recipient_id
    from public.passport_project_followups queue
    where queue.followup_kind = 'reminder'
      and queue.sent_at is null
      and queue.due_at <= now()
    order by queue.due_at
    for update skip locked
  loop
    select concat_ws(' ', candidate.first_name, candidate.last_name), project.project_name
      into candidate_name, project_name
    from public.candidates candidate
    join public.projects project
      on project.company_id = candidate.company_id
    where candidate.id = followup.candidate_id
      and candidate.company_id = followup.company_id
      and project.id = followup.project_id;

    if candidate_name is null then
      update public.passport_project_followups set sent_at = now() where id = followup.id;
      continue;
    end if;

    insert into public.workspace_communications (
      company_id, recipient_id, candidate_id, project_id, submission_id,
      event_type, subject, body
    ) values (
      followup.company_id, followup.recipient_id, followup.candidate_id,
      followup.project_id, followup.submission_id, 'reminder',
      'Follow-up: cancel candidate from project',
      candidate_name || ' still needs to be cancelled from ' || project_name
        || '. Contact the contractor and record the outcome.'
    )
    on conflict (submission_id, recipient_id, event_type) do nothing;

    perform private.queue_workspace_notification(
      followup.company_id,
      array[followup.recipient_id],
      'candidates.view',
      'communications',
      'Follow-up: cancel candidate from project',
      candidate_name || ' still needs to be cancelled from ' || project_name || '. Contact the contractor.',
      'passport_project_cancellation_followup',
      followup.submission_id
    );

    update public.passport_project_followups set sent_at = now() where id = followup.id;
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;

revoke all on function public.dispatch_due_passport_followups() from public, anon, authenticated;
grant execute on function public.dispatch_due_passport_followups() to service_role;

drop function if exists public.list_passport_tracking(uuid);
create function public.list_passport_tracking(requested_company_id uuid)
returns table (
  id uuid,
  candidate_id uuid,
  tracking_number integer,
  passport_number text,
  issue_date date,
  expiry_date date,
  passport_status text,
  storage_branch text,
  storage_location text,
  withdrawn_at date,
  withdrawal_requested_by text,
  transferred_at date,
  transfer_destination text,
  candidate_name text,
  file_number text,
  agent_name text,
  company_name text,
  inquiry_id uuid,
  status_changed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select passport.id, passport.candidate_id, passport.tracking_number, passport.passport_number,
    passport.issue_date, passport.expiry_date, passport.passport_status, passport.storage_branch,
    passport.storage_location, passport.withdrawn_at, passport.withdrawal_requested_by,
    passport.transferred_at, passport.transfer_destination,
    concat_ws(' ', candidate.first_name, candidate.last_name), candidate.file_number,
    candidate.agent_name, company.name, candidate.inquiry_id, passport.status_changed_at
  from public.candidate_passports passport
  join public.candidates candidate on candidate.id = passport.candidate_id and candidate.company_id = passport.company_id
  join public.companies company on company.id = passport.company_id
  where passport.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'passport.view')
  order by passport.tracking_number;
$$;
revoke all on function public.list_passport_tracking(uuid) from public, anon;
grant execute on function public.list_passport_tracking(uuid) to authenticated;