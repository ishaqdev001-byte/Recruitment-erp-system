delete from public.role_permissions permission
using public.company_roles role
where permission.role_id = role.id
  and permission.company_id = role.company_id
  and permission.permission_code in ('medical.view', 'medical.update', 'medical_documents.view')
  and not (
    role.is_system_default
    and lower(trim(role.name)) in ('doctor', 'medical examiner')
  );

create or replace function public.prevent_non_examiner_medical_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role public.company_roles%rowtype;
begin
  if new.permission_code not in ('medical.view', 'medical.update', 'medical_documents.view') then
    return new;
  end if;

  select role.*
  into target_role
  from public.company_roles role
  where role.id = new.role_id
    and role.company_id = new.company_id;

  if not found or not target_role.is_system_default
    or lower(trim(target_role.name)) not in ('doctor', 'medical examiner') then
    return null;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_non_examiner_medical_permissions() from public, anon, authenticated;

drop trigger if exists role_permissions_restrict_medical_access on public.role_permissions;
create trigger role_permissions_restrict_medical_access
  before insert or update of permission_code, role_id, company_id on public.role_permissions
  for each row execute function public.prevent_non_examiner_medical_permissions();

create or replace function public.current_user_has_company_permission(
  requested_company_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and role_permission.permission_code = requested_permission
      and (
        requested_permission not in ('medical.view', 'medical.update', 'medical_documents.view')
        or (
          role.is_system_default
          and lower(trim(role.name)) in ('doctor', 'medical examiner')
        )
      )
      and not (
        lower(trim(role.name)) = 'recruitment agent'
        and (
          requested_permission = 'human_resources.view'
          or requested_permission like 'attendance.%'
          or requested_permission like 'approvals.%'
          or requested_permission like 'communications.%'
          or requested_permission like 'drive.%'
          or requested_permission like 'finance.%'
          or requested_permission like 'leave.%'
          or requested_permission like 'requisitions.%'
        )
      )
  );
$$;

create or replace function private.remove_medical_results_from_candidate_details()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.details := coalesce(new.details, '{}'::jsonb) - array[
    'medicalExamResult',
    'medicalExamAt',
    'medicalExamNotes',
    'medical_exam_result',
    'medical_exam_at',
    'medical_exam_notes'
  ];
  return new;
end;
$$;

revoke all on function private.remove_medical_results_from_candidate_details() from public, anon, authenticated;

alter table public.candidates disable trigger candidates_create_visa_invoice;

update public.candidates
set details = coalesce(details, '{}'::jsonb) - array[
  'medicalExamResult',
  'medicalExamAt',
  'medicalExamNotes',
  'medical_exam_result',
  'medical_exam_at',
  'medical_exam_notes'
]
where details ?| array[
  'medicalExamResult',
  'medicalExamAt',
  'medicalExamNotes',
  'medical_exam_result',
  'medical_exam_at',
  'medical_exam_notes'
];

alter table public.candidates enable trigger candidates_create_visa_invoice;

drop trigger if exists candidates_remove_medical_exam_details on public.candidates;
create trigger candidates_remove_medical_exam_details
  before insert or update of details on public.candidates
  for each row execute function private.remove_medical_results_from_candidate_details();

drop policy if exists "Medical appointments are tenant and permission scoped" on public.medical_appointments;
drop policy if exists "Doctor can view medical appointments" on public.medical_appointments;
drop policy if exists "Medical examiners can view medical appointments" on public.medical_appointments;
create policy "Medical examiners can view medical appointments"
  on public.medical_appointments
  for select to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'medical.view')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

drop policy if exists "Authorized users can update medical appointments" on public.medical_appointments;
drop policy if exists "Doctor can record examination results" on public.medical_appointments;
drop policy if exists "Medical examiners can record examination results" on public.medical_appointments;
drop policy if exists "Authorized users can book medical appointments" on public.medical_appointments;
create policy "Medical examiners can record examination results"
  on public.medical_appointments
  for update to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'medical.update')
    and public.current_user_can_see_branch(company_id, branch_id)
  )
  with check (
    public.current_user_has_company_permission(company_id, 'medical.update')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

revoke all on public.medical_appointments from public, anon, authenticated;
grant select (
  id,
  company_id,
  branch_id,
  candidate_id,
  income_type_id,
  account_id,
  candidate_first_name,
  candidate_last_name,
  candidate_date_of_birth,
  candidate_age,
  candidate_passport_number,
  candidate_phone,
  appointment_at,
  fee_amount,
  created_by,
  created_at,
  doctor_user_id,
  hospital_id,
  doctor_fee_amount,
  candidate_amount_after_doctor_fee,
  appointment_slip_generated,
  invoice_id,
  remarks,
  received_by_name,
  booked_by_name,
  transaction_id,
  payment_reference
) on public.medical_appointments to authenticated;
grant update (exam_result, exam_notes, examined_at, examined_by, status)
  on public.medical_appointments to authenticated;

delete from public.candidate_stage_events
where event_type in ('medical_result', 'medical_appointment');

drop trigger if exists medical_appointments_record_candidate_event on public.medical_appointments;
drop function if exists public.record_candidate_medical_event();

create or replace function private.notify_medical_exam_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  if old.exam_result is not distinct from new.exam_result then return new; end if;

  select array_agg(distinct membership.user_id)
  into recipients
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'medical.view'
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and role.is_system_default
    and lower(trim(role.name)) in ('doctor', 'medical examiner');

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'medical.view', 'medical',
    case when new.exam_result = 'unfit' then 'Urgent medical examination alert'
      else 'Medical examination updated' end,
    case when new.exam_result = 'unfit'
      then 'A candidate medical examination requires immediate review in the Medical workspace.'
      else 'A candidate medical examination result was recorded.' end,
    'medical.exam-result', new.id
  );
  return new;
end;
$$;