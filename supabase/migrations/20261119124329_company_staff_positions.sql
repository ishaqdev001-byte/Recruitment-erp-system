create table public.company_positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_positions_id_company_id_key unique (id, company_id)
);

create unique index company_positions_company_name_key
  on public.company_positions (company_id, lower(btrim(name)));

create index company_positions_company_active_name_idx
  on public.company_positions (company_id, is_active, name);

insert into public.company_positions (company_id, name)
select distinct on (staff.company_id, lower(btrim(staff.position)))
  staff.company_id,
  btrim(staff.position)
from public.company_staff_members staff
where btrim(staff.position) <> ''
order by staff.company_id, lower(btrim(staff.position)), btrim(staff.position);

alter table public.company_staff_members
  add column position_id uuid
    references public.company_positions (id) on delete set null;

create index company_staff_members_company_position_idx
  on public.company_staff_members (company_id, position_id)
  where position_id is not null;

update public.company_staff_members staff
set position_id = catalog_position.id
from public.company_positions catalog_position
where catalog_position.company_id = staff.company_id
  and lower(btrim(catalog_position.name)) = lower(btrim(staff.position));

alter table public.company_positions enable row level security;
revoke all on public.company_positions from public, anon, authenticated;
grant select on public.company_positions to authenticated;
grant all on public.company_positions to service_role;

create policy company_positions_select_active_members
  on public.company_positions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = company_positions.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

create or replace function public.sync_staff_position_from_catalog()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  position_name text;
  position_is_active boolean;
begin
  if new.position_id is null then
    return new;
  end if;

  select catalog_position.name, catalog_position.is_active
  into position_name, position_is_active
  from public.company_positions catalog_position
  where catalog_position.id = new.position_id
    and catalog_position.company_id = new.company_id;

  if not found then
    raise exception 'Select a position from this company.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and not position_is_active then
    raise exception 'Select an active position.'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and new.position_id is distinct from old.position_id
     and not position_is_active then
    raise exception 'Select an active position.'
      using errcode = '23514';
  end if;

  new.position := position_name;
  return new;
end;
$$;

revoke all on function public.sync_staff_position_from_catalog()
  from public, anon, authenticated;

create trigger company_staff_members_sync_position_from_catalog
  before insert or update of company_id, position_id, position
  on public.company_staff_members
  for each row
  execute function public.sync_staff_position_from_catalog();

create or replace function public.sync_company_staff_position_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.company_staff_members staff
    set position = new.name
    where staff.company_id = new.company_id
      and staff.position_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_company_staff_position_name()
  from public, anon, authenticated;

create trigger company_positions_sync_staff_position_name
  after update of name
  on public.company_positions
  for each row
  execute function public.sync_company_staff_position_name();

insert into public.permissions (code, description)
values (
  'staff.positions.manage',
  'Manage the company position catalog'
)
on conflict (code) do update
set description = excluded.description;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'staff.positions.manage'
from public.company_roles role
where lower(btrim(role.name)) = 'chairman'
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_staff_positions_permission_for_role()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(btrim(new.name)) = 'chairman' then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'staff.positions.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.seed_staff_positions_permission_for_role()
  from public, anon, authenticated;

create trigger company_roles_seed_staff_positions_permission
  after insert or update on public.company_roles
  for each row
  execute function public.seed_staff_positions_permission_for_role();