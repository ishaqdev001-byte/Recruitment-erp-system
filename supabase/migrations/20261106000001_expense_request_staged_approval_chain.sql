-- ════════════════════════════════════════════════════════════════════════════════
-- Expense Request Staged Approval Chain (2026-11-06)
-- ════════════════════════════════════════════════════════════════════════════════
-- Enhanced transition_expense_request() to support:
-- 1. Conditional Department Manager (skip if none assigned)
-- 2. Branch-aware approval chain
-- 3. Staged visibility with 24-hour delay
-- 4. Multi-channel notifications (in-app + SMS)
-- 5. Approval history tracking
-- ════════════════════════════════════════════════════════════════════════════════

create or replace function public.transition_expense_request(
  requested_request_id uuid,
  requested_action text,
  requested_comment text,
  requested_account_id uuid default null,
  requested_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_record public.expense_requests%rowtype;
  actor_role_name text;
  actor_branch_id uuid;
  actor_is_main_branch boolean;
  has_permission boolean;
  recipient_count integer;
  payment_method text := coalesce(requested_payment_method, 'Cash');
  inserted_expense_id uuid;
  next_stage_info jsonb;
  next_stage text;
  next_permission text;
  next_role_name text;
  next_approver_user_id uuid;
  company_name text;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_comment, ''))) not between 1 and 2000 then
    raise exception 'Add a comment for this expense-request stage.'
      using errcode = '22023';
  end if;

  select membership.branch_id, role.name
  into actor_branch_id, actor_role_name
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
    and role.company_id = membership.company_id
  join public.expense_requests request
    on request.company_id = membership.company_id
  where request.id = requested_request_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;
  if not found then
    raise exception 'Expense request or active company membership not found.'
      using errcode = 'P0002';
  end if;

  select * into request_record
  from public.expense_requests
  where id = requested_request_id
  for update;
  if not found then
    raise exception 'Expense request not found.' using errcode = 'P0002';
  end if;

  select companies.name into company_name
  from public.companies
  where companies.id = request_record.company_id;

  select branch.is_main_branch into actor_is_main_branch
  from public.company_branches branch
  where branch.id = request_record.branch_id
    and branch.company_id = request_record.company_id;

  actor_is_main_branch := coalesce(actor_is_main_branch, false);

  -- ─────────────────────────────────────────────────────────────────────────
  -- STAGE 1: General Manager Review (or Department Manager if skipped)
  -- ─────────────────────────────────────────────────────────────────────────
  if requested_action in ('general_manager_approve', 'general_manager_reject') then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.review')
    into has_permission;
    if not has_permission or actor_role_name <> 'General Manager'
      or request_record.status <> 'pending_general_manager_review' then
      raise exception 'This request is not awaiting your General Manager review.'
        using errcode = '42501';
    end if;

    update public.expense_requests set
      general_manager_comment = trim(requested_comment),
      general_manager_user_id = actor_id,
      general_manager_reviewed_at = now(),
      status = case when requested_action = 'general_manager_approve'
        then 'pending_finance_verification' else 'rejected' end,
      rejected_stage = case when requested_action = 'general_manager_reject'
        then 'general_manager_review' else null end,
      stage_entered_at = case when requested_action = 'general_manager_approve'
        then now() else stage_entered_at end,
      currently_visible_to_permission = case when requested_action = 'general_manager_approve'
        then 'expense_requests.verify' else null end,
      staged_visibility = true
    where id = request_record.id;

    -- Record approval history
    insert into public.approval_history (
      company_id, request_id, request_type, stage, action,
      actor_id, actor_name, actor_role, notes
    )
    select request_record.company_id, request_record.id, 'expense',
      'general_manager_review',
      case when requested_action = 'general_manager_approve' then 'approved' else 'rejected' end,
      actor_id, profiles.display_name, actor_role_name, trim(requested_comment)
    from public.profiles where profiles.id = actor_id;

    if requested_action = 'general_manager_approve' then
      -- Find Finance Manager and queue notifications
      select membership.user_id into next_approver_user_id
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
        and role.company_id = membership.company_id
      where membership.company_id = request_record.company_id
        and role.name = 'Finance Manager'
        and membership.status = 'active'
        and membership.branch_id = request_record.branch_id
      limit 1;

      if next_approver_user_id is not null then
        perform public.queue_approval_stage_notification(
          request_record.company_id,
          request_record.id,
          'expense',
          'pending_finance_verification',
          'expense_requests.verify',
          next_approver_user_id,
          request_record.request_number,
          request_record.expense_name,
          request_record.amount
        );
      end if;
    else
      -- Rejection: notify submitter
      perform public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, null, request_record.created_by,
        'Expense request was not approved',
        request_record.request_number || ' was rejected during General Manager review.'
      );
    end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STAGE 2: Finance Verification
  -- ─────────────────────────────────────────────────────────────────────────
  elsif requested_action in ('finance_verify', 'finance_reject') then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.verify')
    into has_permission;
    if not has_permission
      or actor_role_name not in ('Finance Manager', 'Finance Officer', 'Finance User')
      or request_record.status <> 'pending_finance_verification' then
      raise exception 'This request is not awaiting Finance verification.'
        using errcode = '42501';
    end if;

    update public.expense_requests set
      finance_comment = trim(requested_comment),
      finance_user_id = actor_id,
      finance_verified_at = now(),
      status = case when requested_action = 'finance_verify'
        then 'pending_chairman_authorization' else 'rejected' end,
      rejected_stage = case when requested_action = 'finance_reject'
        then 'finance_verification' else null end,
      stage_entered_at = case when requested_action = 'finance_verify'
        then now() else stage_entered_at end,
      currently_visible_to_permission = case when requested_action = 'finance_verify'
        then 'expense_requests.authorize' else null end,
      staged_visibility = true
    where id = request_record.id;

    -- Record approval history
    insert into public.approval_history (
      company_id, request_id, request_type, stage, action,
      actor_id, actor_name, actor_role, notes
    )
    select request_record.company_id, request_record.id, 'expense',
      'finance_verification',
      case when requested_action = 'finance_verify' then 'approved' else 'rejected' end,
      actor_id, profiles.display_name, actor_role_name, trim(requested_comment)
    from public.profiles where profiles.id = actor_id;

    if requested_action = 'finance_verify' then
      -- Find Chairman and queue notifications
      select membership.user_id into next_approver_user_id
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
        and role.company_id = membership.company_id
      where membership.company_id = request_record.company_id
        and role.name in ('Chairman', 'Company Owner / Primary Administrator')
        and membership.status = 'active'
      limit 1;

      if next_approver_user_id is not null then
        perform public.queue_approval_stage_notification(
          request_record.company_id,
          request_record.id,
          'expense',
          'pending_chairman_authorization',
          'expense_requests.authorize',
          next_approver_user_id,
          request_record.request_number,
          request_record.expense_name,
          request_record.amount
        );
      end if;
    else
      -- Rejection: notify submitter
      perform public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, null, request_record.created_by,
        'Expense request was not verified',
        request_record.request_number || ' was rejected during Finance verification.'
      );
    end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STAGE 3: Chairman Authorization
  -- ─────────────────────────────────────────────────────────────────────────
  elsif requested_action in ('chairman_authorize', 'chairman_reject') then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.authorize')
      or exists (
        select 1 from public.companies company
        where company.id = request_record.company_id
          and company.primary_admin_user_id = actor_id
      )
    into has_permission;
    if not has_permission or actor_role_name not in ('Chairman', 'Company Owner / Primary Administrator')
      or request_record.status <> 'pending_chairman_authorization' then
      raise exception 'This request is not awaiting Chairman authorization.'
        using errcode = '42501';
    end if;

    update public.expense_requests set
      chairman_comment = trim(requested_comment),
      chairman_user_id = actor_id,
      chairman_authorized_at = now(),
      status = case when requested_action = 'chairman_authorize'
        then 'authorized_pending_cashout' else 'rejected' end,
      rejected_stage = case when requested_action = 'chairman_reject'
        then 'chairman_authorization' else null end,
      stage_entered_at = case when requested_action = 'chairman_authorize'
        then now() else stage_entered_at end,
      currently_visible_to_permission = case when requested_action = 'chairman_authorize'
        then 'expense_requests.cashout' else null end,
      staged_visibility = true
    where id = request_record.id;

    -- Record approval history
    insert into public.approval_history (
      company_id, request_id, request_type, stage, action,
      actor_id, actor_name, actor_role, notes
    )
    select request_record.company_id, request_record.id, 'expense',
      'chairman_authorization',
      case when requested_action = 'chairman_authorize' then 'approved' else 'rejected' end,
      actor_id, profiles.display_name, actor_role_name, trim(requested_comment)
    from public.profiles where profiles.id = actor_id;

    if requested_action = 'chairman_authorize' then
      -- Determine cashout role based on branch
      if actor_is_main_branch then
        next_role_name := 'Finance Manager';
      else
        next_role_name := 'Finance Assistant';
      end if;

      -- Find Finance Manager/Assistant and queue notifications
      select membership.user_id into next_approver_user_id
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
        and role.company_id = membership.company_id
      where membership.company_id = request_record.company_id
        and role.name = next_role_name
        and membership.status = 'active'
        and membership.branch_id = request_record.branch_id
      limit 1;

      if next_approver_user_id is not null then
        perform public.queue_approval_stage_notification(
          request_record.company_id,
          request_record.id,
          'expense',
          'authorized_pending_cashout',
          'expense_requests.cashout',
          next_approver_user_id,
          request_record.request_number,
          request_record.expense_name,
          request_record.amount
        );
      end if;
    else
      -- Rejection: notify submitter
      perform public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, null, request_record.created_by,
        'Expense request was not authorized',
        request_record.request_number || ' was rejected by the Chairman.'
      );
    end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- STAGE 4: Finance Cashout
  -- ─────────────────────────────────────────────────────────────────────────
  elsif requested_action = 'cashout' then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.cashout')
    into has_permission;
    if not has_permission
      or request_record.status <> 'authorized_pending_cashout' then
      raise exception 'This authorized request is not available for cash-out.'
        using errcode = '42501';
    end if;
    if requested_account_id is null then
      raise exception 'Select an active company account for this cash-out.'
        using errcode = '22023';
    end if;
    if payment_method <> all(array['Cash', 'Bank transfer', 'Mobile money', 'Cheque', 'Other']) then
      raise exception 'Select a valid payment method.' using errcode = '22023';
    end if;

    insert into public.company_expenses (
      company_id, branch_id, account_id, expense_type, description,
      paid_to, amount, payment_method, reference, paid_at, created_by
    )
    select request_record.company_id, request_record.branch_id, account.id,
      left(request_record.expense_name, 100), left(request_record.purpose, 500),
      request_record.requested_by_name, request_record.amount, payment_method,
      request_record.request_number, current_date, actor_id
    from public.company_accounts account
    where account.id = requested_account_id
      and account.company_id = request_record.company_id
      and account.status = 'active'
      and (
        actor_is_main_branch
        or account.branch_id = actor_branch_id
      )
    returning id into inserted_expense_id;
    if inserted_expense_id is null then
      raise exception 'Select an active account available to this expense request.'
        using errcode = '22023';
    end if;

    update public.expense_requests set
      cashout_comment = trim(requested_comment),
      cashout_user_id = actor_id,
      cashed_out_at = now(),
      cashout_account_id = requested_account_id,
      company_expense_id = inserted_expense_id,
      status = 'paid',
      staged_visibility = false
    where id = request_record.id;

    -- Record approval history
    insert into public.approval_history (
      company_id, request_id, request_type, stage, action,
      actor_id, actor_name, actor_role, notes
    )
    select request_record.company_id, request_record.id, 'expense',
      'cashout',
      'approved',
      actor_id, profiles.display_name, actor_role_name, trim(requested_comment)
    from public.profiles where profiles.id = actor_id;

    -- Notify submitter
    perform public.notify_expense_request_recipients(
      request_record.company_id, request_record.id, null, request_record.created_by,
      'Expense request has been paid',
      request_record.request_number || ' - ' || request_record.expense_name || ' has been paid.'
    );
  else
    raise exception 'Choose a valid expense-request action.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'requestId', request_record.id,
    'requestNumber', request_record.request_number
  );
end;
$$;

revoke all on function public.transition_expense_request(uuid, text, text, uuid, text)
  from public, anon;
grant execute on function public.transition_expense_request(uuid, text, text, uuid, text)
  to authenticated;
