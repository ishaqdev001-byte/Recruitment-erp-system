-- Leave types, multi-stage approval workflow, leave balances, and leave notifications
-- Approval chain: supervisor (leave.manage) → general manager → CEO / owner (leave.finalize)

-- ─── Leave types ────────────────────────────────────────────────────────────────

create table if not exists public.company_leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  days_per_year integer not null check (days_per_year between 1 and 365),
  description text not null default '' check (length(description) <= 1000),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists company_leave_types_company_active_idx
  on public.company_leave_types (company_id, is_active, name);

drop trigger if exists company_leave_types_set_updated_at on public.company_leave_types;
create trigger company_leave_types_set_updated_at before update on public.company_leave_types
  for each row execute function public.set_updated_at();

alter table public.company_leave_types enable row level security;
revoke all on public.company_leave_types from public, anon, authenticated;
grant select on public.company_leave_types to authenticated;

create policy "Leave types visible to company members" on public.company_leave_types
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'leave.create')
    or public.current_user_has_company_permission(company_id, 'leave.view')
  );

-- ─── Multi-stage leave request approval ─────────────────────────────────────────
-- Approval stages:
--   1. supervisor_status  — any user with leave.manage
--   2. manager_status     — General Manager
--   3. final_status       — CEO / Company Owner / Primary Administrator
--
-- The overall status field follows the chain:
--   pending → supervisor_pending → manager_pending → final_pending → approved | rejected

-- Add new columns to existing leave_requests table
alter table public.leave_requests
  add column if not exists leave_type_id uuid references public.company_leave_types (id) on delete set null,
  add column if not exists days_count integer generated always as (
    (end_date - start_date + 1)
  ) stored,
  -- Stage 1 – Supervisor
  add column if not exists supervisor_status text not null default 'pending'
    check (supervisor_status in ('pending', 'approved', 'rejected')),
  add column if not exists supervisor_note text not null default '',
  add column if not exists supervisor_id uuid,
  add column if not exists supervisor_reviewed_at timestamptz,
  -- Stage 2 – General Manager
  add column if not exists manager_status text not null default 'pending'
    check (manager_status in ('pending', 'approved', 'rejected')),
  add column if not exists manager_note text not null default '',
  add column if not exists manager_id uuid,
  add column if not exists manager_reviewed_at timestamptz,
  -- Stage 3 – Final (CEO / Owner)
  add column if not exists final_status text not null default 'pending'
    check (final_status in ('pending', 'approved', 'rejected')),
  add column if not exists final_note text not null default '',
  add column if not exists final_reviewer_id uuid,
  add column if not exists final_reviewed_at timestamptz;

-- Loosen the old single-reviewer constraint so the new multi-stage columns can exist
-- (The original constraint required reviewed_by/reviewed_at both set when status != pending
--  — we keep reviewed_by as the final approver for backwards compat but relax the check)
alter table public.leave_requests
  drop constraint if exists leave_requests_status_check;

-- Re-add a correct composite check
alter table public.leave_requests
  add constraint leave_requests_status_check check (
    status in ('pending', 'supervisor_pending', 'manager_pending', 'final_pending', 'approved', 'rejected')
  );

-- Update leave status constraint to include new pipeline values
-- (Some older rows have status 'pending' / 'approved' / 'rejected' — those remain valid)

-- ─── Leave balances ──────────────────────────────────────────────────────────────

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  leave_type_id uuid not null references public.company_leave_types (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  days_allocated integer not null check (days_allocated >= 0),
  days_used integer not null default 0 check (days_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, user_id) references public.company_memberships (company_id, user_id) on delete cascade,
  unique (company_id, user_id, leave_type_id, year)
);

create index if not exists leave_balances_user_year_idx
  on public.leave_balances (company_id, user_id, year, leave_type_id);

drop trigger if exists leave_balances_set_updated_at on public.leave_balances;
create trigger leave_balances_set_updated_at before update on public.leave_balances
  for each row execute function public.set_updated_at();

alter table public.leave_balances enable row level security;
revoke all on public.leave_balances from public, anon, authenticated;
grant select on public.leave_balances to authenticated;

create policy "Users see their own leave balances" on public.leave_balances
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.current_user_has_company_permission(company_id, 'leave.view')
  );

-- ─── Leave notifications ─────────────────────────────────────────────────────────

create table if not exists public.leave_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  leave_request_id uuid not null references public.leave_requests (id) on delete cascade,
  recipient_id uuid not null,
  stage text not null check (stage in ('submitted', 'supervisor_approved', 'supervisor_rejected', 'manager_approved', 'manager_rejected', 'final_approved', 'final_rejected')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 500),
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, recipient_id) references public.company_memberships (company_id, user_id) on delete cascade
);

create index if not exists leave_notifications_recipient_sent_idx
  on public.leave_notifications (company_id, recipient_id, sent_at desc);
create index if not exists leave_notifications_request_idx
  on public.leave_notifications (leave_request_id);

alter table public.leave_notifications enable row level security;
revoke all on public.leave_notifications from public, anon, authenticated;
grant select on public.leave_notifications to authenticated;
grant update (read_at) on public.leave_notifications to authenticated;

create policy "Leave notifications visible to recipient" on public.leave_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
  );

create policy "Recipients can mark leave notifications read" on public.leave_notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- ─── Permissions ─────────────────────────────────────────────────────────────────

insert into public.permissions (code, description) values
  ('leave.types', 'Create and edit leave types for the company'),
  ('leave.finalize', 'Give final approval on leave requests (CEO / Company Owner)')
on conflict (code) do nothing;

-- leave.types → Owner, CEO, GM
insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'leave.types'
from public.company_roles role
where role.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager')
on conflict (role_id, permission_code) do nothing;

-- leave.finalize → Owner, CEO
insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'leave.finalize'
from public.company_roles role
where role.name in ('Company Owner / Primary Administrator', 'CEO')
on conflict (role_id, permission_code) do nothing;

-- Extend the role trigger to seed these new permissions
create or replace function public.seed_attendance_leave_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role_permissions (role_id, company_id, permission_code)
  values
    (new.id, new.company_id, 'attendance.clock'),
    (new.id, new.company_id, 'leave.create')
  on conflict (role_id, permission_code) do nothing;

  if new.name in (
    'Company Owner / Primary Administrator', 'General Manager', 'CEO',
    'Administrator', 'Recruitment Manager', 'Branch Manager'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'attendance.view'),
      (new.id, new.company_id, 'attendance.manage'),
      (new.id, new.company_id, 'leave.view'),
      (new.id, new.company_id, 'leave.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'leave.types')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in ('Company Owner / Primary Administrator', 'CEO') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'leave.finalize')
    on conflict (role_id, permission_code) do nothing;
  end if;

  return new;
end;
$$;

-- ─── Multi-stage leave approval RPC ──────────────────────────────────────────────

create or replace function public.advance_leave_request(
  requested_leave_id uuid,
  requested_stage text,   -- 'supervisor' | 'manager' | 'final'
  requested_decision text, -- 'approved' | 'rejected'
  requested_note text default ''
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  leave_rec public.leave_requests%rowtype;
  balance_row public.leave_balances%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if requested_stage not in ('supervisor', 'manager', 'final') then
    raise exception 'Invalid stage' using errcode = '22023';
  end if;

  if requested_decision not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected' using errcode = '22023';
  end if;

  if length(coalesce(requested_note, '')) > 1000 then
    raise exception 'Note is too long (max 1000 characters)' using errcode = '22023';
  end if;

  select * into leave_rec
  from public.leave_requests
  where id = requested_leave_id
  for update;

  if not found then
    raise exception 'Leave request not found' using errcode = 'P0002';
  end if;

  -- ── Supervisor stage ────────────────────────────────────────────────────────
  if requested_stage = 'supervisor' then
    if not public.current_user_has_company_permission(leave_rec.company_id, 'leave.manage') then
      raise exception 'Leave management permission required' using errcode = '42501';
    end if;
    -- Supervisor may not approve their own request
    if leave_rec.employee_id = actor_id then
      raise exception 'You cannot approve your own leave request' using errcode = '42501';
    end if;
    if leave_rec.status <> 'pending' then
      raise exception 'Request is not waiting for supervisor review' using errcode = '22023';
    end if;

    if requested_decision = 'rejected' then
      update public.leave_requests set
        status = 'rejected',
        supervisor_status = 'rejected',
        supervisor_note = coalesce(requested_note, ''),
        supervisor_id = actor_id,
        supervisor_reviewed_at = now(),
        reviewed_by = actor_id,
        reviewed_at = now()
      where id = requested_leave_id returning * into leave_rec;
    else
      update public.leave_requests set
        status = 'manager_pending',
        supervisor_status = 'approved',
        supervisor_note = coalesce(requested_note, ''),
        supervisor_id = actor_id,
        supervisor_reviewed_at = now()
      where id = requested_leave_id returning * into leave_rec;
    end if;

  -- ── Manager (General Manager) stage ────────────────────────────────────────
  elsif requested_stage = 'manager' then
    if not public.current_user_has_company_permission(leave_rec.company_id, 'leave.manage') then
      raise exception 'Leave management permission required' using errcode = '42501';
    end if;
    if leave_rec.employee_id = actor_id then
      raise exception 'You cannot approve your own leave request' using errcode = '42501';
    end if;
    if leave_rec.status <> 'manager_pending' then
      raise exception 'Request is not waiting for manager review' using errcode = '22023';
    end if;

    if requested_decision = 'rejected' then
      update public.leave_requests set
        status = 'rejected',
        manager_status = 'rejected',
        manager_note = coalesce(requested_note, ''),
        manager_id = actor_id,
        manager_reviewed_at = now(),
        reviewed_by = actor_id,
        reviewed_at = now()
      where id = requested_leave_id returning * into leave_rec;
    else
      update public.leave_requests set
        status = 'final_pending',
        manager_status = 'approved',
        manager_note = coalesce(requested_note, ''),
        manager_id = actor_id,
        manager_reviewed_at = now()
      where id = requested_leave_id returning * into leave_rec;
    end if;

  -- ── Final (CEO / Owner) stage ───────────────────────────────────────────────
  elsif requested_stage = 'final' then
    if not public.current_user_has_company_permission(leave_rec.company_id, 'leave.finalize') then
      raise exception 'Final leave approval permission required' using errcode = '42501';
    end if;
    if leave_rec.employee_id = actor_id then
      raise exception 'You cannot approve your own leave request' using errcode = '42501';
    end if;
    if leave_rec.status <> 'final_pending' then
      raise exception 'Request is not waiting for final review' using errcode = '22023';
    end if;

    if requested_decision = 'rejected' then
      update public.leave_requests set
        status = 'rejected',
        final_status = 'rejected',
        final_note = coalesce(requested_note, ''),
        final_reviewer_id = actor_id,
        final_reviewed_at = now(),
        reviewed_by = actor_id,
        reviewed_at = now()
      where id = requested_leave_id returning * into leave_rec;
    else
      update public.leave_requests set
        status = 'approved',
        final_status = 'approved',
        final_note = coalesce(requested_note, ''),
        final_reviewer_id = actor_id,
        final_reviewed_at = now(),
        reviewed_by = actor_id,
        reviewed_at = now()
      where id = requested_leave_id returning * into leave_rec;

      -- Deduct days from leave balance
      if leave_rec.leave_type_id is not null then
        update public.leave_balances set
          days_used = days_used + leave_rec.days_count,
          updated_at = now()
        where company_id = leave_rec.company_id
          and user_id = leave_rec.employee_id
          and leave_type_id = leave_rec.leave_type_id
          and year = extract(year from leave_rec.start_date)::integer;
      end if;
    end if;
  end if;

  return leave_rec;
end;
$$;

revoke all on function public.advance_leave_request(uuid, text, text, text) from public, anon;
grant execute on function public.advance_leave_request(uuid, text, text, text) to authenticated;

-- ─── Function to auto-provision leave balances on request submission ───────────

create or replace function public.ensure_leave_balance(
  p_company_id uuid,
  p_user_id uuid,
  p_leave_type_id uuid,
  p_year integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer;
begin
  select days_per_year into v_days
  from public.company_leave_types
  where id = p_leave_type_id and company_id = p_company_id and is_active = true;

  if v_days is null then return; end if;

  insert into public.leave_balances (company_id, user_id, leave_type_id, year, days_allocated, days_used)
  values (p_company_id, p_user_id, p_leave_type_id, p_year, v_days, 0)
  on conflict (company_id, user_id, leave_type_id, year) do nothing;
end;
$$;

revoke all on function public.ensure_leave_balance(uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.ensure_leave_balance(uuid, uuid, uuid, integer) to service_role;

-- ─── Grant service_role access for server-side notification inserts ───────────

grant select, insert, update, delete on public.company_leave_types to service_role;
grant select, insert, update, delete on public.leave_balances to service_role;
grant select, insert, update, delete on public.leave_notifications to service_role;
grant select, insert, update on public.leave_requests to service_role;

-- ─── Seed default leave types for all existing companies ─────────────────────

insert into public.company_leave_types (company_id, name, days_per_year, description)
select c.id, lt.name, lt.days, lt.description
from public.companies c
cross join (values
  ('Annual Leave', 21, 'Standard paid annual leave entitlement'),
  ('Sick Leave', 10, 'Paid leave for medical illness or injury'),
  ('Personal Leave', 3, 'Leave for personal matters'),
  ('Parental Leave', 90, 'Maternity, paternity, or adoption leave'),
  ('Unpaid Leave', 30, 'Approved leave without pay')
) as lt(name, days, description)
on conflict (company_id, name) do nothing;

-- Trigger to seed default leave types when a new company is created
create or replace function public.seed_leave_types_for_new_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_leave_types (company_id, name, days_per_year, description)
  values
    (new.id, 'Annual Leave', 21, 'Standard paid annual leave entitlement'),
    (new.id, 'Sick Leave', 10, 'Paid leave for medical illness or injury'),
    (new.id, 'Personal Leave', 3, 'Leave for personal matters'),
    (new.id, 'Parental Leave', 90, 'Maternity, paternity, or adoption leave'),
    (new.id, 'Unpaid Leave', 30, 'Approved leave without pay')
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_seed_leave_types on public.companies;
create trigger companies_seed_leave_types
  after insert on public.companies
  for each row execute function public.seed_leave_types_for_new_company();

revoke all on function public.seed_leave_types_for_new_company() from public, anon, authenticated;
