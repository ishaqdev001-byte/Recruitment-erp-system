create unique index if not exists employers_id_company_id_uidx on public.employers (id, company_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  contractor_id uuid,
  contractor_name text not null check (length(trim(contractor_name)) between 1 and 200),
  project_name text not null check (length(trim(project_name)) between 1 and 200),
  country text not null check (length(trim(country)) between 1 and 200),
  salary_range text not null check (length(trim(salary_range)) between 1 and 200),
  age_bracket text not null check (length(trim(age_bracket)) between 1 and 100),
  total_demand integer not null check (total_demand >= 1),
  service_charge numeric(12, 2) not null default 0 check (service_charge >= 0),
  interview_mode text not null check (interview_mode in ('Face to face', 'Online', 'Direct submission')),
  status text not null default 'active' check (status in ('active', 'inactive', 'cancelled')),
  submitted_count integer not null default 0 check (submitted_count >= 0),
  visa_count integer not null default 0 check (visa_count >= 0),
  ticket_count integer not null default 0 check (ticket_count >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contractor_id, company_id) references public.employers (id, company_id)
);

create index projects_company_created_idx on public.projects (company_id, created_at desc);
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

insert into public.permissions (code, description) values
  ('projects.view', 'View company projects'),
  ('projects.create', 'Create company projects'),
  ('projects.edit', 'Edit company project details and metrics'),
  ('projects.delete', 'Delete company projects'),
  ('projects.status', 'Change company project statuses')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select company_role.id, company_role.company_id, permission.code
from public.company_roles company_role
cross join public.permissions permission
where company_role.name in (
  'Company Owner / Primary Administrator', 'General Manager', 'CEO',
  'Administrator', 'Recruitment Manager', 'Branch Manager'
)
  and permission.code in ('projects.view', 'projects.create', 'projects.edit', 'projects.delete')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select company_role.id, company_role.company_id, permission.code
from public.company_roles company_role
cross join public.permissions permission
where company_role.name in (
  'Company Owner / Primary Administrator', 'General Manager', 'CEO',
  'Administrator', 'Recruitment Manager'
)
  and permission.code = 'projects.status'
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_employer_project_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name in (
    'Company Owner / Primary Administrator', 'General Manager', 'CEO',
    'Administrator', 'Recruitment Manager', 'Branch Manager'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission.code
    from public.permissions permission
    where permission.code in (
      'employers.view', 'employers.create', 'projects.view', 'projects.create',
      'projects.edit', 'projects.delete'
    )
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in (
    'Company Owner / Primary Administrator', 'General Manager', 'CEO',
    'Administrator', 'Recruitment Manager'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'projects.status')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_employer_project_permissions on public.company_roles;
create trigger company_roles_seed_employer_project_permissions
  after insert or update on public.company_roles
  for each row execute function public.seed_employer_project_permissions_for_role();
revoke all on function public.seed_employer_project_permissions_for_role() from public, anon, authenticated;

alter table public.projects enable row level security;

create policy "Projects are tenant and permission scoped" on public.projects
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'projects.view')
  );
create policy "Authorized users can create projects" on public.projects
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'projects.create')
  );
create policy "Authorized users can edit project details or status" on public.projects
  for update to authenticated using (
    public.current_user_has_company_permission(company_id, 'projects.edit')
    or public.current_user_has_company_permission(company_id, 'projects.status')
  ) with check (
    public.current_user_has_company_permission(company_id, 'projects.edit')
    or public.current_user_has_company_permission(company_id, 'projects.status')
  );
create policy "Authorized users can delete projects" on public.projects
  for delete to authenticated using (
    public.current_user_has_company_permission(company_id, 'projects.delete')
  );

create or replace function public.enforce_project_update_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger projects_enforce_update_permission before update on public.projects
  for each row execute function public.enforce_project_update_permission();
revoke all on function public.enforce_project_update_permission() from public, anon, authenticated;

grant select, insert, update, delete on public.projects to authenticated;