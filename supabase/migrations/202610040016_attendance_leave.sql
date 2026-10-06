create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  work_date date not null,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.company_memberships (company_id, user_id) on delete cascade,
  unique (company_id, employee_id, work_date),
  check (check_out_at is null or check_out_at >= check_in_at)
);

create index if not exists attendance_records_company_date_idx
  on public.attendance_records (company_id, work_date desc);
drop trigger if exists attendance_records_set_updated_at on public.attendance_records;
create trigger attendance_records_set_updated_at before update on public.attendance_records
  for each row execute function public.set_updated_at();

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  leave_type text not null check (leave_type in ('annual', 'sick', 'personal', 'parental', 'unpaid')),
  start_date date not null,
  end_date date not null,
  reason text not null check (length(trim(reason)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, employee_id) references public.company_memberships (company_id, user_id) on delete cascade,
  foreign key (company_id, reviewed_by) references public.company_memberships (company_id, user_id),
  check (end_date >= start_date),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null) or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null))
);

create index if not exists leave_requests_company_dates_idx
  on public.leave_requests (company_id, start_date, end_date);
create index if not exists leave_requests_employee_created_idx
  on public.leave_requests (company_id, employee_id, created_at desc);
drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();

insert into public.permissions (code, description) values
  ('attendance.view', 'View company attendance records'),
  ('attendance.clock', 'Record personal attendance'),
  ('attendance.manage', 'Manage company attendance records'),
  ('leave.view', 'View company leave requests'),
  ('leave.create', 'Submit personal leave requests'),
  ('leave.manage', 'Review company leave requests')
on conflict (code) do nothing;

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
  return new;
end;
$$;

drop trigger if exists company_roles_seed_attendance_leave_permissions on public.company_roles;
create trigger company_roles_seed_attendance_leave_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_attendance_leave_permissions_for_role();
revoke all on function public.seed_attendance_leave_permissions_for_role() from public, anon, authenticated;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where permission.code in ('attendance.clock', 'leave.create')
   or (role.name in (
     'Company Owner / Primary Administrator', 'General Manager', 'CEO',
     'Administrator', 'Recruitment Manager', 'Branch Manager'
   ) and permission.code in ('attendance.view', 'attendance.manage', 'leave.view', 'leave.manage'))
on conflict (role_id, permission_code) do nothing;

alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists "Attendance records are visible to employees and managers" on public.attendance_records;
create policy "Attendance records are visible to employees and managers" on public.attendance_records
  for select to authenticated using (
    employee_id = (select auth.uid())
    or public.current_user_has_company_permission(company_id, 'attendance.view')
  );

drop policy if exists "Leave requests are visible to employees and managers" on public.leave_requests;
create policy "Leave requests are visible to employees and managers" on public.leave_requests
  for select to authenticated using (
    employee_id = (select auth.uid())
    or public.current_user_has_company_permission(company_id, 'leave.view')
  );
drop policy if exists "Employees can submit their own leave requests" on public.leave_requests;
create policy "Employees can submit their own leave requests" on public.leave_requests
  for insert to authenticated with check (
    employee_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and public.current_user_has_company_permission(company_id, 'leave.create')
  );

grant select on public.attendance_records to authenticated;
grant select, insert on public.leave_requests to authenticated;

create or replace function public.record_attendance_action(requested_company_id uuid, requested_action text)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_user_id uuid := (select auth.uid());
  work_day date := (now() at time zone 'Africa/Kampala')::date;
  attendance_record public.attendance_records%rowtype;
begin
  if employee_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if requested_action not in ('check-in', 'check-out') then
    raise exception 'Choose check-in or check-out' using errcode = '22023';
  end if;
  if not public.current_user_has_company_permission(requested_company_id, 'attendance.clock') then
    raise exception 'Attendance permission required' using errcode = '42501';
  end if;

  if requested_action = 'check-in' then
    insert into public.attendance_records (company_id, employee_id, work_date, check_in_at)
    values (requested_company_id, employee_user_id, work_day, now())
    on conflict (company_id, employee_id, work_date) do nothing
    returning * into attendance_record;
    if not found then
      raise exception 'Attendance has already been recorded for today' using errcode = '23505';
    end if;
    return attendance_record;
  end if;

  update public.attendance_records
  set check_out_at = now()
  where company_id = requested_company_id
    and employee_id = employee_user_id
    and work_date = work_day
    and check_out_at is null
  returning * into attendance_record;
  if not found then
    raise exception 'No active check-in was found for today' using errcode = 'P0002';
  end if;
  return attendance_record;
end;
$$;
revoke all on function public.record_attendance_action(uuid, text) from public, anon;
grant execute on function public.record_attendance_action(uuid, text) to authenticated;

create or replace function public.review_leave_request(requested_leave_id uuid, requested_status text, requested_note text default '')
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  leave_record public.leave_requests%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if requested_status not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected' using errcode = '22023';
  end if;
  if length(coalesce(requested_note, '')) > 1000 then
    raise exception 'Review note is too long' using errcode = '22023';
  end if;

  select * into leave_record
  from public.leave_requests
  where id = requested_leave_id
  for update;
  if not found then
    raise exception 'Leave request not found' using errcode = 'P0002';
  end if;
  if not public.current_user_has_company_permission(leave_record.company_id, 'leave.manage') then
    raise exception 'Leave management permission required' using errcode = '42501';
  end if;
  if leave_record.status <> 'pending' then
    raise exception 'Only pending leave requests can be reviewed' using errcode = '22023';
  end if;

  update public.leave_requests
  set status = requested_status,
      review_note = coalesce(requested_note, ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = requested_leave_id
  returning * into leave_record;
  return leave_record;
end;
$$;
revoke all on function public.review_leave_request(uuid, text, text) from public, anon;
grant execute on function public.review_leave_request(uuid, text, text) to authenticated;

drop policy if exists "Attendance managers can view employee profiles" on public.profiles;
create policy "Attendance managers can view employee profiles" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.company_memberships membership
      where membership.user_id = profiles.id
        and membership.status = 'active'
        and (
          public.current_user_has_company_permission(membership.company_id, 'attendance.view')
          or public.current_user_has_company_permission(membership.company_id, 'leave.view')
        )
    )
  );

drop policy if exists "Attendance managers can view company memberships" on public.company_memberships;
create policy "Attendance managers can view company memberships" on public.company_memberships
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'attendance.view')
    or public.current_user_has_company_permission(company_id, 'leave.view')
  );