create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint expense_categories_id_company_id_key unique (id, company_id)
);

create unique index expense_categories_company_name_key
  on public.expense_categories (company_id, lower(btrim(name)));

create index expense_categories_company_active_name_idx
  on public.expense_categories (company_id, is_active, name);

alter table public.expense_categories enable row level security;
revoke all on table public.expense_categories from public, anon, authenticated;
grant all on table public.expense_categories to service_role;

insert into public.expense_categories (company_id, name)
select company_id, min(btrim(expense_type))
from public.company_expenses
where length(btrim(expense_type)) between 1 and 100
group by company_id, lower(btrim(expense_type));

alter table public.company_expenses
  add column expense_category_id uuid;

alter table public.company_expenses
  add constraint company_expenses_expense_category_company_fkey
  foreign key (expense_category_id, company_id)
  references public.expense_categories (id, company_id)
  on delete set null (expense_category_id);

update public.company_expenses as expense
set expense_category_id = category.id
from public.expense_categories as category
where category.company_id = expense.company_id
  and lower(btrim(category.name)) = lower(btrim(expense.expense_type))
  and length(btrim(expense.expense_type)) between 1 and 100;

create index company_expenses_category_company_idx
  on public.company_expenses (expense_category_id, company_id);

alter table public.company_requisitions
  add column expense_category_id uuid,
  add column expense_category_name text not null default '';

alter table public.company_requisitions
  add constraint company_requisitions_expense_category_company_fkey
  foreign key (expense_category_id, company_id)
  references public.expense_categories (id, company_id)
  on delete set null (expense_category_id);

create index company_requisitions_category_company_idx
  on public.company_requisitions (expense_category_id, company_id);

drop function if exists public.create_requisition(uuid, text, uuid, uuid, uuid, date, text, jsonb);
drop function if exists public.create_requisition(uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid);

create function public.create_requisition(
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
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
begin
  if auth.uid() is null
     or not public.current_user_has_company_permission(p_company_id, 'requisitions.create') then
    raise exception 'You do not have permission to create requisitions.' using errcode = '42501';
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

  select category.name into v_category_name
  from public.expense_categories as category
  where category.id = p_expense_category_id
    and category.company_id = p_company_id
    and category.is_active;
  if v_category_name is null then
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

  select coalesce(max((regexp_match(requisition_number, '(\d+)$'))[1]::integer), 0) + 1
  into v_seq
  from public.company_requisitions
  where company_id = p_company_id
    and requisition_number like 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-%';

  v_req_number := 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;

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
    p_expense_category_id, v_category_name,
    p_due_date, coalesce(trim(p_notes), ''), 'pending', (select auth.uid())
  )
  returning id into v_req_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'quantity')::numeric(14,4);
    v_item_rate := (v_item->>'rate')::numeric(14,2);
    if v_item_qty is null or v_item_qty <= 0 or v_item_rate is null or v_item_rate < 0 then
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

revoke all on function public.create_requisition(uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.create_requisition(uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid, uuid) to authenticated;

drop function if exists public.update_requisition(uuid, uuid, text, uuid, uuid, uuid, date, text, jsonb);

create function public.update_requisition(
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
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
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
  if v_req.status <> 'pending' then
    raise exception 'Only pending requisitions can be edited.' using errcode = '22023';
  end if;

  select category.name into v_category_name
  from public.expense_categories as category
  where category.id = p_expense_category_id
    and category.company_id = p_company_id
    and category.is_active;
  if v_category_name is null then
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

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;

  delete from public.company_requisition_items
  where requisition_id = p_requisition_id and company_id = p_company_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'quantity')::numeric(14,4);
    v_item_rate := (v_item->>'rate')::numeric(14,2);
    if v_item_qty is null or v_item_qty <= 0 or v_item_rate is null or v_item_rate < 0 then
      raise exception 'Each item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;
    insert into public.company_requisition_items (
      company_id, requisition_id, description, quantity, rate, sort_order
    )
    values (
      p_company_id, p_requisition_id,
      coalesce(nullif(trim(v_item->>'description'), ''), 'Item'),
      v_item_qty, v_item_rate, v_sort
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
      expense_category_name = v_category_name,
      due_date = p_due_date,
      notes = coalesce(trim(p_notes), ''),
      total_amount = v_total
  where id = p_requisition_id and company_id = p_company_id;

  return jsonb_build_object('requisition_id', p_requisition_id, 'total_amount', v_total);
end;
$function$;

revoke all on function public.update_requisition(uuid, uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid) from public, anon;
grant execute on function public.update_requisition(uuid, uuid, text, uuid, uuid, uuid, date, text, jsonb, uuid) to authenticated;