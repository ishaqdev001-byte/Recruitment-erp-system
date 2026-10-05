create table if not exists public.employers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  company_name text not null check (length(trim(company_name)) between 1 and 200),
  contact_persons text[] not null check (cardinality(contact_persons) between 1 and 20 and array_position(contact_persons, '') is null),
  phone_numbers text[] not null check (cardinality(phone_numbers) between 1 and 20 and array_position(phone_numbers, '') is null),
  email_addresses text[] not null check (cardinality(email_addresses) between 1 and 20 and array_position(email_addresses, '') is null),
  countries text[] not null check (cardinality(countries) between 1 and 20 and array_position(countries, '') is null),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists employers_company_created_idx on public.employers (company_id, created_at desc);

insert into public.permissions (code, description) values
  ('employers.view', 'View company employers'),
  ('employers.create', 'Register company employers')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select company_role.id, company_role.company_id, permission.code
from public.company_roles company_role
cross join public.permissions permission
where company_role.name in (
  'Company Owner / Primary Administrator', 'General Manager', 'CEO',
  'Administrator', 'Recruitment Manager', 'Branch Manager'
)
  and permission.code in ('employers.view', 'employers.create')
on conflict (role_id, permission_code) do nothing;

alter table public.employers enable row level security;

drop policy if exists "Employers are tenant and permission scoped" on public.employers;
create policy "Employers are tenant and permission scoped" on public.employers
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'employers.view')
  );
drop policy if exists "Authorized users can register employers" on public.employers;
create policy "Authorized users can register employers" on public.employers
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'employers.create')
  );

grant select, insert on public.employers to authenticated;