create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.workspace_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  recipient_id uuid not null,
  required_permission text not null,
  category text not null check (category in (
    'candidates', 'candidate-inquiries', 'tasks', 'approvals', 'finance',
    'agent-finance', 'human-resources', 'communications', 'medical'
  )),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(body) <= 1000),
  source_type text not null check (length(source_type) between 1 and 80),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (company_id, recipient_id)
    references public.company_memberships (company_id, user_id) on delete cascade
);

create index workspace_notifications_recipient_created_idx
  on public.workspace_notifications (recipient_id, created_at desc);
create index workspace_notifications_company_recipient_created_idx
  on public.workspace_notifications (company_id, recipient_id, created_at desc);
create index workspace_notifications_unread_created_idx
  on public.workspace_notifications (created_at desc)
  where read_at is null;

alter table public.workspace_notifications enable row level security;
revoke all on public.workspace_notifications from public, anon, authenticated;
grant select on public.workspace_notifications to authenticated;
grant update (read_at) on public.workspace_notifications to authenticated;
grant all on public.workspace_notifications to service_role;

create policy "Workspace notifications require active membership and permission"
  on public.workspace_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships membership
      join public.role_permissions permission
        on permission.company_id = membership.company_id
       and permission.role_id = membership.role_id
       and permission.permission_code = workspace_notifications.required_permission
      where membership.company_id = workspace_notifications.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

create policy "Recipients can mark permitted workspace notifications read"
  on public.workspace_notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships membership
      join public.role_permissions permission
        on permission.company_id = membership.company_id
       and permission.role_id = membership.role_id
       and permission.permission_code = workspace_notifications.required_permission
      where membership.company_id = workspace_notifications.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  )
  with check (
    recipient_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships membership
      join public.role_permissions permission
        on permission.company_id = membership.company_id
       and permission.role_id = membership.role_id
       and permission.permission_code = workspace_notifications.required_permission
      where membership.company_id = workspace_notifications.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

create or replace function private.queue_workspace_notification(
  requested_company_id uuid,
  requested_recipient_ids uuid[],
  requested_permission text,
  requested_category text,
  requested_title text,
  requested_body text,
  requested_source_type text,
  requested_source_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.workspace_notifications (
    company_id, recipient_id, required_permission, category, title, body,
    source_type, source_id
  )
  select requested_company_id, membership.user_id, requested_permission,
    requested_category, requested_title, requested_body,
    requested_source_type, requested_source_id
  from (
    select distinct requested_id as user_id
    from unnest(coalesce(requested_recipient_ids, '{}'::uuid[])) requested_id
  ) recipients
  join public.company_memberships membership
    on membership.company_id = requested_company_id
   and membership.user_id = recipients.user_id
   and membership.status = 'active'
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = requested_permission;
$$;

revoke all on function private.queue_workspace_notification(
  uuid, uuid[], text, text, text, text, text, uuid
) from public, anon, authenticated;

create or replace function private.notify_candidate_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  event_title text;
  event_body text;
  event_source text;
begin
  if tg_op = 'INSERT' then
    event_title := 'Candidate added';
    event_body := 'A candidate was added to the company pipeline.';
    event_source := 'candidate.created';
  elsif old.agent_user_id is distinct from new.agent_user_id then
    event_title := 'Candidate assignment updated';
    event_body := 'A candidate assignment in the company pipeline was updated.';
    event_source := 'candidate.assignment';
  elsif old.details ->> 'stage' is distinct from new.details ->> 'stage'
    or old.details ->> 'visaStatus' is distinct from new.details ->> 'visaStatus'
    or old.details ->> 'travelStatus' is distinct from new.details ->> 'travelStatus'
  then
    event_title := 'Candidate stage updated';
    event_body := 'A candidate moved to a new recruitment stage.';
    event_source := 'candidate.stage';
  else
    return new;
  end if;

  select array_agg(distinct candidate_recipients.user_id)
  into recipients
  from (
    select membership.user_id
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions permission
      on permission.role_id = membership.role_id
     and permission.company_id = membership.company_id
     and permission.permission_code = 'candidates.view'
    where membership.company_id = new.company_id
      and membership.status = 'active'
      and lower(trim(role.name)) <> 'recruitment agent'
      and membership.user_id is distinct from coalesce((select auth.uid()), new.created_by)
    union
    select new.agent_user_id
    where new.agent_user_id is not null
      and new.agent_user_id is distinct from coalesce((select auth.uid()), new.created_by)
    union
    select old.agent_user_id
    where tg_op = 'UPDATE'
      and old.agent_user_id is not null
      and old.agent_user_id is distinct from coalesce((select auth.uid()), new.created_by)
  ) candidate_recipients;

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'candidates.view', 'candidates',
    event_title, event_body, event_source, new.id
  );
  return new;
end;
$$;

create trigger candidates_workspace_notification
  after insert or update of details, agent_user_id on public.candidates
  for each row execute function private.notify_candidate_event();

create or replace function private.notify_candidate_document_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_agent_id uuid;
  recipients uuid[];
begin
  select candidate.agent_user_id into candidate_agent_id
  from public.candidates candidate
  where candidate.id = new.candidate_id
    and candidate.company_id = new.company_id;

  select array_agg(distinct candidate_recipients.user_id)
  into recipients
  from (
    select membership.user_id
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions permission
      on permission.role_id = membership.role_id
     and permission.company_id = membership.company_id
     and permission.permission_code = 'candidates.view'
    where membership.company_id = new.company_id
      and membership.status = 'active'
      and lower(trim(role.name)) <> 'recruitment agent'
      and membership.user_id is distinct from new.uploaded_by
    union
    select candidate_agent_id
    where candidate_agent_id is not null
      and candidate_agent_id is distinct from new.uploaded_by
  ) candidate_recipients;

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'candidates.view', 'candidates',
    'Candidate document updated', 'A candidate document was added or updated.',
    'candidate.document', new.id
  );
  return new;
end;
$$;

create trigger candidate_documents_workspace_notification
  after insert or update on public.candidate_documents
  for each row execute function private.notify_candidate_document_event();

create or replace function private.notify_candidate_inquiry_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  event_title text;
  event_body text;
  event_source text;
begin
  if tg_op = 'INSERT' then
    event_title := 'New candidate inquiry';
    event_body := 'A candidate inquiry is ready for follow-up.';
    event_source := 'candidate-inquiry.created';
  elsif old.status is distinct from new.status and new.status = 'converted' then
    event_title := 'Candidate inquiry registered';
    event_body := 'A candidate inquiry has been advanced to registration.';
    event_source := 'candidate-inquiry.converted';
  else
    return new;
  end if;

  select array_agg(distinct inquiry_recipients.user_id)
  into recipients
  from (
    select membership.user_id
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions permission
      on permission.role_id = membership.role_id
     and permission.company_id = membership.company_id
     and permission.permission_code = 'candidate_inquiries.view'
    where membership.company_id = new.company_id
      and membership.status = 'active'
      and lower(trim(role.name)) <> 'recruitment agent'
      and membership.user_id is distinct from coalesce((select auth.uid()), new.created_by)
    union
    select new.agent_user_id
    where new.agent_user_id is not null
      and new.agent_user_id is distinct from coalesce((select auth.uid()), new.created_by)
    union
    select new.handled_by_user_id
    where new.handled_by_user_id is distinct from coalesce((select auth.uid()), new.created_by)
  ) inquiry_recipients;

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'candidate_inquiries.view', 'candidate-inquiries',
    event_title, event_body, event_source, new.id
  );
  return new;
end;
$$;

create trigger candidate_inquiries_workspace_notification
  after insert or update of status on public.candidate_inquiries
  for each row execute function private.notify_candidate_inquiry_event();

create or replace function private.notify_task_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  event_title text;
  event_body text;
  event_source text;
begin
  if tg_op = 'INSERT' and new.assigned_to is not null then
    recipients := array[new.assigned_to, new.created_by];
    event_title := 'Task assigned';
    event_body := 'A task was assigned: ' || new.title;
    event_source := 'task.assigned';
  elsif tg_op = 'UPDATE' and old.assigned_to is distinct from new.assigned_to
    and new.assigned_to is not null
  then
    recipients := array[new.assigned_to, old.assigned_to, new.created_by];
    event_title := 'Task assignment updated';
    event_body := 'A task assignment changed: ' || new.title;
    event_source := 'task.reassigned';
  elsif tg_op = 'UPDATE' and old.is_completed is distinct from new.is_completed
    and new.is_completed
  then
    recipients := array[new.created_by];
    event_title := 'Task completed';
    event_body := 'A task was completed: ' || new.title;
    event_source := 'task.completed';
  else
    return new;
  end if;

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'tasks.view', 'tasks',
    event_title, event_body, event_source, new.id
  );
  return new;
end;
$$;

create trigger tasks_workspace_notification
  after insert or update of assigned_to, is_completed on public.tasks
  for each row execute function private.notify_task_event();

create or replace function public.notify_approval_level(
  p_company_id uuid,
  p_request_id uuid,
  p_level text,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  if p_level = 'branch_manager' then
    select array[b.manager_user_id]
    into recipients
    from public.branch_approval_requests request
    join public.company_branches branch
      on branch.id = request.branch_id
     and branch.company_id = request.company_id
    where request.id = p_request_id
      and request.company_id = p_company_id
      and branch.manager_user_id is not null;
  else
    select array_agg(membership.user_id)
    into recipients
    from public.branch_approval_requests request
    join public.company_memberships membership
      on membership.company_id = request.company_id
     and membership.status = 'active'
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions permission
      on permission.company_id = membership.company_id
     and permission.role_id = membership.role_id
     and permission.permission_code = 'approvals.view'
    where request.id = p_request_id
      and request.company_id = p_company_id
      and (
        (p_level = 'supervisor' and role.name = 'Supervisor')
        or (p_level = 'general_manager' and role.name = 'General Manager')
        or (p_level = 'ceo' and role.name in ('Chairman', 'CEO'))
      );
  end if;

  perform private.queue_workspace_notification(
    p_company_id, recipients, 'approvals.view', 'approvals',
    p_title, p_body, 'approval.required.' || p_level, p_request_id
  );
end;
$$;

revoke all on function public.notify_approval_level(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.notify_approval_level(uuid, uuid, text, text, text)
  to service_role;

drop trigger if exists branch_approval_requests_notify_initial_approver
  on public.branch_approval_requests;
create trigger branch_approval_requests_notify_initial_approver
  after insert on public.branch_approval_requests
  for each row execute function public.notify_next_approver();

create or replace function private.notify_approval_submitter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status in ('approved', 'rejected') then
    perform private.queue_workspace_notification(
      new.company_id, array[new.submitted_by], 'approvals.view', 'approvals',
      'Approval request ' || new.status,
      'A request you submitted has been ' || new.status || '.',
      'approval.' || new.status, new.id
    );
  end if;
  return new;
end;
$$;

create trigger branch_approval_requests_notify_submitter
  after update of status on public.branch_approval_requests
  for each row execute function private.notify_approval_submitter();

create or replace function private.notify_invoice_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_candidate_agent uuid;
  recipients uuid[];
  event_title text;
  event_body text;
  event_source text;
begin
  if tg_op = 'INSERT' then
    event_title := 'New invoice';
    event_body := 'A new invoice is available in Finance.';
    event_source := 'finance.invoice.created';
  elsif old.status is distinct from new.status then
    event_title := 'Invoice status updated';
    event_body := 'An invoice status was updated in Finance.';
    event_source := 'finance.invoice.status';
  else
    return new;
  end if;

  select candidate.agent_user_id into invoice_candidate_agent
  from public.candidates candidate
  where candidate.company_id = new.company_id
    and candidate.id = coalesce(
      new.visa_candidate_id,
      case when new.recipient_type = 'candidate' then new.recipient_id else null end
    );

  select array_agg(distinct notification_recipients.user_id)
  into recipients
  from (
    select membership.user_id
    from public.company_memberships membership
    join public.role_permissions permission
      on permission.company_id = membership.company_id
     and permission.role_id = membership.role_id
     and permission.permission_code = 'finance.view'
    where membership.company_id = new.company_id
      and membership.status = 'active'
      and membership.user_id is distinct from coalesce((select auth.uid()), new.created_by)
    union
    select new.recipient_id
    where new.recipient_type = 'agent'
      and new.recipient_id is distinct from coalesce((select auth.uid()), new.created_by)
    union
    select invoice_candidate_agent
    where invoice_candidate_agent is not null
      and invoice_candidate_agent is distinct from coalesce((select auth.uid()), new.created_by)
  ) notification_recipients;

  if new.recipient_type = 'agent' then
    perform private.queue_workspace_notification(
      new.company_id, recipients, 'agent_finance.view', 'agent-finance',
      event_title, 'An invoice is available in your Agent Finance workspace.',
      event_source, new.id
    );
  end if;
  perform private.queue_workspace_notification(
    new.company_id, recipients, 'finance.view', 'finance',
    event_title, event_body, event_source, new.id
  );

  if new.recipient_type <> 'agent' and invoice_candidate_agent is not null then
    perform private.queue_workspace_notification(
      new.company_id, array[invoice_candidate_agent], 'agent_finance.view',
      'agent-finance', event_title,
      'An invoice for an assigned candidate is available in Agent Finance.',
      event_source, new.id
    );
  end if;
  return new;
end;
$$;

create trigger invoices_workspace_notification
  after insert or update of status on public.invoices
  for each row execute function private.notify_invoice_event();

create or replace function private.notify_invoice_payment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoices%rowtype;
  candidate_agent_id uuid;
  finance_recipients uuid[];
begin
  select * into invoice
  from public.invoices
  where id = new.invoice_id and company_id = new.company_id;
  if not found then return new; end if;

  select candidate.agent_user_id into candidate_agent_id
  from public.candidates candidate
  where candidate.company_id = invoice.company_id
    and candidate.id = coalesce(
      invoice.visa_candidate_id,
      case when invoice.recipient_type = 'candidate' then invoice.recipient_id else null end
    );

  select array_agg(membership.user_id)
  into finance_recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'finance.view'
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and membership.user_id is distinct from coalesce((select auth.uid()), new.received_by);

  perform private.queue_workspace_notification(
    new.company_id, finance_recipients, 'finance.view', 'finance',
    'Invoice payment recorded', 'A payment was recorded against an invoice.',
    'finance.invoice.payment', new.id
  );

  if invoice.recipient_type = 'agent' then
    perform private.queue_workspace_notification(
      new.company_id, array[invoice.recipient_id], 'agent_finance.view',
      'agent-finance', 'Invoice payment updated',
      'A payment was recorded against an invoice in your Agent Finance workspace.',
      'finance.invoice.payment', new.id
    );
  elsif candidate_agent_id is not null then
    perform private.queue_workspace_notification(
      new.company_id, array[candidate_agent_id], 'agent_finance.view',
      'agent-finance', 'Candidate invoice payment updated',
      'A payment was recorded against an assigned candidate invoice.',
      'finance.invoice.payment', new.id
    );
  end if;
  return new;
end;
$$;

create trigger invoice_payments_workspace_notification
  after insert on public.invoice_payments
  for each row execute function private.notify_invoice_payment_event();

create or replace function private.notify_financial_receipt_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  finance_recipients uuid[];
  candidate_agent_id uuid;
begin
  select array_agg(membership.user_id)
  into finance_recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'finance.view'
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and membership.user_id is distinct from coalesce((select auth.uid()), new.created_by);

  perform private.queue_workspace_notification(
    new.company_id, finance_recipients, 'finance.view', 'finance',
    'Financial receipt recorded', 'A financial receipt was recorded.',
    'finance.receipt', new.id
  );

  if new.candidate_id is not null then
    select candidate.agent_user_id into candidate_agent_id
    from public.candidates candidate
    where candidate.id = new.candidate_id and candidate.company_id = new.company_id;
    if candidate_agent_id is not null
      and candidate_agent_id is distinct from coalesce((select auth.uid()), new.created_by)
    then
      perform private.queue_workspace_notification(
        new.company_id, array[candidate_agent_id], 'agent_finance.view',
        'agent-finance', 'Candidate receipt recorded',
        'A receipt was recorded for an assigned candidate.',
        'finance.receipt', new.id
      );
    end if;
  end if;
  return new;
end;
$$;

create trigger financial_receipts_workspace_notification
  after insert on public.financial_receipts
  for each row execute function private.notify_financial_receipt_event();

create or replace function private.notify_company_expense_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  select array_agg(membership.user_id)
  into recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'finance.view'
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and membership.user_id is distinct from coalesce((select auth.uid()), new.created_by);

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'finance.view', 'finance',
    'Expense recorded', 'A company expense was recorded.',
    'finance.expense', new.id
  );
  return new;
end;
$$;

create trigger company_expenses_workspace_notification
  after insert on public.company_expenses
  for each row execute function private.notify_company_expense_event();

create or replace function private.notify_paycheck_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  select array_agg(membership.user_id)
  into recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'finance.view'
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and membership.user_id is distinct from coalesce((select auth.uid()), new.paid_by);

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'finance.view', 'finance',
    'Payroll payment recorded', 'A payroll payment was recorded.',
    'finance.paycheck', new.id
  );
  return new;
end;
$$;

create trigger company_staff_paychecks_workspace_notification
  after insert on public.company_staff_paychecks
  for each row execute function private.notify_paycheck_event();

create or replace function private.notify_staff_profile_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  select array_agg(membership.user_id)
  into recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'human_resources.view'
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and membership.user_id is distinct from coalesce((select auth.uid()), new.updated_by);

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'human_resources.view', 'human-resources',
    'Employee profile updated', 'An employee profile was updated.',
    'human-resources.profile', new.id
  );
  return new;
end;
$$;

create trigger company_staff_members_workspace_notification
  after update of name, position, phone, status, bio, date_of_birth, sex,
    local_address, permanent_address, emergency_contact_address,
    passport_number, passport_expiry, national_id_number, national_id_expiry,
    academic_qualifications, professional_qualifications, work_experience,
    languages, has_criminal_record, criminal_case_type, criminal_case_year,
    criminal_case_status
  on public.company_staff_members
  for each row execute function private.notify_staff_profile_event();

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

  select array_agg(membership.user_id)
  into recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'medical.view'
  where membership.company_id = new.company_id
    and membership.status = 'active';

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

create trigger medical_appointments_workspace_notification
  after update of exam_result on public.medical_appointments
  for each row execute function private.notify_medical_exam_event();

create or replace function private.notify_whatsapp_message_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
begin
  if new.direction <> 'inbound' then return new; end if;

  select array_agg(membership.user_id)
  into recipients
  from public.company_memberships membership
  join public.role_permissions permission
    on permission.company_id = membership.company_id
   and permission.role_id = membership.role_id
   and permission.permission_code = 'communications.whatsapp.read'
  where membership.company_id = new.company_id
    and membership.status = 'active';

  perform private.queue_workspace_notification(
    new.company_id, recipients, 'communications.whatsapp.read', 'communications',
    'New WhatsApp message', 'A new inbound message is available in the shared inbox.',
    'communications.whatsapp.inbound', new.id
  );
  return new;
end;
$$;

create trigger whatsapp_messages_workspace_notification
  after insert on public.whatsapp_messages
  for each row execute function private.notify_whatsapp_message_event();

alter table public.notification_push_deliveries
  drop constraint if exists notification_push_deliveries_notification_type_check;
alter table public.notification_push_deliveries
  add constraint notification_push_deliveries_notification_type_check
  check (notification_type in ('task', 'candidate_inquiry', 'leave', 'requisition', 'workspace'));

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
    and exists (
      select 1
      from public.company_memberships membership
      join public.role_permissions permission
        on permission.company_id = membership.company_id
       and permission.role_id = membership.role_id
       and permission.permission_code = notification.required_permission
      where membership.company_id = notification.company_id
        and membership.user_id = notification.recipient_id
        and membership.status = 'active'
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