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
  run_row public.company_approval_workflow_runs%rowtype;
  step jsonb;
  step_key text;
  step_label text;
  action_type text;
  stage_permission_code text;
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
    stage_permission_code := step->>'permissionCode';
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
      (action_type = 'approval' and stage_permission_code in (
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
        and stage_permission_code = 'expense_requests.review')
      or (action_type = 'initiate_requisition'
        and requested_workflow_key = 'expense_request'
        and stage_permission_code = 'expense_requests.initiate')
      or (action_type = 'verify'
        and requested_workflow_key in ('linked_requisition', 'expense_request')
        and stage_permission_code = 'expense_requests.verify')
      or (action_type = 'verify'
        and requested_workflow_key = 'standalone_requisition'
        and stage_permission_code = 'requisitions.verify')
      or (action_type = 'authorize'
        and requested_workflow_key in ('linked_requisition', 'expense_request')
        and stage_permission_code = 'expense_requests.authorize')
      or (action_type = 'authorize'
        and requested_workflow_key = 'standalone_requisition'
        and stage_permission_code = 'requisitions.authorize')
      or (action_type = 'cashout'
        and requested_workflow_key = 'linked_requisition'
        and stage_permission_code = 'expense_requests.cashout')
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
         and permission.permission_code = stage_permission_code
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
      stage_position, step_label, action_type, stage_permission_code, role_ids,
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