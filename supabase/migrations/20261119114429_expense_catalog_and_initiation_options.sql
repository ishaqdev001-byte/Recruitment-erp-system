alter table public.companies
  add column expense_item_catalog_enabled boolean not null default false,
  add column expense_categories_enabled boolean not null default false;

update public.companies company
set expense_item_catalog_enabled = (
  select count(*) >= 4
  from public.company_expense_items item
  where item.company_id = company.id
),
expense_categories_enabled = (
  select count(*) >= 4
  from public.expense_categories category
  where category.company_id = company.id
);

create sequence public.company_expense_item_code_seq;
alter table public.company_expense_items
  add column item_code bigint not null
    default nextval('public.company_expense_item_code_seq'),
  add column is_active boolean not null default true;
alter sequence public.company_expense_item_code_seq
  owned by public.company_expense_items.item_code;
alter table public.company_expense_items
  add constraint company_expense_items_item_code_key unique (item_code),
  add constraint company_expense_items_item_code_positive check (item_code > 0);
revoke all on sequence public.company_expense_item_code_seq
  from public, anon, authenticated;
grant usage, select on sequence public.company_expense_item_code_seq
  to service_role;

insert into public.permissions (code, description)
values
  ('expense_items.manage', 'Manage the company expense item catalog'),
  ('expense_items.custom', 'Use unlisted items when the company catalog is enabled')
on conflict (code) do update
set description = excluded.description;

create or replace function public.create_requisition(
  p_company_id uuid,
  p_title text,
  p_department_id uuid,
  p_currency_id uuid,
  p_service_provider_id uuid,
  p_due_date date,
  p_notes text,
  p_items jsonb,
  p_expense_category_id uuid,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req_id uuid;
  v_req_number text;
  v_seq integer;
  v_dept_name text := '';
  v_currency_code text := 'UGX';
  v_provider_name text := '';
  v_category_name text;
  v_branch_id uuid;
  v_catalog_enabled boolean;
  v_categories_enabled boolean;
  v_catalog_item_id uuid;
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
  v_description text;
begin
  if auth.uid() is null
     or not public.current_user_has_company_permission(p_company_id, 'requisitions.create') then
    raise exception 'You do not have permission to create requisitions.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'Enter a requisition title of 1 to 200 characters.' using errcode = '22023';
  end if;

  select company.expense_item_catalog_enabled,
         company.expense_categories_enabled
  into v_catalog_enabled, v_categories_enabled
  from public.companies company
  where company.id = p_company_id;
  if not found then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  if p_branch_id is not null then
    v_branch_id := p_branch_id;
  else
    select membership.branch_id into v_branch_id
    from public.company_memberships as membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = p_company_id
      and membership.status = 'active'
    limit 1;

    if v_branch_id is null then
      select branch.id into v_branch_id
      from public.company_branches as branch
      where branch.company_id = p_company_id
        and branch.is_main_branch = true
      limit 1;
    end if;
  end if;

  if p_expense_category_id is not null then
    select category.name into v_category_name
    from public.expense_categories as category
    where category.id = p_expense_category_id
      and category.company_id = p_company_id
      and category.is_active;
    if v_category_name is null then
      raise exception 'Select an active expense category for this company.' using errcode = '22023';
    end if;
  elsif v_categories_enabled then
    raise exception 'Select an active expense category for this company.' using errcode = '22023';
  end if;

  if p_department_id is not null then
    select department.name into v_dept_name
    from public.company_departments as department
    where department.id = p_department_id
      and department.company_id = p_company_id
      and department.is_active;
    if v_dept_name is null then
      raise exception 'Selected department is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_currency_id is not null then
    select currency.code into v_currency_code
    from public.company_currencies as currency
    where currency.id = p_currency_id
      and currency.company_id = p_company_id
      and currency.is_active;
    if v_currency_code is null then
      raise exception 'Selected currency is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_service_provider_id is not null then
    select provider.name into v_provider_name
    from public.company_service_providers as provider
    where provider.id = p_service_provider_id
      and provider.company_id = p_company_id
      and provider.is_active;
    if v_provider_name is null then
      raise exception 'Selected service provider is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Add between 1 and 50 line items.' using errcode = '22023';
  end if;

  perform 1 from public.companies where id = p_company_id for update;
  select coalesce(max((regexp_match(requisition_number, '(\d+)$'))[1]::integer), 0) + 1
  into v_seq
  from public.company_requisitions
  where company_id = p_company_id
    and requisition_number like 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-%';

  v_req_number := 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.company_requisitions (
    company_id, branch_id, requisition_number, title,
    department_id, department_name, currency_id, currency_code,
    service_provider_id, service_provider_name,
    expense_category_id, expense_category_name,
    due_date, notes, status, created_by
  )
  values (
    p_company_id, v_branch_id, v_req_number, trim(p_title),
    p_department_id, v_dept_name, p_currency_id, v_currency_code,
    p_service_provider_id, v_provider_name,
    p_expense_category_id, coalesce(v_category_name, ''),
    p_due_date, coalesce(trim(p_notes), ''), 'pending', (select auth.uid())
  )
  returning id into v_req_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := nullif(btrim(v_item->>'description'), '');
    begin
      v_item_qty := (v_item->>'quantity')::numeric(14,4);
      v_item_rate := (v_item->>'rate')::numeric(14,2);
      v_catalog_item_id := nullif(v_item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each requisition item must have valid quantity, rate, and catalog data.' using errcode = '22023';
    end;
    if v_description is null or length(v_description) > 500
       or v_item_qty is null or v_item_qty <= 0
       or v_item_rate is null or v_item_rate < 0 then
      raise exception 'Each item must have a description, positive quantity, and non-negative rate.' using errcode = '22023';
    end if;

    if v_catalog_item_id is not null then
      if not exists (
        select 1 from public.company_expense_items item
        where item.id = v_catalog_item_id
          and item.company_id = p_company_id
          and item.is_active
          and lower(btrim(item.name)) = lower(v_description)
      ) then
        raise exception 'Select a matching active catalog item from this company.' using errcode = '22023';
      end if;
    else
      select item.id into v_catalog_item_id
      from public.company_expense_items item
      where item.company_id = p_company_id
        and item.is_active
        and lower(btrim(item.name)) = lower(v_description)
      limit 1;
    end if;

    if v_catalog_enabled and v_catalog_item_id is null
       and not public.current_user_has_company_permission(p_company_id, 'expense_items.custom') then
      raise exception 'Select an item from the company catalog or request permission to use a custom item.' using errcode = '42501';
    end if;

    insert into public.company_requisition_items (
      company_id, branch_id, requisition_id, catalog_item_id,
      description, quantity, rate, sort_order
    )
    values (
      p_company_id, v_branch_id, v_req_id, v_catalog_item_id,
      v_description, v_item_qty, v_item_rate, v_sort
    );
    v_total := v_total + (v_item_qty * v_item_rate);
    v_sort := v_sort + 1;
  end loop;

  update public.company_requisitions
  set total_amount = v_total
  where id = v_req_id;

  return jsonb_build_object(
    'id', v_req_id,
    'requisition_id', v_req_id,
    'requisition_number', v_req_number,
    'total_amount', v_total,
    'branch_id', v_branch_id
  );
end;
$function$;

create or replace function public.update_requisition(
  p_company_id uuid,
  p_requisition_id uuid,
  p_title text,
  p_department_id uuid,
  p_currency_id uuid,
  p_service_provider_id uuid,
  p_due_date date,
  p_notes text,
  p_items jsonb,
  p_expense_category_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_req record;
  v_dept_name text := '';
  v_currency_code text := 'UGX';
  v_provider_name text := '';
  v_category_name text;
  v_catalog_enabled boolean;
  v_categories_enabled boolean;
  v_catalog_item_id uuid;
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
  v_description text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_req
  from public.company_requisitions
  where id = p_requisition_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'Requisition not found.' using errcode = 'P0002';
  end if;
  if v_req.created_by <> (select auth.uid()) then
    raise exception 'Only the creator can edit a requisition.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' or v_req.source_expense_request_id is not null then
    raise exception 'Only standalone pending requisitions can be edited.' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'Enter a requisition title of 1 to 200 characters.' using errcode = '22023';
  end if;

  select company.expense_item_catalog_enabled,
         company.expense_categories_enabled
  into v_catalog_enabled, v_categories_enabled
  from public.companies company
  where company.id = p_company_id;

  if p_expense_category_id is not null then
    select category.name into v_category_name
    from public.expense_categories as category
    where category.id = p_expense_category_id
      and category.company_id = p_company_id
      and category.is_active;
    if v_category_name is null then
      raise exception 'Select an active expense category for this company.' using errcode = '22023';
    end if;
  elsif v_categories_enabled then
    raise exception 'Select an active expense category for this company.' using errcode = '22023';
  end if;

  if p_department_id is not null then
    select department.name into v_dept_name
    from public.company_departments as department
    where department.id = p_department_id and department.company_id = p_company_id and department.is_active;
    if v_dept_name is null then
      raise exception 'Selected department is not found or inactive.' using errcode = '22023';
    end if;
  end if;
  if p_currency_id is not null then
    select currency.code into v_currency_code
    from public.company_currencies as currency
    where currency.id = p_currency_id and currency.company_id = p_company_id and currency.is_active;
    if v_currency_code is null then
      raise exception 'Selected currency is not found or inactive.' using errcode = '22023';
    end if;
  end if;
  if p_service_provider_id is not null then
    select provider.name into v_provider_name
    from public.company_service_providers as provider
    where provider.id = p_service_provider_id and provider.company_id = p_company_id and provider.is_active;
    if v_provider_name is null then
      raise exception 'Selected service provider is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_items is null
     or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 50 then
    raise exception 'Add between 1 and 50 line items.' using errcode = '22023';
  end if;

  delete from public.company_requisition_items
  where requisition_id = p_requisition_id and company_id = p_company_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := nullif(btrim(v_item->>'description'), '');
    begin
      v_item_qty := (v_item->>'quantity')::numeric(14,4);
      v_item_rate := (v_item->>'rate')::numeric(14,2);
      v_catalog_item_id := nullif(v_item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each requisition item must have valid quantity, rate, and catalog data.' using errcode = '22023';
    end;
    if v_description is null or length(v_description) > 500
       or v_item_qty is null or v_item_qty <= 0
       or v_item_rate is null or v_item_rate < 0 then
      raise exception 'Each item must have a description, positive quantity, and non-negative rate.' using errcode = '22023';
    end if;

    if v_catalog_item_id is not null then
      if not exists (
        select 1 from public.company_expense_items item
        where item.id = v_catalog_item_id
          and item.company_id = p_company_id
          and item.is_active
          and lower(btrim(item.name)) = lower(v_description)
      ) then
        raise exception 'Select a matching active catalog item from this company.' using errcode = '22023';
      end if;
    else
      select item.id into v_catalog_item_id
      from public.company_expense_items item
      where item.company_id = p_company_id
        and item.is_active
        and lower(btrim(item.name)) = lower(v_description)
      limit 1;
    end if;

    if v_catalog_enabled and v_catalog_item_id is null
       and not public.current_user_has_company_permission(p_company_id, 'expense_items.custom') then
      raise exception 'Select an item from the company catalog or request permission to use a custom item.' using errcode = '42501';
    end if;

    insert into public.company_requisition_items (
      company_id, requisition_id, catalog_item_id,
      description, quantity, rate, sort_order
    )
    values (
      p_company_id, p_requisition_id, v_catalog_item_id,
      v_description, v_item_qty, v_item_rate, v_sort
    );
    v_total := v_total + (v_item_qty * v_item_rate);
    v_sort := v_sort + 1;
  end loop;

  update public.company_requisitions
  set title = trim(p_title),
      department_id = p_department_id,
      department_name = v_dept_name,
      currency_id = p_currency_id,
      currency_code = v_currency_code,
      service_provider_id = p_service_provider_id,
      service_provider_name = v_provider_name,
      expense_category_id = p_expense_category_id,
      expense_category_name = coalesce(v_category_name, ''),
      due_date = p_due_date,
      notes = coalesce(trim(p_notes), ''),
      total_amount = v_total
  where id = p_requisition_id and company_id = p_company_id;

  return jsonb_build_object('requisition_id', p_requisition_id, 'total_amount', v_total);
end;
$function$;

create or replace function public.submit_expense_request_with_items(
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
  catalog_enabled boolean;
  categories_enabled boolean;
  catalog_item_id uuid;
  catalog_item_code bigint;
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

  select company.expense_item_catalog_enabled,
         company.expense_categories_enabled
  into catalog_enabled, categories_enabled
  from public.companies company
  where company.id = requested_company_id;
  if not found then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
  into requester_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  if requested_expense_category_id is not null then
    select category.name into category_name
    from public.expense_categories category
    where category.id = requested_expense_category_id
      and category.company_id = requested_company_id
      and category.is_active;
    if category_name is null then
      raise exception 'Select an active expense category from this company.'
        using errcode = '22023';
    end if;
  elsif categories_enabled then
    raise exception 'Select an active expense category from this company.'
      using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    if item ? 'rate' or item ? 'unitRate' or item ? 'amount' then
      raise exception 'Unit rates are entered during requisition initiation.'
        using errcode = '22023';
    end if;
    item_description := nullif(trim(item->>'description'), '');
    begin
      item_quantity := (item->>'quantity')::numeric(14,4);
      catalog_item_id := nullif(item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have a valid quantity and catalog selection.'
        using errcode = '22023';
    end;
    if item_description is null or length(item_description) > 200
      or item_quantity is null or item_quantity <= 0 then
      raise exception 'Each item needs a description and positive quantity.'
        using errcode = '22023';
    end if;

    catalog_item_code := null;
    if catalog_item_id is not null then
      select catalog_item.item_code into catalog_item_code
      from public.company_expense_items catalog_item
      where catalog_item.id = catalog_item_id
        and catalog_item.company_id = requested_company_id
        and catalog_item.is_active
        and lower(btrim(catalog_item.name)) = lower(item_description);
      if catalog_item_code is null then
        raise exception 'Select a matching active catalog item from this company.'
          using errcode = '22023';
      end if;
    else
      select catalog_item.id, catalog_item.item_code
      into catalog_item_id, catalog_item_code
      from public.company_expense_items catalog_item
      where catalog_item.company_id = requested_company_id
        and catalog_item.is_active
        and lower(btrim(catalog_item.name)) = lower(item_description)
      limit 1;
    end if;

    if catalog_enabled and catalog_item_id is null
      and not public.current_user_has_company_permission(requested_company_id, 'expense_items.custom') then
      raise exception 'Select an item from the company catalog or request permission to use a custom item.'
        using errcode = '42501';
    end if;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', 0,
      'catalog_item_id', catalog_item_id,
      'catalog_item_code', catalog_item_code
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
    now(), requested_expense_category_id, coalesce(category_name, ''), normalized_items
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

create or replace function public.update_expense_request_before_initiation(
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
as $function$
declare
  actor_id uuid := (select auth.uid());
  request_row public.expense_requests%rowtype;
  actor_role_name text;
  category_name text;
  catalog_enabled boolean;
  categories_enabled boolean;
  catalog_item_id uuid;
  catalog_item_code bigint;
  item jsonb;
  item_description text;
  item_quantity numeric(14,4);
  normalized_items jsonb := '[]'::jsonb;
  recipient_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into request_row
  from public.expense_requests
  where id = requested_request_id
  for update;
  if not found then
    raise exception 'Expense request not found.' using errcode = 'P0002';
  end if;
  if not public.current_user_has_company_permission(request_row.company_id, 'expense_requests.edit') then
    raise exception 'You do not have permission to edit expense requests.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = request_row.company_id
      and membership.user_id = actor_id
      and membership.status = 'active'
      and (
        public.current_user_is_main_branch_user(request_row.company_id)
        or membership.branch_id = request_row.branch_id
      )
  ) then
    raise exception 'This expense request is outside your branch.' using errcode = '42501';
  end if;
  if request_row.deleted_at is not null
    or request_row.requisition_id is not null
    or request_row.status not in ('pending_line_manager_review', 'pending_administration_officer_initiation') then
    raise exception 'Only requests awaiting approval or initiation can be edited.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_expense_name, ''))) not between 1 and 200
    or length(trim(coalesce(requested_purpose, ''))) not between 1 and 2000
    or length(trim(coalesce(requested_comment, ''))) not between 1 and 2000
    or requested_due_date is null
    or requested_items is null
    or jsonb_typeof(requested_items) is distinct from 'array'
    or jsonb_array_length(requested_items) < 1
    or jsonb_array_length(requested_items) > 50 then
    raise exception 'Enter a valid expense name, purpose, category, due date, comment, and line items.' using errcode = '22023';
  end if;

  select company.expense_item_catalog_enabled,
         company.expense_categories_enabled
  into catalog_enabled, categories_enabled
  from public.companies company
  where company.id = request_row.company_id;

  if requested_expense_category_id is not null then
    select category.name into category_name
    from public.expense_categories category
    where category.id = requested_expense_category_id
      and category.company_id = request_row.company_id
      and category.is_active;
    if category_name is null then
      raise exception 'Select an active expense category from this company.' using errcode = '22023';
    end if;
  elsif categories_enabled then
    raise exception 'Select an active expense category from this company.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(requested_items)
  loop
    if item ? 'rate' or item ? 'unitRate' or item ? 'amount' then
      raise exception 'Unit rates are entered during requisition initiation.' using errcode = '22023';
    end if;
    item_description := nullif(trim(item->>'description'), '');
    begin
      item_quantity := (item->>'quantity')::numeric(14,4);
      catalog_item_id := nullif(item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have a valid quantity and catalog selection.' using errcode = '22023';
    end;
    if item_description is null or length(item_description) > 200 or item_quantity is null or item_quantity <= 0 then
      raise exception 'Each item needs a description and positive quantity.' using errcode = '22023';
    end if;

    catalog_item_code := null;
    if catalog_item_id is not null then
      select catalog_item.item_code into catalog_item_code
      from public.company_expense_items catalog_item
      where catalog_item.id = catalog_item_id
        and catalog_item.company_id = request_row.company_id
        and catalog_item.is_active
        and lower(btrim(catalog_item.name)) = lower(item_description);
      if catalog_item_code is null then
        raise exception 'Select a matching active catalog item from this company.' using errcode = '22023';
      end if;
    else
      select catalog_item.id, catalog_item.item_code
      into catalog_item_id, catalog_item_code
      from public.company_expense_items catalog_item
      where catalog_item.company_id = request_row.company_id
        and catalog_item.is_active
        and lower(btrim(catalog_item.name)) = lower(item_description)
      limit 1;
    end if;

    if catalog_enabled and catalog_item_id is null
      and not public.current_user_has_company_permission(request_row.company_id, 'expense_items.custom') then
      raise exception 'Select an item from the company catalog or request permission to use a custom item.' using errcode = '42501';
    end if;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', 0,
      'catalog_item_id', catalog_item_id,
      'catalog_item_code', catalog_item_code
    ));
  end loop;

  select role.name into actor_role_name
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = request_row.company_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;

  update public.expense_requests
  set expense_name = trim(requested_expense_name),
      purpose = trim(requested_purpose),
      expense_category_id = requested_expense_category_id,
      expense_category_name = coalesce(category_name, ''),
      due_date = requested_due_date,
      request_comment = trim(requested_comment),
      line_items = normalized_items,
      status = 'pending_line_manager_review',
      rejected_stage = null,
      line_manager_comment = null,
      line_manager_reviewed_at = null,
      general_manager_comment = case when request_row.line_manager_fallback then null else general_manager_comment end,
      general_manager_user_id = case when request_row.line_manager_fallback then null else general_manager_user_id end,
      general_manager_reviewed_at = case when request_row.line_manager_fallback then null else general_manager_reviewed_at end,
      currently_visible_to_permission = case when request_row.line_manager_fallback then 'expense_requests.review' else null end,
      next_approver_id = request_row.line_manager_user_id,
      next_approver_stage = case when request_row.line_manager_fallback then 'general_manager_review' else 'line_manager_review' end,
      stage_entered_at = now()
  where id = request_row.id;

  if request_row.line_manager_user_id is not null and not request_row.line_manager_fallback then
    recipient_count := public.notify_expense_request_recipients(
      request_row.company_id, request_row.id, null, request_row.line_manager_user_id,
      'Updated expense request awaiting line-manager review',
      request_row.request_number || ' from ' || request_row.requested_by_name || ' was updated and requires your review.'
    );
  else
    recipient_count := public.notify_expense_request_recipients(
      request_row.company_id, request_row.id, 'expense_requests.review', null,
      'Updated expense request awaiting General Manager review',
      request_row.request_number || ' from ' || request_row.requested_by_name || ' was updated and requires your review.'
    );
  end if;
  if recipient_count = 0 then
    raise exception 'No active reviewer is available for this expense request.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'serialNumber', request_row.serial_number,
    'status', 'pending_line_manager_review'
  );
end;
$function$;

create or replace function private.create_requisition_from_expense_request(
  requested_request_id uuid,
  requested_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  request_row public.expense_requests%rowtype;
  v_req_id uuid;
  v_req_number text;
  v_seq integer;
  v_actor_branch_id uuid;
  v_actor_name text;
  v_item jsonb;
  v_catalog_item_id uuid;
  v_quantity numeric(14,4);
  v_rate numeric(14,2);
  v_total numeric(16,2) := 0;
  v_sort integer := 0;
begin
  if requested_actor_id is null or requested_actor_id is distinct from (select auth.uid())
     or not public.current_user_has_company_permission(
       (select request.company_id from public.expense_requests request where request.id = requested_request_id),
       'expense_requests.initiate'
     ) then
    raise exception 'You do not have permission to initiate this expense request.' using errcode = '42501';
  end if;

  select * into request_row
  from public.expense_requests request
  where request.id = requested_request_id
  for update;
  if not found
     or request_row.status <> 'pending_administration_officer_initiation'
     or request_row.requisition_id is not null
     or request_row.deleted_at is not null then
    raise exception 'This expense request is not available for initiation.' using errcode = '42501';
  end if;

  select membership.branch_id into v_actor_branch_id
  from public.company_memberships membership
  where membership.company_id = request_row.company_id
    and membership.user_id = requested_actor_id
    and membership.status = 'active';
  if not found or (
    not public.current_user_is_main_branch_user(request_row.company_id)
    and v_actor_branch_id is distinct from request_row.branch_id
  ) then
    raise exception 'This expense request is outside your branch.' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
  into v_actor_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = requested_actor_id;

  perform 1 from public.companies where id = request_row.company_id for update;
  select coalesce(max((regexp_match(requisition_number, '(\d+)$'))[1]::integer), 0) + 1
  into v_seq
  from public.company_requisitions
  where company_id = request_row.company_id
    and requisition_number like 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-%';
  v_req_number := 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into public.company_requisitions (
    company_id, branch_id, requisition_number, title,
    department_id, department_name, currency_id, currency_code,
    service_provider_id, service_provider_name,
    expense_category_id, expense_category_name,
    due_date, notes, status, created_by,
    source_expense_request_id, source_expense_request_number,
    requested_by_user_id, requested_by_name,
    initiated_by_user_id, initiated_at, staged_visibility,
    currently_visible_to_permission, next_approver_stage, stage_entered_at
  )
  values (
    request_row.company_id, request_row.branch_id, v_req_number,
    request_row.request_number || ' - ' || request_row.expense_name,
    null, '', null, 'UGX', null, '',
    request_row.expense_category_id, coalesce(request_row.expense_category_name, ''),
    request_row.due_date,
    'Expense request submitted by ' || request_row.requested_by_name || E'\n' || request_row.purpose,
    'pending', requested_actor_id,
    request_row.id, request_row.request_number,
    request_row.created_by, request_row.requested_by_name,
    requested_actor_id, now(), true,
    case when request_row.line_manager_fallback then 'expense_requests.verify' else 'expense_requests.review' end,
    case when request_row.line_manager_fallback then 'finance_verification' else 'general_manager_review' end,
    now()
  )
  returning id into v_req_id;

  for v_item in select value from jsonb_array_elements(request_row.line_items)
  loop
    begin
      v_quantity := (v_item->>'quantity')::numeric(14,4);
      v_rate := (v_item->>'rate')::numeric(14,2);
      v_catalog_item_id := nullif(v_item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'An expense-request item has invalid catalog, quantity, or rate data.' using errcode = '22023';
    end;
    if length(btrim(coalesce(v_item->>'description', ''))) not between 1 and 200
       or v_quantity is null or v_quantity <= 0
       or v_rate is null or v_rate <= 0 then
      raise exception 'Each item needs its original description, positive quantity, and positive unit rate.' using errcode = '22023';
    end if;
    if v_catalog_item_id is not null and not exists (
      select 1 from public.company_expense_items item
      where item.id = v_catalog_item_id
        and item.company_id = request_row.company_id
    ) then
      raise exception 'An expense-request item no longer belongs to this company catalog.' using errcode = '22023';
    end if;

    insert into public.company_requisition_items (
      company_id, branch_id, requisition_id, catalog_item_id,
      description, quantity, rate, sort_order
    )
    values (
      request_row.company_id, request_row.branch_id, v_req_id, v_catalog_item_id,
      btrim(v_item->>'description'), v_quantity, v_rate, v_sort
    );
    v_total := v_total + round(v_quantity * v_rate, 2);
    v_sort := v_sort + 1;
  end loop;

  update public.company_requisitions
  set total_amount = round(v_total, 2)
  where id = v_req_id;

  return jsonb_build_object(
    'requisition_id', v_req_id,
    'requisition_number', v_req_number,
    'total_amount', round(v_total, 2)
  );
end;
$function$;

revoke all on function private.create_requisition_from_expense_request(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.initiate_expense_request_requisition(
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
  actor_name text;
  request_row public.expense_requests%rowtype;
  item jsonb;
  item_ordinality bigint;
  item_description text;
  item_quantity numeric(14,4);
  item_rate numeric(14,2);
  catalog_item_id uuid;
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

  select role.name
  into actor_role_name
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.company_id = request_row.company_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;
  if not found
    or not public.current_user_has_company_permission(request_row.company_id, 'expense_requests.initiate')
    or request_row.status <> 'pending_administration_officer_initiation'
    or request_row.requisition_id is not null
    or request_row.deleted_at is not null
    or not exists (
      select 1 from public.company_memberships membership
      where membership.company_id = request_row.company_id
        and membership.user_id = actor_id
        and membership.status = 'active'
        and (
          public.current_user_is_main_branch_user(request_row.company_id)
          or membership.branch_id = request_row.branch_id
        )
    ) then
    raise exception 'This request is not available for initiation.' using errcode = '42501';
  end if;

  if jsonb_array_length(requested_unit_rates) <> jsonb_array_length(request_row.line_items) then
    raise exception 'Enter one unit rate for every requested item.' using errcode = '22023';
  end if;

  item_ordinality := 0;
  for item in select value from jsonb_array_elements(request_row.line_items)
  loop
    item_description := nullif(trim(item->>'description'), '');
    begin
      item_quantity := (item->>'quantity')::numeric(14,4);
      item_rate := (requested_unit_rates ->> (item_ordinality::integer))::numeric(14,2);
      catalog_item_id := nullif(item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have a valid positive unit rate.' using errcode = '22023';
    end;
    if item_description is null or length(item_description) > 200
      or item_quantity is null or item_quantity <= 0
      or item_rate is null or item_rate <= 0 then
      raise exception 'Each item needs its original description, positive quantity, and positive unit rate.' using errcode = '22023';
    end if;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', item_rate,
      'catalog_item_id', catalog_item_id,
      'catalog_item_code', item->'catalog_item_code'
    ));
    item_ordinality := item_ordinality + 1;
  end loop;

  update public.expense_requests
  set amount = round((
        select sum((entry->>'quantity')::numeric * (entry->>'rate')::numeric)
        from jsonb_array_elements(normalized_items) entry
      ), 2),
      line_items = normalized_items
  where id = request_row.id;
  request_row.line_items := normalized_items;
  request_row.amount := round((
    select sum((entry->>'quantity')::numeric * (entry->>'rate')::numeric)
    from jsonb_array_elements(normalized_items) entry
  ), 2);
  if request_row.amount <= 0 or request_row.amount > 999999999999.99 then
    raise exception 'The request total must be greater than zero and within the supported limit.' using errcode = '22023';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
  into actor_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  requisition_result := private.create_requisition_from_expense_request(
    request_row.id,
    actor_id
  );
  new_requisition_id := (requisition_result->>'requisition_id')::uuid;
  new_requisition_number := requisition_result->>'requisition_number';
  if new_requisition_id is null or new_requisition_number is null then
    raise exception 'The linked requisition was not created successfully.' using errcode = 'P0002';
  end if;

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
    raise exception 'No active approver is available for the initiated requisition.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'requisitionId', new_requisition_id,
    'requisitionNumber', new_requisition_number
  );
end;
$function$;

revoke all on function public.submit_expense_request_with_items(uuid, text, text, uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.submit_expense_request_with_items(uuid, text, text, uuid, date, text, jsonb)
  to authenticated;
revoke all on function public.update_expense_request_before_initiation(uuid, text, text, uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.update_expense_request_before_initiation(uuid, text, text, uuid, date, text, jsonb)
  to authenticated;
revoke all on function public.initiate_expense_request_requisition(uuid, text, jsonb)
  from public, anon;
grant execute on function public.initiate_expense_request_requisition(uuid, text, jsonb)
  to authenticated;

create or replace function public.record_company_expense(
  p_company_id uuid,
  p_branch_id uuid,
  p_account_id uuid,
  p_expense_category_id uuid,
  p_description text,
  p_paid_to text,
  p_payment_method text,
  p_reference text,
  p_paid_at date,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_membership_branch_id uuid;
  v_is_main_branch boolean;
  v_account_branch_id uuid;
  v_expense_category_name text;
  v_expense_item_catalog_enabled boolean;
  v_expense_categories_enabled boolean;
  v_expense_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_description text;
  v_catalog_item_id uuid;
  v_quantity numeric(14,4);
  v_rate numeric(14,2);
  v_line_total numeric;
  v_sort_order integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not public.current_user_has_company_permission(p_company_id, 'finance.create') then
    raise exception 'You do not have permission to record company expenses.' using errcode = '42501';
  end if;

  select membership.branch_id
  into v_membership_branch_id
  from public.company_memberships as membership
  where membership.company_id = p_company_id
    and membership.user_id = v_user_id
    and membership.status = 'active';
  if not found then
    raise exception 'Active company membership not found.' using errcode = '42501';
  end if;

  select company.expense_item_catalog_enabled,
         company.expense_categories_enabled
  into v_expense_item_catalog_enabled, v_expense_categories_enabled
  from public.companies as company
  where company.id = p_company_id;
  if not found then
    raise exception 'Company not found.' using errcode = 'P0002';
  end if;

  v_is_main_branch := public.current_user_is_main_branch_user(p_company_id);
  if p_branch_id is not null and not exists (
    select 1
    from public.company_branches as branch
    where branch.id = p_branch_id
      and branch.company_id = p_company_id
  ) then
    raise exception 'Select a branch from this company.' using errcode = '22023';
  end if;
  if not v_is_main_branch and (
    v_membership_branch_id is null
    or p_branch_id is distinct from v_membership_branch_id
  ) then
    raise exception 'You can only record expenses for your assigned branch.' using errcode = '42501';
  end if;

  if p_description is null or length(btrim(p_description)) not between 1 and 500
     or coalesce(length(btrim(p_paid_to)), 0) > 200
     or p_payment_method not in ('Cash', 'Bank transfer', 'Mobile money', 'Cheque', 'Other')
     or p_reference is null or length(btrim(p_reference)) not between 1 and 100
     or p_paid_at is null then
    raise exception 'Enter valid expense details.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Add between 1 and 100 expense line items.' using errcode = '22023';
  end if;

  if p_expense_category_id is not null then
    select category.name
    into v_expense_category_name
    from public.expense_categories as category
    where category.id = p_expense_category_id
      and category.company_id = p_company_id
      and category.is_active;
    if v_expense_category_name is null then
      raise exception 'Select an active expense category for this company.' using errcode = '22023';
    end if;
  elsif v_expense_categories_enabled then
    raise exception 'Select an active expense category for this company.' using errcode = '22023';
  else
    v_expense_category_name := 'Uncategorized';
  end if;

  select account.branch_id
  into v_account_branch_id
  from public.company_accounts as account
  where account.id = p_account_id
    and account.company_id = p_company_id
    and account.status = 'active';
  if not found then
    raise exception 'Select an active account from this company.' using errcode = '22023';
  end if;
  if not v_is_main_branch and v_account_branch_id is distinct from v_membership_branch_id then
    raise exception 'Select an active account from your branch.' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    if length(v_description) not between 1 and 500 then
      raise exception 'Each expense item must have a description of 1 to 500 characters.' using errcode = '22023';
    end if;

    begin
      v_quantity := (v_item->>'quantity')::numeric(14,4);
      v_rate := (v_item->>'rate')::numeric(14,2);
      v_catalog_item_id := nullif(v_item->>'catalog_item_id', '')::uuid;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each expense item must have valid quantity, rate, and catalog data.' using errcode = '22023';
    end;
    if v_quantity is null or v_quantity <= 0 or v_rate is null or v_rate < 0 then
      raise exception 'Each expense item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;

    if not v_expense_item_catalog_enabled then
      v_catalog_item_id := null;
    elsif v_catalog_item_id is not null then
      if not exists (
        select 1
        from public.company_expense_items as catalog_item
        where catalog_item.id = v_catalog_item_id
          and catalog_item.company_id = p_company_id
          and catalog_item.is_active
          and lower(btrim(catalog_item.name)) = lower(v_description)
      ) then
        raise exception 'Select a matching active catalog item from this company.' using errcode = '22023';
      end if;
    else
      select catalog_item.id
      into v_catalog_item_id
      from public.company_expense_items as catalog_item
      where catalog_item.company_id = p_company_id
        and catalog_item.is_active
        and lower(btrim(catalog_item.name)) = lower(v_description)
      limit 1;
    end if;

    if v_expense_item_catalog_enabled
       and v_catalog_item_id is null
       and not public.current_user_has_company_permission(p_company_id, 'expense_items.custom') then
      raise exception 'Select an item from the company catalog or request permission to use a custom item.' using errcode = '42501';
    end if;

    v_line_total := round(v_quantity * v_rate, 2);
    if v_line_total > 999999999999.99 then
      raise exception 'An expense item exceeds the supported limit.' using errcode = '22023';
    end if;
    v_total := v_total + v_line_total;
    if v_total > 999999999999.99 then
      raise exception 'The expense total exceeds the supported limit.' using errcode = '22023';
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  if v_total <= 0 then
    raise exception 'Expense total must be greater than zero.' using errcode = '22023';
  end if;

  insert into public.company_expenses (
    company_id, branch_id, account_id, expense_category_id,
    expense_type, description, paid_to, amount, payment_method,
    reference, paid_at, created_by
  ) values (
    p_company_id, p_branch_id, p_account_id, p_expense_category_id,
    v_expense_category_name, btrim(p_description), btrim(coalesce(p_paid_to, '')),
    v_total, p_payment_method, btrim(p_reference), p_paid_at, v_user_id
  )
  returning id into v_expense_id;

  v_sort_order := 0;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := btrim(coalesce(v_item->>'description', ''));
    v_quantity := (v_item->>'quantity')::numeric(14,4);
    v_rate := (v_item->>'rate')::numeric(14,2);
    v_catalog_item_id := nullif(v_item->>'catalog_item_id', '')::uuid;
    if not v_expense_item_catalog_enabled then
      v_catalog_item_id := null;
    end if;

    insert into public.company_expense_line_items (
      company_id, branch_id, catalog_item_id, description,
      expense_id, quantity, rate, total_amount, sort_order
    ) values (
      p_company_id, p_branch_id, v_catalog_item_id, v_description,
      v_expense_id, v_quantity, v_rate, round(v_quantity * v_rate, 2), v_sort_order
    );
    v_sort_order := v_sort_order + 1;
  end loop;

  update public.company_account_transactions
  set branch_id = p_branch_id
  where company_id = p_company_id
    and source_type = 'company_expenses'
    and source_id = v_expense_id;

  return jsonb_build_object(
    'expense_id', v_expense_id,
    'reference', p_reference,
    'amount', v_total
  );
end;
$function$;

revoke all on function public.record_company_expense(uuid, uuid, uuid, uuid, text, text, text, text, date, jsonb)
  from public, anon;
grant execute on function public.record_company_expense(uuid, uuid, uuid, uuid, text, text, text, text, date, jsonb)
  to authenticated;