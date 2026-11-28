create table public.recruit_admin_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 100),
  description text not null default '' check (length(description) <= 1000),
  price numeric(12, 2) not null default 0 check (price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year')),
  storage_limit_bytes bigint check (
    storage_limit_bytes is null or storage_limit_bytes >= 0
  ),
  features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruit_admin_company_controls (
  company_id uuid primary key references public.companies(id) on delete cascade,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'frozen', 'archived')),
  lifecycle_reason text check (
    lifecycle_reason is null or length(lifecycle_reason) <= 1000
  ),
  lifecycle_changed_by uuid references auth.users(id) on delete set null,
  lifecycle_changed_at timestamptz not null default now(),
  feature_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(feature_overrides) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruit_admin_membership_freeze_backups (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_status text not null check (original_status in ('active', 'invited')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.recruit_admin_company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id uuid not null references public.recruit_admin_plans(id) on delete restrict,
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  renewal_at timestamptz,
  is_current boolean not null default true,
  notes text not null default '' check (length(notes) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create unique index recruit_admin_company_current_subscription_idx
  on public.recruit_admin_company_subscriptions (company_id)
  where is_current;

create index recruit_admin_company_subscriptions_history_idx
  on public.recruit_admin_company_subscriptions (company_id, created_at desc);

create table public.recruit_admin_subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid references public.recruit_admin_company_subscriptions(id)
    on delete set null,
  invoice_number text not null unique
    check (length(btrim(invoice_number)) between 1 and 100),
  description text not null default '' check (length(description) <= 1000),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'partial', 'paid', 'void')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recruit_admin_subscription_invoices_company_idx
  on public.recruit_admin_subscription_invoices (company_id, issued_at desc);

create table public.recruit_admin_subscription_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.recruit_admin_subscription_invoices(id)
    on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (length(btrim(method)) between 2 and 100),
  reference text not null default '' check (length(reference) <= 200),
  notes text not null default '' check (length(notes) <= 1000),
  received_at timestamptz not null default now(),
  received_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index recruit_admin_subscription_payments_invoice_idx
  on public.recruit_admin_subscription_payments (invoice_id, received_at desc);

alter table public.recruit_admin_plans enable row level security;
alter table public.recruit_admin_company_controls enable row level security;
alter table public.recruit_admin_company_subscriptions enable row level security;
alter table public.recruit_admin_subscription_invoices enable row level security;
alter table public.recruit_admin_subscription_payments enable row level security;

revoke all on public.recruit_admin_plans,
  public.recruit_admin_company_controls,
  public.recruit_admin_membership_freeze_backups,
  public.recruit_admin_company_subscriptions,
  public.recruit_admin_subscription_invoices,
  public.recruit_admin_subscription_payments
  from public, anon, authenticated;
grant select, insert, update, delete on public.recruit_admin_plans,
  public.recruit_admin_company_controls,
  public.recruit_admin_membership_freeze_backups,
  public.recruit_admin_company_subscriptions,
  public.recruit_admin_subscription_invoices,
  public.recruit_admin_subscription_payments
  to service_role;

alter table public.recruit_admin_company_storage_allocations
  add column allocation_override boolean not null default false;

update public.recruit_admin_company_storage_allocations
set allocation_override = true
where allocated_bytes is not null
   or updated_by is not null;

create or replace function public.recruit_admin_current_user_company_access_allowed(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies company
    left join public.recruit_admin_company_controls controls
      on controls.company_id = company.id
    where company.id = requested_company_id
      and exists (
        select 1
        from public.company_memberships membership
        where membership.company_id = company.id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and (
            coalesce(controls.lifecycle_state, 'active') = 'active'
            or (
              coalesce(controls.lifecycle_state, 'active') = 'frozen'
              and company.primary_admin_user_id = (select auth.uid())
            )
          )
        )
  );
$$;

revoke all on function public.recruit_admin_current_user_company_access_allowed(uuid)
  from public, anon;
grant execute on function public.recruit_admin_current_user_company_access_allowed(uuid)
  to authenticated, service_role;

create or replace function public.recruit_admin_current_user_company_feature_enabled(
  requested_company_id uuid,
  requested_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with feature_settings as (
    select
      controls.feature_overrides ->> requested_feature as company_override,
      plan.features ->> requested_feature as plan_default,
      subscription.id is not null as has_subscription
    from public.companies company
    left join public.recruit_admin_company_controls controls
      on controls.company_id = company.id
    left join public.recruit_admin_company_subscriptions subscription
      on subscription.company_id = company.id
      and subscription.is_current
    left join public.recruit_admin_plans plan
      on plan.id = subscription.plan_id
    where company.id = requested_company_id
      and requested_feature in (
        'candidates',
        'projects',
        'users',
        'hr',
        'finance',
        'medical',
        'tasks',
        'communications',
        'reports',
        'ai'
      )
      and public.recruit_admin_current_user_company_access_allowed(company.id)
  )
  select coalesce(
    company_override,
    plan_default,
    case when has_subscription then 'false' else 'true' end
  )::boolean
  from feature_settings;
$$;

revoke all on function public.recruit_admin_current_user_company_feature_enabled(uuid, text)
  from public, anon;
grant execute on function public.recruit_admin_current_user_company_feature_enabled(uuid, text)
  to authenticated, service_role;

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
  select
    public.recruit_admin_current_user_company_access_allowed(requested_company_id)
    and exists (
      select 1
      from public.company_memberships membership
      join public.companies company
        on company.id = membership.company_id
      where membership.company_id = requested_company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and (
          company.primary_admin_user_id = (select auth.uid())
          or exists (
            select 1
            from public.company_roles role
            join public.role_permissions permission
              on permission.role_id = role.id
              and permission.company_id = role.company_id
            where role.id = membership.role_id
              and role.company_id = membership.company_id
              and permission.permission_code = requested_permission
              and not (
                role.name = 'Recruitment Agent'
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
          )
        )
    )
    and case
      when requested_permission like 'candidates.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'candidates')
      when requested_permission like 'projects.%'
        or requested_permission like 'suppliers.%'
        or requested_permission like 'employers.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'projects')
      when requested_permission like 'users.%'
        or requested_permission like 'agents.%'
        or requested_permission like 'staff.%'
        or requested_permission like 'staff.positions.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'users')
      when requested_permission like 'human_resources.%'
        or requested_permission like 'hr.%'
        or requested_permission like 'attendance.%'
        or requested_permission like 'leave.%'
        or requested_permission like 'payroll.%'
        or requested_permission like 'paychecks.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'hr')
      when requested_permission like 'finance.%'
        or requested_permission like 'accounts.%'
        or requested_permission like 'expense_requests.%'
        or requested_permission like 'expense_items.%'
        or requested_permission like 'expenses.%'
        or requested_permission like 'requisitions.%'
        or requested_permission like 'invoices.%'
        or requested_permission like 'receipts.%'
        or requested_permission like 'payments.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'finance')
      when requested_permission like 'medical.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'medical')
      when requested_permission like 'tasks.%'
        or requested_permission like 'approvals.%'
        or requested_permission like 'workflows.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'tasks')
      when requested_permission like 'communications.%'
        or requested_permission like 'sms.%'
        or requested_permission like 'whatsapp.%'
        or requested_permission like 'mail.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'communications')
      when requested_permission like 'reports.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'reports')
      when requested_permission like 'ai.%'
        then public.recruit_admin_current_user_company_feature_enabled(requested_company_id, 'ai')
      else true
    end;
$$;

revoke all on function public.current_user_has_company_permission(uuid, text)
  from public, anon;
grant execute on function public.current_user_has_company_permission(uuid, text)
  to authenticated, service_role;

create or replace function public.recruit_admin_set_company_lifecycle(
  requested_company_id uuid,
  requested_state text,
  requested_reason text,
  requested_actor uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  owner_user_id uuid;
begin
  if requested_state not in ('active', 'frozen', 'archived') then
    raise exception 'Company lifecycle state is invalid.';
  end if;
  if requested_reason is not null and length(requested_reason) > 1000 then
    raise exception 'Company lifecycle reason is too long.';
  end if;
  if not exists (
    select 1 from public.companies company
    where company.id = requested_company_id
  ) then
    raise exception 'Company not found.';
  end if;

  select company.primary_admin_user_id
  into owner_user_id
  from public.companies company
  where company.id = requested_company_id;

  insert into public.recruit_admin_company_controls (
    company_id,
    lifecycle_state,
    lifecycle_reason,
    lifecycle_changed_by,
    lifecycle_changed_at,
    updated_at
  )
  values (
    requested_company_id,
    requested_state,
    nullif(btrim(requested_reason), ''),
    requested_actor,
    now(),
    now()
  )
  on conflict (company_id) do update
  set lifecycle_state = excluded.lifecycle_state,
      lifecycle_reason = excluded.lifecycle_reason,
      lifecycle_changed_by = excluded.lifecycle_changed_by,
      lifecycle_changed_at = excluded.lifecycle_changed_at,
      updated_at = excluded.updated_at;

  if requested_state in ('frozen', 'archived') then
    insert into public.recruit_admin_membership_freeze_backups (
      company_id,
      user_id,
      original_status
    )
    select membership.company_id, membership.user_id, membership.status
    from public.company_memberships membership
    where membership.company_id = requested_company_id
      and membership.status in ('active', 'invited')
      and (
        requested_state = 'archived'
        or membership.user_id is distinct from owner_user_id
      )
    on conflict (company_id, user_id) do nothing;

    update public.company_memberships membership
    set status = 'disabled'
    where membership.company_id = requested_company_id
      and membership.status in ('active', 'invited')
      and (
        requested_state = 'archived'
        or membership.user_id is distinct from owner_user_id
      );

    if requested_state = 'frozen' then
      update public.company_memberships membership
      set status = backup.original_status
      from public.recruit_admin_membership_freeze_backups backup
      where backup.company_id = requested_company_id
        and backup.user_id = owner_user_id
        and membership.company_id = backup.company_id
        and membership.user_id = backup.user_id
        and membership.status = 'disabled';
      delete from public.recruit_admin_membership_freeze_backups backup
      where backup.company_id = requested_company_id
        and backup.user_id = owner_user_id;
    end if;
  else
    update public.company_memberships membership
    set status = backup.original_status
    from public.recruit_admin_membership_freeze_backups backup
    where backup.company_id = requested_company_id
      and membership.company_id = backup.company_id
      and membership.user_id = backup.user_id
      and membership.status = 'disabled';

    delete from public.recruit_admin_membership_freeze_backups backup
    where backup.company_id = requested_company_id;
  end if;
end;
$$;

revoke all on function public.recruit_admin_set_company_lifecycle(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.recruit_admin_set_company_lifecycle(uuid, text, text, uuid)
  to service_role;

create or replace function public.recruit_admin_assign_company_plan(
  requested_company_id uuid,
  requested_plan_id uuid,
  requested_status text,
  requested_renewal_at timestamptz,
  requested_actor uuid
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  current_subscription_id uuid;
  current_plan_id uuid;
  next_subscription_id uuid;
  plan_storage_limit bigint;
  allocation_is_override boolean;
  storage_was_measured boolean;
begin
  if requested_status not in ('trialing', 'active', 'past_due', 'cancelled') then
    raise exception 'Subscription status is invalid.';
  end if;
  if not exists (
    select 1 from public.companies company
    where company.id = requested_company_id
  ) then
    raise exception 'Company not found.';
  end if;

  select subscription.id, subscription.plan_id
  into current_subscription_id, current_plan_id
  from public.recruit_admin_company_subscriptions subscription
  where subscription.company_id = requested_company_id
    and subscription.is_current
  for update;

  if requested_plan_id is null then
    if current_subscription_id is not null then
      update public.recruit_admin_company_subscriptions
      set is_current = false,
          status = 'cancelled',
          ends_at = now(),
          updated_at = now()
      where id = current_subscription_id;
    end if;
    return null;
  end if;

  select plan.storage_limit_bytes
  into plan_storage_limit
  from public.recruit_admin_plans plan
  where plan.id = requested_plan_id
    and plan.is_active;
  if not found then
    raise exception 'An active subscription plan was not found.';
  end if;

  if plan_storage_limit is not null then
    select allocation.allocation_override, allocation.measured_at is not null
    into allocation_is_override, storage_was_measured
    from public.recruit_admin_company_storage_allocations allocation
    where allocation.company_id = requested_company_id;
    if not coalesce(allocation_is_override, false)
      and not coalesce(storage_was_measured, false)
    then
      raise exception 'Refresh company storage before assigning this plan limit.';
    end if;
  end if;

  if current_subscription_id is not null and current_plan_id = requested_plan_id then
    if requested_status = 'cancelled' then
      update public.recruit_admin_company_subscriptions
      set is_current = false,
          status = requested_status,
          ends_at = now(),
          updated_at = now()
      where id = current_subscription_id;
    else
      update public.recruit_admin_company_subscriptions
      set status = requested_status,
          renewal_at = requested_renewal_at,
          updated_at = now()
      where id = current_subscription_id;
    end if;
    return current_subscription_id;
  end if;

  if requested_status = 'cancelled' then
    raise exception 'A new subscription cannot start as cancelled.';
  end if;

  if current_subscription_id is not null then
    update public.recruit_admin_company_subscriptions
    set is_current = false,
        status = 'cancelled',
        ends_at = now(),
        updated_at = now()
    where id = current_subscription_id;
  end if;

  insert into public.recruit_admin_company_subscriptions (
    company_id,
    plan_id,
    status,
    renewal_at,
    created_by
  )
  values (
    requested_company_id,
    requested_plan_id,
    requested_status,
    requested_renewal_at,
    requested_actor
  )
  returning id into next_subscription_id;

  return next_subscription_id;
end;
$$;

revoke all on function public.recruit_admin_assign_company_plan(
  uuid, uuid, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.recruit_admin_assign_company_plan(
  uuid, uuid, text, timestamptz, uuid
) to service_role;

create or replace function public.recruit_admin_save_company_storage_measurements(
  requested_measurements jsonb
)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  measurement jsonb;
  saved_count integer := 0;
  measurement_company_id uuid;
  measurement_bytes bigint;
  measurement_file_count bigint;
  measurement_time timestamptz;
begin
  if jsonb_typeof(requested_measurements) <> 'array' then
    raise exception 'Storage measurements must be an array.';
  end if;

  for measurement in
    select value from jsonb_array_elements(requested_measurements)
  loop
    measurement_company_id := (measurement ->> 'company_id')::uuid;
    measurement_bytes := (measurement ->> 'used_bytes')::bigint;
    measurement_file_count := (measurement ->> 'file_count')::bigint;
    measurement_time := (measurement ->> 'measured_at')::timestamptz;
    if measurement_bytes < 0
      or measurement_file_count < 0
      or measurement_time is null
    then
      raise exception 'Storage measurement values are invalid.';
    end if;

    insert into public.recruit_admin_company_storage_allocations (
      company_id,
      used_bytes,
      file_count,
      measured_at,
      updated_at
    )
    values (
      measurement_company_id,
      measurement_bytes,
      measurement_file_count,
      measurement_time,
      now()
    )
    on conflict (company_id) do update
    set used_bytes = excluded.used_bytes,
        file_count = excluded.file_count,
        measured_at = excluded.measured_at,
        updated_at = excluded.updated_at;
    saved_count := saved_count + 1;
  end loop;

  return saved_count;
end;
$$;

revoke all on function public.recruit_admin_save_company_storage_measurements(jsonb)
  from public, anon, authenticated;
grant execute on function public.recruit_admin_save_company_storage_measurements(jsonb)
  to service_role;

create or replace function public.recruit_admin_enforce_membership_lifecycle()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  company_state text;
  owner_user_id uuid;
begin
  select company.primary_admin_user_id,
         coalesce(controls.lifecycle_state, 'active')
  into owner_user_id, company_state
  from public.companies company
  left join public.recruit_admin_company_controls controls
    on controls.company_id = company.id
  where company.id = new.company_id;

  if new.status in ('active', 'invited')
    and (
      company_state = 'archived'
      or (
        company_state = 'frozen'
        and new.user_id is distinct from owner_user_id
      )
    )
  then
    insert into public.recruit_admin_membership_freeze_backups (
      company_id,
      user_id,
      original_status
    )
    values (new.company_id, new.user_id, new.status)
    on conflict (company_id, user_id) do nothing;
    new.status := 'disabled';
  end if;

  return new;
end;
$$;

revoke all on function public.recruit_admin_enforce_membership_lifecycle()
  from public, anon, authenticated;

create trigger recruit_admin_enforce_membership_lifecycle
before insert or update on public.company_memberships
for each row
execute function public.recruit_admin_enforce_membership_lifecycle();

create or replace function public.recruit_admin_record_subscription_payment(
  requested_company_id uuid,
  requested_invoice_id uuid,
  requested_amount numeric,
  requested_method text,
  requested_reference text,
  requested_notes text,
  requested_actor uuid
)
returns table (payment_id uuid, invoice_status text)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  invoice_amount numeric(12, 2);
  invoice_state text;
  paid_amount numeric(12, 2);
  created_payment_id uuid;
begin
  if requested_amount is null or requested_amount <= 0
    or requested_method is null or length(btrim(requested_method)) not between 2 and 100
    or requested_reference is null or length(requested_reference) > 200
    or requested_notes is null or length(requested_notes) > 1000
  then
    raise exception 'Payment details are invalid.';
  end if;

  select invoice.amount, invoice.status
  into invoice_amount, invoice_state
  from public.recruit_admin_subscription_invoices invoice
  where invoice.id = requested_invoice_id
    and invoice.company_id = requested_company_id
  for update;

  if not found or invoice_state in ('paid', 'void') then
    raise exception 'An open invoice for this company was not found.';
  end if;

  select coalesce(sum(payment.amount), 0)
  into paid_amount
  from public.recruit_admin_subscription_payments payment
  where payment.invoice_id = requested_invoice_id;

  if paid_amount + requested_amount > invoice_amount then
    raise exception 'Payment exceeds the invoice balance.';
  end if;

  insert into public.recruit_admin_subscription_payments (
    invoice_id,
    amount,
    method,
    reference,
    notes,
    received_by
  )
  values (
    requested_invoice_id,
    requested_amount,
    btrim(requested_method),
    btrim(requested_reference),
    btrim(requested_notes),
    requested_actor
  )
  returning id into created_payment_id;

  paid_amount := paid_amount + requested_amount;
  invoice_state := case
    when paid_amount = invoice_amount then 'paid'
    else 'partial'
  end;
  update public.recruit_admin_subscription_invoices invoice
  set status = invoice_state, updated_at = now()
  where invoice.id = requested_invoice_id;

  return query select created_payment_id, invoice_state;
end;
$$;

revoke all on function public.recruit_admin_record_subscription_payment(
  uuid, uuid, numeric, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.recruit_admin_record_subscription_payment(
  uuid, uuid, numeric, text, text, text, uuid
) to service_role;

do $$
declare
  scoped_table record;
  feature_name text;
  second_feature_name text;
begin
  for scoped_table in
    select table_info.tablename
    from pg_catalog.pg_tables table_info
    where table_info.schemaname = 'public'
      and table_info.rowsecurity
      and exists (
        select 1
        from information_schema.columns column_info
        where column_info.table_schema = 'public'
          and column_info.table_name = table_info.tablename
          and column_info.column_name = 'company_id'
      )
  loop
    execute format(
      'drop policy if exists recruit_admin_company_lifecycle_gate on public.%I',
      scoped_table.tablename
    );
    execute format(
      'create policy recruit_admin_company_lifecycle_gate on public.%I as restrictive for all to authenticated using (public.recruit_admin_current_user_company_access_allowed(company_id)) with check (public.recruit_admin_current_user_company_access_allowed(company_id))',
      scoped_table.tablename
    );

    feature_name := case
      when scoped_table.tablename in (
        'candidates',
        'candidate_inquiries',
        'candidate_stage_events'
      ) then 'candidates'
      when scoped_table.tablename = 'candidate_project_submissions'
        then 'candidates'
      when scoped_table.tablename in (
        'projects',
        'employers',
        'suppliers'
      ) then 'projects'
      when scoped_table.tablename in (
        'company_memberships',
        'company_roles'
      ) then 'users'
      when scoped_table.tablename = 'company_staff_members'
        then 'users'
      when scoped_table.tablename in (
        'company_staff_documents',
        'attendance_records',
        'leave_requests',
        'company_leave_types',
        'leave_balances',
        'staff_hr_profile_reminders'
      ) then 'hr'
      when scoped_table.tablename in (
        'company_staff_paychecks',
        'company_staff_payroll_adjustments'
      ) then 'hr'
      when scoped_table.tablename in (
        'company_accounts',
        'company_account_transactions',
        'financial_receipts',
        'invoices',
        'invoice_payments',
        'invoice_deposit_allocations',
        'company_expenses',
        'company_requisitions',
        'requisition_payments',
        'expense_requests',
        'company_payable_invoices'
      ) then 'finance'
      when scoped_table.tablename in (
        'medical_appointments',
        'hospitals',
        'doctor_hospital_affiliations',
        'doctor_offline_status'
      ) then 'medical'
      when scoped_table.tablename in (
        'tasks',
        'task_lists',
        'task_progress_reports'
      ) then 'tasks'
      when scoped_table.tablename in (
        'sms_message_logs',
        'sms_contact_groups',
        'sms_contact_group_members',
        'staff_chat_messages',
        'whatsapp_connections',
        'whatsapp_messages',
        'workspace_communications',
        'mail_connections',
        'mail_message_logs'
      ) then 'communications'
      when scoped_table.tablename = 'ai_usage_logs' then 'ai'
      else null
    end;
      second_feature_name := case
        when scoped_table.tablename = 'candidate_project_submissions'
          then 'projects'
        when scoped_table.tablename = 'company_staff_members'
          then 'hr'
        when scoped_table.tablename in (
          'company_staff_paychecks',
          'company_staff_payroll_adjustments'
        ) then 'finance'
        else null
      end;

    if feature_name is not null then
      execute format(
        'drop policy if exists recruit_admin_module_feature_gate on public.%I',
        scoped_table.tablename
      );
      if second_feature_name is null then
        execute format(
          'create policy recruit_admin_module_feature_gate on public.%I as restrictive for all to authenticated using (public.recruit_admin_current_user_company_feature_enabled(company_id, %L)) with check (public.recruit_admin_current_user_company_feature_enabled(company_id, %L))',
          scoped_table.tablename,
          feature_name,
          feature_name
        );
      else
        execute format(
          'create policy recruit_admin_module_feature_gate on public.%I as restrictive for all to authenticated using (public.recruit_admin_current_user_company_feature_enabled(company_id, %L) and public.recruit_admin_current_user_company_feature_enabled(company_id, %L)) with check (public.recruit_admin_current_user_company_feature_enabled(company_id, %L) and public.recruit_admin_current_user_company_feature_enabled(company_id, %L))',
          scoped_table.tablename,
          feature_name,
          second_feature_name,
          feature_name,
          second_feature_name
        );
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.recruit_admin_reserve_company_storage(
  requested_company_id uuid,
  byte_delta bigint
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  effective_limit bigint;
begin
  if requested_company_id is null or byte_delta is null then
    raise exception 'Company and byte delta are required.';
  end if;

  insert into public.recruit_admin_company_storage_allocations (company_id)
  values (requested_company_id)
  on conflict (company_id) do nothing;

  select case
      when allocation.allocation_override then allocation.allocated_bytes
      else plan.storage_limit_bytes
    end
  into effective_limit
  from public.recruit_admin_company_storage_allocations allocation
  left join public.recruit_admin_company_subscriptions subscription
    on subscription.company_id = allocation.company_id
    and subscription.is_current
  left join public.recruit_admin_plans plan
    on plan.id = subscription.plan_id
  where allocation.company_id = requested_company_id;

  update public.recruit_admin_company_storage_allocations allocation
  set used_bytes = greatest(0, allocation.used_bytes + byte_delta),
      updated_at = now()
  where allocation.company_id = requested_company_id
    and (
      byte_delta <= 0
      or effective_limit is null
      or allocation.used_bytes + byte_delta <= effective_limit
    );

  return found;
end;
$$;

revoke all on function public.recruit_admin_reserve_company_storage(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.recruit_admin_reserve_company_storage(uuid, bigint)
  to service_role;