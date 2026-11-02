insert into public.permissions (code, description)
values
  ('candidates.stage', 'Update candidate recruitment and processing stages'),
  ('candidates.project_submit', 'Submit candidates to recruitment projects')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role_permission.role_id, role_permission.company_id, permission.code
from public.role_permissions role_permission
cross join (
  values ('candidates.stage'), ('candidates.project_submit')
) as permission(code)
where role_permission.permission_code = 'candidates.edit'
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_company_default_roles_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_company_default_roles(new.id);

  insert into public.role_permissions (role_id, company_id, permission_code)
  select role_permission.role_id, new.id, permission.code
  from public.role_permissions role_permission
  cross join (
    values ('candidates.stage'), ('candidates.project_submit')
  ) as permission(code)
  where role_permission.company_id = new.id
    and role_permission.permission_code = 'candidates.edit'
  on conflict (role_id, permission_code) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_company_default_roles_after_insert()
  from public, anon, authenticated;

create or replace function public.enforce_candidate_workflow_permissions()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  workflow_fields constant text[] := array[
    'stage', 'assignedProjectId', 'assignedContracts', 'contracts',
    'offerLetter', 'wakalaReceived', 'molReceived', 'enjaz',
    'visaStatus', 'visaProjectId', 'visaProjectName', 'visaReceivedAt',
    'travelStatus', 'ticketNumber', 'bookingReference', 'travelDate',
    'travelTime', 'departureUtc', 'connectingFlights'
  ];
  old_workflow jsonb;
  new_workflow jsonb;
  assignment_changed boolean;
  workflow_changed boolean;
  project_submission boolean;
  candidate_edit_allowed boolean;
  required_permission text;
begin
  candidate_edit_allowed := public.current_user_has_company_permission(
    new.company_id,
    'candidates.edit'
  );

  new_workflow := jsonb_build_object(
    'stage', coalesce(nullif(new.details ->> 'stage', ''), 'Registration'),
    'assignedProjectId', nullif(trim(new.details ->> 'assignedProjectId'), ''),
    'assignedContracts', nullif(trim(new.details ->> 'assignedContracts'), ''),
    'contracts', nullif(trim(new.details ->> 'contracts'), ''),
    'offerLetter', nullif(new.details ->> 'offerLetter', ''),
    'wakalaReceived', nullif(new.details ->> 'wakalaReceived', ''),
    'molReceived', nullif(new.details ->> 'molReceived', ''),
    'enjaz', nullif(new.details ->> 'enjaz', ''),
    'visaStatus', coalesce(nullif(new.details ->> 'visaStatus', ''), 'Pending'),
    'visaProjectId', nullif(trim(new.details ->> 'visaProjectId'), ''),
    'visaProjectName', nullif(trim(new.details ->> 'visaProjectName'), ''),
    'visaReceivedAt', nullif(new.details ->> 'visaReceivedAt', ''),
    'travelStatus', nullif(new.details ->> 'travelStatus', ''),
    'ticketNumber', nullif(trim(new.details ->> 'ticketNumber'), ''),
    'bookingReference', nullif(trim(new.details ->> 'bookingReference'), ''),
    'travelDate', nullif(new.details ->> 'travelDate', ''),
    'travelTime', nullif(new.details ->> 'travelTime', ''),
    'departureUtc', nullif(new.details ->> 'departureUtc', ''),
    'connectingFlights', coalesce(new.details -> 'connectingFlights', '[]'::jsonb),
    'visaLocked', coalesce(new.visa_locked, false)
  );

  if tg_op = 'INSERT' then
    assignment_changed :=
      nullif(trim(new.details ->> 'assignedProjectId'), '') is not null
      or nullif(trim(new.details ->> 'assignedContracts'), '') is not null
      or nullif(trim(new.details ->> 'contracts'), '') is not null;
    workflow_changed :=
      coalesce(nullif(new.details ->> 'stage', ''), 'Registration') <> 'Registration'
      or coalesce(new.visa_locked, false)
      or nullif(new.details ->> 'offerLetter', '') is not null
      or nullif(new.details ->> 'wakalaReceived', '') is not null
      or nullif(new.details ->> 'molReceived', '') is not null
      or nullif(new.details ->> 'enjaz', '') is not null
      or coalesce(nullif(new.details ->> 'visaStatus', ''), 'Pending') <> 'Pending'
      or nullif(new.details ->> 'visaProjectId', '') is not null
      or nullif(new.details ->> 'visaProjectName', '') is not null
      or nullif(new.details ->> 'visaReceivedAt', '') is not null
      or nullif(new.details ->> 'travelStatus', '') is not null
      or nullif(new.details ->> 'ticketNumber', '') is not null
      or nullif(new.details ->> 'bookingReference', '') is not null
      or nullif(new.details ->> 'travelDate', '') is not null
      or nullif(new.details ->> 'travelTime', '') is not null
      or nullif(new.details ->> 'departureUtc', '') is not null
      or coalesce(new.details -> 'connectingFlights', '[]'::jsonb) <> '[]'::jsonb;

    if not workflow_changed and not assignment_changed then
      return new;
    end if;

    project_submission :=
      assignment_changed
      or coalesce(nullif(new.details ->> 'stage', ''), 'Registration') = 'Submitted to Project';

    if current_user in ('authenticated', 'anon') then
      raise exception 'Create candidates at Registration and use the workflow actions for stage changes.'
        using errcode = '42501';
    end if;
  else
    old_workflow := jsonb_build_object(
      'stage', coalesce(nullif(old.details ->> 'stage', ''), 'Registration'),
      'assignedProjectId', nullif(trim(old.details ->> 'assignedProjectId'), ''),
      'assignedContracts', nullif(trim(old.details ->> 'assignedContracts'), ''),
      'contracts', nullif(trim(old.details ->> 'contracts'), ''),
      'offerLetter', nullif(old.details ->> 'offerLetter', ''),
      'wakalaReceived', nullif(old.details ->> 'wakalaReceived', ''),
      'molReceived', nullif(old.details ->> 'molReceived', ''),
      'enjaz', nullif(old.details ->> 'enjaz', ''),
      'visaStatus', coalesce(nullif(old.details ->> 'visaStatus', ''), 'Pending'),
      'visaProjectId', nullif(trim(old.details ->> 'visaProjectId'), ''),
      'visaProjectName', nullif(trim(old.details ->> 'visaProjectName'), ''),
      'visaReceivedAt', nullif(old.details ->> 'visaReceivedAt', ''),
      'travelStatus', nullif(old.details ->> 'travelStatus', ''),
      'ticketNumber', nullif(trim(old.details ->> 'ticketNumber'), ''),
      'bookingReference', nullif(trim(old.details ->> 'bookingReference'), ''),
      'travelDate', nullif(old.details ->> 'travelDate', ''),
      'travelTime', nullif(old.details ->> 'travelTime', ''),
      'departureUtc', nullif(old.details ->> 'departureUtc', ''),
      'connectingFlights', coalesce(old.details -> 'connectingFlights', '[]'::jsonb),
      'visaLocked', coalesce(old.visa_locked, false)
    );

    assignment_changed :=
      nullif(trim(old.details ->> 'assignedProjectId'), '')
        is distinct from nullif(trim(new.details ->> 'assignedProjectId'), '')
      or nullif(trim(old.details ->> 'assignedContracts'), '')
        is distinct from nullif(trim(new.details ->> 'assignedContracts'), '')
      or nullif(trim(old.details ->> 'contracts'), '')
        is distinct from nullif(trim(new.details ->> 'contracts'), '');
    workflow_changed := old_workflow is distinct from new_workflow;

    if not candidate_edit_allowed and (
      (to_jsonb(old) - array['details', 'visa_locked', 'updated_at', 'updated_by'])
        is distinct from
      (to_jsonb(new) - array['details', 'visa_locked', 'updated_at', 'updated_by'])
      or (coalesce(old.details, '{}'::jsonb) - workflow_fields)
        is distinct from
         (coalesce(new.details, '{}'::jsonb) - workflow_fields)
    ) then
      raise exception 'Candidate edit permission is required for non-workflow changes.'
        using errcode = '42501';
    end if;

    if not workflow_changed then
      return new;
    end if;

    project_submission :=
      assignment_changed
      or (
        coalesce(nullif(old.details ->> 'stage', ''), 'Registration')
          is distinct from coalesce(nullif(new.details ->> 'stage', ''), 'Registration')
        and coalesce(nullif(new.details ->> 'stage', ''), 'Registration') = 'Submitted to Project'
      );
  end if;

  required_permission := case
    when project_submission then 'candidates.project_submit'
    else 'candidates.stage'
  end;
  if not public.current_user_has_company_permission(new.company_id, required_permission) then
    raise exception 'Permission % is required to update this candidate workflow.', required_permission
      using errcode = '42501';
  end if;

  if project_submission and current_user in ('authenticated', 'anon') then
    raise exception 'Project submissions must use the candidate workflow action.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists candidates_enforce_workflow_permissions on public.candidates;
create trigger candidates_enforce_workflow_permissions
  before insert or update on public.candidates
  for each row execute function public.enforce_candidate_workflow_permissions();

drop policy if exists "Authorized users can edit candidates" on public.candidates;
drop policy if exists "Authorized users can edit candidate records and workflow" on public.candidates;
create policy "Authorized users can edit candidate records and workflow" on public.candidates
  for update to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    or public.current_user_has_company_permission(company_id, 'candidates.stage')
    or public.current_user_has_company_permission(company_id, 'candidates.project_submit')
  )
  with check (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    or public.current_user_has_company_permission(company_id, 'candidates.stage')
    or public.current_user_has_company_permission(company_id, 'candidates.project_submit')
  );

revoke all on function public.enforce_candidate_workflow_permissions()
  from public, anon, authenticated;

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
    or not public.current_user_has_company_permission(company_id_value, 'candidates.project_submit') then
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

revoke all on function public.record_candidate_project_submission(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_candidate_project_submission(uuid, uuid)
  to authenticated;