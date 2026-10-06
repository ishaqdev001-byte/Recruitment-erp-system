alter table public.attendance_records
  alter column check_in_at drop not null,
  add column if not exists status text not null default 'present',
  add column if not exists check_in_comment text not null default '',
  add column if not exists check_out_comment text not null default '',
  add column if not exists leave_request_id uuid;

alter table public.attendance_records drop constraint if exists attendance_records_status_check;
alter table public.attendance_records add constraint attendance_records_status_check check (
  (status = 'present' and check_in_at is not null and leave_request_id is null)
  or (status = 'absent' and check_in_at is null and check_out_at is null and check_in_comment = '' and check_out_comment = '' and leave_request_id is null)
  or (status = 'leave' and check_in_at is null and check_out_at is null and check_in_comment = '' and check_out_comment = '' and leave_request_id is not null)
);
alter table public.attendance_records drop constraint if exists attendance_records_comment_length_check;
alter table public.attendance_records add constraint attendance_records_comment_length_check
  check (length(check_in_comment) <= 1000 and length(check_out_comment) <= 1000);

create or replace function public.current_user_can_manage_company_attendance(requested_company_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles company_role
      on company_role.id = membership.role_id
     and company_role.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and company_role.name in (
        'Company Owner / Primary Administrator', 'CEO', 'General Manager'
      )
  );
$$;
revoke all on function public.current_user_can_manage_company_attendance(uuid) from public, anon;
grant execute on function public.current_user_can_manage_company_attendance(uuid) to authenticated;

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
      (new.id, new.company_id, 'leave.view'),
      (new.id, new.company_id, 'leave.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'attendance.view'),
      (new.id, new.company_id, 'attendance.manage')
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

delete from public.role_permissions role_permission
using public.company_roles company_role
where role_permission.role_id = company_role.id
  and role_permission.company_id = company_role.company_id
  and role_permission.permission_code in ('attendance.view', 'attendance.manage')
  and company_role.name not in ('Company Owner / Primary Administrator', 'CEO', 'General Manager');

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where permission.code in ('attendance.clock', 'leave.create')
   or (role.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager')
       and permission.code in ('attendance.view', 'attendance.manage'))
   or (role.name in (
       'Company Owner / Primary Administrator', 'General Manager', 'CEO',
       'Administrator', 'Recruitment Manager', 'Branch Manager'
     ) and permission.code in ('leave.view', 'leave.manage'))
on conflict (role_id, permission_code) do nothing;

drop policy if exists "Attendance records are visible to employees and managers" on public.attendance_records;
create policy "Attendance records are visible to employees and managers" on public.attendance_records
  for select to authenticated using (
    public.current_user_can_manage_company_attendance(company_id)
    or (
      employee_id = (select auth.uid())
      and work_date >= ((now() at time zone 'Africa/Kampala')::date - interval '3 months')::date
      and public.current_user_has_company_permission(company_id, 'attendance.clock')
    )
  );

drop policy if exists "Attendance managers can view company memberships" on public.company_memberships;
create policy "Attendance managers can view company memberships" on public.company_memberships
  for select to authenticated using (
    public.current_user_can_manage_company_attendance(company_id)
    or public.current_user_has_company_permission(company_id, 'leave.view')
  );

drop policy if exists "Attendance managers can view employee profiles" on public.profiles;
create policy "Attendance managers can view employee profiles" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.company_memberships membership
      where membership.user_id = profiles.id
        and membership.status in ('active', 'disabled')
        and (
          public.current_user_can_manage_company_attendance(membership.company_id)
          or public.current_user_has_company_permission(membership.company_id, 'leave.view')
        )
    )
  );

create or replace function public.audit_attendance_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  if new.status = 'absent' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    action_name := 'attendance_absent_marked';
  elsif new.status = 'leave' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    action_name := 'attendance_leave_recorded';
  elsif tg_op = 'INSERT' then
    action_name := 'attendance_checked_in';
  elsif old.check_out_at is distinct from new.check_out_at then
    action_name := 'attendance_checked_out';
  else
    action_name := 'attendance_updated';
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id, (select auth.uid()), action_name, 'attendance_record', new.id,
    jsonb_build_object(
      'employee_id', new.employee_id,
      'work_date', new.work_date,
      'status', new.status,
      'check_in_at', new.check_in_at,
      'check_out_at', new.check_out_at,
      'check_in_comment', new.check_in_comment,
      'check_out_comment', new.check_out_comment,
      'leave_request_id', new.leave_request_id
    )
  );
  return new;
end;
$$;
drop trigger if exists attendance_records_audit on public.attendance_records;
create trigger attendance_records_audit after insert or update on public.attendance_records
  for each row execute function public.audit_attendance_change();
revoke all on function public.audit_attendance_change() from public, anon, authenticated;

drop function if exists public.record_attendance_action(uuid, text, text);
drop function if exists public.record_attendance_action(uuid, text);
create function public.record_attendance_action(requested_company_id uuid, requested_action text, requested_comment text)
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
revoke all on function public.record_attendance_action(uuid, text, text) from public, anon;
grant execute on function public.record_attendance_action(uuid, text, text) to authenticated;

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
    select generate_series(requested_start_date::timestamp, least(requested_end_date, today - 1)::timestamp, interval '1 day')::date
  loop
    for member_user_id in
      select membership.user_id
      from public.company_memberships membership
      where membership.company_id = requested_company_id
        and membership.status = 'active'
        and membership.created_at::date <= attendance_day
        and (public.current_user_can_manage_company_attendance(requested_company_id) or membership.user_id = caller_user_id)
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
      set status = case when public.attendance_records.status = 'present' then 'present' else excluded.status end,
          leave_request_id = case when public.attendance_records.status = 'present' then null else excluded.leave_request_id end
      where public.attendance_records.status is distinct from case
          when public.attendance_records.status = 'present' then 'present'
          else excluded.status
        end
        or public.attendance_records.leave_request_id is distinct from case
          when public.attendance_records.status = 'present' then null
          else excluded.leave_request_id
        end;
      get diagnostics affected_rows = row_count;
      marked_count := marked_count + affected_rows;
      covering_leave_id := null;
    end loop;
  end loop;
  return marked_count;
end;
$$;
revoke all on function public.record_attendance_absences(uuid, date, date) from public, anon;
grant execute on function public.record_attendance_absences(uuid, date, date) to authenticated;