create table if not exists public.company_staff_id_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  staff_id_prefix text not null check (staff_id_prefix ~ '^[A-Z][A-Z0-9]{0,9}$'),
  next_sequence integer not null default 1 check (next_sequence between 1 and 999999),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_staff_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  staff_id text not null check (length(trim(staff_id)) between 1 and 20),
  name text not null check (length(trim(name)) between 1 and 200),
  position text not null check (length(trim(position)) between 1 and 150),
  phone text not null check (length(trim(phone)) between 1 and 60),
  status text not null default 'Active' check (status in ('Active', 'On Leave', 'Inactive')),
  bio text not null default '' check (length(bio) <= 5000),
  date_of_birth date not null,
  next_of_kin text not null default '' check (length(next_of_kin) <= 200),
  next_of_kin_phone text not null default '' check (length(next_of_kin_phone) <= 60),
  marital_status text not null default 'Single' check (marital_status in ('Single', 'Married', 'Widowed', 'Separated')),
  date_joined date not null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, staff_id),
  unique (id, company_id)
);

create index if not exists company_staff_members_company_created_idx
  on public.company_staff_members (company_id, created_at desc);

drop trigger if exists company_staff_id_settings_set_updated_at on public.company_staff_id_settings;
create trigger company_staff_id_settings_set_updated_at before update on public.company_staff_id_settings
  for each row execute function public.set_updated_at();
drop trigger if exists company_staff_members_set_updated_at on public.company_staff_members;
create trigger company_staff_members_set_updated_at before update on public.company_staff_members
  for each row execute function public.set_updated_at();

alter table public.company_staff_id_settings enable row level security;
alter table public.company_staff_members enable row level security;
revoke all on public.company_staff_id_settings, public.company_staff_members from public, anon, authenticated;
grant select, insert, update, delete on public.company_staff_id_settings, public.company_staff_members to service_role;

create or replace function public.allocate_company_staff_sequence(requested_company_id uuid)
returns table (staff_id_prefix text, sequence_number integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.company_staff_id_settings settings
  set next_sequence = settings.next_sequence + 1
  where settings.company_id = requested_company_id
  returning settings.staff_id_prefix, settings.next_sequence - 1;

  if not found then
    raise exception 'Staff ID settings are not configured for this company';
  end if;
end;
$$;

revoke all on function public.allocate_company_staff_sequence(uuid) from public, anon, authenticated;
grant execute on function public.allocate_company_staff_sequence(uuid) to service_role;