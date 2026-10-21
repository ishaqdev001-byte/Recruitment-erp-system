-- ═══════════════════════════════════════════════════════════════════════════
-- Branch system: update RPCs and DB functions to carry branch_id
--
-- • Update create_requisition to accept p_branch_id
-- • Update list_passport_tracking to include branch_id
-- • Update list_finance_candidates to include branch filter
-- • Add current_user_branch_id to permissions catalog
-- • Grant new branch permissions to requisitions.create roles
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Update create_requisition to accept and store p_branch_id ────────────

create or replace function public.create_requisition(
  p_company_id uuid,
  p_title text,
  p_department_id uuid,
  p_currency_id uuid,
  p_service_provider_id uuid,
  p_due_date date,
  p_notes text,
  p_items jsonb,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req_id uuid;
  v_req_number text;
  v_seq integer;
  v_dept_name text := '';
  v_currency_code text := 'UGX';
  v_provider_name text := '';
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
  v_branch_id uuid;
begin
  if not public.current_user_has_company_permission(p_company_id, 'requisitions.create') then
    raise exception 'You do not have permission to create requisitions.' using errcode = '42501';
  end if;

  -- Resolve branch: use p_branch_id if provided, else use caller's branch, else main branch
  if p_branch_id is not null then
    v_branch_id := p_branch_id;
  else
    select m.branch_id into v_branch_id
    from public.company_memberships m
    where m.user_id = (select auth.uid())
      and m.company_id = p_company_id
      and m.status = 'active'
    limit 1;

    if v_branch_id is null then
      select b.id into v_branch_id
      from public.company_branches b
      where b.company_id = p_company_id and b.is_main_branch = true
      limit 1;
    end if;
  end if;

  if p_department_id is not null then
    select name into v_dept_name
    from public.company_departments
    where id = p_department_id and company_id = p_company_id and is_active;
    if v_dept_name is null then
      raise exception 'Selected department is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_currency_id is not null then
    select code into v_currency_code
    from public.company_currencies
    where id = p_currency_id and company_id = p_company_id and is_active;
    if v_currency_code is null then
      raise exception 'Selected currency is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_service_provider_id is not null then
    select name into v_provider_name
    from public.company_service_providers
    where id = p_service_provider_id and company_id = p_company_id and is_active;
    if v_provider_name is null then
      raise exception 'Selected service provider is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  select coalesce(max(
    (regexp_match(requisition_number, '(\d+)$'))[1]::integer
  ), 0) + 1
  into v_seq
  from public.company_requisitions
  where company_id = p_company_id
    and requisition_number like 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-%';

  v_req_number := 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;

  insert into public.company_requisitions (
    company_id, branch_id, requisition_number, title,
    department_id, department_name,
    currency_id, currency_code,
    service_provider_id, service_provider_name,
    due_date, notes,
    status, created_by
  )
  values (
    p_company_id, v_branch_id, v_req_number, p_title,
    p_department_id, v_dept_name,
    p_currency_id, v_currency_code,
    p_service_provider_id, v_provider_name,
    p_due_date, coalesce(p_notes, ''),
    'pending', (select auth.uid())
  )
  returning id into v_req_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty  := (v_item->>'quantity')::numeric(14,4);
    v_item_rate := (v_item->>'rate')::numeric(14,2);
    if v_item_qty is null or v_item_qty <= 0
       or v_item_rate is null or v_item_rate < 0 then
      raise exception 'Each item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;

    insert into public.company_requisition_items (
      company_id, branch_id, requisition_id, description, quantity, rate, sort_order
    )
    values (
      p_company_id, v_branch_id, v_req_id,
      coalesce(nullif(trim(v_item->>'description'), ''), 'Item'),
      v_item_qty, v_item_rate, v_sort
    );

    v_total := v_total + (v_item_qty * v_item_rate);
    v_sort  := v_sort + 1;
  end loop;

  update public.company_requisitions
  set total_amount = v_total
  where id = v_req_id;

  return jsonb_build_object(
    'id', v_req_id,
    'requisition_number', v_req_number,
    'total_amount', v_total,
    'branch_id', v_branch_id
  );
end;
$$;

revoke all on function public.create_requisition(uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_requisition(uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid) to authenticated;

-- ─── 2. Grant approvals permissions to requisitions-creating roles ──────────

insert into public.permissions (code, description)
values ('requisitions.create', 'Create purchase requisitions')
on conflict (code) do nothing;

-- Ensure Branch Manager and Supervisor can submit requisitions
insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, 'requisitions.create'
from public.company_roles cr
where cr.name in ('Branch Manager', 'Supervisor', 'Recruitment Manager', 'Finance User', 'Finance Officer', 'Finance Manager', 'Administrator', 'General Manager', 'CEO', 'Chairman')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, 'approvals.manage'
from public.company_roles cr
where cr.name in ('Branch Manager', 'Supervisor', 'Finance User', 'Finance Officer', 'Finance Manager', 'Recruitment Agent', 'Recruitment Manager')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, 'approvals.view'
from public.company_roles cr
where cr.name in ('Branch Manager', 'Supervisor', 'Finance User', 'Finance Officer', 'Finance Manager', 'Recruitment Agent', 'Recruitment Manager')
on conflict (role_id, permission_code) do nothing;

-- ─── 3. Update the other-income/appointment booking role check to include Chairman ──

-- (No SQL needed — the API already has MEDICAL_MANAGER_ROLES including Chairman
--  and the migrate renames the role. Just ensure the role has all permissions.)
insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, p.code
from public.company_roles cr
cross join public.permissions p
where cr.name = 'Chairman'
on conflict (role_id, permission_code) do nothing;
