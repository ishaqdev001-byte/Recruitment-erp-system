insert into public.permissions (code, description)
values
  ('requisitions.items.create', 'Add items to linked expense-request requisitions'),
  ('requisitions.items.edit', 'Edit items on linked expense-request requisitions'),
  ('requisitions.items.delete', 'Delete items from linked expense-request requisitions')
on conflict (code) do update
set description = excluded.description;

create policy "Linked requisition item managers can view requisitions"
  on public.company_requisitions
  for select
  to authenticated
  using (
    source_expense_request_id is not null
    and (
      public.current_user_has_company_permission(
        company_id, 'requisitions.items.create'
      )
      or public.current_user_has_company_permission(
        company_id, 'requisitions.items.edit'
      )
      or public.current_user_has_company_permission(
        company_id, 'requisitions.items.delete'
      )
    )
    and (
      public.current_user_is_main_branch_user(company_id)
      or exists (
        select 1
        from public.company_memberships membership
        where membership.company_id = company_requisitions.company_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and membership.branch_id = company_requisitions.branch_id
      )
    )
  );

create policy "Linked requisition item managers can view line items"
  on public.company_requisition_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.company_requisitions requisition
      where requisition.id = company_requisition_items.requisition_id
        and requisition.company_id = company_requisition_items.company_id
        and requisition.source_expense_request_id is not null
        and (
          public.current_user_has_company_permission(
            requisition.company_id, 'requisitions.items.create'
          )
          or public.current_user_has_company_permission(
            requisition.company_id, 'requisitions.items.edit'
          )
          or public.current_user_has_company_permission(
            requisition.company_id, 'requisitions.items.delete'
          )
        )
        and (
          public.current_user_is_main_branch_user(requisition.company_id)
          or exists (
            select 1
            from public.company_memberships membership
            where membership.company_id = requisition.company_id
              and membership.user_id = (select auth.uid())
              and membership.status = 'active'
              and membership.branch_id = requisition.branch_id
          )
        )
    )
  );

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
  allow_total_change boolean;
begin
  if old.source_expense_request_id is null then
    return new;
  end if;

  if new.source_expense_request_id is null and not exists (
    select 1
    from public.expense_requests request
    where request.id = old.source_expense_request_id
  ) then
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
    when 'paid' then 'approved'
    when 'rejected' then 'rejected'
    else null
  end;
  expected_payment_status := case when linked_request.status = 'paid' then 'paid' else 'unpaid' end;
  expected_amount_paid := case when linked_request.status = 'paid' then old.total_amount else 0 end;
  allow_total_change :=
    current_setting('kilax.allow_linked_requisition_total_update', true) = 'true'
    and new.total_amount is distinct from old.total_amount;

  if expected_status is null
    or (
      to_jsonb(new) - array[
        'status', 'payment_status', 'amount_paid', 'updated_at', 'total_amount'
      ]
    ) is distinct from (
      to_jsonb(old) - array[
        'status', 'payment_status', 'amount_paid', 'updated_at', 'total_amount'
      ]
    )
    or (
      new.total_amount is distinct from old.total_amount
      and not allow_total_change
    )
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

create or replace function private.guard_linked_requisition_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_requisition_id uuid;
  target_company_id uuid;
  allowed_operation text;
  has_linked_parent boolean;
begin
  if tg_op = 'DELETE' then
    target_requisition_id := old.requisition_id;
    target_company_id := old.company_id;
    allowed_operation := current_setting(
      'kilax.allow_linked_requisition_item_delete',
      true
    );
  elsif tg_op = 'UPDATE' then
    target_requisition_id := old.requisition_id;
    target_company_id := old.company_id;
    allowed_operation := current_setting(
      'kilax.allow_linked_requisition_item_edit',
      true
    );
  else
    target_requisition_id := new.requisition_id;
    target_company_id := new.company_id;
    allowed_operation := current_setting(
      'kilax.allow_linked_requisition_item_create',
      true
    );
    if current_setting(
      'kilax.allow_initial_linked_requisition_items',
      true
    ) = 'true' then
      allowed_operation := 'true';
    end if;
  end if;

  select exists (
    select 1
    from public.company_requisitions requisition
    where requisition.id = target_requisition_id
      and requisition.company_id = target_company_id
      and requisition.source_expense_request_id is not null
  ) into has_linked_parent;

  if tg_op = 'UPDATE' then
    has_linked_parent := has_linked_parent or exists (
      select 1
      from public.company_requisitions requisition
      where requisition.id = new.requisition_id
        and requisition.company_id = new.company_id
        and requisition.source_expense_request_id is not null
    );
  end if;

  if has_linked_parent and allowed_operation is distinct from 'true' then
    raise exception 'Items on linked expense-request requisitions require the matching item permission.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_requisition_items()
  from public, anon, authenticated;

create or replace function private.create_requisition_from_expense_request(
  requested_request_id uuid,
  requested_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_insert_permission text;
  previous_total_permission text;
  result jsonb;
begin
  if requested_actor_id is null
    or requested_actor_id is distinct from (select auth.uid())
    or not public.current_user_has_company_permission(
      (
        select request.company_id
        from public.expense_requests request
        where request.id = requested_request_id
      ),
      'expense_requests.initiate'
    ) then
    raise exception 'You do not have permission to initiate this expense request.'
      using errcode = '42501';
  end if;

  previous_insert_permission := current_setting(
    'kilax.allow_initial_linked_requisition_items',
    true
  );
  previous_total_permission := current_setting(
    'kilax.allow_linked_requisition_total_update',
    true
  );
  perform set_config('kilax.allow_initial_linked_requisition_items', 'true', true);
  perform set_config('kilax.allow_linked_requisition_total_update', 'true', true);

  result := private.create_requisition_from_expense_request_internal(
    requested_request_id,
    requested_actor_id
  );

  perform set_config(
    'kilax.allow_initial_linked_requisition_items',
    coalesce(previous_insert_permission, 'false'),
    true
  );
  perform set_config(
    'kilax.allow_linked_requisition_total_update',
    coalesce(previous_total_permission, 'false'),
    true
  );

  return result;
end;
$$;

revoke all on function private.create_requisition_from_expense_request(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.manage_linked_requisition_items(
  requested_company_id uuid,
  requested_requisition_id uuid,
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_id uuid;
  request_row public.expense_requests%rowtype;
  requisition_row public.company_requisitions%rowtype;
  existing_item public.company_requisition_items%rowtype;
  catalog_name text;
  catalog_code bigint;
  item jsonb;
  item_id uuid;
  item_description text;
  item_quantity numeric(14,4);
  item_rate numeric(14,2);
  catalog_item_id uuid;
  normalized_items jsonb := '[]'::jsonb;
  submitted_ids uuid[] := array[]::uuid[];
  item_index integer := 0;
  new_item_count integer := 0;
  changed_item_count integer := 0;
  deleted_item_count integer := 0;
  v_total_amount numeric(16,2) := 0;
  can_create boolean;
  can_edit boolean;
  can_delete boolean;
  actor_branch_id uuid;
  actor_role_name text;
  actor_name text;
  target_permission text;
  recipient_count integer;
  previous_create_permission text;
  previous_edit_permission text;
  previous_delete_permission text;
  previous_total_permission text;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if requested_items is null
    or jsonb_typeof(requested_items) is distinct from 'array'
    or jsonb_array_length(requested_items) < 1
    or jsonb_array_length(requested_items) > 50 then
    raise exception 'Provide between 1 and 50 requisition items.'
      using errcode = '22023';
  end if;

  select requisition.source_expense_request_id
  into request_id
  from public.company_requisitions requisition
  where requisition.id = requested_requisition_id
    and requisition.company_id = requested_company_id;
  if not found or request_id is null then
    raise exception 'This requisition is not linked to an Expense Request.'
      using errcode = '22023';
  end if;

  select * into request_row
  from public.expense_requests request
  where request.id = request_id
    and request.company_id = requested_company_id
  for update;
  if not found then
    raise exception 'Linked Expense Request could not be verified.'
      using errcode = '23503';
  end if;

  select * into requisition_row
  from public.company_requisitions requisition
  where requisition.id = requested_requisition_id
    and requisition.company_id = requested_company_id
    and requisition.source_expense_request_id = request_id
  for update;
  if not found then
    raise exception 'Linked requisition changed while the items were being updated.'
      using errcode = '40001';
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
  if not found then
    raise exception 'Active company membership not found.'
      using errcode = '42501';
  end if;

  if not public.current_user_is_main_branch_user(requested_company_id)
    and actor_branch_id is distinct from request_row.branch_id then
    raise exception 'This requisition is outside your branch.'
      using errcode = '42501';
  end if;

  if request_row.deleted_at is not null
    or request_row.status = 'paid'
    or request_row.company_expense_id is not null
    or requisition_row.payment_status = 'paid'
    or requisition_row.amount_paid > 0 then
    raise exception 'Items cannot be changed after the linked request has been paid.'
      using errcode = '42501';
  end if;

  can_create := public.current_user_has_company_permission(
    requested_company_id, 'requisitions.items.create'
  );
  can_edit := public.current_user_has_company_permission(
    requested_company_id, 'requisitions.items.edit'
  );
  can_delete := public.current_user_has_company_permission(
    requested_company_id, 'requisitions.items.delete'
  );

  for item in select value from jsonb_array_elements(requested_items)
  loop
    item_index := item_index + 1;
    item_description := nullif(btrim(item->>'description'), '');
    begin
      item_id := nullif(item->>'id', '')::uuid;
      item_quantity := (item->>'quantity')::numeric(14,4);
      item_rate := (item->>'rate')::numeric(14,2);
      catalog_item_id := nullif(item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have valid identifiers, quantity, and rate.'
        using errcode = '22023';
    end;

    if item_description is null or length(item_description) > 200
      or item_quantity is null or item_quantity <= 0
      or item_rate is null or item_rate <= 0 then
      raise exception 'Each item needs a description, positive quantity, and positive rate.'
        using errcode = '22023';
    end if;

    if catalog_item_id is not null then
      select catalog_item.name, catalog_item.item_code
      into catalog_name, catalog_code
      from public.company_expense_items catalog_item
      where catalog_item.id = catalog_item_id
        and catalog_item.company_id = requested_company_id
        and lower(btrim(catalog_item.name)) = lower(item_description)
        and (
          catalog_item.is_active
          or exists (
            select 1
            from public.company_requisition_items current_item
            where current_item.requisition_id = requested_requisition_id
              and current_item.catalog_item_id = catalog_item.id
          )
        );
      if not found then
        raise exception 'Select a matching active catalog item from this company.'
          using errcode = '22023';
      end if;
    else
      catalog_code := null;
    end if;

    if item_id is null then
      new_item_count := new_item_count + 1;
    else
      if item_id = any(submitted_ids) then
        raise exception 'An item was submitted more than once.'
          using errcode = '22023';
      end if;
      submitted_ids := array_append(submitted_ids, item_id);

      select * into existing_item
      from public.company_requisition_items current_item
      where current_item.id = item_id
        and current_item.requisition_id = requested_requisition_id
        and current_item.company_id = requested_company_id;
      if not found then
        raise exception 'An item does not belong to this requisition.'
          using errcode = '22023';
      end if;
      if existing_item.description is distinct from item_description
        or existing_item.quantity is distinct from item_quantity
        or existing_item.rate is distinct from item_rate
        or existing_item.catalog_item_id is distinct from catalog_item_id
        or existing_item.sort_order is distinct from item_index - 1 then
        changed_item_count := changed_item_count + 1;
      end if;
    end if;

    v_total_amount := v_total_amount + round(item_quantity * item_rate, 2);
    normalized_items := normalized_items || jsonb_build_array(
      jsonb_build_object(
        'id', item_id,
        'description', item_description,
        'quantity', item_quantity,
        'rate', item_rate,
        'catalog_item_id', catalog_item_id,
        'catalog_item_code', catalog_code
      )
    );
  end loop;

  select count(*) into deleted_item_count
  from public.company_requisition_items current_item
  where current_item.requisition_id = requested_requisition_id
    and current_item.company_id = requested_company_id
    and not (current_item.id = any(submitted_ids));

  if new_item_count > 0 and not can_create then
    raise exception 'You do not have permission to add requisition items.'
      using errcode = '42501';
  end if;
  if changed_item_count > 0 and not can_edit then
    raise exception 'You do not have permission to edit requisition items.'
      using errcode = '42501';
  end if;
  if deleted_item_count > 0 and not can_delete then
    raise exception 'You do not have permission to delete requisition items.'
      using errcode = '42501';
  end if;
  if v_total_amount <= 0 or v_total_amount > 999999999999.99 then
    raise exception 'The items must total an amount within the supported limit.'
      using errcode = '22023';
  end if;
  if new_item_count = 0 and changed_item_count = 0 and deleted_item_count = 0 then
    raise exception 'No item changes were submitted.'
      using errcode = '22023';
  end if;

  previous_create_permission := current_setting(
    'kilax.allow_linked_requisition_item_create', true
  );
  previous_edit_permission := current_setting(
    'kilax.allow_linked_requisition_item_edit', true
  );
  previous_delete_permission := current_setting(
    'kilax.allow_linked_requisition_item_delete', true
  );
  previous_total_permission := current_setting(
    'kilax.allow_linked_requisition_total_update', true
  );
  perform set_config(
    'kilax.allow_linked_requisition_item_create',
    case when new_item_count > 0 then 'true' else 'false' end,
    true
  );
  perform set_config(
    'kilax.allow_linked_requisition_item_edit',
    case when changed_item_count > 0 then 'true' else 'false' end,
    true
  );
  perform set_config(
    'kilax.allow_linked_requisition_item_delete',
    case when deleted_item_count > 0 then 'true' else 'false' end,
    true
  );
  perform set_config('kilax.allow_linked_requisition_total_update', 'true', true);

  delete from public.company_requisition_items current_item
  where current_item.requisition_id = requested_requisition_id
    and current_item.company_id = requested_company_id
    and not (current_item.id = any(submitted_ids));

  item_index := 0;
  for item in select value from jsonb_array_elements(normalized_items)
  loop
    if item->>'id' is null then
      insert into public.company_requisition_items (
        company_id, branch_id, requisition_id, catalog_item_id,
        description, quantity, rate, sort_order
      )
      values (
        requested_company_id, request_row.branch_id, requested_requisition_id,
        nullif(item->>'catalog_item_id', '')::uuid,
        item->>'description', (item->>'quantity')::numeric,
        (item->>'rate')::numeric, item_index
      );
    else
      update public.company_requisition_items
      set catalog_item_id = nullif(item->>'catalog_item_id', '')::uuid,
          description = item->>'description',
          quantity = (item->>'quantity')::numeric,
          rate = (item->>'rate')::numeric,
          sort_order = item_index
      where id = (item->>'id')::uuid
        and requisition_id = requested_requisition_id
        and company_id = requested_company_id
        and (
          catalog_item_id is distinct from nullif(item->>'catalog_item_id', '')::uuid
          or description is distinct from item->>'description'
          or quantity is distinct from (item->>'quantity')::numeric
          or rate is distinct from (item->>'rate')::numeric
          or sort_order is distinct from item_index
        );
    end if;
    item_index := item_index + 1;
  end loop;

  update public.company_requisitions
  set total_amount = round(v_total_amount, 2)
  where id = requested_requisition_id
    and company_id = requested_company_id;

  update public.expense_requests
  set amount = round(v_total_amount, 2),
      line_items = normalized_items,
      status = 'pending_line_manager_review',
      rejected_stage = null,
      line_manager_comment = null,
      line_manager_reviewed_at = null,
      general_manager_comment = null,
      general_manager_user_id = null,
      general_manager_reviewed_at = null,
      finance_comment = null,
      finance_user_id = null,
      finance_verified_at = null,
      chairman_comment = null,
      chairman_user_id = null,
      chairman_authorized_at = null,
      cashout_comment = null,
      cashout_user_id = null,
      cashed_out_at = null,
      cashout_account_id = null,
      currently_visible_to_permission = case
        when request_row.line_manager_fallback
          or request_row.line_manager_user_id is null
          then 'expense_requests.review'
        else null
      end,
      next_approver_id = case
        when request_row.line_manager_fallback then null
        else request_row.line_manager_user_id
      end,
      next_approver_stage = case
        when request_row.line_manager_fallback
          or request_row.line_manager_user_id is null
          then 'general_manager_review'
        else 'line_manager_review'
      end,
      stage_entered_at = now()
  where id = request_id
    and company_id = requested_company_id;

  perform set_config(
    'kilax.allow_linked_requisition_item_create',
    coalesce(previous_create_permission, 'false'),
    true
  );
  perform set_config(
    'kilax.allow_linked_requisition_item_edit',
    coalesce(previous_edit_permission, 'false'),
    true
  );
  perform set_config(
    'kilax.allow_linked_requisition_item_delete',
    coalesce(previous_delete_permission, 'false'),
    true
  );
  perform set_config(
    'kilax.allow_linked_requisition_total_update',
    coalesce(previous_total_permission, 'false'),
    true
  );

  select coalesce(nullif(btrim(profile.display_name), ''), auth_user.email, 'Staff member')
  into actor_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  insert into public.approval_history (
    company_id, request_id, request_type, stage, action, actor_id,
    actor_name, actor_role, notes
  )
  values (
    requested_company_id, request_id, 'expense', 'item_changes', 'noted',
    actor_id, actor_name, actor_role_name,
    'Linked requisition items changed; approvals restarted for the updated total.'
  );

  if request_row.line_manager_fallback or request_row.line_manager_user_id is null then
    target_permission := 'expense_requests.review';
    recipient_count := public.notify_expense_request_recipients(
      requested_company_id, request_id, target_permission, null,
      'Updated expense request awaiting General Manager review',
      request_row.request_number || ' has updated items and requires review again.'
    );
  else
    recipient_count := public.notify_expense_request_recipients(
      requested_company_id, request_id, null, request_row.line_manager_user_id,
      'Updated expense request awaiting line-manager review',
      request_row.request_number || ' has updated items and requires review again.'
    );
  end if;

  if recipient_count = 0 then
    raise exception 'No active reviewer is available for the updated expense request.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'requestId', request_id,
    'requestNumber', request_row.request_number,
    'requisitionId', requested_requisition_id,
    'totalAmount', round(v_total_amount, 2),
    'status', 'pending_line_manager_review'
  );
end;
$$;

revoke all on function public.manage_linked_requisition_items(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.manage_linked_requisition_items(uuid, uuid, jsonb)
  to authenticated;