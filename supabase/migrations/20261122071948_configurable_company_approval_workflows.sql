insert into public.permissions (code, description)
values (
  'workflows.manage',
  'Configure company approval workflows and stage routing'
)
on conflict (code) do update
set description = excluded.description;

create table public.company_approval_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  workflow_key text not null check (
    workflow_key in (
      'expense_request',
      'linked_requisition',
      'standalone_requisition',
      'leave'
    )
  ),
  name text not null check (length(btrim(name)) between 1 and 120),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (company_id, workflow_key),
  unique (id, company_id, workflow_key)
);

create table public.company_approval_workflow_stages (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null,
  company_id uuid not null,
  workflow_key text not null,
  stage_key text not null check (length(btrim(stage_key)) between 1 and 80),
  position integer not null check (position between 0 and 19),
  label text not null check (length(btrim(label)) between 1 and 100),
  action_type text not null check (
    action_type in (
      'approval',
      'line_manager_review',
      'initiate_requisition',
      'verify',
      'authorize',
      'cashout'
    )
  ),
  permission_code text not null,
  role_ids uuid[] not null default array[]::uuid[],
  instructions text not null default '' check (length(instructions) <= 1000),
  created_at timestamptz not null default now(),
  unique (workflow_id, stage_key),
  unique (workflow_id, position),
  foreign key (workflow_id, company_id, workflow_key)
    references public.company_approval_workflows (id, company_id, workflow_key)
    on delete cascade
);

create index company_approval_workflow_stages_order_idx
  on public.company_approval_workflow_stages (workflow_id, position);

create table public.company_approval_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  workflow_key text not null check (
    workflow_key in (
      'expense_request',
      'linked_requisition',
      'standalone_requisition',
      'leave'
    )
  ),
  subject_id uuid not null,
  steps_snapshot jsonb not null check (jsonb_typeof(steps_snapshot) = 'array'),
  current_stage_key text,
  run_status text not null default 'pending'
    check (run_status in ('pending', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, workflow_key, subject_id)
);

create index company_approval_workflow_runs_pending_idx
  on public.company_approval_workflow_runs
    (company_id, workflow_key, run_status, updated_at desc);

create table public.company_approval_workflow_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  run_id uuid not null references public.company_approval_workflow_runs (id) on delete cascade,
  stage_key text not null,
  stage_label text not null,
  action_type text not null,
  decision text not null check (decision in ('approved', 'rejected', 'completed')),
  actor_id uuid references auth.users (id) on delete set null,
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index company_approval_workflow_history_run_idx
  on public.company_approval_workflow_history (run_id, created_at);

alter table public.company_approval_workflows enable row level security;
alter table public.company_approval_workflow_stages enable row level security;
alter table public.company_approval_workflow_runs enable row level security;
alter table public.company_approval_workflow_history enable row level security;

revoke all on public.company_approval_workflows
  from public, anon, authenticated;
revoke all on public.company_approval_workflow_stages
  from public, anon, authenticated;
revoke all on public.company_approval_workflow_runs
  from public, anon, authenticated;
revoke all on public.company_approval_workflow_history
  from public, anon, authenticated;

grant all on public.company_approval_workflows to service_role;
grant all on public.company_approval_workflow_stages to service_role;
grant all on public.company_approval_workflow_runs to service_role;
grant all on public.company_approval_workflow_history to service_role;

create or replace function private.seed_company_approval_workflows(
  requested_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_row public.company_approval_workflows%rowtype;
  run_row public.company_approval_workflow_runs%rowtype;
begin
  insert into public.company_approval_workflows (company_id, workflow_key, name)
  values
    (requested_company_id, 'expense_request', 'Expense Request'),
    (requested_company_id, 'linked_requisition', 'Requisition from Expense Request'),
    (requested_company_id, 'standalone_requisition', 'Standalone Requisition'),
    (requested_company_id, 'leave', 'Leave Application')
  on conflict (company_id, workflow_key) do nothing;

  for workflow_row in
    select *
    from public.company_approval_workflows
    where company_id = requested_company_id
  loop
    if exists (
      select 1
      from public.company_approval_workflow_stages stage
      where stage.workflow_id = workflow_row.id
    ) then
      continue;
    end if;

    if workflow_row.workflow_key = 'expense_request' then
      insert into public.company_approval_workflow_stages (
        workflow_id, company_id, workflow_key, stage_key, position, label,
        action_type, permission_code, instructions
      )
      values
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'line-manager-review', 0, 'Line Manager Review',
          'line_manager_review', 'expense_requests.review',
          'Review the request and its supporting details.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'ao-initiation', 1, 'Requisition Initiation',
          'initiate_requisition', 'expense_requests.initiate',
          'Enter unit rates and create the linked requisition.');
    elsif workflow_row.workflow_key = 'linked_requisition' then
      insert into public.company_approval_workflow_stages (
        workflow_id, company_id, workflow_key, stage_key, position, label,
        action_type, permission_code, instructions
      )
      values
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'general-manager-review', 0, 'General Manager Review',
          'approval', 'expense_requests.review',
          'Review the linked requisition and expense request.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'finance-verification', 1, 'Finance Verification',
          'verify', 'expense_requests.verify',
          'Verify the amount and supporting financial details.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'chairman-authorization', 2, 'Chairman Authorization',
          'authorize', 'expense_requests.authorize',
          'Authorize or reject the requested expenditure.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'finance-cashout', 3, 'Finance Cash-out',
          'cashout', 'expense_requests.cashout',
          'Record payment from an eligible company account.');
    elsif workflow_row.workflow_key = 'standalone_requisition' then
      insert into public.company_approval_workflow_stages (
        workflow_id, company_id, workflow_key, stage_key, position, label,
        action_type, permission_code, instructions
      )
      values
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'general-manager-review', 0, 'General Manager Review',
          'approval', 'requisitions.review',
          'Review the requisition details and supporting documents.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'finance-verification', 1, 'Finance Verification',
          'verify', 'requisitions.verify',
          'Verify the amount, account, and financial details.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'chairman-authorization', 2, 'Chairman Authorization',
          'authorize', 'requisitions.authorize',
          'Provide final authorization or reject the requisition.');
    else
      insert into public.company_approval_workflow_stages (
        workflow_id, company_id, workflow_key, stage_key, position, label,
        action_type, permission_code, instructions
      )
      values
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'supervisor-review', 0, 'Supervisor Review',
          'approval', 'leave.manage',
          'Review the leave dates, reason, and team coverage.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'manager-review', 1, 'General Manager Review',
          'approval', 'leave.manage',
          'Review the request and previous comments.'),
        (workflow_row.id, requested_company_id, workflow_row.workflow_key,
          'final-approval', 2, 'Final Approval',
          'approval', 'leave.finalize',
          'Approve or reject the leave request.');
    end if;
  end loop;
end;
$$;

revoke all on function private.seed_company_approval_workflows(uuid)
  from public, anon, authenticated;

create or replace function private.snapshot_company_approval_workflow(
  requested_company_id uuid,
  requested_workflow_key text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stageKey', stage.stage_key,
        'label', stage.label,
        'actionType', stage.action_type,
        'permissionCode', stage.permission_code,
        'roleIds', to_jsonb(stage.role_ids),
        'instructions', stage.instructions
      )
      order by stage.position
    ),
    '[]'::jsonb
  )
  from public.company_approval_workflows workflow
  join public.company_approval_workflow_stages stage
    on stage.workflow_id = workflow.id
   and stage.company_id = workflow.company_id
   and stage.workflow_key = workflow.workflow_key
  where workflow.company_id = requested_company_id
    and workflow.workflow_key = requested_workflow_key
$$;

revoke all on function private.snapshot_company_approval_workflow(uuid, text)
  from public, anon, authenticated;

create or replace function private.start_company_approval_workflow(
  requested_company_id uuid,
  requested_workflow_key text,
  requested_subject_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_snapshot jsonb;
  first_stage_key text;
  result_id uuid;
begin
  perform private.seed_company_approval_workflows(requested_company_id);
  workflow_snapshot := private.snapshot_company_approval_workflow(
    requested_company_id, requested_workflow_key
  );
  select workflow_stage.value->>'stageKey'
  into first_stage_key
  from jsonb_array_elements(workflow_snapshot) as workflow_stage(value)
  limit 1;

  insert into public.company_approval_workflow_runs (
    company_id, workflow_key, subject_id, steps_snapshot,
    current_stage_key, run_status
  )
  values (
    requested_company_id, requested_workflow_key, requested_subject_id,
    workflow_snapshot, first_stage_key,
    case when first_stage_key is null then 'completed' else 'pending' end
  )
  on conflict (company_id, workflow_key, subject_id) do nothing
  returning id into result_id;

  if result_id is null then
    select run.id into result_id
    from public.company_approval_workflow_runs run
    where run.company_id = requested_company_id
      and run.workflow_key = requested_workflow_key
      and run.subject_id = requested_subject_id;
  end if;
  return result_id;
end;
$$;

revoke all on function private.start_company_approval_workflow(uuid, text, uuid)
  from public, anon, authenticated;

create or replace function private.skip_linked_fallback_manager_stage(
  requested_company_id uuid,
  requested_requisition_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_row public.company_approval_workflow_runs%rowtype;
  source_request_id uuid;
  fallback_actor_id uuid;
  fallback_note text;
  actor_role_id uuid;
  stage jsonb;
  next_stage jsonb;
  stage_role_ids uuid[];
  next_stage_key text;
  stage_position bigint;
  next_status text;
begin
  select requisition.source_expense_request_id
  into source_request_id
  from public.company_requisitions requisition
  join public.expense_requests request
    on request.id = requisition.source_expense_request_id
   and request.company_id = requisition.company_id
  where requisition.id = requested_requisition_id
    and requisition.company_id = requested_company_id
    and request.requisition_id = requisition.id
    and request.line_manager_fallback;
  if source_request_id is null then
    return;
  end if;

  select history.actor_id, history.note
  into fallback_actor_id, fallback_note
  from public.company_approval_workflow_runs run
  join public.company_approval_workflow_history history
    on history.run_id = run.id
  where run.company_id = requested_company_id
    and run.workflow_key = 'expense_request'
    and run.subject_id = source_request_id
    and history.action_type = 'line_manager_review'
    and history.decision = 'approved'
  order by history.created_at desc
  limit 1;
  if fallback_actor_id is null then
    return;
  end if;

  select membership.role_id
  into actor_role_id
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = requested_company_id
    and membership.user_id = fallback_actor_id
    and membership.status = 'active'
    and role.name = 'General Manager'
  limit 1;
  if actor_role_id is null then
    return;
  end if;

  select run.* into run_row
  from public.company_approval_workflow_runs run
  where run.company_id = requested_company_id
    and run.workflow_key = 'linked_requisition'
    and run.subject_id = requested_requisition_id
    and run.run_status = 'pending'
  for update;
  if not found then
    return;
  end if;

  select workflow_stage.value, workflow_stage.ordinality
  into stage, stage_position
  from jsonb_array_elements(run_row.steps_snapshot) with ordinality
    workflow_stage(value, ordinality)
  where workflow_stage.value->>'stageKey' = run_row.current_stage_key
  limit 1;
  if stage is null
    or stage_position is distinct from 1
    or stage->>'actionType' <> 'approval'
    or stage->>'permissionCode' <> 'expense_requests.review' then
    return;
  end if;

  select coalesce(array_agg(assigned_role.value::uuid), array[]::uuid[])
  into stage_role_ids
  from jsonb_array_elements_text(coalesce(stage->'roleIds', '[]'::jsonb))
    assigned_role(value);
  if cardinality(stage_role_ids) > 0
    and not (actor_role_id = any(stage_role_ids)) then
    return;
  end if;

  select workflow_stage.value
  into next_stage
  from jsonb_array_elements(run_row.steps_snapshot) with ordinality
    workflow_stage(value, ordinality)
  where workflow_stage.ordinality > stage_position
  order by workflow_stage.ordinality
  limit 1;
  next_stage_key := next_stage->>'stageKey';

  insert into public.company_approval_workflow_history (
    company_id, run_id, stage_key, stage_label, action_type, decision,
    actor_id, note
  )
  values (
    requested_company_id,
    run_row.id,
    stage->>'stageKey',
    stage->>'label',
    stage->>'actionType',
    'approved',
    fallback_actor_id,
    case when nullif(btrim(fallback_note), '') is null
      then 'Satisfied by the General Manager fallback review before initiation.'
      else 'Satisfied by the General Manager fallback review: ' ||
        btrim(fallback_note) end
  );

  update public.company_approval_workflow_runs
  set current_stage_key = next_stage_key,
      run_status = case when next_stage_key is null
        then 'completed' else 'pending' end,
      updated_at = now()
  where id = run_row.id;

  next_status := case
    when next_stage_key is null then 'approved_uninitiated'
    when next_stage->>'actionType' = 'verify'
      then 'pending_finance_verification'
    when next_stage->>'actionType' = 'authorize'
      then 'pending_chairman_authorization'
    when next_stage->>'actionType' = 'cashout'
      then 'authorized_pending_cashout'
    else 'pending_general_manager_review'
  end;
  update public.expense_requests
  set status = next_status,
      currently_visible_to_permission = next_stage->>'permissionCode',
      next_approver_stage = next_stage_key,
      stage_entered_at = now()
  where id = source_request_id
    and company_id = requested_company_id
    and requisition_id = requested_requisition_id;
end;
$$;

revoke all on function private.skip_linked_fallback_manager_stage(
  uuid, uuid
) from public, anon, authenticated;

create or replace function private.notify_company_approval_workflow_stage(
  requested_company_id uuid,
  requested_workflow_key text,
  requested_subject_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_row public.company_approval_workflow_runs%rowtype;
  stage jsonb;
  role_ids uuid[];
  stage_permission text;
  source_type text;
  line_manager_user_id uuid;
  line_manager_fallback boolean;
  subject_status text;
  recipient record;
  inserted_count integer := 0;
  notification_title text;
  notification_body text;
begin
  if requested_workflow_key = 'linked_requisition' then
    perform private.skip_linked_fallback_manager_stage(
      requested_company_id, requested_subject_id
    );
  end if;

  select run.* into run_row
  from public.company_approval_workflow_runs run
  where run.company_id = requested_company_id
    and run.workflow_key = requested_workflow_key
    and run.subject_id = requested_subject_id
    and run.run_status = 'pending'
  limit 1;
  if not found or run_row.current_stage_key is null then
    return 0;
  end if;

  select stage_row.value into stage
  from jsonb_array_elements(run_row.steps_snapshot) stage_row(value)
  where stage_row.value->>'stageKey' = run_row.current_stage_key
  limit 1;
  if stage is null then
    return 0;
  end if;

  stage_permission := stage->>'permissionCode';
  source_type := case requested_workflow_key
    when 'expense_request' then 'expense_request'
    else requested_workflow_key
  end;
  notification_title := 'Approval needed: ' ||
    coalesce(stage->>'label', 'Request');
  notification_body := 'A ' ||
    replace(requested_workflow_key, '_', ' ') ||
    ' is awaiting your review.';
  select coalesce(array_agg(assigned_role.value::uuid), array[]::uuid[])
  into role_ids
  from jsonb_array_elements_text(coalesce(stage->'roleIds', '[]'::jsonb))
    assigned_role(value);

  if requested_workflow_key = 'expense_request'
    and stage->>'actionType' = 'line_manager_review' then
    select request.line_manager_user_id, request.line_manager_fallback,
      request.status
    into line_manager_user_id, line_manager_fallback, subject_status
    from public.expense_requests request
    where request.id = requested_subject_id
      and request.company_id = requested_company_id;

    if line_manager_user_id is not null then
      insert into public.workspace_notifications (
        company_id, recipient_id, required_permission, category, title, body,
        source_type, source_id
      )
      select requested_company_id, membership.user_id,
        'expense_requests.view', 'approvals', notification_title,
        notification_body, source_type, requested_subject_id
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
       and role.company_id = membership.company_id
      where membership.company_id = requested_company_id
        and membership.user_id = line_manager_user_id
        and membership.status = 'active'
        and lower(role.name) <> 'administration officer'
        and (
          cardinality(role_ids) = 0
          or membership.role_id = any(role_ids)
        );
      get diagnostics inserted_count = row_count;
      return inserted_count;
    end if;
  end if;

  for recipient in
    select distinct membership.user_id
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
     and role_permission.permission_code = stage_permission
    where membership.company_id = requested_company_id
      and membership.status = 'active'
      and (
        cardinality(role_ids) = 0
        or membership.role_id = any(role_ids)
      )
      and (
        (
          stage->>'actionType' = 'line_manager_review'
          and requested_workflow_key = 'expense_request'
          and lower(role.name) = 'general manager'
          and (
            line_manager_fallback
            or (
              subject_status = 'pending_general_manager_review'
              and line_manager_user_id is null
            )
          )
        )
        or (
          stage->>'actionType' = 'initiate_requisition'
          and lower(role.name) = 'administration officer'
          and role.is_system_default
        )
        or (
          stage->>'actionType' = 'cashout'
          and role.name = 'Finance Manager'
        )
        or stage->>'actionType' not in (
          'line_manager_review', 'initiate_requisition', 'cashout'
        )
      )
  loop
    insert into public.workspace_notifications (
      company_id, recipient_id, required_permission, category, title, body,
      source_type, source_id
    )
    values (
      requested_company_id, recipient.user_id, stage_permission,
      'approvals', notification_title, notification_body,
      source_type, requested_subject_id
    );
    inserted_count := inserted_count + 1;

    if requested_workflow_key = 'leave' then
      insert into public.leave_notifications (
        company_id, leave_request_id, recipient_id, stage, title, body
      )
      select requested_company_id, leave_request.id, recipient.user_id,
        run_row.current_stage_key, notification_title,
        'A leave application is awaiting your review.'
      from public.leave_requests leave_request
      where leave_request.id = requested_subject_id
        and leave_request.company_id = requested_company_id;
    end if;
  end loop;

  return inserted_count;
end;
$$;

revoke all on function private.notify_company_approval_workflow_stage(
  uuid, text, uuid
) from public, anon, authenticated;

create or replace function private.start_approval_workflow_for_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workflow_key text;
begin
  if tg_table_name = 'expense_requests' then
    target_workflow_key := 'expense_request';
  elsif tg_table_name = 'leave_requests' then
    target_workflow_key := 'leave';
  elsif tg_table_name = 'company_requisitions' then
    target_workflow_key := case
      when new.source_expense_request_id is null
        then 'standalone_requisition'
      else 'linked_requisition'
    end;
  else
    raise exception 'Unsupported approval workflow source table.';
  end if;

  perform private.start_company_approval_workflow(
    new.company_id, target_workflow_key, new.id
  );
  if target_workflow_key in ('standalone_requisition', 'leave') then
    perform private.notify_company_approval_workflow_stage(
      new.company_id, target_workflow_key, new.id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.start_approval_workflow_for_record()
  from public, anon, authenticated;

create trigger expense_requests_start_approval_workflow
  after insert on public.expense_requests
  for each row execute function private.start_approval_workflow_for_record();

create trigger leave_requests_start_approval_workflow
  after insert on public.leave_requests
  for each row execute function private.start_approval_workflow_for_record();

create trigger company_requisitions_start_approval_workflow
  after insert on public.company_requisitions
  for each row execute function private.start_approval_workflow_for_record();

create or replace function private.reclassify_linked_requisition_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source_expense_request_id is null
    and new.source_expense_request_id is not null then
    delete from public.company_approval_workflow_runs
    where company_id = new.company_id
      and subject_id = new.id
      and workflow_key = 'standalone_requisition';
    perform private.start_company_approval_workflow(
      new.company_id, 'linked_requisition', new.id
    );
    perform private.notify_company_approval_workflow_stage(
      new.company_id, 'linked_requisition', new.id
    );
  end if;
  return new;
end;
$$;

revoke all on function private.reclassify_linked_requisition_workflow()
  from public, anon, authenticated;

create trigger company_requisitions_reclassify_approval_workflow
  after update of source_expense_request_id on public.company_requisitions
  for each row
  when (
    old.source_expense_request_id is null
    and new.source_expense_request_id is not null
  )
  execute function private.reclassify_linked_requisition_workflow();

create or replace function public.notify_expense_request_recipients(
  target_company_id uuid,
  target_request_id uuid,
  target_permission text,
  target_user_id uuid,
  notification_title text,
  notification_body text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.expense_requests%rowtype;
  workflow_key text;
  subject_id uuid;
begin
  select request.* into request_row
  from public.expense_requests request
  where request.id = target_request_id
    and request.company_id = target_company_id;
  if not found then
    return 0;
  end if;

  if request_row.status in ('paid', 'rejected') then
    return 1;
  end if;
  if request_row.requisition_id is null then
    workflow_key := 'expense_request';
    subject_id := request_row.id;
  else
    workflow_key := 'linked_requisition';
    subject_id := request_row.requisition_id;
  end if;

  return private.notify_company_approval_workflow_stage(
    target_company_id, workflow_key, subject_id
  );
end;
$$;

revoke all on function public.notify_expense_request_recipients(
  uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;

create or replace function public.save_company_approval_workflow(
  requested_company_id uuid,
  requested_workflow_key text,
  requested_name text,
  requested_steps jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  workflow_row public.company_approval_workflows%rowtype;
  step jsonb;
  step_key text;
  step_label text;
  action_type text;
  permission_code text;
  instructions text;
  role_ids uuid[];
  stage_position integer := 0;
  new_snapshot jsonb;
  next_stage_key text;
  updated_runs integer := 0;
  has_cashout boolean := false;
begin
  if actor_id is null or not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = requested_company_id
      and membership.user_id = actor_id
      and membership.status = 'active'
  ) then
    raise exception 'Active company membership required.'
      using errcode = '42501';
  end if;
  if not public.current_user_has_company_permission(
    requested_company_id, 'workflows.manage'
  ) then
    raise exception 'You do not have permission to manage approval workflows.'
      using errcode = '42501';
  end if;
  if requested_workflow_key not in (
    'expense_request', 'linked_requisition',
    'standalone_requisition', 'leave'
  ) or length(btrim(coalesce(requested_name, ''))) not between 1 and 120 then
    raise exception 'Choose a valid workflow and enter a name.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(requested_steps) is distinct from 'array' then
    raise exception 'A workflow must contain between 1 and 20 stages.'
      using errcode = '22023';
  end if;
  if jsonb_array_length(requested_steps) not between 1 and 20 then
    raise exception 'A workflow must contain between 1 and 20 stages.'
      using errcode = '22023';
  end if;
  if requested_workflow_key = 'expense_request' and exists (
    select 1
    from jsonb_array_elements(requested_steps) with ordinality
      workflow_stage(value, stage_position)
    where workflow_stage.value->>'actionType' = 'initiate_requisition'
      and workflow_stage.stage_position < jsonb_array_length(requested_steps)
  ) then
    raise exception 'Requisition initiation must be the final Expense Request stage.'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(requested_steps) as workflow_step(value)
    where jsonb_typeof(workflow_step.value) is distinct from 'object'
      or jsonb_typeof(workflow_step.value->'roleIds') is distinct from 'array'
  ) then
    raise exception 'Each workflow stage needs valid role assignments.'
      using errcode = '22023';
  end if;

  perform private.seed_company_approval_workflows(requested_company_id);
  select * into workflow_row
  from public.company_approval_workflows workflow
  where workflow.company_id = requested_company_id
    and workflow.workflow_key = requested_workflow_key
  for update;
  if not found then
    raise exception 'Approval workflow not found.' using errcode = 'P0002';
  end if;

  delete from public.company_approval_workflow_stages stage
  where stage.workflow_id = workflow_row.id;

  for step in select value from jsonb_array_elements(requested_steps)
  loop
    step_key := nullif(btrim(step->>'stageKey'), '');
    step_label := nullif(btrim(step->>'label'), '');
    action_type := step->>'actionType';
    permission_code := step->>'permissionCode';
    instructions := coalesce(step->>'instructions', '');

    if step_key is null or length(step_key) > 80
      or step_label is null or length(step_label) > 100
      or length(instructions) > 1000
      or exists (
        select 1
        from jsonb_array_elements(requested_steps) as workflow_candidate(value)
        where workflow_candidate.value->>'stageKey' = step_key
        group by workflow_candidate.value->>'stageKey'
        having count(*) > 1
      ) then
      raise exception 'Stage names, instructions, or identifiers are invalid.'
        using errcode = '22023';
    end if;

    if action_type not in (
      'approval', 'line_manager_review', 'initiate_requisition',
      'verify', 'authorize', 'cashout'
    ) then
      raise exception 'Choose a supported action for each workflow stage.'
        using errcode = '22023';
    end if;

    if not (
      (action_type = 'approval' and permission_code in (
        case requested_workflow_key
          when 'expense_request' then 'expense_requests.review'
          when 'linked_requisition' then 'expense_requests.review'
          when 'standalone_requisition' then 'requisitions.review'
          else 'leave.manage'
        end,
        case requested_workflow_key
          when 'leave' then 'leave.finalize'
          else ''
        end
      ))
      or (action_type = 'line_manager_review'
        and requested_workflow_key = 'expense_request'
        and permission_code = 'expense_requests.review')
      or (action_type = 'initiate_requisition'
        and requested_workflow_key = 'expense_request'
        and permission_code = 'expense_requests.initiate')
      or (action_type = 'verify'
        and requested_workflow_key in ('linked_requisition', 'expense_request')
        and permission_code = 'expense_requests.verify')
      or (action_type = 'verify'
        and requested_workflow_key = 'standalone_requisition'
        and permission_code = 'requisitions.verify')
      or (action_type = 'authorize'
        and requested_workflow_key in ('linked_requisition', 'expense_request')
        and permission_code = 'expense_requests.authorize')
      or (action_type = 'authorize'
        and requested_workflow_key = 'standalone_requisition'
        and permission_code = 'requisitions.authorize')
      or (action_type = 'cashout'
        and requested_workflow_key = 'linked_requisition'
        and permission_code = 'expense_requests.cashout')
    ) then
      raise exception 'The selected permission does not match this workflow action.'
        using errcode = '22023';
    end if;

    begin
      select coalesce(array_agg(value::uuid), array[]::uuid[])
      into role_ids
      from jsonb_array_elements_text(step->'roleIds') as assigned_role(value);
    exception when invalid_text_representation then
      raise exception 'Select valid company roles for each stage.'
        using errcode = '22023';
    end;

    if exists (
      select 1
      from unnest(role_ids) assigned_role_id
      where not exists (
        select 1
        from public.company_roles role
        join public.role_permissions permission
          on permission.role_id = role.id
         and permission.company_id = role.company_id
         and permission.permission_code = permission_code
        where role.id = assigned_role_id
          and role.company_id = requested_company_id
      )
    ) then
      raise exception 'Every selected role must have the stage permission.'
        using errcode = '22023';
    end if;

    if action_type = 'initiate_requisition' and exists (
      select 1
      from unnest(role_ids) assigned_role_id
      join public.company_roles role
        on role.id = assigned_role_id
       and role.company_id = requested_company_id
      where lower(role.name) <> 'administration officer'
        or not role.is_system_default
    ) then
      raise exception 'Requisition initiation must remain assigned to the Administration Officer role.'
        using errcode = '22023';
    end if;
    if action_type = 'cashout' and exists (
        select 1
        from unnest(role_ids) assigned_role_id
        join public.company_roles role
          on role.id = assigned_role_id
         and role.company_id = requested_company_id
        where lower(role.name) <> 'finance manager'
          or not role.is_system_default
    ) then
        raise exception 'Cash-out must remain assigned to the Finance Manager role.'
          using errcode = '22023';
    end if;

    insert into public.company_approval_workflow_stages (
      workflow_id, company_id, workflow_key, stage_key, position, label,
      action_type, permission_code, role_ids, instructions
    )
    values (
      workflow_row.id, requested_company_id, requested_workflow_key, step_key,
      stage_position, step_label, action_type, permission_code, role_ids,
      instructions
    );
    stage_position := stage_position + 1;
  end loop;

  select exists (
    select 1
    from jsonb_array_elements(requested_steps) as workflow_step(value)
    where workflow_step.value->>'actionType' = 'cashout'
  ) into has_cashout;
  if (
    select count(*)
    from jsonb_array_elements(requested_steps) as workflow_step(value)
    where workflow_step.value->>'actionType' = 'cashout'
  ) > 1 then
    raise exception 'A workflow can contain only one cash-out stage.'
      using errcode = '22023';
  end if;
  if has_cashout and (
    requested_steps->(jsonb_array_length(requested_steps) - 1)->>'actionType'
      <> 'cashout'
    or not exists (
      select 1
      from jsonb_array_elements(requested_steps) as workflow_step(value)
      where workflow_step.value->>'actionType' = 'authorize'
        and (workflow_step.value->>'stageKey') is distinct from
          requested_steps->(jsonb_array_length(requested_steps) - 1)->>'stageKey'
    )
  ) then
    raise exception 'Cash-out must be the final stage and follow an authorization stage.'
      using errcode = '22023';
  end if;

  update public.company_approval_workflows
  set name = btrim(requested_name),
      updated_by = actor_id,
      updated_at = now()
  where id = workflow_row.id;

  new_snapshot := private.snapshot_company_approval_workflow(
    requested_company_id, requested_workflow_key
  );

  for run_row in
    select run.*
    from public.company_approval_workflow_runs run
    where run.company_id = requested_company_id
      and run.workflow_key = requested_workflow_key
      and run.run_status = 'pending'
    for update
  loop
    select workflow_stage.value->>'stageKey'
    into next_stage_key
    from jsonb_array_elements(new_snapshot) with ordinality
      as workflow_stage(value, stage_position)
    where not exists (
      select 1
      from public.company_approval_workflow_history history
      where history.run_id = run_row.id
        and history.decision in ('approved', 'completed')
        and history.stage_key = workflow_stage.value->>'stageKey'
    )
    order by (
      workflow_stage.value->>'stageKey' = run_row.current_stage_key
    ) desc, workflow_stage.stage_position
    limit 1;
    update public.company_approval_workflow_runs run
    set steps_snapshot = new_snapshot,
        current_stage_key = next_stage_key,
        run_status = case when next_stage_key is null
          then 'completed' else 'pending' end,
        updated_at = now()
    where run.id = run_row.id;
    updated_runs := updated_runs + 1;
    if next_stage_key is not null then
      perform private.notify_company_approval_workflow_stage(
        requested_company_id,
        requested_workflow_key,
        run_row.subject_id
      );
    end if;
  end loop;

  return jsonb_build_object(
    'workflowId', workflow_row.id,
    'updatedPendingRuns', updated_runs
  );
end;
$$;

revoke all on function public.save_company_approval_workflow(
  uuid, text, text, jsonb
) from public, anon;
grant execute on function public.save_company_approval_workflow(
  uuid, text, text, jsonb
) to authenticated;

create or replace function private.seed_approval_workflows_for_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_company_approval_workflows(new.id);
  return new;
end;
$$;

revoke all on function private.seed_approval_workflows_for_company()
  from public, anon, authenticated;

create trigger companies_seed_approval_workflows
  after insert on public.companies
  for each row execute function private.seed_approval_workflows_for_company();

select private.seed_company_approval_workflows(company.id)
from public.companies company;

do $$
declare
  request_row record;
  stage_key text;
  run_id uuid;
begin
  for request_row in
    select request.id, request.company_id, request.status,
      request.requisition_id, request.line_manager_user_id
    from public.expense_requests request
  loop
    run_id := private.start_company_approval_workflow(
      request_row.company_id, 'expense_request', request_row.id
    );
    stage_key := null;
    if request_row.requisition_id is null then
      select workflow_stage.value->>'stageKey'
      into stage_key
      from public.company_approval_workflow_runs run
      cross join lateral jsonb_array_elements(run.steps_snapshot)
        with ordinality workflow_stage(value, stage_position)
      where run.id = run_id
        and case request_row.status
          when 'pending_line_manager_review' then
            workflow_stage.value->>'actionType' = 'line_manager_review'
          when 'pending_administration_officer_initiation' then
            workflow_stage.value->>'actionType' = 'initiate_requisition'
          when 'pending_general_manager_review' then
            workflow_stage.value->>'actionType' in ('approval', 'line_manager_review')
            and workflow_stage.value->>'permissionCode' = 'expense_requests.review'
          when 'pending_finance_verification' then
            workflow_stage.value->>'actionType' = 'verify'
          when 'pending_chairman_authorization' then
            workflow_stage.value->>'actionType' = 'authorize'
          when 'authorized_pending_cashout' then
            workflow_stage.value->>'actionType' = 'cashout'
          else false
        end
      order by workflow_stage.stage_position
      limit 1;
    end if;
    update public.company_approval_workflow_runs
    set current_stage_key = stage_key,
        run_status = case
          when request_row.status = 'rejected' then 'rejected'
          when request_row.status = 'paid'
            or request_row.requisition_id is not null then 'completed'
          when stage_key is null then 'completed'
          else 'pending'
        end
    where id = run_id;
  end loop;

  for request_row in
    select requisition.id, requisition.company_id, requisition.status,
      requisition.source_expense_request_id,
      source_request.status as request_status,
      source_request.line_manager_fallback as request_line_manager_fallback
    from public.company_requisitions requisition
    left join public.expense_requests source_request
      on source_request.id = requisition.source_expense_request_id
     and source_request.company_id = requisition.company_id
  loop
    run_id := private.start_company_approval_workflow(
      request_row.company_id,
      case when request_row.source_expense_request_id is null
        then 'standalone_requisition' else 'linked_requisition' end,
      request_row.id
    );
    stage_key := null;
    select workflow_stage.value->>'stageKey'
    into stage_key
    from public.company_approval_workflow_runs run
    cross join lateral jsonb_array_elements(run.steps_snapshot)
      with ordinality workflow_stage(value, stage_position)
    where run.id = run_id
      and case
        when request_row.source_expense_request_id is not null then
          case request_row.request_status
            when 'pending_general_manager_review' then
              case when request_row.request_line_manager_fallback then
                workflow_stage.value->>'actionType' = 'verify'
              else
                workflow_stage.value->>'actionType' = 'approval'
                and workflow_stage.value->>'permissionCode' = 'expense_requests.review'
              end
            when 'pending_finance_verification' then
              workflow_stage.value->>'actionType' = 'verify'
            when 'pending_chairman_authorization' then
              workflow_stage.value->>'actionType' = 'authorize'
            when 'authorized_pending_cashout' then
              workflow_stage.value->>'actionType' = 'cashout'
            else false
          end
        else
          case request_row.status
            when 'pending' then workflow_stage.value->>'actionType' = 'approval'
            when 'gm_review' then workflow_stage.value->>'actionType' = 'verify'
            when 'finance_review' then workflow_stage.value->>'actionType' = 'authorize'
            else false
          end
      end
    order by workflow_stage.stage_position
    limit 1;
    update public.company_approval_workflow_runs
    set current_stage_key = stage_key,
        run_status = case
          when request_row.source_expense_request_id is not null
            and request_row.request_status = 'rejected' then 'rejected'
          when request_row.source_expense_request_id is not null
            and request_row.request_status = 'paid' then 'completed'
          when request_row.source_expense_request_id is null
            and request_row.status = 'rejected' then 'rejected'
          when request_row.source_expense_request_id is null
            and request_row.status = 'approved' then 'completed'
          when stage_key is null then 'completed'
          else 'pending'
        end
    where id = run_id;
  end loop;

  for request_row in
    select leave_request.id, leave_request.company_id, leave_request.status
    from public.leave_requests leave_request
  loop
    run_id := private.start_company_approval_workflow(
      request_row.company_id, 'leave', request_row.id
    );
    stage_key := case request_row.status
      when 'pending' then 'supervisor-review'
      when 'supervisor_pending' then 'supervisor-review'
      when 'manager_pending' then 'manager-review'
      when 'final_pending' then 'final-approval'
      else null
    end;
    update public.company_approval_workflow_runs
    set current_stage_key = stage_key,
        run_status = case
          when request_row.status in ('approved', 'rejected')
            then request_row.status
          when stage_key is null then 'completed'
          else 'pending'
        end
    where id = run_id;
  end loop;
end;
$$;

create or replace function public.submit_priced_expense_request_with_items(
  requested_company_id uuid,
  requested_expense_name text,
  requested_purpose text,
  requested_expense_category_id uuid,
  requested_due_date date,
  requested_comment text,
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  base_items jsonb := '[]'::jsonb;
  submitted_result jsonb;
  request_id uuid;
  stored_items jsonb;
  priced_items jsonb;
  total_amount numeric(16,2);
begin
  if jsonb_typeof(requested_items) is distinct from 'array'
    or jsonb_array_length(requested_items) not between 1 and 50 then
    raise exception 'Submit between one and fifty priced items.'
      using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or item ? 'unitRate' or item ? 'amount' then
      raise exception 'Each item must contain a unit rate and no supplied total.'
        using errcode = '22023';
    end if;
    begin
      if (item->>'quantity')::numeric(14,4) <= 0
        or (item->>'rate')::numeric(14,2) <= 0 then
        raise exception 'Each item needs a positive quantity and unit rate.'
          using errcode = '22023';
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item needs a valid quantity and unit rate.'
        using errcode = '22023';
    end;
    base_items := base_items || jsonb_build_array(jsonb_build_object(
      'description', item->>'description',
      'quantity', item->>'quantity',
      'catalog_item_id', coalesce(item->'catalog_item_id', 'null'::jsonb)
    ));
  end loop;

  submitted_result := public.submit_expense_request_with_items(
    requested_company_id,
    requested_expense_name,
    requested_purpose,
    requested_expense_category_id,
    requested_due_date,
    requested_comment,
    base_items
  );
  request_id := (submitted_result->>'requestId')::uuid;

  select request.line_items into stored_items
  from public.expense_requests request
  where request.id = request_id
    and request.company_id = requested_company_id
    and request.created_by = (select auth.uid())
  for update;
  if not found or jsonb_array_length(stored_items) <> jsonb_array_length(requested_items) then
    raise exception 'Unable to associate submitted prices with the request.'
      using errcode = 'P0002';
  end if;

  select
    jsonb_agg(
      jsonb_set(stored_item.value, '{rate}', to_jsonb((requested_item.value->>'rate')::numeric(14,2)), true)
      order by stored_item.ordinality
    ),
    sum(round(
      (stored_item.value->>'quantity')::numeric
      * (requested_item.value->>'rate')::numeric,
      2
    ))
  into priced_items, total_amount
  from jsonb_array_elements(stored_items) with ordinality stored_item(value, ordinality)
  join jsonb_array_elements(requested_items) with ordinality requested_item(value, ordinality)
    on requested_item.ordinality = stored_item.ordinality;

  if total_amount <= 0 or total_amount > 999999999999.99 then
    raise exception 'The request total must be greater than zero and within the supported limit.'
      using errcode = '22023';
  end if;
  update public.expense_requests
  set line_items = priced_items,
      amount = total_amount
  where id = request_id
    and company_id = requested_company_id;

  return submitted_result || jsonb_build_object(
    'amount', total_amount,
    'lineItems', priced_items
  );
end;
$$;

revoke all on function public.submit_priced_expense_request_with_items(
  uuid, text, text, uuid, date, text, jsonb
) from public, anon;
grant execute on function public.submit_priced_expense_request_with_items(
  uuid, text, text, uuid, date, text, jsonb
) to authenticated;

create or replace function public.update_priced_expense_request_before_initiation(
  requested_request_id uuid,
  requested_expense_name text,
  requested_purpose text,
  requested_expense_category_id uuid,
  requested_due_date date,
  requested_comment text,
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  base_items jsonb := '[]'::jsonb;
  updated_result jsonb;
  request_row public.expense_requests%rowtype;
  priced_items jsonb;
  total_amount numeric(16,2);
begin
  if jsonb_typeof(requested_items) is distinct from 'array'
    or jsonb_array_length(requested_items) not between 1 and 50 then
    raise exception 'Submit between one and fifty priced items.'
      using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or item ? 'unitRate' or item ? 'amount' then
      raise exception 'Each item must contain a unit rate and no supplied total.'
        using errcode = '22023';
    end if;
    begin
      if (item->>'quantity')::numeric(14,4) <= 0
        or (item->>'rate')::numeric(14,2) <= 0 then
        raise exception 'Each item needs a positive quantity and unit rate.'
          using errcode = '22023';
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item needs a valid quantity and unit rate.'
        using errcode = '22023';
    end;
    base_items := base_items || jsonb_build_array(jsonb_build_object(
      'description', item->>'description',
      'quantity', item->>'quantity',
      'catalog_item_id', coalesce(item->'catalog_item_id', 'null'::jsonb)
    ));
  end loop;

  updated_result := public.update_expense_request_before_initiation(
    requested_request_id,
    requested_expense_name,
    requested_purpose,
    requested_expense_category_id,
    requested_due_date,
    requested_comment,
    base_items
  );

  select * into request_row
  from public.expense_requests request
  where request.id = requested_request_id
    and request.created_by = (select auth.uid())
  for update;
  if not found or jsonb_array_length(request_row.line_items) <> jsonb_array_length(requested_items) then
    raise exception 'Unable to associate submitted prices with the request.'
      using errcode = 'P0002';
  end if;

  select
    jsonb_agg(
      jsonb_set(stored_item.value, '{rate}', to_jsonb((requested_item.value->>'rate')::numeric(14,2)), true)
      order by stored_item.ordinality
    ),
    sum(round(
      (stored_item.value->>'quantity')::numeric
      * (requested_item.value->>'rate')::numeric,
      2
    ))
  into priced_items, total_amount
  from jsonb_array_elements(request_row.line_items) with ordinality stored_item(value, ordinality)
  join jsonb_array_elements(requested_items) with ordinality requested_item(value, ordinality)
    on requested_item.ordinality = stored_item.ordinality;

  if total_amount <= 0 or total_amount > 999999999999.99 then
    raise exception 'The request total must be greater than zero and within the supported limit.'
      using errcode = '22023';
  end if;
  update public.expense_requests
  set line_items = priced_items,
      amount = total_amount
  where id = requested_request_id;

  update public.company_approval_workflow_runs run
  set steps_snapshot = private.snapshot_company_approval_workflow(
        run.company_id, run.workflow_key
      ),
      current_stage_key = (
        private.snapshot_company_approval_workflow(run.company_id, run.workflow_key)
        ->0->>'stageKey'
      ),
      run_status = 'pending',
      updated_at = now()
  where run.company_id = request_row.company_id
    and run.workflow_key = 'expense_request'
    and run.subject_id = requested_request_id;
  delete from public.company_approval_workflow_history history
  using public.company_approval_workflow_runs run
  where history.run_id = run.id
    and run.company_id = request_row.company_id
    and run.workflow_key = 'expense_request'
    and run.subject_id = requested_request_id;

  return updated_result || jsonb_build_object(
    'amount', total_amount,
    'lineItems', priced_items
  );
end;
$$;

revoke all on function public.update_priced_expense_request_before_initiation(
  uuid, text, text, uuid, date, text, jsonb
) from public, anon;
grant execute on function public.update_priced_expense_request_before_initiation(
  uuid, text, text, uuid, date, text, jsonb
) to authenticated;

create or replace function public.get_company_approval_workflow_states(
  requested_company_id uuid,
  requested_workflow_key text,
  requested_subject_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role_id uuid;
  actor_role_name text;
  actor_branch_id uuid;
  run_row public.company_approval_workflow_runs%rowtype;
  stage jsonb;
  role_ids uuid[];
  can_act boolean;
  subject_visible boolean;
  history_rows jsonb;
  results jsonb := '[]'::jsonb;
begin
  if actor_id is null or not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = requested_company_id
      and membership.user_id = actor_id
      and membership.status = 'active'
  ) then
    raise exception 'Active company membership required.'
      using errcode = '42501';
  end if;
  if requested_workflow_key not in (
    'expense_request', 'linked_requisition', 'standalone_requisition', 'leave'
  ) then
    raise exception 'Choose a valid approval workflow.'
      using errcode = '22023';
  end if;

  select membership.role_id, role.name, membership.branch_id
  into actor_role_id, actor_role_name, actor_branch_id
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = requested_company_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;

  for run_row in
    select run.*
    from public.company_approval_workflow_runs run
    where run.company_id = requested_company_id
      and run.workflow_key = requested_workflow_key
      and run.subject_id = any(coalesce(requested_subject_ids, array[]::uuid[]))
  loop
    subject_visible := case requested_workflow_key
      when 'expense_request' then exists (
        select 1 from public.expense_requests request
        where request.id = run_row.subject_id
          and request.company_id = requested_company_id
          and (
            request.created_by = actor_id
            or request.line_manager_user_id = actor_id
            or (
              request.line_manager_fallback
              and actor_role_name = 'General Manager'
              and public.current_user_has_company_permission(requested_company_id, 'expense_requests.review')
            )
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.view')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.review')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.verify')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.authorize')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.cashout')
          )
      )
      when 'linked_requisition' then exists (
        select 1 from public.company_requisitions requisition
        where requisition.id = run_row.subject_id
          and requisition.company_id = requested_company_id
          and requisition.source_expense_request_id is not null
          and (
            requisition.created_by = actor_id
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.view')
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.review')
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.verify')
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.authorize')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.view')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.review')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.verify')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.authorize')
            or public.current_user_has_company_permission(requested_company_id, 'expense_requests.cashout')
          )
      )
      when 'standalone_requisition' then exists (
        select 1 from public.company_requisitions requisition
        where requisition.id = run_row.subject_id
          and requisition.company_id = requested_company_id
          and requisition.source_expense_request_id is null
          and (
            requisition.created_by = actor_id
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.view')
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.review')
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.verify')
            or public.current_user_has_company_permission(requested_company_id, 'requisitions.authorize')
          )
      )
      else exists (
        select 1 from public.leave_requests leave_request
        where leave_request.id = run_row.subject_id
          and leave_request.company_id = requested_company_id
          and (
            leave_request.employee_id = actor_id
            or public.current_user_has_company_permission(requested_company_id, 'leave.view')
            or public.current_user_has_company_permission(requested_company_id, 'leave.manage')
            or public.current_user_has_company_permission(requested_company_id, 'leave.finalize')
          )
      )
    end;
    if not subject_visible then
      raise exception 'You do not have permission to view this workflow.'
        using errcode = '42501';
    end if;

    stage := null;
    if run_row.run_status = 'pending' and run_row.current_stage_key is not null then
      select workflow_stage.value into stage
      from jsonb_array_elements(run_row.steps_snapshot) workflow_stage(value)
      where workflow_stage.value->>'stageKey' = run_row.current_stage_key
      limit 1;
    end if;

    can_act := false;
    if stage is not null then
      select coalesce(array_agg(assigned_role.value::uuid), array[]::uuid[])
      into role_ids
      from jsonb_array_elements_text(coalesce(stage->'roleIds', '[]'::jsonb))
        assigned_role(value);
      can_act :=
        (cardinality(role_ids) = 0 or actor_role_id = any(role_ids))
        and exists (
          select 1
          from public.company_memberships membership
          where membership.company_id = requested_company_id
            and membership.user_id = actor_id
            and membership.status = 'active'
            and (
              public.current_user_is_main_branch_user(requested_company_id)
              or (
                requested_workflow_key = 'expense_request'
                and stage->>'actionType' = 'line_manager_review'
                and exists (
                  select 1
                  from public.expense_requests request
                  where request.id = run_row.subject_id
                    and request.company_id = requested_company_id
                    and request.line_manager_user_id = actor_id
                )
              )
              or membership.branch_id = (
                case requested_workflow_key
                  when 'expense_request' then (
                    select request.branch_id from public.expense_requests request
                    where request.id = run_row.subject_id
                      and request.company_id = requested_company_id
                  )
                  when 'linked_requisition' then (
                    select requisition.branch_id
                    from public.company_requisitions requisition
                    where requisition.id = run_row.subject_id
                      and requisition.company_id = requested_company_id
                  )
                  when 'standalone_requisition' then (
                    select requisition.branch_id
                    from public.company_requisitions requisition
                    where requisition.id = run_row.subject_id
                      and requisition.company_id = requested_company_id
                  )
                  else membership.branch_id
                end
              )
            )
        )
        and (
          (
            stage->>'actionType' = 'line_manager_review'
            and requested_workflow_key = 'expense_request'
            and exists (
              select 1
              from public.expense_requests request
              where request.id = run_row.subject_id
                and request.company_id = requested_company_id
                and (
                  (
                    request.line_manager_user_id = actor_id
                    and actor_role_name <> 'Administration Officer'
                  )
                  or (
                    request.line_manager_fallback
                    and actor_role_name = 'General Manager'
                    and public.current_user_has_company_permission(
                      requested_company_id, stage->>'permissionCode'
                    )
                  )
                  or (
                    request.status = 'pending_general_manager_review'
                    and request.line_manager_user_id is null
                    and actor_role_name = 'General Manager'
                    and public.current_user_has_company_permission(
                      requested_company_id, stage->>'permissionCode'
                    )
                  )
                )
            )
          )
          or (
            stage->>'actionType' = 'initiate_requisition'
            and actor_role_name = 'Administration Officer'
            and exists (
              select 1 from public.company_roles role
              where role.id = actor_role_id
                and role.company_id = requested_company_id
                and role.is_system_default
            )
            and public.current_user_has_company_permission(
              requested_company_id, stage->>'permissionCode'
            )
          )
          or (
            stage->>'actionType' = 'cashout'
            and actor_role_name = 'Finance Manager'
            and public.current_user_has_company_permission(
              requested_company_id, stage->>'permissionCode'
            )
          )
          or (
            stage->>'actionType' not in ('line_manager_review', 'initiate_requisition', 'cashout')
            and public.current_user_has_company_permission(
              requested_company_id, stage->>'permissionCode'
            )
          )
        )
        and (
          requested_workflow_key <> 'leave'
          or not exists (
            select 1 from public.leave_requests leave_request
            where leave_request.id = run_row.subject_id
              and leave_request.company_id = requested_company_id
              and leave_request.employee_id = actor_id
          )
        );
    end if;

    select coalesce(
      jsonb_agg(jsonb_build_object(
        'stageKey', history.stage_key,
        'label', history.stage_label,
        'actionType', history.action_type,
        'decision', history.decision,
        'note', history.note,
        'createdAt', history.created_at
      ) order by history.created_at),
      '[]'::jsonb
    )
    into history_rows
    from public.company_approval_workflow_history history
    where history.run_id = run_row.id;

    results := results || jsonb_build_array(jsonb_build_object(
      'subjectId', run_row.subject_id,
      'workflowKey', run_row.workflow_key,
      'runStatus', run_row.run_status,
      'currentStage', stage,
      'canAct', can_act,
      'history', history_rows
    ));
  end loop;
  return results;
end;
$$;

revoke all on function public.get_company_approval_workflow_states(
  uuid, text, uuid[]
) from public, anon;
grant execute on function public.get_company_approval_workflow_states(
  uuid, text, uuid[]
) to authenticated;

create or replace function public.advance_company_approval_workflow(
  requested_company_id uuid,
  requested_workflow_key text,
  requested_subject_id uuid,
  requested_decision text,
  requested_note text default '',
  requested_account_id uuid default null,
  requested_payment_method text default null,
  requested_unit_rates jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role_id uuid;
  actor_role_name text;
  actor_branch_id uuid;
  run_row public.company_approval_workflow_runs%rowtype;
  stage jsonb;
  next_stage jsonb;
  role_ids uuid[];
  stage_position bigint;
  next_stage_position bigint;
  stage_key text;
  stage_label text;
  approval_request_id uuid;
  action_type text;
  permission_code text;
  request_row public.expense_requests%rowtype;
  requisition_row public.company_requisitions%rowtype;
  leave_row public.leave_requests%rowtype;
  expense_request_id uuid;
  rate_array jsonb;
  rate_item record;
  stored_rate numeric(14,2);
  supplied_rate numeric(14,2);
  rates_validated boolean := false;
  operation_result jsonb;
  next_stage_key text;
  next_permission text;
  next_status text;
  actor_name text;
  allowed boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(coalesce(requested_note, '')) > 2000 then
    raise exception 'Notes must be 2,000 characters or fewer.'
      using errcode = '22023';
  end if;

  select membership.role_id, role.name, membership.branch_id
  into actor_role_id, actor_role_name, actor_branch_id
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = requested_company_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;
  if not found then
    raise exception 'Active company membership required.'
      using errcode = '42501';
  end if;

  select run.* into run_row
  from public.company_approval_workflow_runs run
  where run.company_id = requested_company_id
    and run.workflow_key = requested_workflow_key
    and run.subject_id = requested_subject_id
    and run.run_status = 'pending'
  for update;
  if not found then
    raise exception 'This request has no pending approval stage.'
      using errcode = 'P0002';
  end if;

  select workflow_stage.value, workflow_stage.ordinality
  into stage, stage_position
  from jsonb_array_elements(run_row.steps_snapshot) with ordinality
    workflow_stage(value, ordinality)
  where workflow_stage.value->>'stageKey' = run_row.current_stage_key
  limit 1;
  if stage is null then
    raise exception 'The current approval stage is unavailable.'
      using errcode = 'P0002';
  end if;
  stage_key := stage->>'stageKey';
  stage_label := stage->>'label';
  action_type := stage->>'actionType';
  permission_code := stage->>'permissionCode';
  select coalesce(array_agg(assigned_role.value::uuid), array[]::uuid[])
  into role_ids
  from jsonb_array_elements_text(coalesce(stage->'roleIds', '[]'::jsonb))
    assigned_role(value);

  select workflow_stage.value, workflow_stage.ordinality
  into next_stage, next_stage_position
  from jsonb_array_elements(run_row.steps_snapshot) with ordinality
    workflow_stage(value, ordinality)
  where workflow_stage.ordinality > stage_position
  order by workflow_stage.ordinality
  limit 1;
  next_stage_key := next_stage->>'stageKey';
  next_permission := next_stage->>'permissionCode';

  if (cardinality(role_ids) > 0 and actor_role_id <> all(role_ids))
    or not exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = requested_company_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and (
          public.current_user_is_main_branch_user(requested_company_id)
          or (
            requested_workflow_key = 'expense_request'
            and action_type = 'line_manager_review'
            and exists (
              select 1
              from public.expense_requests request
              where request.id = requested_subject_id
                and request.company_id = requested_company_id
                and request.line_manager_user_id = actor_id
            )
          )
          or membership.branch_id = case requested_workflow_key
            when 'expense_request' then (
              select request.branch_id from public.expense_requests request
              where request.id = requested_subject_id
                and request.company_id = requested_company_id
            )
            when 'linked_requisition' then (
              select requisition.branch_id
              from public.company_requisitions requisition
              where requisition.id = requested_subject_id
                and requisition.company_id = requested_company_id
            )
            when 'standalone_requisition' then (
              select requisition.branch_id
              from public.company_requisitions requisition
              where requisition.id = requested_subject_id
                and requisition.company_id = requested_company_id
            )
            else membership.branch_id
          end
        )
    ) then
    raise exception 'This request is outside your approval scope.'
      using errcode = '42501';
  end if;

  if action_type = 'line_manager_review' then
    select * into request_row
    from public.expense_requests request
    where request.id = requested_subject_id
      and request.company_id = requested_company_id
    for update;
    allowed := found and (
      (
        request_row.line_manager_user_id = actor_id
        and actor_role_name <> 'Administration Officer'
      )
      or (
        request_row.line_manager_fallback
        and actor_role_name = 'General Manager'
        and public.current_user_has_company_permission(
          requested_company_id, permission_code
        )
      )
      or (
        request_row.status = 'pending_general_manager_review'
        and request_row.line_manager_user_id is null
        and actor_role_name = 'General Manager'
        and public.current_user_has_company_permission(
          requested_company_id, permission_code
        )
      )
    );
  elsif action_type = 'initiate_requisition' then
    allowed := requested_workflow_key = 'expense_request'
      and actor_role_name = 'Administration Officer'
      and exists (
        select 1 from public.company_roles role
        where role.id = actor_role_id
          and role.company_id = requested_company_id
          and role.is_system_default
      )
      and public.current_user_has_company_permission(
        requested_company_id, permission_code
      );
  elsif action_type = 'cashout' then
    allowed := requested_workflow_key = 'linked_requisition'
      and actor_role_name = 'Finance Manager'
      and public.current_user_has_company_permission(
        requested_company_id, permission_code
      );
  else
    allowed := public.current_user_has_company_permission(
      requested_company_id, permission_code
    );
  end if;
  if not allowed then
    raise exception 'You are not assigned or permitted to handle this workflow stage.'
      using errcode = '42501';
  end if;

  if requested_workflow_key = 'leave' then
    select * into leave_row
    from public.leave_requests leave_request
    where leave_request.id = requested_subject_id
      and leave_request.company_id = requested_company_id
    for update;
    if not found then
      raise exception 'Leave request not found.' using errcode = 'P0002';
    end if;
    if leave_row.employee_id = actor_id then
      raise exception 'You cannot approve your own leave request.'
        using errcode = '42501';
    end if;
  elsif requested_workflow_key = 'expense_request' then
    if action_type <> 'line_manager_review' then
      select * into request_row
      from public.expense_requests request
      where request.id = requested_subject_id
        and request.company_id = requested_company_id
      for update;
    end if;
    if request_row.id is null or request_row.deleted_at is not null then
      raise exception 'Expense request not found.' using errcode = 'P0002';
    end if;
  elsif requested_workflow_key = 'linked_requisition' then
    select * into requisition_row
    from public.company_requisitions requisition
    where requisition.id = requested_subject_id
      and requisition.company_id = requested_company_id
      and requisition.source_expense_request_id is not null
    for update;
    if not found then
      raise exception 'Linked requisition not found.' using errcode = 'P0002';
    end if;
    expense_request_id := requisition_row.source_expense_request_id;
    select * into request_row
    from public.expense_requests request
    where request.id = expense_request_id
      and request.company_id = requested_company_id
    for update;
    if not found or request_row.deleted_at is not null then
      raise exception 'Linked expense request not found.' using errcode = 'P0002';
    end if;
  else
    select * into requisition_row
    from public.company_requisitions requisition
    where requisition.id = requested_subject_id
      and requisition.company_id = requested_company_id
      and requisition.source_expense_request_id is null
    for update;
    if not found then
      raise exception 'Requisition not found.' using errcode = 'P0002';
    end if;
  end if;

  if action_type in ('initiate_requisition', 'cashout') then
    if requested_decision <> 'completed' then
      raise exception 'Complete this operational step to continue.'
        using errcode = '22023';
    end if;
    if length(btrim(coalesce(requested_note, ''))) not between 1 and 2000 then
      raise exception 'Add a note before completing this operational step.'
        using errcode = '22023';
    end if;
  elsif action_type in ('approval', 'line_manager_review', 'verify', 'authorize') then
    if requested_decision not in ('approved', 'rejected') then
      raise exception 'Choose approved or rejected.'
        using errcode = '22023';
    end if;
    if requested_workflow_key <> 'leave'
      and length(btrim(coalesce(requested_note, ''))) not between 1 and 2000 then
      raise exception 'Add a comment before taking action.'
        using errcode = '22023';
    end if;
  else
    raise exception 'Unsupported workflow action.' using errcode = '22023';
  end if;

  if action_type = 'initiate_requisition' then
    if next_stage_key is not null then
      raise exception 'Requisition initiation must be the final Expense Request step.'
        using errcode = '22023';
    end if;
    rate_array := '[]'::jsonb;
    for rate_item in
      select item.value, item.ordinality
      from jsonb_array_elements(request_row.line_items)
        with ordinality item(value, ordinality)
    loop
      stored_rate := null;
      begin
        stored_rate := (rate_item.value->>'rate')::numeric(14,2);
      exception when invalid_text_representation or numeric_value_out_of_range then
        stored_rate := null;
      end;
      if stored_rate is null or stored_rate <= 0 then
        if not rates_validated then
          if jsonb_typeof(requested_unit_rates) is distinct from 'array' then
            raise exception 'Enter a positive unit rate for every item before initiating this legacy request.'
              using errcode = '22023';
          end if;
          if jsonb_array_length(requested_unit_rates)
            <> jsonb_array_length(request_row.line_items) then
            raise exception 'Enter a positive unit rate for every item before initiating this legacy request.'
              using errcode = '22023';
          end if;
          rates_validated := true;
        end if;
        begin
          supplied_rate := (
            requested_unit_rates ->> (rate_item.ordinality::integer - 1)
          )::numeric(14,2);
        exception when invalid_text_representation or numeric_value_out_of_range then
          raise exception 'Each legacy item needs a valid positive unit rate.'
            using errcode = '22023';
        end;
        if supplied_rate is null or supplied_rate <= 0 then
          raise exception 'Each legacy item needs a valid positive unit rate.'
            using errcode = '22023';
        end if;
      else
        supplied_rate := stored_rate;
      end if;
      rate_array := rate_array || jsonb_build_array(supplied_rate);
    end loop;
    update public.expense_requests
    set status = 'pending_administration_officer_initiation'
    where id = request_row.id;
    operation_result := public.initiate_expense_request_requisition(
      request_row.id, trim(requested_note), rate_array
    );
    update public.expense_requests
    set amount = (
      select coalesce(sum(round(
        (item.value->>'quantity')::numeric
        * (item.value->>'rate')::numeric,
        2
      )), 0)
      from jsonb_array_elements(line_items) item(value)
    )
    where id = request_row.id;
  elsif action_type = 'cashout' then
    if requested_account_id is null
      or not exists (
        select 1
        from public.company_approval_workflow_history history
        where history.run_id = run_row.id
          and history.action_type = 'authorize'
          and history.decision = 'approved'
      ) then
      raise exception 'Cash-out requires a previously approved authorization stage and an active account.'
        using errcode = '42501';
    end if;
    operation_result := public.transition_expense_request(
      request_row.id,
      'cashout',
      trim(requested_note),
      requested_account_id,
      coalesce(requested_payment_method, 'Cash')
    );
  else
    select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
    into actor_name
    from auth.users auth_user
    left join public.profiles profile on profile.id = auth_user.id
    where auth_user.id = actor_id;

    if requested_workflow_key = 'leave' then
      if requested_decision = 'rejected' then
        update public.leave_requests
        set status = 'rejected',
            review_note = btrim(requested_note),
            reviewed_by = actor_id,
            reviewed_at = now(),
            supervisor_status = case when stage_position = 1 then 'rejected' else supervisor_status end,
            supervisor_note = case when stage_position = 1 then btrim(requested_note) else supervisor_note end,
            supervisor_id = case when stage_position = 1 then actor_id else supervisor_id end,
            supervisor_reviewed_at = case when stage_position = 1 then now() else supervisor_reviewed_at end,
            manager_status = case when stage_position = 2 then 'rejected' else manager_status end,
            manager_note = case when stage_position = 2 then btrim(requested_note) else manager_note end,
            manager_id = case when stage_position = 2 then actor_id else manager_id end,
            manager_reviewed_at = case when stage_position = 2 then now() else manager_reviewed_at end,
            final_status = case when next_stage_key is null then 'rejected' else final_status end,
            final_note = case when next_stage_key is null then btrim(requested_note) else final_note end,
            final_reviewer_id = case when next_stage_key is null then actor_id else final_reviewer_id end,
            final_reviewed_at = case when next_stage_key is null then now() else final_reviewed_at end
        where id = leave_row.id;
      else
        update public.leave_requests
        set status = case
              when next_stage_key is null then 'approved'
              when next_stage_position = 2 then 'manager_pending'
              else 'final_pending'
            end,
            review_note = btrim(requested_note),
            reviewed_by = actor_id,
            reviewed_at = now(),
            supervisor_status = case when stage_position = 1 then 'approved' else supervisor_status end,
            supervisor_note = case when stage_position = 1 then btrim(requested_note) else supervisor_note end,
            supervisor_id = case when stage_position = 1 then actor_id else supervisor_id end,
            supervisor_reviewed_at = case when stage_position = 1 then now() else supervisor_reviewed_at end,
            manager_status = case when stage_position = 2 then 'approved' else manager_status end,
            manager_note = case when stage_position = 2 then btrim(requested_note) else manager_note end,
            manager_id = case when stage_position = 2 then actor_id else manager_id end,
            manager_reviewed_at = case when stage_position = 2 then now() else manager_reviewed_at end,
            final_status = case when next_stage_key is null then 'approved' else final_status end,
            final_note = case when next_stage_key is null then btrim(requested_note) else final_note end,
            final_reviewer_id = case when next_stage_key is null then actor_id else final_reviewer_id end,
            final_reviewed_at = case when next_stage_key is null then now() else final_reviewed_at end
        where id = leave_row.id;
        if next_stage_key is null and leave_row.leave_type_id is not null then
          update public.leave_balances
          set days_used = days_used + leave_row.days_count,
              updated_at = now()
          where company_id = leave_row.company_id
            and user_id = leave_row.employee_id
            and leave_type_id = leave_row.leave_type_id
            and year = extract(year from leave_row.start_date)::integer;
        end if;
      end if;
    elsif requested_workflow_key in ('expense_request', 'linked_requisition') then
      if requested_decision = 'rejected' then
        update public.expense_requests
        set status = 'rejected',
            rejected_stage = case action_type
              when 'line_manager_review' then 'line_manager_review'
              when 'verify' then 'finance_verification'
              when 'authorize' then 'chairman_authorization'
              else 'general_manager_review'
            end,
            currently_visible_to_permission = null,
            next_approver_id = null,
            next_approver_stage = null,
            line_manager_comment = case when action_type = 'line_manager_review' then btrim(requested_note) else line_manager_comment end,
            line_manager_reviewed_at = case when action_type = 'line_manager_review' then now() else line_manager_reviewed_at end,
            finance_comment = case when action_type = 'verify' then btrim(requested_note) else finance_comment end,
            finance_user_id = case when action_type = 'verify' then actor_id else finance_user_id end,
            finance_verified_at = case when action_type = 'verify' then now() else finance_verified_at end,
            chairman_comment = case when action_type = 'authorize' then btrim(requested_note) else chairman_comment end,
            chairman_user_id = case when action_type = 'authorize' then actor_id else chairman_user_id end,
            chairman_authorized_at = case when action_type = 'authorize' then now() else chairman_authorized_at end,
            stage_entered_at = now()
        where id = request_row.id;
      else
        next_status := case
          when next_stage_key is null then 'approved_uninitiated'
          when next_stage->>'actionType' = 'initiate_requisition'
            then 'pending_administration_officer_initiation'
          when next_stage->>'actionType' = 'cashout'
            then 'authorized_pending_cashout'
          when next_stage->>'actionType' = 'verify'
            then 'pending_finance_verification'
          when next_stage->>'actionType' = 'authorize'
            then 'pending_chairman_authorization'
          else 'pending_general_manager_review'
        end;
        update public.expense_requests
        set status = next_status,
            rejected_stage = null,
            currently_visible_to_permission = next_permission,
            next_approver_id = null,
            next_approver_stage = next_stage_key,
            line_manager_fallback = case
              when action_type = 'line_manager_review'
                and request_row.status = 'pending_general_manager_review'
                and request_row.line_manager_user_id is null
                then true
              else line_manager_fallback
            end,
            line_manager_comment = case when action_type = 'line_manager_review' then btrim(requested_note) else line_manager_comment end,
            line_manager_reviewed_at = case when action_type = 'line_manager_review' then now() else line_manager_reviewed_at end,
            general_manager_comment = case when action_type = 'approval' then btrim(requested_note) else general_manager_comment end,
            general_manager_user_id = case when action_type = 'approval' then actor_id else general_manager_user_id end,
            general_manager_reviewed_at = case when action_type = 'approval' then now() else general_manager_reviewed_at end,
            finance_comment = case when action_type = 'verify' then btrim(requested_note) else finance_comment end,
            finance_user_id = case when action_type = 'verify' then actor_id else finance_user_id end,
            finance_verified_at = case when action_type = 'verify' then now() else finance_verified_at end,
            chairman_comment = case when action_type = 'authorize' then btrim(requested_note) else chairman_comment end,
            chairman_user_id = case when action_type = 'authorize' then actor_id else chairman_user_id end,
            chairman_authorized_at = case when action_type = 'authorize' then now() else chairman_authorized_at end,
            stage_entered_at = now()
        where id = request_row.id;
      end if;
    else
      if requested_decision = 'rejected' then
        update public.company_requisitions
        set status = 'rejected',
            general_manager_status = case when action_type = 'approval' then 'rejected' else general_manager_status end,
            general_manager_reviewed_by = case when action_type = 'approval' then actor_id else general_manager_reviewed_by end,
            general_manager_reviewed_at = case when action_type = 'approval' then now() else general_manager_reviewed_at end,
            general_manager_note = case when action_type = 'approval' then btrim(requested_note) else general_manager_note end,
            finance_status = case when action_type = 'verify' then 'rejected' else finance_status end,
            finance_reviewed_by = case when action_type = 'verify' then actor_id else finance_reviewed_by end,
            finance_reviewed_at = case when action_type = 'verify' then now() else finance_reviewed_at end,
            finance_note = case when action_type = 'verify' then btrim(requested_note) else finance_note end,
            director_status = case when action_type = 'authorize' then 'rejected' else director_status end,
            director_reviewed_by = case when action_type = 'authorize' then actor_id else director_reviewed_by end,
            director_reviewed_at = case when action_type = 'authorize' then now() else director_reviewed_at end,
            director_note = case when action_type = 'authorize' then btrim(requested_note) else director_note end
        where id = requisition_row.id;
      else
        next_status := case
          when next_stage_key is null then 'approved'
          when next_stage->>'actionType' = 'verify' then 'gm_review'
          when next_stage->>'actionType' = 'authorize' then 'finance_review'
          else 'pending'
        end;
        update public.company_requisitions
        set status = next_status,
            general_manager_status = case when action_type = 'approval' then 'approved' else general_manager_status end,
            general_manager_reviewed_by = case when action_type = 'approval' then actor_id else general_manager_reviewed_by end,
            general_manager_reviewed_at = case when action_type = 'approval' then now() else general_manager_reviewed_at end,
            general_manager_note = case when action_type = 'approval' then btrim(requested_note) else general_manager_note end,
            finance_status = case when action_type = 'verify' then 'approved' else finance_status end,
            finance_reviewed_by = case when action_type = 'verify' then actor_id else finance_reviewed_by end,
            finance_reviewed_at = case when action_type = 'verify' then now() else finance_reviewed_at end,
            finance_note = case when action_type = 'verify' then btrim(requested_note) else finance_note end,
            director_status = case when action_type = 'authorize' then 'approved' else director_status end,
            director_reviewed_by = case when action_type = 'authorize' then actor_id else director_reviewed_by end,
            director_reviewed_at = case when action_type = 'authorize' then now() else director_reviewed_at end,
            director_note = case when action_type = 'authorize' then btrim(requested_note) else director_note end,
            currently_visible_to_permission = next_permission,
            next_approver_stage = next_stage_key,
            stage_entered_at = now()
        where id = requisition_row.id;
      end if;
    end if;

    approval_request_id := case
      when requested_workflow_key = 'leave' then requested_subject_id
      when requested_workflow_key = 'standalone_requisition' then requested_subject_id
      when requested_workflow_key = 'linked_requisition' then expense_request_id
      else request_row.id
    end;

    insert into public.approval_history (
      company_id, request_id, request_type, stage, action, actor_id,
      actor_name, actor_role, notes
    )
    values (
      requested_company_id,
      approval_request_id,
      case when requested_workflow_key = 'leave' then 'leave'
        when requested_workflow_key = 'standalone_requisition' then 'requisition'
        else 'expense' end,
      stage_key,
      case when requested_decision = 'completed' then 'noted' else requested_decision end,
      actor_id, actor_name, actor_role_name, btrim(requested_note)
    );
  end if;

  insert into public.company_approval_workflow_history (
    company_id, run_id, stage_key, stage_label, action_type, decision,
    actor_id, note
  )
  values (
    requested_company_id, run_row.id, stage_key, stage_label, action_type,
    case when requested_decision = 'completed' then 'completed' else requested_decision end,
    actor_id, btrim(requested_note)
  );

  if action_type in ('initiate_requisition', 'cashout') then
    update public.company_approval_workflow_runs
    set run_status = 'completed',
        current_stage_key = null,
        updated_at = now()
    where id = run_row.id;
  elsif requested_decision = 'rejected' then
    update public.company_approval_workflow_runs
    set run_status = 'rejected',
        current_stage_key = null,
        updated_at = now()
    where id = run_row.id;
  else
    update public.company_approval_workflow_runs
    set current_stage_key = next_stage_key,
        run_status = case when next_stage_key is null then 'completed' else 'pending' end,
        updated_at = now()
    where id = run_row.id;
  end if;

  if next_stage_key is not null and requested_decision = 'approved' then
    perform private.notify_company_approval_workflow_stage(
      requested_company_id, requested_workflow_key, requested_subject_id
    );
  elsif requested_decision = 'rejected'
    or (
      next_stage_key is null
      and action_type <> 'initiate_requisition'
    ) then
    if requested_workflow_key in ('expense_request', 'linked_requisition') then
      expense_request_id := case
        when requested_workflow_key = 'expense_request' then requested_subject_id
        else expense_request_id
      end;
      insert into public.workspace_notifications (
        company_id, recipient_id, required_permission, category, title, body,
        source_type, source_id
      )
      select requested_company_id, request.created_by,
        'expense_requests.view', 'approvals',
        case when requested_decision = 'rejected' then 'Request declined' else 'Approval workflow completed' end,
        case when requested_decision = 'rejected' then 'Your request was declined.' else 'Your request approval workflow is complete.' end,
        'expense_request', request.id
      from public.expense_requests request
      where request.id = expense_request_id;
    elsif requested_workflow_key = 'standalone_requisition' then
      insert into public.workspace_notifications (
        company_id, recipient_id, required_permission, category, title, body,
        source_type, source_id
      )
      values (
        requested_company_id,
        requisition_row.created_by,
        'requisitions.create',
        'approvals',
        case when requested_decision = 'rejected'
          then 'Requisition declined'
          else 'Requisition approval workflow completed' end,
        case when requested_decision = 'rejected'
          then 'Your requisition was declined.'
          else 'Your requisition approval workflow is complete.' end,
        'standalone_requisition',
        requested_subject_id
      );
    end if;
  end if;

  if requested_workflow_key = 'leave'
    and (requested_decision = 'rejected' or next_stage_key is null) then
    insert into public.leave_notifications (
      company_id, leave_request_id, recipient_id, stage, title, body
    )
    values (
      requested_company_id,
      requested_subject_id,
      leave_row.employee_id,
      stage_key || '_' || requested_decision,
      case when requested_decision = 'rejected'
        then 'Leave request declined'
        else 'Leave request fully approved' end,
      case when requested_decision = 'rejected'
        then 'Your leave request was declined at ' || stage_label || '.'
        else 'Your leave request is approved and your leave balance has been updated.' end
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'workflowKey', requested_workflow_key,
    'subjectId', requested_subject_id,
    'nextStage', next_stage,
    'runStatus', case
      when action_type in ('initiate_requisition', 'cashout') then 'completed'
      when requested_decision = 'rejected' then 'rejected'
      when next_stage_key is null then 'completed'
      else 'pending'
    end,
    'operation', operation_result
  );
end;
$$;

revoke all on function public.advance_company_approval_workflow(
  uuid, text, uuid, text, text, uuid, text, jsonb
) from public, anon;
grant execute on function public.advance_company_approval_workflow(
  uuid, text, uuid, text, text, uuid, text, jsonb
) to authenticated;

do $$
begin
  if to_regprocedure('public.transition_expense_request(uuid,text,text,uuid,text)') is not null then
    execute 'revoke all on function public.transition_expense_request(uuid, text, text, uuid, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.transition_staff_expense_request(uuid,text,text)') is not null then
    execute 'revoke all on function public.transition_staff_expense_request(uuid, text, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.initiate_expense_request_requisition(uuid,text,jsonb)') is not null then
    execute 'revoke all on function public.initiate_expense_request_requisition(uuid, text, jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.advance_leave_request(uuid,text,text,text)') is not null then
    execute 'revoke all on function public.advance_leave_request(uuid, text, text, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.review_requisition(uuid,uuid,text,text,text)') is not null then
    execute 'revoke all on function public.review_requisition(uuid, uuid, text, text, text) from public, anon, authenticated';
  end if;
end;
$$;

alter table public.expense_requests
  drop constraint expense_requests_status_check,
  add constraint expense_requests_status_check check (
    status in (
      'pending_line_manager_review',
      'pending_administration_officer_initiation',
      'pending_general_manager_review',
      'pending_finance_verification',
      'pending_chairman_authorization',
      'authorized_pending_cashout',
      'approved_uninitiated',
      'paid',
      'rejected'
    )
  );

create or replace function private.sync_expense_request_requisition_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requisition_status text;
begin
  if new.requisition_id is null or old.status is not distinct from new.status then
    return new;
  end if;

  requisition_status := case new.status
    when 'pending_line_manager_review' then 'pending'
    when 'pending_administration_officer_initiation' then 'pending'
    when 'pending_general_manager_review' then 'gm_review'
    when 'pending_finance_verification' then 'finance_review'
    when 'pending_chairman_authorization' then 'finance_review'
    when 'authorized_pending_cashout' then 'approved'
    when 'approved_uninitiated' then 'approved'
    when 'paid' then 'approved'
    when 'rejected' then 'rejected'
    else null
  end;
  if requisition_status is null then
    raise exception 'Unsupported linked expense-request status.'
      using errcode = '22023';
  end if;

  update public.company_requisitions
  set status = requisition_status,
      payment_status = case when new.status = 'paid' then 'paid' else 'unpaid' end,
      amount_paid = case when new.status = 'paid' then total_amount else 0 end
  where id = new.requisition_id
    and company_id = new.company_id
    and source_expense_request_id = new.id;
  return new;
end;
$$;

revoke all on function private.sync_expense_request_requisition_status()
  from public, anon, authenticated;

create or replace function private.guard_linked_requisition_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_request public.expense_requests%rowtype;
  expected_status text;
  expected_payment_status text;
  expected_amount_paid numeric(16,2);
begin
  if old.source_expense_request_id is null then
    return new;
  end if;
  select * into linked_request
  from public.expense_requests request
  where request.id = old.source_expense_request_id
    and request.company_id = old.company_id;
  if not found then
    raise exception 'Linked expense request could not be verified.'
      using errcode = '23503';
  end if;
  expected_status := case linked_request.status
    when 'pending_line_manager_review' then 'pending'
    when 'pending_administration_officer_initiation' then 'pending'
    when 'pending_general_manager_review' then 'gm_review'
    when 'pending_finance_verification' then 'finance_review'
    when 'pending_chairman_authorization' then 'finance_review'
    when 'authorized_pending_cashout' then 'approved'
    when 'approved_uninitiated' then 'approved'
    when 'paid' then 'approved'
    when 'rejected' then 'rejected'
    else null
  end;
  expected_payment_status := case
    when linked_request.status = 'paid' then 'paid' else 'unpaid'
  end;
  expected_amount_paid := case
    when linked_request.status = 'paid' then old.total_amount else 0
  end;
  if expected_status is null
    or (to_jsonb(new) - array['status', 'payment_status', 'amount_paid', 'updated_at'])
      is distinct from
       (to_jsonb(old) - array['status', 'payment_status', 'amount_paid', 'updated_at'])
    or new.status is distinct from expected_status
    or new.payment_status is distinct from expected_payment_status
    or new.amount_paid is distinct from expected_amount_paid then
    raise exception 'Linked expense-request requisitions are read-only; use the Expense Requests approval workflow.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_requisition_write()
  from public, anon, authenticated;