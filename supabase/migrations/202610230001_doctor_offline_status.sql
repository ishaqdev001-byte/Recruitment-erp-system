-- Doctor Offline Status: Track when doctors are unavailable for medical appointments
-- Allows doctors to set offline mode for full day or specific time ranges

create table if not exists public.doctor_offline_status (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  doctor_user_id uuid not null references auth.users (id) on delete cascade,
  offline_date date not null,
  -- If null, entire day is offline. If set, offline from this time
  offline_start_time time with time zone,
  -- If null, entire day is offline. If set, offline until this time
  offline_end_time time with time zone,
  -- Reason for being offline (optional)
  reason text check (length(trim(reason)) between 0 and 500),
  -- is_all_day: true means entire day offline (start/end times ignored)
  is_all_day boolean not null default false,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  -- Validate: if specific times, start must be before end
  constraint offline_times_valid check (
    is_all_day = true
    or (offline_start_time is null and offline_end_time is null)
    or (offline_start_time < offline_end_time)
  ),
  foreign key (company_id, doctor_user_id)
    references public.company_memberships (company_id, user_id) on delete cascade
);

-- Ensure no duplicate offline periods for the same doctor on the same day.
create unique index if not exists doctor_offline_status_period_unique_idx
  on public.doctor_offline_status (
    company_id,
    doctor_user_id,
    offline_date,
    (coalesce(offline_start_time, '00:00:00+00'::time with time zone)),
    (coalesce(offline_end_time, '23:59:59+00'::time with time zone))
  );

create index if not exists doctor_offline_status_company_doctor_date_idx
  on public.doctor_offline_status (company_id, doctor_user_id, offline_date);
create index if not exists doctor_offline_status_company_date_idx
  on public.doctor_offline_status (company_id, offline_date);
create index if not exists doctor_offline_status_active_idx
  on public.doctor_offline_status (company_id, offline_date, doctor_user_id);

drop trigger if exists doctor_offline_status_set_updated_at on public.doctor_offline_status;
create trigger doctor_offline_status_set_updated_at before update on public.doctor_offline_status
  for each row execute function public.set_updated_at();

alter table public.doctor_offline_status enable row level security;
revoke all on public.doctor_offline_status from public, anon, authenticated;
grant select, insert, update, delete on public.doctor_offline_status to service_role;

-- Doctors (users with doctor role) can view their own offline status
drop policy if exists "Doctors can view their own offline status" on public.doctor_offline_status;
create policy "Doctors can view their own offline status"
  on public.doctor_offline_status
  for select to authenticated using (
    (doctor_user_id = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'doctor.view')
  );

-- Finance/medical admin can view all doctor offline status for their company
drop policy if exists "Finance staff can view doctor offline status" on public.doctor_offline_status;
create policy "Finance staff can view doctor offline status"
  on public.doctor_offline_status
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

-- Doctors can set their own offline status
drop policy if exists "Doctors can create their own offline status" on public.doctor_offline_status;
create policy "Doctors can create their own offline status"
  on public.doctor_offline_status
  for insert to authenticated with check (
    (doctor_user_id = (select auth.uid()))
    and (created_by = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'doctor.manage')
  );

-- Doctors can update their own offline status
drop policy if exists "Doctors can update their own offline status" on public.doctor_offline_status;
create policy "Doctors can update their own offline status"
  on public.doctor_offline_status
  for update to authenticated
  using (
    (doctor_user_id = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'doctor.manage')
  )
  with check (
    (doctor_user_id = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'doctor.manage')
  );

-- Doctors can delete their own offline status
drop policy if exists "Doctors can delete their own offline status" on public.doctor_offline_status;
create policy "Doctors can delete their own offline status"
  on public.doctor_offline_status
  for delete to authenticated using (
    (doctor_user_id = (select auth.uid()))
    and public.current_user_has_company_permission(company_id, 'doctor.manage')
  );

-- Create helper function to check doctor availability
create or replace function public.is_doctor_available(
  p_company_id uuid,
  p_doctor_user_id uuid,
  p_appointment_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offline_count integer;
begin
  -- Check if doctor has offline status for this appointment time
  select count(*) into v_offline_count
  from public.doctor_offline_status
  where company_id = p_company_id
    and doctor_user_id = p_doctor_user_id
    and offline_date = (p_appointment_at::date)
    and (
      -- All day offline
      (is_all_day = true)
      -- Or specific time range matches
      or (
        is_all_day = false
        and offline_start_time is not null
        and offline_end_time is not null
        and (p_appointment_at::time with time zone) >= offline_start_time
        and (p_appointment_at::time with time zone) < offline_end_time
      )
    );
  
  return v_offline_count = 0;
end;
$$;

-- Create helper function to get doctor next available time
create or replace function public.get_doctor_next_available(
  p_company_id uuid,
  p_doctor_user_id uuid,
  p_from_time timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check_date date;
  v_check_time timestamptz;
  v_next_available timestamptz;
begin
  v_check_date := (p_from_time::date);
  v_check_time := p_from_time;
  
  -- Look ahead up to 30 days
  for i in 0..30 loop
    if not exists (
      select 1 from public.doctor_offline_status
      where company_id = p_company_id
        and doctor_user_id = p_doctor_user_id
        and offline_date = v_check_date
        and (is_all_day = true)
    ) then
      -- This day is not completely offline, doctor is available
      v_next_available := (v_check_date || ' 08:00:00+00')::timestamptz;
      if v_next_available >= p_from_time then
        return v_next_available;
      end if;
    end if;
    
    v_check_date := v_check_date + 1;
  end loop;
  
  -- If no availability found in 30 days, return null or after 30 days
  return (v_check_date || ' 08:00:00+00')::timestamptz;
end;
$$;

grant execute on function public.is_doctor_available(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.get_doctor_next_available(uuid, uuid, timestamptz) to authenticated, service_role;
