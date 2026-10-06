create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  supplier_name text not null check (length(trim(supplier_name)) between 1 and 200),
  contact_person text not null check (length(trim(contact_person)) between 1 and 200),
  phone text not null check (length(trim(phone)) between 1 and 100),
  email text not null check (length(trim(email)) between 1 and 200),
  branch text not null check (length(trim(branch)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suppliers_company_created_idx on public.suppliers (company_id, created_at desc);
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

insert into public.permissions (code, description) values
  ('suppliers.view', 'View company suppliers'),
  ('suppliers.create', 'Register company suppliers')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select company_role.id, company_role.company_id, permission.code
from public.company_roles company_role
cross join public.permissions permission
where company_role.name in (
  'Company Owner / Primary Administrator', 'General Manager', 'CEO',
  'Administrator', 'Recruitment Manager', 'Branch Manager'
)
  and permission.code in ('suppliers.view', 'suppliers.create')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_supplier_permissions_for_role()
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
    values
      (new.id, new.company_id, 'suppliers.view'),
      (new.id, new.company_id, 'suppliers.create')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_supplier_permissions on public.company_roles;
create trigger company_roles_seed_supplier_permissions
  after insert or update on public.company_roles
  for each row execute function public.seed_supplier_permissions_for_role();
revoke all on function public.seed_supplier_permissions_for_role() from public, anon, authenticated;

alter table public.suppliers enable row level security;

drop policy if exists "Suppliers are tenant and permission scoped" on public.suppliers;
create policy "Suppliers are tenant and permission scoped" on public.suppliers
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'suppliers.view')
  );
drop policy if exists "Authorized users can register suppliers" on public.suppliers;
create policy "Authorized users can register suppliers" on public.suppliers
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'suppliers.create')
  );

grant select, insert on public.suppliers to authenticated;