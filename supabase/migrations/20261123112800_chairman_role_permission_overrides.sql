create or replace function public.prevent_non_examiner_medical_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role public.company_roles%rowtype;
  has_primary_admin_override boolean;
begin
  if new.permission_code not in (
    'medical.view', 'medical.update', 'medical_documents.view'
  ) then
    return new;
  end if;

  select exists (
    select 1
    from app_private.company_role_permission_overrides permission_override
    where permission_override.transaction_id = pg_catalog.txid_current()
      and permission_override.role_id = new.role_id
      and permission_override.company_id = new.company_id
  )
  into has_primary_admin_override;

  if has_primary_admin_override then
    return new;
  end if;

  select role.*
  into target_role
  from public.company_roles role
  where role.id = new.role_id
    and role.company_id = new.company_id;

  if not found or not target_role.is_system_default
    or lower(trim(target_role.name)) not in ('doctor', 'medical examiner') then
    return null;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_administration_officer_expense_request_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  has_primary_admin_override boolean;
begin
  if new.permission_code not in (
    'expense_requests.view', 'expense_requests.create'
  ) then
    return new;
  end if;

  select exists (
    select 1
    from app_private.company_role_permission_overrides permission_override
    where permission_override.transaction_id = pg_catalog.txid_current()
      and permission_override.role_id = new.role_id
      and permission_override.company_id = new.company_id
  )
  into has_primary_admin_override;

  if has_primary_admin_override then
    return new;
  end if;

  if exists (
    select 1
    from public.company_roles role
    where role.id = new.role_id
      and role.company_id = new.company_id
      and role.name = 'Administration Officer'
  ) then
    return null;
  end if;

  return new;
end;
$$;

create or replace function public.current_user_has_company_permission(
  requested_company_id uuid,
  requested_permission text
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
    join public.companies company
      on company.id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and company.primary_admin_user_id = membership.user_id
  ) or exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and role_permission.permission_code = requested_permission
      and not (
        lower(trim(role.name)) = 'recruitment agent'
        and (
          requested_permission = 'human_resources.view'
          or requested_permission like 'attendance.%'
          or requested_permission like 'approvals.%'
          or requested_permission like 'communications.%'
          or requested_permission like 'drive.%'
          or requested_permission like 'finance.%'
          or requested_permission like 'leave.%'
          or requested_permission like 'requisitions.%'
        )
      )
  );
$$;

drop policy if exists "Expense requests follow assigned approval visibility"
  on public.expense_requests;

create policy "Expense requests follow assigned approval visibility"
  on public.expense_requests for select to authenticated
  using (
    created_by = (select auth.uid())
    or (
      status = 'pending_line_manager_review'
      and (
        (
          line_manager_user_id = (select auth.uid())
          and public.current_user_is_linked_company_staff(company_id)
        )
        or (
          public.current_user_has_company_permission(
            company_id, 'expense_requests.review'
          )
          and exists (
            select 1
            from public.company_memberships membership
            join public.company_roles role
              on role.id = membership.role_id
             and role.company_id = membership.company_id
            where membership.company_id = expense_requests.company_id
              and membership.user_id = (select auth.uid())
              and membership.status = 'active'
              and role.name = 'General Manager'
              and (
                line_manager_fallback
                or not exists (
                  select 1
                  from public.company_staff_members staff
                  join public.company_memberships manager_membership
                    on manager_membership.company_id = staff.company_id
                   and manager_membership.user_id = staff.linked_user_id
                   and manager_membership.status = 'active'
                  join public.company_roles manager_role
                    on manager_role.id = manager_membership.role_id
                   and manager_role.company_id = manager_membership.company_id
                  where staff.company_id = expense_requests.company_id
                    and staff.linked_user_id = expense_requests.line_manager_user_id
                    and staff.status = 'active'
                    and manager_role.name <> 'Administration Officer'
                )
              )
          )
        )
      )
    )
    or (
      status = 'pending_administration_officer_initiation'
      and public.current_user_has_company_permission(
        company_id, 'expense_requests.initiate'
      )
    )
    or (
      (
        staged_visibility = true
        and currently_visible_to_permission is not null
        and public.current_user_has_company_permission(
          company_id, currently_visible_to_permission
        )
      )
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
    )
  );

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
  if not found
    or (
      lower(btrim(actor_role_name)) = 'administration officer'
      and not public.current_user_has_company_permission(
        requested_company_id, 'expense_requests.create'
      )
    )
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
      and not public.current_user_has_company_permission(
        requested_company_id, 'expense_items.custom'
      ) then
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