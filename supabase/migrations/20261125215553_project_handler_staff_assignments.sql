alter table public.projects
  add column if not exists project_handler_staff_id uuid
    references public.company_staff_members (id) on delete set null;

create index if not exists projects_company_handler_staff_idx
  on public.projects (company_id, project_handler_staff_id)
  where project_handler_staff_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_single_project_handler_assignment_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_single_project_handler_assignment_check
      check (
        project_manager_user_id is null
        or project_handler_staff_id is null
      );
  end if;
end;
$$;

create or replace function public.guard_project_handler_staff_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_is_chairman boolean;
  actor_can_assign boolean;
begin
  if tg_op = 'UPDATE'
    and new.project_handler_staff_id is not distinct from old.project_handler_staff_id then
    return new;
  end if;

  if tg_op = 'INSERT' and new.project_handler_staff_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.companies company
    where company.id = new.company_id
      and company.primary_admin_user_id = actor_id
  ) into actor_is_chairman;

  actor_can_assign := actor_id is not null
    and public.current_user_has_company_permission(new.company_id, 'projects.assign');

  if actor_id is not null and not (actor_is_chairman or actor_can_assign) then
    raise exception 'Only the Chairman or a user with projects.assign can assign project staff.'
      using errcode = '42501';
  end if;

  if new.project_handler_staff_id is null then
    return new;
  end if;

  if new.project_manager_user_id is not null then
    raise exception 'A project can have only one Project Handler.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.company_staff_members staff
    where staff.id = new.project_handler_staff_id
      and staff.company_id = new.company_id
      and staff.status = 'Active'
      and staff.linked_user_id is null
  ) then
    raise exception 'The selected Project Handler must be active staff without a linked account in this company.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_project_handler_staff_assignment()
  from public, anon, authenticated;

drop trigger if exists projects_guard_handler_staff_assignment
  on public.projects;
create trigger projects_guard_handler_staff_assignment
  before insert or update of project_handler_staff_id
  on public.projects
  for each row
  execute function public.guard_project_handler_staff_assignment();