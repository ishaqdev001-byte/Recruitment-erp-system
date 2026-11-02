insert into public.permissions (code, description)
values (
  'medical.alerts.view',
  'Receive unfit examination alerts only; does not grant access to medical examinations or reports.'
)
on conflict (code) do update
set description = excluded.description;

create or replace function private.can_deliver_workspace_notification(
  requested_company_id uuid,
  requested_user_id uuid,
  requested_permission text,
  requested_source_type text,
  requested_source_id uuid
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
    where membership.company_id = requested_company_id
      and membership.user_id = requested_user_id
      and membership.status = 'active'
      and (
        exists (
          select 1
          from public.role_permissions permission
          where permission.company_id = membership.company_id
            and permission.role_id = membership.role_id
            and permission.permission_code = requested_permission
        )
        or (
          requested_permission = 'medical.alerts.view'
          and requested_source_type = 'medical.unfit-alert'
          and exists (
            select 1
            from public.medical_appointments appointment
            join public.companies company
              on company.id = appointment.company_id
            where appointment.id = requested_source_id
              and appointment.company_id = requested_company_id
              and (
                requested_user_id = company.primary_admin_user_id
                or requested_user_id = appointment.created_by
                or lower(trim(role.name)) = 'supervisor'
              )
          )
        )
      )
  );
$$;

revoke all on function private.can_deliver_workspace_notification(
  uuid, uuid, text, text, uuid
) from public, anon, authenticated;

create or replace function public.current_user_can_view_workspace_notification(
  requested_company_id uuid,
  requested_permission text,
  requested_source_type text,
  requested_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and private.can_deliver_workspace_notification(
      requested_company_id,
      (select auth.uid()),
      requested_permission,
      requested_source_type,
      requested_source_id
    );
$$;

revoke all on function public.current_user_can_view_workspace_notification(
  uuid, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.current_user_can_view_workspace_notification(
  uuid, text, text, uuid
) to authenticated;

drop policy if exists "Workspace notifications require active membership and permission"
  on public.workspace_notifications;
create policy "Workspace notifications require active membership and permission"
  on public.workspace_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.current_user_can_view_workspace_notification(
      company_id, required_permission, source_type, source_id
    )
  );

drop policy if exists "Recipients can mark permitted workspace notifications read"
  on public.workspace_notifications;
create policy "Recipients can mark permitted workspace notifications read"
  on public.workspace_notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.current_user_can_view_workspace_notification(
      company_id, required_permission, source_type, source_id
    )
  )
  with check (
    recipient_id = (select auth.uid())
    and public.current_user_can_view_workspace_notification(
      company_id, required_permission, source_type, source_id
    )
  );

create or replace function public.list_pending_workspace_push_notifications(
  requested_user_id uuid default null,
  requested_company_id uuid default null
)
returns table (
  id uuid,
  company_id uuid,
  recipient_id uuid,
  required_permission text,
  category text,
  title text,
  body text
)
language sql
stable
security definer
set search_path = ''
as $$
  select notification.id, notification.company_id, notification.recipient_id,
    notification.required_permission, notification.category, notification.title,
    notification.body
  from public.workspace_notifications notification
  where notification.read_at is null
    and notification.created_at >= now() - interval '7 days'
    and (requested_user_id is null or notification.recipient_id = requested_user_id)
    and (requested_company_id is null or notification.company_id = requested_company_id)
    and private.can_deliver_workspace_notification(
      notification.company_id,
      notification.recipient_id,
      notification.required_permission,
      notification.source_type,
      notification.source_id
    )
    and not exists (
      select 1
      from public.notification_push_deliveries delivery
      where delivery.company_id = notification.company_id
        and delivery.user_id = notification.recipient_id
        and delivery.notification_type = 'workspace'
        and delivery.notification_id = notification.id
        and delivery.status = 'delivered'
    )
  order by notification.created_at desc
  limit 1000;
$$;

revoke all on function public.list_pending_workspace_push_notifications(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.list_pending_workspace_push_notifications(uuid, uuid)
  to service_role;

create or replace function private.notify_medical_exam_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  examiner_recipients uuid[];
  alert_recipients uuid[];
begin
  if old.exam_result is not distinct from new.exam_result then
    return new;
  end if;

  select array_agg(distinct membership.user_id)
  into examiner_recipients
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
    new.company_id,
    examiner_recipients,
    'medical.view',
    'medical',
    case when new.exam_result = 'unfit' then 'Urgent medical examination alert'
      else 'Medical examination updated' end,
    case when new.exam_result = 'unfit'
      then 'A candidate medical examination requires immediate review in the Medical workspace.'
      else 'A candidate medical examination result was recorded.' end,
    'medical.exam-result',
    new.id
  );

  if new.exam_result = 'unfit' then
    select array_agg(distinct membership.user_id)
    into alert_recipients
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    left join public.role_permissions permission
      on permission.company_id = membership.company_id
     and permission.role_id = membership.role_id
     and permission.permission_code = 'medical.alerts.view'
    join public.companies company
      on company.id = membership.company_id
    where membership.company_id = new.company_id
      and membership.status = 'active'
      and (
        membership.user_id = company.primary_admin_user_id
        or membership.user_id = new.created_by
        or lower(trim(role.name)) = 'supervisor'
        or permission.role_id is not null
      );

    insert into public.workspace_notifications (
      company_id,
      recipient_id,
      required_permission,
      category,
      title,
      body,
      source_type,
      source_id
    )
    select
      new.company_id,
      recipient_id,
      'medical.alerts.view',
      'medical',
      'Urgent medical follow-up required',
      'A candidate has been declared medically unfit. Review the candidate workflow and coordinate the next steps.',
      'medical.unfit-alert',
      new.id
    from unnest(coalesce(alert_recipients, '{}'::uuid[])) recipients(recipient_id);
  end if;

  return new;
end;
$$;

create or replace function private.record_candidate_medical_booking_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.candidate_id is null then
    return new;
  end if;

  insert into public.candidate_stage_events (
    company_id,
    candidate_id,
    event_type,
    label,
    occurred_at,
    recorded_by,
    metadata
  )
  values (
    new.company_id,
    new.candidate_id,
    'medical_appointment',
    'Medical appointment booked',
    new.appointment_at,
    new.created_by,
    jsonb_build_object('appointmentAt', new.appointment_at)
  );
  return new;
end;
$$;

revoke all on function private.record_candidate_medical_booking_event()
  from public, anon, authenticated;

insert into public.candidate_stage_events (
  company_id,
  candidate_id,
  event_type,
  label,
  occurred_at,
  recorded_by,
  metadata
)
select
  appointment.company_id,
  appointment.candidate_id,
  'medical_appointment',
  'Medical appointment booked',
  appointment.appointment_at,
  appointment.created_by,
  jsonb_build_object('appointmentAt', appointment.appointment_at)
from public.medical_appointments appointment
join public.candidates candidate
  on candidate.id = appointment.candidate_id
 and candidate.company_id = appointment.company_id
where appointment.candidate_id is not null
  and not exists (
    select 1
    from public.candidate_stage_events event
    where event.company_id = appointment.company_id
      and event.candidate_id = appointment.candidate_id
      and event.event_type = 'medical_appointment'
      and event.occurred_at = appointment.appointment_at
      and event.metadata = jsonb_build_object('appointmentAt', appointment.appointment_at)
  );

drop trigger if exists medical_appointments_record_candidate_event
  on public.medical_appointments;
create trigger medical_appointments_record_candidate_event
  after insert on public.medical_appointments
  for each row execute function private.record_candidate_medical_booking_event();