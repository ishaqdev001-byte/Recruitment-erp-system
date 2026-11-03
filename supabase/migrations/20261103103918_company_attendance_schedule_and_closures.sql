create table if not exists public.company_attendance_settings (
  company_id uuid primary key references public.companies (id) on delete cascade,
  country_code text not null default 'UG'
    check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_attendance_schedule (
  company_id uuid not null references public.companies (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_open boolean not null default false,
  opens_at time,
  closes_at time,
  primary key (company_id, weekday),
  check (
    (is_open and opens_at is not null and closes_at is not null and opens_at < closes_at)
    or (not is_open and opens_at is null and closes_at is null)
  )
);

create table if not exists public.company_attendance_closures (
  company_id uuid not null references public.companies (id) on delete cascade,
  closed_date date not null,
  name text not null check (length(btrim(name)) between 1 and 200),
  closure_type text not null check (closure_type in ('public_holiday', 'custom')),
  created_at timestamptz not null default now(),
  primary key (company_id, closed_date)
);

create index if not exists company_attendance_closures_date_idx
  on public.company_attendance_closures (company_id, closed_date);

alter table public.company_attendance_settings enable row level security;
alter table public.company_attendance_schedule enable row level security;
alter table public.company_attendance_closures enable row level security;

revoke all on public.company_attendance_settings from anon, authenticated;
revoke all on public.company_attendance_schedule from anon, authenticated;
revoke all on public.company_attendance_closures from anon, authenticated;
grant all on public.company_attendance_settings to service_role;
grant all on public.company_attendance_schedule to service_role;
grant all on public.company_attendance_closures to service_role;

create or replace function public.save_company_attendance_settings(
  requested_company_id uuid,
  requested_country_code text,
  requested_schedule jsonb,
  requested_closures jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_country_code !~ '^[A-Z]{2}$'
    or jsonb_typeof(requested_schedule) <> 'array'
    or jsonb_array_length(requested_schedule) <> 7
    or jsonb_typeof(requested_closures) <> 'array'
    or jsonb_array_length(requested_closures) > 500 then
    raise exception 'Invalid attendance schedule or closure data'
      using errcode = '22023';
  end if;

  insert into public.company_attendance_settings (company_id, country_code)
  values (requested_company_id, requested_country_code)
  on conflict (company_id) do update
  set country_code = excluded.country_code,
      updated_at = now();

  delete from public.company_attendance_schedule
  where company_id = requested_company_id;
  insert into public.company_attendance_schedule (
    company_id, weekday, is_open, opens_at, closes_at
  )
  select
    requested_company_id,
    item.weekday,
    item.is_open,
    item.opens_at,
    item.closes_at
  from jsonb_to_recordset(requested_schedule) as item(
    weekday smallint,
    is_open boolean,
    opens_at time,
    closes_at time
  );

  delete from public.company_attendance_closures
  where company_id = requested_company_id;
  insert into public.company_attendance_closures (
    company_id, closed_date, name, closure_type
  )
  select
    requested_company_id,
    item.closed_date,
    item.name,
    item.closure_type
  from jsonb_to_recordset(requested_closures) as item(
    closed_date date,
    name text,
    closure_type text
  );
end;
$$;

revoke all on function public.save_company_attendance_settings(uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_company_attendance_settings(uuid, text, jsonb, jsonb)
  to service_role;

insert into public.permissions (code, description)
values ('attendance.view_reports', 'View weekly and monthly company attendance reports')
on conflict (code) do update
set description = excluded.description;

create or replace function public.current_user_can_manage_company_attendance(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_company_permission(
    requested_company_id,
    'attendance.view'
  ) or public.current_user_has_company_permission(
    requested_company_id,
    'attendance.manage'
  ) or (
    public.current_user_has_company_permission(
      requested_company_id,
      'attendance.view_reports'
    )
    and exists (
      select 1
      from public.companies company
      where company.id = requested_company_id
        and company.primary_admin_user_id = (select auth.uid())
    )
  );
$$;

revoke all on function public.current_user_can_manage_company_attendance(uuid)
  from public, anon;
grant execute on function public.current_user_can_manage_company_attendance(uuid)
  to authenticated;

create or replace function public.company_attendance_day_is_open(
  requested_company_id uuid,
  requested_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1
      from public.company_attendance_closures closure
      where closure.company_id = requested_company_id
        and closure.closed_date = requested_date
    )
    and case
      when exists (
        select 1
        from public.company_attendance_schedule schedule
        where schedule.company_id = requested_company_id
      ) then exists (
        select 1
        from public.company_attendance_schedule schedule
        where schedule.company_id = requested_company_id
          and schedule.weekday = extract(dow from requested_date)::smallint
          and schedule.is_open
      )
      else true
    end;
$$;

revoke all on function public.company_attendance_day_is_open(uuid, date)
  from public, anon;
grant execute on function public.company_attendance_day_is_open(uuid, date)
  to authenticated;

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
    'Company Owner / Primary Administrator', 'Chairman', 'General Manager',
    'Supervisor'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'attendance.view')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in ('General Manager', 'Supervisor') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'attendance.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in ('Company Owner / Primary Administrator', 'Chairman') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'attendance.view_reports')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in (
    'Company Owner / Primary Administrator', 'General Manager', 'CEO',
    'Administrator', 'Recruitment Manager', 'Branch Manager'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'leave.view'),
      (new.id, new.company_id, 'leave.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_attendance_leave_permissions
  on public.company_roles;
create trigger company_roles_seed_attendance_leave_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_attendance_leave_permissions_for_role();
revoke all on function public.seed_attendance_leave_permissions_for_role()
  from public, anon, authenticated;

delete from public.role_permissions role_permission
using public.company_roles company_role
where role_permission.role_id = company_role.id
  and role_permission.company_id = company_role.company_id
  and company_role.is_system_default
  and (
    (role_permission.permission_code = 'attendance.view'
      and company_role.name not in (
        'Company Owner / Primary Administrator', 'Chairman',
        'General Manager', 'Supervisor'
      ))
    or (role_permission.permission_code = 'attendance.manage'
      and company_role.name not in ('General Manager', 'Supervisor'))
    or (role_permission.permission_code = 'attendance.view_reports'
      and company_role.name not in (
        'Company Owner / Primary Administrator', 'Chairman'
      ))
  );

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where permission.code = 'attendance.view'
  and role.name in (
    'Company Owner / Primary Administrator', 'Chairman',
    'General Manager', 'Supervisor'
  )
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'attendance.manage'
from public.company_roles role
where role.name in ('General Manager', 'Supervisor')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'attendance.view_reports'
from public.company_roles role
where role.name in ('Company Owner / Primary Administrator', 'Chairman')
on conflict (role_id, permission_code) do nothing;

create or replace function public.record_attendance_action(
  requested_company_id uuid,
  requested_action text,
  requested_comment text
)
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
  if requested_comment is null or length(btrim(requested_comment)) not between 1 and 1000 then
    raise exception 'Add a comment between 1 and 1,000 characters' using errcode = '22023';
  end if;
  if not public.current_user_has_company_permission(requested_company_id, 'attendance.clock') then
    raise exception 'Attendance permission required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.companies company
    where company.id = requested_company_id
      and company.primary_admin_user_id = employee_user_id
  ) then
    raise exception 'The company Chairman cannot record attendance' using errcode = '42501';
  end if;
  if not public.company_attendance_day_is_open(requested_company_id, work_day) then
    raise exception 'The office is closed today; attendance cannot be recorded' using errcode = '22023';
  end if;

  if requested_action = 'check-in' then
    insert into public.attendance_records (
      company_id, employee_id, work_date, check_in_at, check_in_comment, status
    ) values (
      requested_company_id, employee_user_id, work_day, now(), btrim(requested_comment), 'present'
    )
    on conflict (company_id, employee_id, work_date) do nothing
    returning * into attendance_record;
    if not found then
      raise exception 'Attendance has already been recorded for today' using errcode = '23505';
    end if;
    return attendance_record;
  end if;

  update public.attendance_records
  set check_out_at = now(), check_out_comment = btrim(requested_comment)
  where company_id = requested_company_id
    and employee_id = employee_user_id
    and work_date = work_day
    and status = 'present'
    and check_out_at is null
  returning * into attendance_record;
  if not found then
    raise exception 'No active check-in was found for today' using errcode = 'P0002';
  end if;
  return attendance_record;
end;
$$;

revoke all on function public.record_attendance_action(uuid, text, text)
  from public, anon;
grant execute on function public.record_attendance_action(uuid, text, text)
  to authenticated;

create or replace function public.record_attendance_action_for_employee(
  requested_company_id uuid,
  requested_employee_id uuid,
  requested_action text,
  requested_comment text
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  work_day date := (now() at time zone 'Africa/Kampala')::date;
  attendance_record public.attendance_records%rowtype;
begin
  if caller_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if requested_employee_id is null or requested_action is null
    or requested_action not in ('check-in', 'check-out') then
    raise exception 'Choose an employee and attendance action' using errcode = '22023';
  end if;
  if requested_comment is null or length(btrim(requested_comment)) not between 1 and 1000 then
    raise exception 'Add a comment between 1 and 1,000 characters' using errcode = '22023';
  end if;
  if not public.current_user_has_company_permission(requested_company_id, 'attendance.manage') then
    raise exception 'Daily attendance management permission required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.companies company
    where company.id = requested_company_id
      and company.primary_admin_user_id = caller_user_id
  ) then
    raise exception 'The company Chairman cannot record staff attendance' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.company_memberships membership
    where membership.company_id = requested_company_id
      and membership.user_id = requested_employee_id
      and membership.status = 'active'
  ) then
    raise exception 'Choose an active company staff member' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.companies company
    where company.id = requested_company_id
      and company.primary_admin_user_id = requested_employee_id
  ) then
    raise exception 'The company Chairman is not an attendance staff member' using errcode = '42501';
  end if;
  if not public.company_attendance_day_is_open(requested_company_id, work_day) then
    raise exception 'The office is closed today; attendance cannot be recorded' using errcode = '22023';
  end if;

  if requested_action = 'check-in' then
    insert into public.attendance_records (
      company_id, employee_id, work_date, check_in_at, check_in_comment, status
    ) values (
      requested_company_id, requested_employee_id, work_day, now(), btrim(requested_comment), 'present'
    )
    on conflict (company_id, employee_id, work_date) do nothing
    returning * into attendance_record;
    if not found then
      raise exception 'Attendance has already been recorded for today' using errcode = '23505';
    end if;
    return attendance_record;
  end if;

  update public.attendance_records
  set check_out_at = now(), check_out_comment = btrim(requested_comment)
  where company_id = requested_company_id
    and employee_id = requested_employee_id
    and work_date = work_day
    and status = 'present'
    and check_out_at is null
  returning * into attendance_record;
  if not found then
    raise exception 'No active check-in was found for this employee today' using errcode = 'P0002';
  end if;
  return attendance_record;
end;
$$;

revoke all on function public.record_attendance_action_for_employee(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.record_attendance_action_for_employee(uuid, uuid, text, text)
  to authenticated;

create or replace function public.record_attendance_absences(
  requested_company_id uuid,
  requested_start_date date,
  requested_end_date date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := (select auth.uid());
  today date := (now() at time zone 'Africa/Kampala')::date;
  attendance_day date;
  member_user_id uuid;
  covering_leave_id uuid;
  affected_rows integer;
  marked_count integer := 0;
begin
  if caller_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if requested_start_date is null or requested_end_date is null
    or requested_end_date < requested_start_date
    or requested_end_date - requested_start_date > 31
    or requested_end_date > today then
    raise exception 'Choose a valid attendance date range' using errcode = '22023';
  end if;
  if not public.current_user_can_manage_company_attendance(requested_company_id)
    and requested_start_date < (today - interval '3 months')::date then
    raise exception 'Personal attendance history is limited to three months' using errcode = '42501';
  end if;
  if not public.current_user_can_manage_company_attendance(requested_company_id)
    and not public.current_user_has_company_permission(requested_company_id, 'attendance.clock') then
    raise exception 'Attendance permission required' using errcode = '42501';
  end if;

  for attendance_day in
    select generate_series(
      requested_start_date::timestamp,
      least(requested_end_date, today - 1)::timestamp,
      interval '1 day'
    )::date
  loop
    if public.company_attendance_day_is_open(requested_company_id, attendance_day) then
      for member_user_id in
        select membership.user_id
        from public.company_memberships membership
        where membership.company_id = requested_company_id
          and membership.status = 'active'
          and membership.created_at::date <= attendance_day
          and (
            public.current_user_can_manage_company_attendance(requested_company_id)
            or membership.user_id = caller_user_id
          )
      loop
        select request.id into covering_leave_id
        from public.leave_requests request
        where request.company_id = requested_company_id
          and request.employee_id = member_user_id
          and request.status in ('pending', 'approved')
          and request.start_date <= attendance_day
          and request.end_date >= attendance_day
        order by request.created_at desc
        limit 1;

        insert into public.attendance_records (
          company_id, employee_id, work_date, status, leave_request_id
        ) values (
          requested_company_id, member_user_id, attendance_day,
          case when covering_leave_id is null then 'absent' else 'leave' end,
          covering_leave_id
        )
        on conflict (company_id, employee_id, work_date) do update
        set status = case
              when public.attendance_records.status = 'present'
                then 'present'
              else excluded.status
            end,
            leave_request_id = case
              when public.attendance_records.status = 'present'
                then null
              else excluded.leave_request_id
            end
        where public.attendance_records.status is distinct from case
            when public.attendance_records.status = 'present'
              then 'present'
            else excluded.status
          end
          or public.attendance_records.leave_request_id is distinct from case
            when public.attendance_records.status = 'present'
              then null
            else excluded.leave_request_id
          end;
        get diagnostics affected_rows = row_count;
        marked_count := marked_count + affected_rows;
        covering_leave_id := null;
      end loop;
    end if;
  end loop;
  return marked_count;
end;
$$;

revoke all on function public.record_attendance_absences(uuid, date, date)
  from public, anon;
grant execute on function public.record_attendance_absences(uuid, date, date)
  to authenticated;