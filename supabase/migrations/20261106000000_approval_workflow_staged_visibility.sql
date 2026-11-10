-- ════════════════════════════════════════════════════════════════════════════════
-- Approval Workflow: Staged Visibility & Notifications (2026-11-06)
-- ════════════════════════════════════════════════════════════════════════════════
-- Adds staged visibility, 24-hour delay, and approval history tracking
-- for expense requests, requisitions, and leave requests.
-- ════════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add staged visibility columns to expense_requests
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.expense_requests
  add column if not exists staged_visibility boolean not null default true,
  add column if not exists currently_visible_to_permission text,
  add column if not exists next_approver_id uuid references auth.users (id) on delete set null,
  add column if not exists next_approver_stage text,
  add column if not exists stage_entered_at timestamptz not null default now();

create index if not exists expense_requests_staged_visibility_idx
  on public.expense_requests (company_id, staged_visibility, stage_entered_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add staged visibility columns to company_requisitions (if table exists)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.company_requisitions
  add column if not exists staged_visibility boolean not null default true,
  add column if not exists currently_visible_to_permission text,
  add column if not exists next_approver_id uuid references auth.users (id) on delete set null,
  add column if not exists next_approver_stage text,
  add column if not exists stage_entered_at timestamptz not null default now();

create index if not exists company_requisitions_staged_visibility_idx
  on public.company_requisitions (company_id, staged_visibility, stage_entered_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add staged visibility columns to leave_requests (if table exists)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leave_requests
  add column if not exists staged_visibility boolean not null default true,
  add column if not exists currently_visible_to_permission text,
  add column if not exists next_approver_id uuid references auth.users (id) on delete set null,
  add column if not exists next_approver_stage text,
  add column if not exists stage_entered_at timestamptz not null default now();

create index if not exists leave_requests_staged_visibility_idx
  on public.leave_requests (company_id, staged_visibility, stage_entered_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Create approval_history table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.approval_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid not null,
  request_type text not null check (request_type in ('expense', 'requisition', 'leave')),
  stage text not null,
  action text not null check (action in ('submitted', 'approved', 'rejected', 'noted')),
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  actor_role text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists approval_history_request_idx
  on public.approval_history (company_id, request_id, request_type, created_at desc);
create index if not exists approval_history_actor_idx
  on public.approval_history (actor_id, created_at desc);

alter table public.approval_history enable row level security;
revoke all on public.approval_history from public, anon, authenticated;
grant select on public.approval_history to authenticated;
grant all on public.approval_history to service_role;

create policy "Approval history visible to company members"
  on public.approval_history for select to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'approvals.view')
    or public.current_user_has_company_permission(company_id, 'expense_requests.view')
    or public.current_user_has_company_permission(company_id, 'expense_requests.review')
    or public.current_user_has_company_permission(company_id, 'expense_requests.verify')
    or public.current_user_has_company_permission(company_id, 'expense_requests.authorize')
    or (
      select created_by
      from public.expense_requests
      where public.expense_requests.id = approval_history.request_id
    ) = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Create approval_reminders table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.approval_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid not null,
  request_type text not null check (request_type in ('expense', 'requisition', 'leave')),
  stage text not null,
  assigned_to_id uuid not null references auth.users (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('2hour', 'sms_followup')),
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (request_id, request_type, stage, reminder_type)
);

create index if not exists approval_reminders_request_idx
  on public.approval_reminders (company_id, request_id, request_type);
create index if not exists approval_reminders_assigned_idx
  on public.approval_reminders (assigned_to_id, created_at desc);

alter table public.approval_reminders enable row level security;
revoke all on public.approval_reminders from public, anon, authenticated;
grant select on public.approval_reminders to authenticated;
grant all on public.approval_reminders to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Create email_queue table (for Resend email delivery)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.email_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete set null,
  recipient_email text,
  template text not null,
  context jsonb,
  request_type text,
  request_id uuid,
  status text default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists email_queue_status_created_idx
  on public.email_queue (status, created_at);
create index if not exists email_queue_request_idx
  on public.email_queue (request_type, request_id);

alter table public.email_queue enable row level security;
revoke all on public.email_queue from public, anon, authenticated;
grant all on public.email_queue to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Create sms_queue table (for SMSUG SMS delivery)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sms_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_id uuid references auth.users (id) on delete set null,
  recipient_phone text,
  message text not null,
  request_type text,
  request_id uuid,
  status text default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  smsug_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sms_queue_status_created_idx
  on public.sms_queue (status, created_at);
create index if not exists sms_queue_request_idx
  on public.sms_queue (request_type, request_id);

alter table public.sms_queue enable row level security;
revoke all on public.sms_queue from public, anon, authenticated;
grant all on public.sms_queue to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Update RLS policy for expense_requests to enforce staged visibility
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "Expense requests are visible to permitted staff and their creator"
  on public.expense_requests;

create policy "Expense requests visible with staged visibility enforcement"
  on public.expense_requests for select to authenticated
  using (
    -- Creator always sees own
    created_by = (select auth.uid())
    -- Current approver (full access)
    or (
      staged_visibility = true
      and currently_visible_to_permission is not null
      and public.current_user_has_company_permission(company_id, currently_visible_to_permission)
    )
    -- Higher hierarchy (read-only after 24 hours)
    or (
      staged_visibility = true
      and stage_entered_at < (now() - interval '24 hours')
      and (
        public.current_user_has_company_permission(company_id, 'expense_requests.view')
        or public.current_user_has_company_permission(company_id, 'expense_requests.review')
        or public.current_user_has_company_permission(company_id, 'expense_requests.verify')
        or public.current_user_has_company_permission(company_id, 'expense_requests.authorize')
        or public.current_user_has_company_permission(company_id, 'expense_requests.cashout')
      )
    )
    -- Fallback for non-staged items (legacy)
    or (
      staged_visibility = false
      and (
        public.current_user_has_company_permission(company_id, 'expense_requests.view')
        or public.current_user_has_company_permission(company_id, 'expense_requests.review')
        or public.current_user_has_company_permission(company_id, 'expense_requests.verify')
        or public.current_user_has_company_permission(company_id, 'expense_requests.authorize')
        or public.current_user_has_company_permission(company_id, 'expense_requests.cashout')
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Helper function: Get next approver for expense (based on branch)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_next_expense_approver(
  p_company_id uuid,
  p_current_stage text,
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_main_branch boolean;
  next_stage text;
  next_permission text;
  next_role_name text;
begin
  -- Determine if branch is main branch
  select branch.is_main_branch into is_main_branch
  from public.company_branches branch
  where branch.id = p_branch_id
    and branch.company_id = p_company_id;

  if is_main_branch is null then
    return jsonb_build_object('error', 'Branch not found');
  end if;

  -- Main branch chain: emp → dm → gm → fm → chairman → fm (payout)
  -- Non-main chain: emp → dm → bm → gm → fm → chairman → fa (payout)
  
  case
    when p_current_stage = 'pending_general_manager_review' then
      if is_main_branch then
        next_stage := 'pending_finance_verification';
        next_permission := 'expense_requests.verify';
        next_role_name := 'Finance Manager';
      else
        next_stage := 'pending_finance_verification';
        next_permission := 'expense_requests.verify';
        next_role_name := 'Finance Manager';
      end if;
    
    when p_current_stage = 'pending_finance_verification' then
      next_stage := 'pending_chairman_authorization';
      next_permission := 'expense_requests.authorize';
      next_role_name := 'Chairman';
    
    when p_current_stage = 'pending_chairman_authorization' then
      if is_main_branch then
        next_stage := 'authorized_pending_cashout';
        next_permission := 'expense_requests.cashout';
        next_role_name := 'Finance Manager';
      else
        next_stage := 'authorized_pending_cashout';
        next_permission := 'expense_requests.cashout';
        next_role_name := 'Finance Assistant';
      end if;
    
    else
      return jsonb_build_object('error', 'Unknown stage: ' || p_current_stage);
  end case;

  return jsonb_build_object(
    'stage', next_stage,
    'permission', next_permission,
    'roleName', next_role_name
  );
end;
$$;

revoke all on function public.get_next_expense_approver(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_next_expense_approver(uuid, text, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Helper function: Queue stage-change notification
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.queue_approval_stage_notification(
  p_company_id uuid,
  p_request_id uuid,
  p_request_type text,
  p_next_stage text,
  p_next_permission text,
  p_next_approver_id uuid,
  p_item_number text,
  p_item_name text,
  p_amount numeric
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  company_rec record;
  approver_rec record;
begin
  -- Get company name
  select companies.name into company_rec
  from public.companies
  where companies.id = p_company_id;

  if company_rec is null then
    raise warning 'Company % not found', p_company_id;
    return 0;
  end if;

  -- Get approver email and phone
  select profiles.email, profiles.phone, profiles.display_name
  into approver_rec
  from public.profiles
  where profiles.id = p_next_approver_id;

  if approver_rec is null then
    raise warning 'Approver % not found', p_next_approver_id;
    return 0;
  end if;

  -- In-app notification (existing system via workspace_notifications)
  insert into public.workspace_notifications (
    company_id, recipient_id, required_permission, category, title, body
  )
  select p_company_id, p_next_approver_id, p_next_permission,
    'finance', 
    format('%s approval needed: %s', upper(p_request_type), p_item_number),
    format('%s - %s ($%s) requires your %s approval.',
      p_item_number, p_item_name, p_amount, p_next_stage)
  where p_next_approver_id is not null;

  -- SMS notification (to all company members with phone, NOT just approver)
  insert into public.sms_queue (
    company_id, recipient_id, recipient_phone, message,
    request_type, request_id, status
  )
  select p_company_id, membership.user_id, profiles.phone,
    format('[%s]: %s %s ($%s) awaiting your approval.',
      company_rec.name, upper(p_request_type), p_item_number, p_amount),
    p_request_type, p_request_id, 'pending'
  from public.company_memberships membership
  join public.profiles on profiles.id = membership.user_id
  where membership.company_id = p_company_id
    and membership.status = 'active'
    and profiles.phone is not null
    and membership.user_id = p_next_approver_id;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.queue_approval_stage_notification(uuid, uuid, text, text, text, uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.queue_approval_stage_notification(uuid, uuid, text, text, text, uuid, text, text, numeric)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Helper function: Queue reminder notification (in-app + SMS only)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.queue_approval_reminder_notification(
  p_company_id uuid,
  p_request_id uuid,
  p_request_type text,
  p_approver_id uuid,
  p_item_number text,
  p_item_name text,
  p_hours_pending integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  company_rec record;
  approver_rec record;
begin
  -- Get company name
  select companies.name into company_rec
  from public.companies
  where companies.id = p_company_id;

  -- Get approver phone
  select profiles.phone into approver_rec
  from public.profiles
  where profiles.id = p_approver_id;

  if approver_rec.phone is null then
    return 0;
  end if;

  -- In-app reminder notification
  insert into public.workspace_notifications (
    company_id, recipient_id, required_permission, category, title, body
  )
  select p_company_id, p_approver_id, null,
    'finance',
    format('Reminder: %s awaiting approval for %s hours', p_item_number, p_hours_pending),
    format('%s - %s is pending your %s approval for over %s hours.',
      p_item_number, p_item_name, p_request_type, p_hours_pending);

  -- SMS reminder (only if phone exists)
  if approver_rec.phone is not null then
    insert into public.sms_queue (
      company_id, recipient_id, recipient_phone, message,
      request_type, request_id, status
    ) values (
      p_company_id, p_approver_id, approver_rec.phone,
      format('[%s] Reminder: %s pending for %s+ hours. Action needed.',
        company_rec.name, p_item_number, p_hours_pending),
      p_request_type, p_request_id, 'pending'
    );
  end if;

  -- Mark reminder as sent
  insert into public.approval_reminders (
    company_id, request_id, request_type, stage, assigned_to_id, reminder_type
  ) values (
    p_company_id, p_request_id, p_request_type, 'pending', p_approver_id, '2hour'
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.queue_approval_reminder_notification(uuid, uuid, text, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.queue_approval_reminder_notification(uuid, uuid, text, uuid, text, text, integer)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fin: All tables, indexes, policies, and functions created
-- ─────────────────────────────────────────────────────────────────────────────
