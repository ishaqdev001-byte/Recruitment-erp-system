-- ═══════════════════════════════════════════════════════════════════════════
-- Branch Approval Workflow
--
-- Multi-level approval chain:
--   Level 1: Branch Manager  (the originating branch's manager)
--   Level 2: Supervisor      (main-branch supervisor, appointed by Chairman)
--   Level 3: General Manager
--   Level 4: CEO / Chairman
--
-- Any approval-requiring request (requisitions, expenses, candidate advances,
-- document requests, custom) flows through this chain.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. branch_approval_requests ──────────────────────────────────────────────

create table if not exists public.branch_approval_requests (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  branch_id         uuid not null,
  request_type      text not null check (request_type in (
                        'requisition', 'expense', 'candidate_advance',
                        'document_request', 'medical_request', 'custom'
                      )),
  title             text not null check (length(trim(title)) between 1 and 200),
  description       text not null default '' check (length(description) <= 4000),
  amount            numeric(16, 2),
  reference_id      uuid,           -- link to the source record (e.g. requisition id)
  reference_type    text,           -- 'company_requisitions', 'company_expenses', etc.
  metadata          jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  current_level     text not null default 'branch_manager'
                      check (current_level in ('branch_manager', 'supervisor', 'general_manager', 'ceo')),
  submitted_by      uuid not null references auth.users (id) on delete restrict,
  submitted_at      timestamptz not null default now(),
  final_decision_at timestamptz,
  final_decision_by uuid references auth.users (id) on delete set null,
  final_notes       text not null default '' check (length(final_notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, company_id),
  foreign key (branch_id, company_id)
    references public.company_branches (id, company_id) on delete cascade
);

create index if not exists branch_approval_requests_company_status_idx
  on public.branch_approval_requests (company_id, status, created_at desc);
create index if not exists branch_approval_requests_branch_idx
  on public.branch_approval_requests (company_id, branch_id, status);
create index if not exists branch_approval_requests_submitter_idx
  on public.branch_approval_requests (company_id, submitted_by, created_at desc);
create index if not exists branch_approval_requests_current_level_idx
  on public.branch_approval_requests (company_id, current_level, status)
  where status = 'pending';

drop trigger if exists branch_approval_requests_set_updated_at on public.branch_approval_requests;
create trigger branch_approval_requests_set_updated_at before update on public.branch_approval_requests
  for each row execute function public.set_updated_at();

-- ─── 2. branch_approval_steps ────────────────────────────────────────────────

create table if not exists public.branch_approval_steps (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null,
  company_id      uuid not null references public.companies (id) on delete cascade,
  level           text not null check (level in ('branch_manager', 'supervisor', 'general_manager', 'ceo')),
  level_order      integer not null check (level_order between 1 and 4),
  approver_role    text not null,    -- expected role name for this level
  approver_id     uuid references auth.users (id) on delete set null,
  decision        text not null default 'pending'
                    check (decision in ('pending', 'approved', 'rejected', 'skipped')),
  decision_notes  text not null default '' check (length(decision_notes) <= 2000),
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (id, company_id),
  foreign key (request_id, company_id)
    references public.branch_approval_requests (id, company_id) on delete cascade
);

create index if not exists branch_approval_steps_request_idx
  on public.branch_approval_steps (company_id, request_id, level_order);
create index if not exists branch_approval_steps_pending_idx
  on public.branch_approval_steps (company_id, request_id, decision)
  where decision = 'pending';

-- ─── 3. Trigger: auto-create 4 steps on request insert ────────────────────────

create or replace function public.create_approval_steps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.branch_approval_steps (request_id, company_id, level, level_order, approver_role)
  values
    (new.id, new.company_id, 'branch_manager',  1, 'Branch Manager'),
    (new.id, new.company_id, 'supervisor',     2, 'Supervisor'),
    (new.id, new.company_id, 'general_manager',3, 'General Manager'),
    (new.id, new.company_id, 'ceo',            4, 'Chairman');
  return new;
end;
$$;

drop trigger if exists branch_approval_requests_create_steps on public.branch_approval_requests;
create trigger branch_approval_requests_create_steps
  after insert on public.branch_approval_requests
  for each row execute function public.create_approval_steps();

revoke all on function public.create_approval_steps() from public, anon, authenticated;

-- ─── 4. Advance / reject the chain ────────────────────────────────────────────

create or replace function public.advance_approval_chain(
  p_request_id uuid,
  p_company_id uuid,
  p_decision text,
  p_notes text,
  p_approver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request  public.branch_approval_requests%rowtype;
  v_step     public.branch_approval_steps%rowtype;
  v_next_level text;
  v_next_order integer;
  v_role_name text;
  v_can_approve boolean := false;
begin
  -- Lock the request
  select * into v_request
  from public.branch_approval_requests
  where id = p_request_id and company_id = p_company_id
  for update;

  if not found then
    return jsonb_build_object('error', 'Approval request not found');
  end if;

  if v_request.status <> 'pending' then
    return jsonb_build_object('error', 'This request has already been ' || v_request.status);
  end if;

  -- Find the current pending step
  select * into v_step
  from public.branch_approval_steps
  where request_id = p_request_id
    and company_id = p_company_id
    and level = v_request.current_level
  for update;

  if not found then
    return jsonb_build_object('error', 'Current approval step not found');
  end if;

  -- Verify the approver has the right role for this level
  v_role_name := public.current_user_role_name(p_company_id);

  if v_step.level = 'branch_manager' then
    v_can_approve := public.current_user_is_branch_manager(p_company_id, v_request.branch_id);
  elsif v_step.level = 'supervisor' then
    v_can_approve := v_role_name = 'Supervisor' and public.current_user_is_main_branch_user(p_company_id);
  elsif v_step.level = 'general_manager' then
    v_can_approve := v_role_name in ('General Manager', 'Chairman', 'CEO', 'Administrator');
  elsif v_step.level = 'ceo' then
    v_can_approve := v_role_name in ('Chairman', 'CEO');
  end if;

  -- Chairman can approve at any level (override)
  if v_role_name = 'Chairman' then
    v_can_approve := true;
  end if;

  if not v_can_approve then
    return jsonb_build_object('error', 'You do not have permission to approve at this level');
  end if;

  -- Record the step decision
  update public.branch_approval_steps
  set decision = p_decision,
      decision_notes = p_notes,
      decided_at = now(),
      approver_id = p_approver_id
  where id = v_step.id;

  if p_decision = 'rejected' then
    -- Reject the entire request
    update public.branch_approval_requests
    set status = 'rejected',
        current_level = v_request.current_level,
        final_decision_at = now(),
        final_decision_by = p_approver_id,
        final_notes = p_notes
    where id = p_request_id;

    -- Skip remaining steps
    update public.branch_approval_steps
    set decision = 'skipped'
    where request_id = p_request_id
      and company_id = p_company_id
      and decision = 'pending';

    return jsonb_build_object('status', 'rejected');
  end if;

  -- Approved: advance to next level
  v_next_order := v_step.level_order + 1;

  if v_next_order > 4 then
    -- All levels approved
    update public.branch_approval_requests
    set status = 'approved',
        current_level = 'ceo',
        final_decision_at = now(),
        final_decision_by = p_approver_id,
        final_notes = p_notes
    where id = p_request_id;

    return jsonb_build_object('status', 'approved');
  end if;

  -- Move to next level
  select level into v_next_level
  from (values
    (1, 'branch_manager'),
    (2, 'supervisor'),
    (3, 'general_manager'),
    (4, 'ceo')
  ) as levels(ord, lvl)
  where ord = v_next_order;

  update public.branch_approval_requests
  set current_level = v_next_level
  where id = p_request_id;

  return jsonb_build_object('status', 'advanced', 'next_level', v_next_level);
end;
$$;

revoke all on function public.advance_approval_chain(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.advance_approval_chain(uuid, uuid, text, text, uuid) to authenticated;

-- ─── 5. RLS for approval tables ───────────────────────────────────────────────

alter table public.branch_approval_requests enable row level security;
alter table public.branch_approval_steps enable row level security;

revoke all on public.branch_approval_requests, public.branch_approval_steps from public, anon, authenticated;
grant select, insert, update on public.branch_approval_requests to authenticated;
grant select, update on public.branch_approval_steps to authenticated;

-- Requests: visible to submitter, branch-scoped approvers, and main-branch leadership
drop policy if exists "Approval requests visible to authorized users" on public.branch_approval_requests;
create policy "Approval requests visible to authorized users"
  on public.branch_approval_requests for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'approvals.view')
    and (
      submitted_by = (select auth.uid())                                           -- own request
      or public.current_user_can_see_branch(company_id, branch_id)                 -- same branch
      or public.current_user_is_main_branch_user(company_id)                        -- main branch sees all
    )
  );

-- Requests: any user with approvals.manage can submit
drop policy if exists "Authorized users can submit approval requests" on public.branch_approval_requests;
create policy "Authorized users can submit approval requests"
  on public.branch_approval_requests for insert to authenticated with check (
    submitted_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'approvals.manage')
  );

-- Requests: approvers can update status (via the advance function which is security definer)
-- Direct updates are restricted to the submitter (withdraw) and service role
drop policy if exists "Submitters can withdraw their own requests" on public.branch_approval_requests;
create policy "Submitters can withdraw their own requests"
  on public.branch_approval_requests for update to authenticated
  using (submitted_by = (select auth.uid()) and status = 'pending')
  with check (submitted_by = (select auth.uid()));

-- Steps: visible to anyone who can see the parent request
drop policy if exists "Approval steps visible to authorized users" on public.branch_approval_steps;
create policy "Approval steps visible to authorized users"
  on public.branch_approval_steps for select to authenticated using (
    exists (
      select 1 from public.branch_approval_requests req
      where req.id = branch_approval_steps.request_id
        and req.company_id = branch_approval_steps.company_id
        and public.current_user_has_company_permission(req.company_id, 'approvals.view')
        and (
          req.submitted_by = (select auth.uid())
          or public.current_user_can_see_branch(req.company_id, req.branch_id)
          or public.current_user_is_main_branch_user(req.company_id)
        )
    )
  );

-- Steps: updated via advance_approval_chain (security definer) — allow update for authenticated
drop policy if exists "Authorized users can update approval steps" on public.branch_approval_steps;
create policy "Authorized users can update approval steps"
  on public.branch_approval_steps for update to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'approvals.manage')
  )
  with check (
    public.current_user_has_company_permission(company_id, 'approvals.manage')
  );

-- ─── 6. Wire requisitions into the branch approval chain ─────────────────────
-- When a requisition is created, auto-create a branch_approval_request for it.
-- The existing 3-stage workflow (gm/finance/director) is replaced by the 4-level
-- branch chain. We keep the old columns for backward compat but drive approvals
-- through the new system.

create or replace function public.create_requisition_approval_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only create if no approval request already exists for this requisition
  if not exists (
    select 1 from public.branch_approval_requests
    where company_id = new.company_id
      and reference_id = new.id
      and reference_type = 'company_requisitions'
  ) then
    insert into public.branch_approval_requests (
      company_id, branch_id, request_type, title, description,
      amount, reference_id, reference_type, metadata, submitted_by
    )
    values (
      new.company_id,
      coalesce(new.branch_id, (select id from public.company_branches where company_id = new.company_id and is_main_branch = true limit 1)),
      'requisition',
      new.title,
      coalesce(nullif(new.notes, ''), 'Requisition ' || new.requisition_number),
      new.total_amount,
      new.id,
      'company_requisitions',
      jsonb_build_object('requisition_number', new.requisition_number, 'department', new.department_name),
      new.created_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists company_requisitions_create_approval on public.company_requisitions;
create trigger company_requisitions_create_approval
  after insert on public.company_requisitions
  for each row execute function public.create_requisition_approval_request();

revoke all on function public.create_requisition_approval_request() from public, anon, authenticated;

-- ─── 7. Notification helper for approvals ─────────────────────────────────────

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
  v_role_name text;
  v_recipient record;
begin
  -- Determine which role(s) should be notified
  if p_level = 'branch_manager' then
    -- Notify the branch manager of the request's branch
    insert into public.task_notifications (company_id, task_id, recipient_id, title, body, remind_at, sms_status)
    select p_company_id, null, b.manager_user_id, p_title, p_body, now(), 'not_requested'
    from public.branch_approval_requests r
    join public.company_branches b on b.id = r.branch_id and b.company_id = r.company_id
    where r.id = p_request_id
      and b.manager_user_id is not null;
  else
    -- Map level to role name
    v_role_name := case p_level
      when 'supervisor' then 'Supervisor'
      when 'general_manager' then 'General Manager'
      when 'ceo' then 'Chairman'
      else null
    end;

    if v_role_name is not null then
      -- Notify all users with that role in the company
      insert into public.task_notifications (company_id, task_id, recipient_id, title, body, remind_at, sms_status)
      select p_company_id, null, m.user_id, p_title, p_body, now(), 'not_requested'
      from public.company_memberships m
      join public.company_roles r on r.id = m.role_id and r.company_id = m.company_id
      where m.company_id = p_company_id
        and m.status = 'active'
        and (r.name = v_role_name or (v_role_name = 'Chairman' and r.name in ('Chairman', 'CEO')));
    end if;
  end if;
end;
$$;

revoke all on function public.notify_approval_level(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_approval_level(uuid, uuid, text, text, text) to service_role;

-- ─── 8. Trigger to notify the next approver when the chain advances ───────────

create or replace function public.notify_next_approver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request  public.branch_approval_requests%rowtype;
  v_title    text;
  v_body     text;
begin
  select * into v_request
  from public.branch_approval_requests
  where id = new.id;

  if v_request.status = 'pending' then
    v_title := 'Approval required — ' || v_request.title;
    v_body := 'A new request requires your approval at the ' ||
      case v_request.current_level
        when 'branch_manager' then 'Branch Manager'
        when 'supervisor' then 'Supervisor'
        when 'general_manager' then 'General Manager'
        when 'ceo' then 'CEO / Chairman'
      end || ' level.';

    perform public.notify_approval_level(
      v_request.company_id,
      v_request.id,
      v_request.current_level,
      v_title,
      v_body
    );
  end if;

  return new;
end;
$$;

drop trigger if exists branch_approval_requests_notify_approver on public.branch_approval_requests;
create trigger branch_approval_requests_notify_approver
  after update of current_level on public.branch_approval_requests
  for each row execute function public.notify_next_approver();

revoke all on function public.notify_next_approver() from public, anon, authenticated;
