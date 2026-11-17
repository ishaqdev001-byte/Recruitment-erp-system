alter table public.expense_requests
  drop constraint if exists expense_requests_amount_check,
  add constraint expense_requests_amount_nonnegative_check
    check (amount >= 0);

drop function if exists public.submit_staff_expense_request(
  uuid, text, text, uuid, date, text, jsonb
);

create function public.submit_expense_request_with_items(
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
as $function$
declare
  actor_id uuid := (select auth.uid());
  actor_branch_id uuid;
  actor_role_name text;
  requester_name text;
  manager_user_id uuid;
  category_name text;
  request_row public.expense_requests%rowtype;
  item jsonb;
  item_description text;
  item_quantity numeric(14,4);
  normalized_items jsonb := '[]'::jsonb;
  recipient_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_expense_name, ''))) not between 1 and 200
    or length(trim(coalesce(requested_purpose, ''))) not between 1 and 2000
    or length(trim(coalesce(requested_comment, ''))) not between 1 and 2000
    or requested_due_date is null
    or requested_items is null
    or jsonb_typeof(requested_items) is distinct from 'array'
    or jsonb_array_length(requested_items) < 1
    or jsonb_array_length(requested_items) > 50 then
    raise exception 'Enter a valid expense name, purpose, category, due date, comment, and line items.'
      using errcode = '22023';
  end if;

  select membership.branch_id, role.name
  into actor_branch_id, actor_role_name
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = requested_company_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;
  if not found or lower(btrim(actor_role_name)) = 'administration officer'
    or not (
      public.current_user_is_linked_company_staff(requested_company_id)
      or public.current_user_has_company_permission(requested_company_id, 'expense_requests.view')
      or public.current_user_has_company_permission(requested_company_id, 'expense_requests.create')
      or public.current_user_has_company_permission(requested_company_id, 'expense_requests.review')
      or public.current_user_has_company_permission(requested_company_id, 'expense_requests.verify')
      or public.current_user_has_company_permission(requested_company_id, 'expense_requests.authorize')
      or public.current_user_has_company_permission(requested_company_id, 'expense_requests.cashout')
    ) then
    raise exception 'You do not have permission to create expense requests.'
      using errcode = '42501';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
  into requester_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  select category.name into category_name
  from public.expense_categories category
  where category.id = requested_expense_category_id
    and category.company_id = requested_company_id
    and category.is_active;
  if category_name is null then
    raise exception 'Select an active expense category from this company.'
      using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    if item ? 'rate' or item ? 'unitRate' or item ? 'amount' then
      raise exception 'Unit rates are entered by the Administration Officer during initiation.'
        using errcode = '22023';
    end if;
    item_description := nullif(trim(item->>'description'), '');
    begin
      item_quantity := (item->>'quantity')::numeric(14,4);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have a valid quantity.'
        using errcode = '22023';
    end;
    if item_description is null or length(item_description) > 200
      or item_quantity is null or item_quantity <= 0 then
      raise exception 'Each item needs a description and positive quantity.'
        using errcode = '22023';
    end if;
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', 0
    ));
  end loop;

  select manager.linked_user_id into manager_user_id
  from public.company_staff_members requester
  join public.company_staff_members manager
    on manager.id = requester.line_manager_staff_id
   and manager.company_id = requester.company_id
   and manager.status = 'active'
  join public.company_memberships manager_membership
    on manager_membership.company_id = manager.company_id
   and manager_membership.user_id = manager.linked_user_id
   and manager_membership.status = 'active'
  join public.company_roles manager_role
    on manager_role.id = manager_membership.role_id
   and manager_role.company_id = manager_membership.company_id
  where requester.company_id = requested_company_id
    and requester.linked_user_id = actor_id
    and requester.status = 'active'
    and manager.linked_user_id <> actor_id
    and lower(btrim(manager_role.name)) <> 'administration officer'
  limit 1;

  insert into public.expense_requests (
    company_id, branch_id, expense_name, requested_by_name, purpose,
    amount, due_date, request_comment, created_by, status,
    line_manager_user_id, line_manager_fallback, staged_visibility,
    currently_visible_to_permission, next_approver_id, next_approver_stage,
    stage_entered_at, expense_category_id, expense_category_name, line_items
  )
  values (
    requested_company_id, actor_branch_id, trim(requested_expense_name),
    requester_name, trim(requested_purpose), 0, requested_due_date,
    trim(requested_comment), actor_id, 'pending_line_manager_review',
    manager_user_id, manager_user_id is null, true,
    case when manager_user_id is null then 'expense_requests.review' else null end,
    manager_user_id, case when manager_user_id is null then 'general_manager_review' else 'line_manager_review' end,
    now(), requested_expense_category_id, category_name, normalized_items
  )
  returning * into request_row;

  insert into public.approval_history (
    company_id, request_id, request_type, stage, action, actor_id,
    actor_name, actor_role, notes
  )
  values (
    requested_company_id, request_row.id, 'expense', 'staff_submission',
    'submitted', actor_id, requester_name, actor_role_name, trim(requested_comment)
  );

  if manager_user_id is not null then
    recipient_count := public.notify_expense_request_recipients(
      requested_company_id, request_row.id, null, manager_user_id,
      'Expense request awaiting line-manager review',
      request_row.request_number || ' from ' || requester_name || ' requires your review.'
    );
  else
    recipient_count := public.notify_expense_request_recipients(
      requested_company_id, request_row.id, 'expense_requests.review', null,
      'Expense request awaiting General Manager review',
      request_row.request_number || ' from ' || requester_name || ' requires your review.'
    );
  end if;
  if recipient_count = 0 then
    raise exception 'No active reviewer is available for this expense request.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'status', request_row.status,
    'lineManagerFallback', request_row.line_manager_fallback
  );
end;
$function$;

revoke all on function public.submit_expense_request_with_items(uuid, text, text, uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.submit_expense_request_with_items(uuid, text, text, uuid, date, text, jsonb)
  to authenticated;

alter function public.transition_staff_expense_request(uuid, text, text)
  rename to transition_staff_expense_request_internal;
revoke all on function public.transition_staff_expense_request_internal(uuid, text, text)
  from public, anon, authenticated;

create function public.transition_staff_expense_request(
  requested_request_id uuid,
  requested_action text,
  requested_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if requested_action not in ('line_manager_approve', 'line_manager_reject') then
    raise exception 'Choose a valid line-manager review action.'
      using errcode = '22023';
  end if;

  return public.transition_staff_expense_request_internal(
    requested_request_id,
    requested_action,
    requested_comment
  );
end;
$function$;

revoke all on function public.transition_staff_expense_request(uuid, text, text)
  from public, anon;
grant execute on function public.transition_staff_expense_request(uuid, text, text)
  to authenticated;

create function public.initiate_expense_request_requisition(
  requested_request_id uuid,
  requested_comment text,
  requested_unit_rates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  actor_role_name text;
  actor_is_default boolean;
  actor_name text;
  request_row public.expense_requests%rowtype;
  item jsonb;
  item_ordinality bigint;
  item_description text;
  item_quantity numeric(14,4);
  item_rate numeric(14,2);
  item_total numeric(16,2) := 0;
  normalized_items jsonb := '[]'::jsonb;
  requisition_result jsonb;
  new_requisition_id uuid;
  new_requisition_number text;
  next_status text;
  next_permission text;
  recipient_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_comment, ''))) not between 1 and 2000
    or requested_unit_rates is null
    or jsonb_typeof(requested_unit_rates) is distinct from 'array'
    or jsonb_array_length(requested_unit_rates) < 1
    or jsonb_array_length(requested_unit_rates) > 50 then
    raise exception 'Enter a positive unit rate for every item and add an initiation comment.'
      using errcode = '22023';
  end if;

  select * into request_row
  from public.expense_requests request
  where request.id = requested_request_id
  for update;
  if not found then
    raise exception 'Expense request not found.' using errcode = 'P0002';
  end if;

  select role.name, role.is_system_default
  into actor_role_name, actor_is_default
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = request_row.company_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;
  if not found
    or lower(btrim(actor_role_name)) <> 'administration officer'
    or actor_is_default is not true
    or not public.current_user_has_company_permission(request_row.company_id, 'expense_requests.initiate')
    or not public.current_user_has_company_permission(request_row.company_id, 'requisitions.create')
    or request_row.status <> 'pending_administration_officer_initiation'
    or request_row.requisition_id is not null then
    raise exception 'This request is not available for Administration Officer initiation.'
      using errcode = '42501';
  end if;

  if jsonb_array_length(requested_unit_rates) <> jsonb_array_length(request_row.line_items) then
    raise exception 'Enter one unit rate for every requested item.'
      using errcode = '22023';
  end if;

  item_ordinality := 0;
  for item in select value from jsonb_array_elements(request_row.line_items)
  loop
    item_description := nullif(trim(item->>'description'), '');
    begin
      item_quantity := (item->>'quantity')::numeric(14,4);
      item_rate := (requested_unit_rates ->> (item_ordinality::integer))::numeric(14,2);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have a valid positive unit rate.'
        using errcode = '22023';
    end;
    if item_description is null or length(item_description) > 200
      or item_quantity is null or item_quantity <= 0
      or item_rate is null or item_rate <= 0 then
      raise exception 'Each item needs its original description, positive quantity, and positive unit rate.'
        using errcode = '22023';
    end if;

    item_total := item_total + round(item_quantity * item_rate, 2);
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', item_rate
    ));
    item_ordinality := item_ordinality + 1;
  end loop;

  item_total := round(item_total, 2);
  if item_total <= 0 or item_total > 999999999999.99 then
    raise exception 'The request total must be greater than zero and within the supported limit.'
      using errcode = '22023';
  end if;

  update public.expense_requests
  set amount = item_total,
      line_items = normalized_items
  where id = request_row.id;
  request_row.amount := item_total;
  request_row.line_items := normalized_items;

  select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Administration Officer')
  into actor_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  requisition_result := public.create_requisition(
    request_row.company_id,
    request_row.request_number || ' - ' || request_row.expense_name,
    null, null, null, request_row.due_date,
    'Expense request submitted by ' || request_row.requested_by_name || E'\n' || request_row.purpose,
    request_row.line_items,
    request_row.expense_category_id,
    request_row.branch_id
  );
  new_requisition_id := (requisition_result->>'requisition_id')::uuid;
  new_requisition_number := requisition_result->>'requisition_number';
  if new_requisition_id is null or new_requisition_number is null then
    raise exception 'The linked requisition was not created successfully.'
      using errcode = 'P0002';
  end if;

  update public.company_requisitions
  set source_expense_request_id = request_row.id,
      source_expense_request_number = request_row.request_number,
      requested_by_user_id = request_row.created_by,
      requested_by_name = request_row.requested_by_name,
      initiated_by_user_id = actor_id,
      initiated_at = now(),
      staged_visibility = true,
      currently_visible_to_permission = case
        when request_row.line_manager_fallback then 'expense_requests.verify'
        else 'expense_requests.review'
      end,
      next_approver_stage = case
        when request_row.line_manager_fallback then 'finance_verification'
        else 'general_manager_review'
      end,
      stage_entered_at = now()
  where id = new_requisition_id
    and company_id = request_row.company_id;

  next_status := case
    when request_row.line_manager_fallback then 'pending_finance_verification'
    else 'pending_general_manager_review'
  end;
  next_permission := case
    when request_row.line_manager_fallback then 'expense_requests.verify'
    else 'expense_requests.review'
  end;

  update public.expense_requests
  set requisition_id = new_requisition_id,
      requisition_number = new_requisition_number,
      status = next_status,
      currently_visible_to_permission = next_permission,
      next_approver_stage = case
        when request_row.line_manager_fallback then 'finance_verification'
        else 'general_manager_review'
      end,
      stage_entered_at = now()
  where id = request_row.id;

  insert into public.approval_history (
    company_id, request_id, request_type, stage, action, actor_id,
    actor_name, actor_role, notes
  )
  values (
    request_row.company_id, request_row.id, 'expense', 'administration_officer_initiation',
    'noted', actor_id, actor_name, actor_role_name,
    trim(requested_comment) || ' Requisition ' || new_requisition_number || ' created.'
  );

  recipient_count := public.notify_expense_request_recipients(
    request_row.company_id, request_row.id, next_permission, null,
    case when request_row.line_manager_fallback
      then 'Requisition awaiting Finance verification'
      else 'Requisition awaiting General Manager review' end,
    new_requisition_number || ' (' || request_row.request_number || ') requires the next review.'
  );
  if recipient_count = 0 then
    raise exception 'No active approver is available for the initiated requisition.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'requisitionId', new_requisition_id,
    'requisitionNumber', new_requisition_number
  );
end;
$function$;

revoke all on function public.initiate_expense_request_requisition(uuid, text, jsonb)
  from public, anon;
grant execute on function public.initiate_expense_request_requisition(uuid, text, jsonb)
  to authenticated;