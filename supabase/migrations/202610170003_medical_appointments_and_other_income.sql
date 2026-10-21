do $$
begin
  -- Ensure company_accounts has is_default and status before the seed function
  -- references them.  This is a no-op when 202610130005 has already been applied.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_accounts'
  ) then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name  = 'company_accounts'
        and column_name = 'is_default'
    ) then
      alter table public.company_accounts
        add column is_default boolean not null default false;
    end if;
    -- status is required by the seed function's WHERE clause
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name  = 'company_accounts'
        and column_name = 'status'
    ) then
      alter table public.company_accounts
        add column status text not null default 'active';
    end if;
    -- composite unique (id, company_id) is the FK target for company_income_types
    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname  = 'public'
        and t.relname  = 'company_accounts'
        and c.contype  = 'u'
        and c.conkey   @> (
          select array_agg(a.attnum)
          from pg_attribute a
          where a.attrelid = t.oid
            and a.attname in ('id', 'company_id')
        )
        and array_length(c.conkey, 1) = 2
    ) then
      alter table public.company_accounts
        add constraint company_accounts_id_company_id_key unique (id, company_id);
    end if;
  end if;
end;
$$;

-- Ensure the unique index on (company_id, lower(name)) exists so that the seed
-- function's ON CONFLICT clause resolves correctly even when 202610130005 has
-- not yet been applied.
create unique index if not exists company_accounts_name_uidx
  on public.company_accounts (company_id, lower(name));

create table if not exists public.company_income_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  income_kind text not null check (income_kind in ('medical', 'other')),
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  account_id uuid not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (account_id, company_id)
    references public.company_accounts (id, company_id) on delete restrict
);

create unique index if not exists company_income_types_company_name_uidx
  on public.company_income_types (company_id, lower(name));
create index if not exists company_income_types_company_active_idx
  on public.company_income_types (company_id, income_kind, is_active, lower(name));

drop trigger if exists company_income_types_set_updated_at on public.company_income_types;
create trigger company_income_types_set_updated_at before update on public.company_income_types
  for each row execute function public.set_updated_at();

create table if not exists public.medical_appointments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  income_type_id uuid not null,
  account_id uuid not null,
  candidate_first_name text not null check (length(trim(candidate_first_name)) between 1 and 200),
  candidate_last_name text not null check (length(trim(candidate_last_name)) between 1 and 200),
  candidate_date_of_birth date not null,
  candidate_age integer not null check (candidate_age between 0 and 120),
  candidate_passport_number text not null check (length(trim(candidate_passport_number)) between 1 and 100),
  candidate_phone text not null check (length(trim(candidate_phone)) between 1 and 100),
  appointment_at timestamptz not null,
  fee_amount numeric(14, 2) not null check (fee_amount > 0),
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled')),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (income_type_id, company_id)
    references public.company_income_types (id, company_id) on delete restrict,
  foreign key (account_id, company_id)
    references public.company_accounts (id, company_id) on delete restrict
);

create index if not exists medical_appointments_company_scheduled_idx
  on public.medical_appointments (company_id, appointment_at desc, created_at desc);

create or replace function public.seed_company_medical_income_types(
  requested_company_id uuid,
  requested_creator_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id_value uuid;
  creator_id_value uuid := requested_creator_id;
begin
  select account.id into account_id_value
  from public.company_accounts account
  where account.company_id = requested_company_id
    and account.is_default
    and account.status = 'active'
  order by account.created_at, account.id
  limit 1;

  if account_id_value is null then
    select account.id into account_id_value
    from public.company_accounts account
    where account.company_id = requested_company_id
      and account.status = 'active'
    order by account.created_at, account.id
    limit 1;
  end if;

  if account_id_value is null then
    if creator_id_value is null then
      select company.primary_admin_user_id into creator_id_value
      from public.companies company
      where company.id = requested_company_id;
    end if;
    if creator_id_value is null then
      select membership.user_id into creator_id_value
      from public.company_memberships membership
      where membership.company_id = requested_company_id
        and membership.status = 'active'
      order by membership.created_at, membership.user_id
      limit 1;
    end if;
    if creator_id_value is null then
      return;
    end if;

    insert into public.company_accounts (company_id, name, account_type, description, is_default, created_by)
    values (
      requested_company_id,
      'Open Account',
      'cash',
      'Default account for initial company transactions before other accounts are created.',
      true,
      creator_id_value
    )
    on conflict (company_id, lower(name)) do nothing;

    select account.id into account_id_value
    from public.company_accounts account
    where account.company_id = requested_company_id
      and account.status = 'active'
    order by account.is_default desc, account.created_at, account.id
    limit 1;
    if account_id_value is null then
      return;
    end if;
  end if;

  insert into public.company_income_types (company_id, name, income_kind, fee, account_id, is_default, created_by)
  select requested_company_id, default_type.name, 'medical', 0, account_id_value, true, requested_creator_id
  from (values ('General Medical Examination'), ('X-Ray'), ('Laboratory Test')) as default_type(name)
  on conflict (company_id, lower(name)) do nothing;
end;
$$;

create or replace function public.seed_company_medical_income_types_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_company_medical_income_types(new.id, new.primary_admin_user_id);
  return new;
end;
$$;

drop trigger if exists companies_seed_medical_income_types on public.companies;
create trigger companies_seed_medical_income_types
  after insert on public.companies
  for each row execute function public.seed_company_medical_income_types_after_insert();

select public.seed_company_medical_income_types(company.id, company.primary_admin_user_id)
from public.companies company;

alter table public.company_income_types enable row level security;
alter table public.medical_appointments enable row level security;
revoke all on public.company_income_types, public.medical_appointments from public, anon, authenticated;
grant select, insert, update on public.company_income_types, public.medical_appointments to service_role;

-- Authenticated access: income types are finance-permission gated.
-- Finance Manager and above (Owner, CEO, GM, Admin) can manage income types.
-- Finance User can view and create but not edit.
grant select, insert, update on public.company_income_types to authenticated;

drop policy if exists "Income types are tenant and permission scoped" on public.company_income_types;
create policy "Income types are tenant and permission scoped"
  on public.company_income_types
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

drop policy if exists "Authorized users can create income types" on public.company_income_types;
create policy "Authorized users can create income types"
  on public.company_income_types
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

-- finance.edit covers Finance Manager, Owner, CEO, General Manager, and Administrator.
-- Allows updating name, fee, account_id (which account the income type draws from), and
-- is_active / is_default so responsible members can redirect the account at any time.
drop policy if exists "Authorized users can edit income types" on public.company_income_types;
create policy "Authorized users can edit income types"
  on public.company_income_types
  for update to authenticated
  using  (public.current_user_has_company_permission(company_id, 'finance.edit'))
  with check (public.current_user_has_company_permission(company_id, 'finance.edit'));

-- Medical appointments: finance.create to book, finance.edit to manage.
grant select, insert, update on public.medical_appointments to authenticated;

drop policy if exists "Medical appointments are tenant and permission scoped" on public.medical_appointments;
create policy "Medical appointments are tenant and permission scoped"
  on public.medical_appointments
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

drop policy if exists "Authorized users can book medical appointments" on public.medical_appointments;
create policy "Authorized users can book medical appointments"
  on public.medical_appointments
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

drop policy if exists "Authorized users can update medical appointments" on public.medical_appointments;
create policy "Authorized users can update medical appointments"
  on public.medical_appointments
  for update to authenticated
  using  (public.current_user_has_company_permission(company_id, 'finance.edit'))
  with check (public.current_user_has_company_permission(company_id, 'finance.edit'));

revoke all on function public.seed_company_medical_income_types(uuid, uuid) from public, anon, authenticated;
revoke all on function public.seed_company_medical_income_types_after_insert() from public, anon, authenticated;