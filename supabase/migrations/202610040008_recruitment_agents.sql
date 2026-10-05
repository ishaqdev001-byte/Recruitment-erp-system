alter table public.profiles
  add column if not exists phone text not null default '',
  add column if not exists branch text not null default '';

insert into public.company_roles (company_id, name, description)
select company.id, 'Recruitment Agent', 'Registers and supports candidates through recruitment.'
from public.companies company
on conflict (company_id, name) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name = 'Recruitment Agent'
  and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_recruitment_agent_role(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent_role_id uuid;
begin
  insert into public.company_roles (company_id, name, description)
  values (target_company_id, 'Recruitment Agent', 'Registers and supports candidates through recruitment.')
  on conflict (company_id, name) do update
    set description = excluded.description
  returning id into agent_role_id;

  insert into public.role_permissions (role_id, company_id, permission_code)
  select agent_role_id, target_company_id, permission.code
  from public.permissions permission
  where permission.code in ('candidates.view', 'candidates.create', 'candidates.edit')
  on conflict (role_id, permission_code) do nothing;
end;
$$;

create or replace function public.seed_recruitment_agent_role_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_recruitment_agent_role(new.id);
  return new;
end;
$$;

drop trigger if exists companies_seed_recruitment_agent_role on public.companies;
create trigger companies_seed_recruitment_agent_role
  after insert on public.companies
  for each row execute function public.seed_recruitment_agent_role_after_insert();

revoke all on function public.seed_recruitment_agent_role(uuid) from public, anon, authenticated;
revoke all on function public.seed_recruitment_agent_role_after_insert() from public, anon, authenticated;