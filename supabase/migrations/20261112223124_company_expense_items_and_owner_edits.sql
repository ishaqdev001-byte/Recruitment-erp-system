create table public.company_expense_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint company_expense_items_id_company_id_key unique (id, company_id)
);

create unique index company_expense_items_company_name_key
  on public.company_expense_items (company_id, lower(btrim(name)));

alter table public.company_expense_items enable row level security;
revoke all on table public.company_expense_items from public, anon, authenticated;
grant all on table public.company_expense_items to service_role;

alter table public.company_requisition_items
  add column catalog_item_id uuid;

alter table public.company_requisition_items
  add constraint company_requisition_items_catalog_item_company_fkey
  foreign key (catalog_item_id, company_id)
  references public.company_expense_items (id, company_id)
  on delete set null (catalog_item_id);

create index company_requisition_items_catalog_item_idx
  on public.company_requisition_items (company_id, catalog_item_id)
  where catalog_item_id is not null;

alter table public.company_expenses
  add constraint company_expenses_id_company_id_key unique (id, company_id);

create table public.company_expense_line_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  expense_id uuid not null,
  branch_id uuid references public.company_branches(id) on delete set null,
  catalog_item_id uuid,
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity numeric(14,4) not null check (quantity > 0),
  rate numeric(14,2) not null check (rate >= 0),
  total_amount numeric(16,2) not null check (total_amount >= 0),
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  constraint company_expense_line_items_expense_company_fkey
    foreign key (expense_id, company_id)
    references public.company_expenses (id, company_id)
    on delete cascade,
  constraint company_expense_line_items_catalog_item_company_fkey
    foreign key (catalog_item_id, company_id)
    references public.company_expense_items (id, company_id)
    on delete set null (catalog_item_id)
);

create index company_expense_line_items_expense_idx
  on public.company_expense_line_items (company_id, expense_id, sort_order);

alter table public.company_expense_line_items enable row level security;
revoke all on table public.company_expense_line_items from public, anon, authenticated;
grant all on table public.company_expense_line_items to service_role;

create or replace function private.attach_company_expense_catalog_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.catalog_item_id is null then
    select item.id
    into new.catalog_item_id
    from public.company_expense_items as item
    where item.company_id = new.company_id
      and lower(btrim(item.name)) = lower(btrim(new.description));
  end if;

  return new;
end;
$function$;

revoke all on function private.attach_company_expense_catalog_item() from public, anon, authenticated;

create trigger company_requisition_items_attach_catalog_item
before insert or update of description on public.company_requisition_items
for each row
execute function private.attach_company_expense_catalog_item();

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

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Expense items must be provided as a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Add between 1 and 100 expense line items.' using errcode = '22023';
  end if;

  select category.name
  into v_expense_category_name
  from public.expense_categories as category
  where category.id = p_expense_category_id
    and category.company_id = p_company_id
    and category.is_active;
  if v_expense_category_name is null then
    raise exception 'Select an active expense category for this company.' using errcode = '22023';
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
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each expense item must have a valid quantity and rate.' using errcode = '22023';
    end;
    if v_quantity is null or v_quantity <= 0 or v_rate is null or v_rate < 0 then
      raise exception 'Each expense item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;

    v_catalog_item_id := null;
    if nullif(v_item->>'catalog_item_id', '') is not null then
      begin
        v_catalog_item_id := (v_item->>'catalog_item_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Select a valid company catalog item.' using errcode = '22023';
      end;
      if not exists (
        select 1
        from public.company_expense_items as catalog_item
        where catalog_item.id = v_catalog_item_id
          and catalog_item.company_id = p_company_id
      ) then
        raise exception 'The selected item does not belong to this company.' using errcode = '22023';
      end if;
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
    v_line_total := round(v_quantity * v_rate, 2);
    v_catalog_item_id := nullif(v_item->>'catalog_item_id', '')::uuid;

    insert into public.company_expense_line_items (
      company_id, branch_id, catalog_item_id, description,
      expense_id, quantity, rate, total_amount, sort_order
    ) values (
      p_company_id, p_branch_id, v_catalog_item_id, v_description,
      v_expense_id, v_quantity, v_rate, v_line_total, v_sort_order
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

revoke all on function public.record_company_expense(uuid, uuid, uuid, uuid, text, text, text, text, date, jsonb) from public, anon;
grant execute on function public.record_company_expense(uuid, uuid, uuid, uuid, text, text, text, text, date, jsonb) to authenticated;

create or replace function public.update_company_agent_details(
  p_company_id uuid,
  p_agent_user_id uuid,
  p_display_name text,
  p_phone text,
  p_branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_primary_admin_user_id uuid;
  v_branch_name text;
  v_old_name text;
  v_matching_agents integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select company.primary_admin_user_id
  into v_primary_admin_user_id
  from public.companies as company
  where company.id = p_company_id;
  if not found or v_primary_admin_user_id is distinct from (select auth.uid()) then
    raise exception 'Only the company Chairman can edit agent details.' using errcode = '42501';
  end if;
  if p_agent_user_id is null or p_agent_user_id = (select auth.uid()) then
    raise exception 'Select a company agent to edit.' using errcode = '22023';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 1 and 200
     or coalesce(length(btrim(p_phone)), 0) > 100 then
    raise exception 'Enter a valid agent name and phone number.' using errcode = '22023';
  end if;

  select branch.name
  into v_branch_name
  from public.company_branches as branch
  where branch.id = p_branch_id
    and branch.company_id = p_company_id
    and branch.status = 'active';
  if v_branch_name is null then
    raise exception 'Select an active branch from this company.' using errcode = '22023';
  end if;

  select profile.display_name
  into v_old_name
  from public.company_memberships as membership
  join public.company_roles as role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  left join public.profiles as profile
    on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and membership.user_id = p_agent_user_id
    and lower(btrim(role.name)) = 'recruitment agent'
  for update of membership;
  if not found then
    raise exception 'Selected user is not a Recruitment Agent in this company.' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_matching_agents
  from public.company_memberships as membership
  join public.company_roles as role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  join public.profiles as profile
    on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and membership.user_id <> p_agent_user_id
    and lower(btrim(role.name)) = 'recruitment agent'
    and lower(btrim(profile.display_name)) = lower(btrim(v_old_name));

  update public.company_memberships
  set branch_id = p_branch_id
  where company_id = p_company_id
    and user_id = p_agent_user_id;

  update public.profiles
  set display_name = btrim(p_display_name),
      phone = btrim(coalesce(p_phone, '')),
      branch = v_branch_name,
      updated_at = now()
  where id = p_agent_user_id;
  if not found then
    raise exception 'Agent profile not found.' using errcode = 'P0002';
  end if;

  update public.candidates
  set agent_name = btrim(p_display_name)
  where company_id = p_company_id
    and agent_user_id = p_agent_user_id;

  if v_old_name is not null and v_matching_agents = 0 then
    update public.candidates
    set agent_name = btrim(p_display_name)
    where company_id = p_company_id
      and agent_user_id is null
      and lower(btrim(agent_name)) = lower(btrim(v_old_name));
  end if;
end;
$function$;

revoke all on function public.update_company_agent_details(uuid, uuid, text, text, uuid) from public, anon;
grant execute on function public.update_company_agent_details(uuid, uuid, text, text, uuid) to authenticated;