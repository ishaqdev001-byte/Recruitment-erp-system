-- Requisitions module: company departments, currencies, service providers (lookup tables)
-- and purchase requisitions with line items and a three-stage approval workflow.
-- Approval chain:
--   1. general_manager_status  — any user with requisitions.review
--   2. finance_status          — any user with requisitions.verify
--   3. director_status         — any user with requisitions.authorize (CEO / Owner)

-- ─── Company departments ────────────────────────────────────────────────────────

create table if not exists public.company_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 500),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_departments_name_uidx
  on public.company_departments (company_id, lower(name));

create index if not exists company_departments_company_active_idx
  on public.company_departments (company_id, is_active, name);

drop trigger if exists company_departments_set_updated_at on public.company_departments;
create trigger company_departments_set_updated_at before update on public.company_departments
  for each row execute function public.set_updated_at();

alter table public.company_departments enable row level security;
revoke all on public.company_departments from public, anon, authenticated;
grant select on public.company_departments to authenticated;

create policy "Departments visible to company members"
  on public.company_departments for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_departments.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- ─── Company currencies ─────────────────────────────────────────────────────────

create table if not exists public.company_currencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 10),
  name text not null check (length(trim(name)) between 1 and 100),
  symbol text not null default '' check (length(symbol) <= 10),
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_currencies_code_uidx
  on public.company_currencies (company_id, upper(code));

create unique index if not exists company_currencies_default_uidx
  on public.company_currencies (company_id)
  where is_default;

create index if not exists company_currencies_company_active_idx
  on public.company_currencies (company_id, is_active, code);

drop trigger if exists company_currencies_set_updated_at on public.company_currencies;
create trigger company_currencies_set_updated_at before update on public.company_currencies
  for each row execute function public.set_updated_at();

alter table public.company_currencies enable row level security;
revoke all on public.company_currencies from public, anon, authenticated;
grant select on public.company_currencies to authenticated;

create policy "Currencies visible to company members"
  on public.company_currencies for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_currencies.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- ─── Company service providers ──────────────────────────────────────────────────

create table if not exists public.company_service_providers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 150),
  contact_name text not null default '' check (length(contact_name) <= 150),
  phone text not null default '' check (length(phone) <= 50),
  email text not null default '' check (length(email) <= 254),
  address text not null default '' check (length(address) <= 500),
  notes text not null default '' check (length(notes) <= 1000),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_service_providers_name_uidx
  on public.company_service_providers (company_id, lower(name));

create index if not exists company_service_providers_company_active_idx
  on public.company_service_providers (company_id, is_active, name);

drop trigger if exists company_service_providers_set_updated_at on public.company_service_providers;
create trigger company_service_providers_set_updated_at before update on public.company_service_providers
  for each row execute function public.set_updated_at();

alter table public.company_service_providers enable row level security;
revoke all on public.company_service_providers from public, anon, authenticated;
grant select on public.company_service_providers to authenticated;

create policy "Service providers visible to company members"
  on public.company_service_providers for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_service_providers.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- ─── Requisitions ───────────────────────────────────────────────────────────────

create table if not exists public.company_requisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  requisition_number text not null,
  title text not null check (length(trim(title)) between 1 and 200),
  department_id uuid references public.company_departments (id) on delete set null,
  department_name text not null default '' check (length(department_name) <= 100),
  currency_id uuid references public.company_currencies (id) on delete set null,
  currency_code text not null default 'UGX' check (length(currency_code) <= 10),
  service_provider_id uuid references public.company_service_providers (id) on delete set null,
  service_provider_name text not null default '' check (length(service_provider_name) <= 150),
  due_date date not null,
  notes text not null default '' check (length(notes) <= 2000),
  total_amount numeric(16, 2) not null default 0 check (total_amount >= 0),

  -- Three-stage approval workflow
  status text not null default 'pending'
    check (status in ('pending', 'gm_review', 'finance_review', 'approved', 'rejected')),
  general_manager_status text not null default 'pending'
    check (general_manager_status in ('pending', 'approved', 'rejected')),
  general_manager_reviewed_by uuid references auth.users (id) on delete set null,
  general_manager_reviewed_at timestamptz,
  general_manager_note text not null default '' check (length(general_manager_note) <= 1000),

  finance_status text not null default 'pending'
    check (finance_status in ('pending', 'approved', 'rejected')),
  finance_reviewed_by uuid references auth.users (id) on delete set null,
  finance_reviewed_at timestamptz,
  finance_note text not null default '' check (length(finance_note) <= 1000),

  director_status text not null default 'pending'
    check (director_status in ('pending', 'approved', 'rejected')),
  director_reviewed_by uuid references auth.users (id) on delete set null,
  director_reviewed_at timestamptz,
  director_note text not null default '' check (length(director_note) <= 1000),

  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, requisition_number)
);

create index if not exists company_requisitions_company_status_idx
  on public.company_requisitions (company_id, status, created_at desc);
create index if not exists company_requisitions_created_by_idx
  on public.company_requisitions (company_id, created_by, created_at desc);

drop trigger if exists company_requisitions_set_updated_at on public.company_requisitions;
create trigger company_requisitions_set_updated_at before update on public.company_requisitions
  for each row execute function public.set_updated_at();

alter table public.company_requisitions enable row level security;
revoke all on public.company_requisitions from public, anon, authenticated;
grant select on public.company_requisitions to authenticated;

create policy "Requisitions visible to company members"
  on public.company_requisitions for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_requisitions.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- ─── Requisition line items ──────────────────────────────────────────────────────

create table if not exists public.company_requisition_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  requisition_id uuid not null references public.company_requisitions (id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 500),
  quantity numeric(14, 4) not null check (quantity > 0),
  rate numeric(14, 2) not null check (rate >= 0),
  total_amount numeric(16, 2) not null generated always as (quantity * rate) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_requisition_items_requisition_idx
  on public.company_requisition_items (company_id, requisition_id, sort_order);

drop trigger if exists company_requisition_items_set_updated_at on public.company_requisition_items;
create trigger company_requisition_items_set_updated_at before update on public.company_requisition_items
  for each row execute function public.set_updated_at();

alter table public.company_requisition_items enable row level security;
revoke all on public.company_requisition_items from public, anon, authenticated;
grant select on public.company_requisition_items to authenticated;

create policy "Requisition items visible to company members"
  on public.company_requisition_items for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_requisition_items.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- ─── Requisition notifications ───────────────────────────────────────────────────

create table if not exists public.requisition_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  requisition_id uuid not null references public.company_requisitions (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  stage text not null check (length(stage) <= 60),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 2000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists requisition_notifications_recipient_idx
  on public.requisition_notifications (company_id, recipient_id, is_read, created_at desc);
create index if not exists requisition_notifications_requisition_idx
  on public.requisition_notifications (company_id, requisition_id);

alter table public.requisition_notifications enable row level security;
revoke all on public.requisition_notifications from public, anon, authenticated;
grant select, update on public.requisition_notifications to authenticated;

create policy "Requisition notifications visible to recipient"
  on public.requisition_notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "Requisition notifications mark-read by recipient"
  on public.requisition_notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- ─── RPC: create_requisition ────────────────────────────────────────────────────

create or replace function public.create_requisition(
  p_company_id uuid,
  p_title text,
  p_department_id uuid,
  p_currency_id uuid,
  p_service_provider_id uuid,
  p_due_date date,
  p_notes text,
  p_items jsonb
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
begin
  -- Permission check
  if not public.current_user_has_company_permission(p_company_id, 'requisitions.create') then
    raise exception 'You do not have permission to create requisitions.' using errcode = '42501';
  end if;

  -- Resolve lookup names (snapshot them so they survive future renames)
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

  -- Generate requisition number REQ-YYYYMMDD-NNN
  select coalesce(max(
    (regexp_match(requisition_number, '(\d+)$'))[1]::integer
  ), 0) + 1
  into v_seq
  from public.company_requisitions
  where company_id = p_company_id
    and requisition_number like 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-%';

  v_req_number := 'REQ-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  -- Validate items
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;

  -- Insert requisition header
  insert into public.company_requisitions (
    company_id, requisition_number, title,
    department_id, department_name,
    currency_id, currency_code,
    service_provider_id, service_provider_name,
    due_date, notes,
    status, created_by
  ) values (
    p_company_id, v_req_number, trim(p_title),
    p_department_id, v_dept_name,
    p_currency_id, v_currency_code,
    p_service_provider_id, v_provider_name,
    p_due_date, coalesce(trim(p_notes), ''),
    'pending', auth.uid()
  )
  returning id into v_req_id;

  -- Insert line items
  for v_item in select jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'quantity')::numeric(14,4);
    v_item_rate := (v_item->>'rate')::numeric(14,2);
    if v_item_qty <= 0 or v_item_rate < 0 then
      raise exception 'Each item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;

    insert into public.company_requisition_items (
      company_id, requisition_id, description, quantity, rate, sort_order
    ) values (
      p_company_id, v_req_id,
      trim(v_item->>'description'),
      v_item_qty, v_item_rate, v_sort
    );
    v_total := v_total + (v_item_qty * v_item_rate);
    v_sort := v_sort + 1;
  end loop;

  -- Update total
  update public.company_requisitions
  set total_amount = v_total
  where id = v_req_id;

  return jsonb_build_object('requisition_id', v_req_id, 'requisition_number', v_req_number);
end;
$$;

-- ─── RPC: review_requisition ────────────────────────────────────────────────────

create or replace function public.review_requisition(
  p_company_id uuid,
  p_requisition_id uuid,
  p_stage text,   -- 'general_manager' | 'finance' | 'director'
  p_decision text, -- 'approved' | 'rejected'
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_permission text;
  v_next_status text;
begin
  -- Map stage to required permission
  v_permission := case p_stage
    when 'general_manager' then 'requisitions.review'
    when 'finance'         then 'requisitions.verify'
    when 'director'        then 'requisitions.authorize'
    else null
  end;

  if v_permission is null then
    raise exception 'Invalid review stage.' using errcode = '22023';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.' using errcode = '22023';
  end if;

  if not public.current_user_has_company_permission(p_company_id, v_permission) then
    raise exception 'You do not have permission to review at this stage.' using errcode = '42501';
  end if;

  select * into v_req
  from public.company_requisitions
  where id = p_requisition_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Requisition not found.' using errcode = 'P0002';
  end if;

  -- Validate stage ordering
  if p_stage = 'general_manager' and v_req.status <> 'pending' then
    raise exception 'This requisition is not awaiting General Manager review.' using errcode = '22023';
  end if;
  if p_stage = 'finance' and v_req.status <> 'gm_review' then
    raise exception 'This requisition has not been approved by the General Manager yet.' using errcode = '22023';
  end if;
  if p_stage = 'director' and v_req.status <> 'finance_review' then
    raise exception 'This requisition has not been verified by Finance yet.' using errcode = '22023';
  end if;

  -- Determine next overall status
  if p_decision = 'rejected' then
    v_next_status := 'rejected';
  elsif p_stage = 'general_manager' then
    v_next_status := 'gm_review';
  elsif p_stage = 'finance' then
    v_next_status := 'finance_review';
  else -- director approved = fully approved
    v_next_status := 'approved';
  end if;

  -- Apply
  if p_stage = 'general_manager' then
    update public.company_requisitions set
      general_manager_status = p_decision,
      general_manager_reviewed_by = auth.uid(),
      general_manager_reviewed_at = now(),
      general_manager_note = coalesce(trim(p_note), ''),
      status = v_next_status
    where id = p_requisition_id and company_id = p_company_id;
  elsif p_stage = 'finance' then
    update public.company_requisitions set
      finance_status = p_decision,
      finance_reviewed_by = auth.uid(),
      finance_reviewed_at = now(),
      finance_note = coalesce(trim(p_note), ''),
      status = v_next_status
    where id = p_requisition_id and company_id = p_company_id;
  else
    update public.company_requisitions set
      director_status = p_decision,
      director_reviewed_by = auth.uid(),
      director_reviewed_at = now(),
      director_note = coalesce(trim(p_note), ''),
      status = v_next_status
    where id = p_requisition_id and company_id = p_company_id;
  end if;

  return jsonb_build_object('status', v_next_status, 'decision', p_decision);
end;
$$;

-- ─── RPC: update_requisition_items ──────────────────────────────────────────────
-- Replaces all items on a pending requisition (creator only)

create or replace function public.update_requisition(
  p_company_id uuid,
  p_requisition_id uuid,
  p_title text,
  p_department_id uuid,
  p_currency_id uuid,
  p_service_provider_id uuid,
  p_due_date date,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_dept_name text := '';
  v_currency_code text := 'UGX';
  v_provider_name text := '';
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
begin
  select * into v_req
  from public.company_requisitions
  where id = p_requisition_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Requisition not found.' using errcode = 'P0002';
  end if;

  -- Only creator can edit, and only while pending
  if v_req.created_by <> auth.uid() then
    raise exception 'Only the creator can edit a requisition.' using errcode = '42501';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Only pending requisitions can be edited.' using errcode = '22023';
  end if;

  -- Resolve names
  if p_department_id is not null then
    select name into v_dept_name from public.company_departments
    where id = p_department_id and company_id = p_company_id and is_active;
    if v_dept_name is null then
      raise exception 'Selected department is not found or inactive.' using errcode = '22023';
    end if;
  end if;
  if p_currency_id is not null then
    select code into v_currency_code from public.company_currencies
    where id = p_currency_id and company_id = p_company_id and is_active;
    if v_currency_code is null then
      raise exception 'Selected currency is not found or inactive.' using errcode = '22023';
    end if;
  end if;
  if p_service_provider_id is not null then
    select name into v_provider_name from public.company_service_providers
    where id = p_service_provider_id and company_id = p_company_id and is_active;
    if v_provider_name is null then
      raise exception 'Selected service provider is not found or inactive.' using errcode = '22023';
    end if;
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;

  -- Delete old items and replace
  delete from public.company_requisition_items
  where requisition_id = p_requisition_id and company_id = p_company_id;

  for v_item in select jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'quantity')::numeric(14,4);
    v_item_rate := (v_item->>'rate')::numeric(14,2);
    if v_item_qty <= 0 or v_item_rate < 0 then
      raise exception 'Each item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;
    insert into public.company_requisition_items (
      company_id, requisition_id, description, quantity, rate, sort_order
    ) values (
      p_company_id, p_requisition_id,
      trim(v_item->>'description'),
      v_item_qty, v_item_rate, v_sort
    );
    v_total := v_total + (v_item_qty * v_item_rate);
    v_sort := v_sort + 1;
  end loop;

  update public.company_requisitions set
    title = trim(p_title),
    department_id = p_department_id,
    department_name = v_dept_name,
    currency_id = p_currency_id,
    currency_code = v_currency_code,
    service_provider_id = p_service_provider_id,
    service_provider_name = v_provider_name,
    due_date = p_due_date,
    notes = coalesce(trim(p_notes), ''),
    total_amount = v_total
  where id = p_requisition_id and company_id = p_company_id;

  return jsonb_build_object('requisition_id', p_requisition_id, 'total_amount', v_total);
end;
$$;

-- ─── Permissions: add requisitions permission codes ──────────────────────────────
-- requisitions.create  — staff can submit requisitions
-- requisitions.review  — General Manager reviews
-- requisitions.verify  — Finance / cashier verifies
-- requisitions.authorize — CEO / Owner / Director authorizes

insert into public.permissions (code, description) values
  ('requisitions.create',    'Submit purchase requisitions'),
  ('requisitions.review',    'First-stage review (General Manager)'),
  ('requisitions.verify',    'Second-stage financial verification (Finance/Cashier)'),
  ('requisitions.authorize', 'Final approval (CEO / Director / Owner)')
on conflict (code) do nothing;

-- Grant default permissions based on existing roles
-- General Manager gets review
insert into public.role_permissions (company_id, role_id, permission_code)
select cm.company_id, cr.id, 'requisitions.review'
from public.company_roles cr
join public.company_memberships cm on cm.company_id = cr.company_id
where cr.name in ('General Manager')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.company_id = cr.company_id
      and rp.role_id = cr.id
      and rp.permission_code = 'requisitions.review'
  )
on conflict do nothing;

-- Finance roles get verify + create
insert into public.role_permissions (company_id, role_id, permission_code)
select cr.company_id, cr.id, perms.permission_code
from public.company_roles cr
cross join (values ('requisitions.verify'), ('requisitions.create')) as perms(permission_code)
where cr.name in ('Finance Manager', 'Finance Officer', 'Finance User')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.company_id = cr.company_id
      and rp.role_id = cr.id
      and rp.permission_code = perms.permission_code
  )
on conflict do nothing;

-- CEO / Owner gets all
insert into public.role_permissions (company_id, role_id, permission_code)
select cr.company_id, cr.id, perms.permission_code
from public.company_roles cr
cross join (values ('requisitions.create'), ('requisitions.review'), ('requisitions.verify'), ('requisitions.authorize')) as perms(permission_code)
where cr.name in ('CEO', 'Company Owner / Primary Administrator', 'Administrator')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.company_id = cr.company_id
      and rp.role_id = cr.id
      and rp.permission_code = perms.permission_code
  )
on conflict do nothing;

-- All active members get create by default
insert into public.role_permissions (company_id, role_id, permission_code)
select cr.company_id, cr.id, 'requisitions.create'
from public.company_roles cr
where not exists (
    select 1 from public.role_permissions rp
    where rp.company_id = cr.company_id
      and rp.role_id = cr.id
      and rp.permission_code = 'requisitions.create'
  )
on conflict do nothing;
