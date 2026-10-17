create or replace function public.resolve_candidate_project_submission_id(
  requested_company_id uuid,
  candidate_details jsonb
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_project_id uuid;
  requested_project_name text;
begin
  if coalesce(candidate_details ->> 'assignedProjectId', '') ~* '^[0-9a-f-]{36}$' then
    requested_project_id := (candidate_details ->> 'assignedProjectId')::uuid;
    if exists (
      select 1
      from public.projects project
      where project.id = requested_project_id
        and project.company_id = requested_company_id
    ) then
      return requested_project_id;
    end if;
  end if;

  requested_project_name := coalesce(
    nullif(trim(candidate_details ->> 'assignedContracts'), ''),
    nullif(trim(candidate_details ->> 'contracts'), '')
  );
  if requested_project_name is null then
    return null;
  end if;

  select project.id into requested_project_id
  from public.projects project
  where project.company_id = requested_company_id
    and lower(project.project_name) = lower(requested_project_name)
  order by project.created_at desc, project.id desc
  limit 1;
  return requested_project_id;
end;
$$;

create or replace function public.sync_candidate_project_submitted_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_project_id uuid;
  new_project_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_project_id := public.resolve_candidate_project_submission_id(old.company_id, old.details);
  end if;
  if tg_op <> 'DELETE' then
    new_project_id := public.resolve_candidate_project_submission_id(new.company_id, new.details);
  end if;

  if old_project_id is distinct from new_project_id then
    if old_project_id is not null then
      update public.projects
      set submitted_count = greatest(submitted_count - 1, 0)
      where id = old_project_id;
    end if;
    if new_project_id is not null then
      update public.projects
      set submitted_count = submitted_count + 1
      where id = new_project_id;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_project_update_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.submitted_count is distinct from new.submitted_count then
    if pg_trigger_depth() > 1
      and (to_jsonb(old) - 'submitted_count' - 'updated_at') is not distinct from (to_jsonb(new) - 'submitted_count' - 'updated_at') then
      return new;
    end if;
    raise exception 'Project submitted count is maintained automatically' using errcode = '42501';
  end if;

  if public.current_user_has_company_permission(old.company_id, 'projects.edit') then
    return new;
  end if;
  if public.current_user_has_company_permission(old.company_id, 'projects.status')
    and (to_jsonb(old) - 'status' - 'updated_at') is not distinct from (to_jsonb(new) - 'status' - 'updated_at') then
    return new;
  end if;
  raise exception 'Project update requires edit permission or a status-only change';
end;
$$;

drop trigger if exists candidates_sync_project_submitted_count on public.candidates;
create trigger candidates_sync_project_submitted_count
  after insert or delete or update of company_id, details on public.candidates
  for each row execute function public.sync_candidate_project_submitted_count();

alter table public.projects disable trigger projects_enforce_update_permission;

update public.projects project
set submitted_count = (
  select count(*)::integer
  from public.candidates candidate
  where public.resolve_candidate_project_submission_id(candidate.company_id, candidate.details) = project.id
);

alter table public.projects enable trigger projects_enforce_update_permission;

revoke all on function public.resolve_candidate_project_submission_id(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.sync_candidate_project_submitted_count() from public, anon, authenticated;