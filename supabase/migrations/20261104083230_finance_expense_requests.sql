insert into public.permissions (code, description)
values
  ('expense_requests.view', 'View company expense requests'),
  ('expense_requests.create', 'Create company expense requests'),
  ('expense_requests.review', 'Review company expense requests'),
  ('expense_requests.verify', 'Verify company expense requests'),
  ('expense_requests.authorize', 'Authorize company expense requests'),
  ('expense_requests.cashout', 'Pay authorized company expense requests')
on conflict (code) do nothing;

create or replace function public.seed_expense_request_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  permission_codes text[];
begin
  permission_codes := case new.name
    when 'Administration Officer' then array['expense_requests.view', 'expense_requests.create']
    when 'General Manager' then array['expense_requests.view', 'expense_requests.review']
    when 'Finance Manager' then array['expense_requests.view', 'expense_requests.verify', 'expense_requests.cashout']
    when 'Finance Officer' then array['expense_requests.view', 'expense_requests.verify']
    when 'Chairman' then array['expense_requests.view', 'expense_requests.authorize']
    when 'Company Owner / Primary Administrator' then array['expense_requests.view', 'expense_requests.authorize']
    else array[]::text[]
  end;

  if new.is_system_default and cardinality(permission_codes) > 0 then
    insert into public.role_permissions (role_id, company_id, permission_code)
    select new.id, new.company_id, permission_code
    from unnest(permission_codes) as permission_code
    on conflict (role_id, permission_code) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.seed_expense_request_role_permissions()
  from public, anon, authenticated;

drop trigger if exists company_roles_seed_expense_request_permissions
  on public.company_roles;
create trigger company_roles_seed_expense_request_permissions
  after insert or update of name, is_system_default on public.company_roles
  for each row
  execute function public.seed_expense_request_role_permissions();

insert into public.company_roles (company_id, name, description, is_system_default)
select company.id, 'Administration Officer',
  'Administers company operations, records, permissions, and user access.',
  true
from public.companies company
on conflict (company_id, name) do update
set description = excluded.description,
    is_system_default = true;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name = 'Administration Officer'
  and role.is_system_default
  and permission.code <> 'reports.view'
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join (values
  ('Chairman', 'expense_requests.view'),
  ('Chairman', 'expense_requests.authorize'),
  ('Company Owner / Primary Administrator', 'expense_requests.view'),
  ('Company Owner / Primary Administrator', 'expense_requests.authorize'),
  ('General Manager', 'expense_requests.view'),
  ('General Manager', 'expense_requests.review'),
  ('Finance Manager', 'expense_requests.view'),
  ('Finance Manager', 'expense_requests.verify'),
  ('Finance Manager', 'expense_requests.cashout'),
  ('Finance Officer', 'expense_requests.view'),
  ('Finance Officer', 'expense_requests.verify'),
  ('Administration Officer', 'expense_requests.view'),
  ('Administration Officer', 'expense_requests.create')
) as permission(role_name, code)
join public.permissions on permissions.code = permission.code
where role.name = permission.role_name
  and role.is_system_default
on conflict (role_id, permission_code) do nothing;

create table public.expense_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  branch_id uuid references public.company_branches (id) on delete restrict,
  request_number text generated always as (
    'ER-' || upper(substr(replace(id::text, '-', ''), 1, 10))
  ) stored,
  expense_name text not null check (length(trim(expense_name)) between 1 and 200),
  requested_by_name text not null check (length(trim(requested_by_name)) between 1 and 200),
  purpose text not null check (length(trim(purpose)) between 1 and 2000),
  amount numeric(14, 2) not null check (amount > 0),
  due_date date not null,
  request_comment text not null check (length(trim(request_comment)) between 1 and 2000),
  status text not null default 'pending_general_manager_review'
    check (status in (
      'pending_general_manager_review',
      'pending_finance_verification',
      'pending_chairman_authorization',
      'authorized_pending_cashout',
      'paid',
      'rejected'
    )),
  rejected_stage text check (rejected_stage in (
    'general_manager_review',
    'finance_verification',
    'chairman_authorization'
  )),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  general_manager_comment text,
  general_manager_user_id uuid references auth.users (id) on delete set null,
  general_manager_reviewed_at timestamptz,
  finance_comment text,
  finance_user_id uuid references auth.users (id) on delete set null,
  finance_verified_at timestamptz,
  chairman_comment text,
  chairman_user_id uuid references auth.users (id) on delete set null,
  chairman_authorized_at timestamptz,
  cashout_comment text,
  cashout_user_id uuid references auth.users (id) on delete set null,
  cashed_out_at timestamptz,
  cashout_account_id uuid references public.company_accounts (id) on delete restrict,
  company_expense_id uuid references public.company_expenses (id) on delete restrict,
  unique (company_id, request_number)
);

create index expense_requests_company_status_created_idx
  on public.expense_requests (company_id, status, created_at desc);
create index expense_requests_company_creator_created_idx
  on public.expense_requests (company_id, created_by, created_at desc);

alter table public.expense_requests enable row level security;
revoke all on public.expense_requests from public, anon, authenticated;
grant select on public.expense_requests to authenticated;
grant all on public.expense_requests to service_role;

create policy "Expense requests are visible to permitted staff and their creator"
  on public.expense_requests for select to authenticated
  using (
    created_by = (select auth.uid())
    or public.current_user_has_company_permission(company_id, 'expense_requests.view')
    or public.current_user_has_company_permission(company_id, 'expense_requests.review')
    or public.current_user_has_company_permission(company_id, 'expense_requests.verify')
    or public.current_user_has_company_permission(company_id, 'expense_requests.authorize')
    or public.current_user_has_company_permission(company_id, 'expense_requests.cashout')
  );

create or replace function public.notify_expense_request_recipients(
  target_company_id uuid,
  target_request_id uuid,
  target_permission text,
  target_user_id uuid,
  notification_title text,
  notification_body text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if target_user_id is not null then
    insert into public.workspace_notifications (
      company_id, recipient_id, required_permission, category, title, body
    )
    select target_company_id, membership.user_id, 'expense_requests.view',
      'finance', notification_title, notification_body
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_user_id
      and membership.status = 'active';
  else
    insert into public.workspace_notifications (
      company_id, recipient_id, required_permission, category, title, body
    )
    select target_company_id, membership.user_id, target_permission,
      'finance', notification_title, notification_body
    from public.company_memberships membership
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
      and role_permission.company_id = membership.company_id
      and role_permission.permission_code = target_permission
    join public.company_roles role
      on role.id = membership.role_id
      and role.company_id = membership.company_id
    where membership.company_id = target_company_id
      and membership.status = 'active'
      and (
        (target_permission = 'expense_requests.review' and role.name = 'General Manager')
        or (
          target_permission = 'expense_requests.verify'
          and role.name in ('Finance Manager', 'Finance Officer', 'Finance User')
        )
        or (
          target_permission = 'expense_requests.authorize'
          and role.name in ('Chairman', 'Company Owner / Primary Administrator')
        )
        or (target_permission = 'expense_requests.cashout' and role.name = 'Finance Manager')
      );
  end if;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.notify_expense_request_recipients(uuid, uuid, text, uuid, text, text)
  from public, anon, authenticated;

create or replace function public.submit_expense_request(
  requested_company_id uuid,
  requested_expense_name text,
  requested_by_name text,
  requested_purpose text,
  requested_amount numeric,
  requested_due_date date,
  requested_comment text
)
returns table (request_id uuid, request_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role_name text;
  actor_is_default boolean;
  actor_branch_id uuid;
  inserted_request public.expense_requests%rowtype;
  recipient_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_expense_name, ''))) not between 1 and 200
    or length(trim(coalesce(requested_by_name, ''))) not between 1 and 200
    or length(trim(coalesce(requested_purpose, ''))) not between 1 and 2000
    or length(trim(coalesce(requested_comment, ''))) not between 1 and 2000
    or requested_amount is null or requested_amount <= 0
    or requested_amount > 999999999999.99
    or requested_due_date is null then
    raise exception 'Enter a valid expense name, requester, purpose, amount, due date, and comment.'
      using errcode = '22023';
  end if;

  select membership.branch_id, role.name, role.is_system_default
  into actor_branch_id, actor_role_name, actor_is_default
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
    and role.company_id = membership.company_id
  where membership.company_id = requested_company_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  if not found or actor_role_name <> 'Administration Officer'
    or actor_is_default is not true
    or not public.current_user_has_company_permission(requested_company_id, 'expense_requests.create') then
    raise exception 'Only the Administration Officer can create expense requests.'
      using errcode = '42501';
  end if;

  insert into public.expense_requests (
    company_id, branch_id, expense_name, requested_by_name, purpose,
    amount, due_date, request_comment, created_by
  ) values (
    requested_company_id, actor_branch_id, trim(requested_expense_name),
    trim(requested_by_name), trim(requested_purpose),
    round(requested_amount, 2), requested_due_date, trim(requested_comment), actor_id
  )
  returning * into inserted_request;

  recipient_count := public.notify_expense_request_recipients(
    requested_company_id, inserted_request.id, 'expense_requests.review', null,
    'Expense request awaiting General Manager review',
    inserted_request.request_number || ' - ' || inserted_request.expense_name || ' requires your review.'
  );
  if recipient_count = 0 then
    raise exception 'No active General Manager has expense-request review access.'
      using errcode = 'P0002';
  end if;

  return query select inserted_request.id, inserted_request.request_number;
end;
$$;

create or replace function public.transition_expense_request(
  requested_request_id uuid,
  requested_action text,
  requested_comment text,
  requested_account_id uuid default null,
  requested_payment_method text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_record public.expense_requests%rowtype;
  actor_role_name text;
  actor_branch_id uuid;
  actor_is_main_branch boolean;
  has_permission boolean;
  recipient_count integer;
  payment_method text := coalesce(requested_payment_method, 'Cash');
  inserted_expense_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_comment, ''))) not between 1 and 2000 then
    raise exception 'Add a comment for this expense-request stage.'
      using errcode = '22023';
  end if;

  select membership.branch_id, role.name
  into actor_branch_id, actor_role_name
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
    and role.company_id = membership.company_id
  join public.expense_requests request
    on request.company_id = membership.company_id
  where request.id = requested_request_id
    and membership.user_id = actor_id
    and membership.status = 'active'
  limit 1;
  if not found then
    raise exception 'Expense request or active company membership not found.'
      using errcode = 'P0002';
  end if;

  select * into request_record
  from public.expense_requests
  where id = requested_request_id
  for update;
  if not found then
    raise exception 'Expense request not found.' using errcode = 'P0002';
  end if;

  if requested_action in ('general_manager_approve', 'general_manager_reject') then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.review')
    into has_permission;
    if not has_permission or actor_role_name <> 'General Manager'
      or request_record.status <> 'pending_general_manager_review' then
      raise exception 'This request is not awaiting your General Manager review.'
        using errcode = '42501';
    end if;
    update public.expense_requests set
      general_manager_comment = trim(requested_comment),
      general_manager_user_id = actor_id,
      general_manager_reviewed_at = now(),
      status = case when requested_action = 'general_manager_approve'
        then 'pending_finance_verification' else 'rejected' end,
      rejected_stage = case when requested_action = 'general_manager_reject'
        then 'general_manager_review' else null end
    where id = request_record.id;

    if requested_action = 'general_manager_approve' then
      recipient_count := public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, 'expense_requests.verify', null,
        'Expense request awaiting Finance verification',
        request_record.request_number || ' - ' || request_record.expense_name || ' requires Finance verification.'
      );
      if recipient_count = 0 then
        raise exception 'No active Finance user has expense-request verification access.'
          using errcode = 'P0002';
      end if;
    else
      perform public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, null, request_record.created_by,
        'Expense request was not approved',
        request_record.request_number || ' was rejected during General Manager review.'
      );
    end if;
  elsif requested_action in ('finance_verify', 'finance_reject') then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.verify')
    into has_permission;
    if not has_permission
      or actor_role_name not in ('Finance Manager', 'Finance Officer', 'Finance User')
      or request_record.status <> 'pending_finance_verification' then
      raise exception 'This request is not awaiting Finance verification.'
        using errcode = '42501';
    end if;
    update public.expense_requests set
      finance_comment = trim(requested_comment),
      finance_user_id = actor_id,
      finance_verified_at = now(),
      status = case when requested_action = 'finance_verify'
        then 'pending_chairman_authorization' else 'rejected' end,
      rejected_stage = case when requested_action = 'finance_reject'
        then 'finance_verification' else null end
    where id = request_record.id;

    if requested_action = 'finance_verify' then
      recipient_count := public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, 'expense_requests.authorize', null,
        'Expense request awaiting Chairman authorization',
        request_record.request_number || ' - ' || request_record.expense_name || ' is ready for authorization.'
      );
      if recipient_count = 0 then
        raise exception 'No active Chairman has expense-request authorization access.'
          using errcode = 'P0002';
      end if;
    else
      perform public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, null, request_record.created_by,
        'Expense request was not verified',
        request_record.request_number || ' was rejected during Finance verification.'
      );
    end if;
  elsif requested_action in ('chairman_authorize', 'chairman_reject') then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.authorize')
      or exists (
        select 1 from public.companies company
        where company.id = request_record.company_id
          and company.primary_admin_user_id = actor_id
      )
    into has_permission;
    if not has_permission or actor_role_name not in ('Chairman', 'Company Owner / Primary Administrator')
      or request_record.status <> 'pending_chairman_authorization' then
      raise exception 'This request is not awaiting Chairman authorization.'
        using errcode = '42501';
    end if;
    update public.expense_requests set
      chairman_comment = trim(requested_comment),
      chairman_user_id = actor_id,
      chairman_authorized_at = now(),
      status = case when requested_action = 'chairman_authorize'
        then 'authorized_pending_cashout' else 'rejected' end,
      rejected_stage = case when requested_action = 'chairman_reject'
        then 'chairman_authorization' else null end
    where id = request_record.id;

    if requested_action = 'chairman_authorize' then
      recipient_count := public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, 'expense_requests.cashout', null,
        'Authorized expense ready for cash-out',
        request_record.request_number || ' - ' || request_record.expense_name || ' is authorized and ready for payment.'
      );
      if recipient_count = 0 then
        raise exception 'No active Finance Manager has expense-request cash-out access.'
          using errcode = 'P0002';
      end if;
    else
      perform public.notify_expense_request_recipients(
        request_record.company_id, request_record.id, null, request_record.created_by,
        'Expense request was not authorized',
        request_record.request_number || ' was rejected by the Chairman.'
      );
    end if;
  elsif requested_action = 'cashout' then
    select public.current_user_has_company_permission(request_record.company_id, 'expense_requests.cashout')
    into has_permission;
    if not has_permission or actor_role_name <> 'Finance Manager'
      or request_record.status <> 'authorized_pending_cashout' then
      raise exception 'This authorized request is not available for Finance Manager cash-out.'
        using errcode = '42501';
    end if;
    if requested_account_id is null then
      raise exception 'Select an active company account for this cash-out.'
        using errcode = '22023';
    end if;
    if payment_method <> all(array['Cash', 'Bank transfer', 'Mobile money', 'Cheque', 'Other']) then
      raise exception 'Select a valid payment method.' using errcode = '22023';
    end if;

    select public.current_user_is_main_branch_user(request_record.company_id)
    into actor_is_main_branch;

    insert into public.company_expenses (
      company_id, branch_id, account_id, expense_type, description,
      paid_to, amount, payment_method, reference, paid_at, created_by
    )
    select request_record.company_id, request_record.branch_id, account.id,
      left(request_record.expense_name, 100), left(request_record.purpose, 500),
      request_record.requested_by_name, request_record.amount, payment_method,
      request_record.request_number, current_date, actor_id
    from public.company_accounts account
    where account.id = requested_account_id
      and account.company_id = request_record.company_id
      and account.status = 'active'
      and (
        actor_is_main_branch
        or account.branch_id = actor_branch_id
      )
    returning id into inserted_expense_id;
    if inserted_expense_id is null then
      raise exception 'Select an active account available to this expense request.'
        using errcode = '22023';
    end if;

    update public.expense_requests set
      cashout_comment = trim(requested_comment),
      cashout_user_id = actor_id,
      cashed_out_at = now(),
      cashout_account_id = requested_account_id,
      company_expense_id = inserted_expense_id,
      status = 'paid'
    where id = request_record.id;

    perform public.notify_expense_request_recipients(
      request_record.company_id, request_record.id, null, request_record.created_by,
      'Expense request has been paid',
      request_record.request_number || ' - ' || request_record.expense_name || ' has been paid.'
    );
  else
    raise exception 'Choose a valid expense-request action.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'requestId', request_record.id,
    'requestNumber', request_record.request_number
  );
end;
$$;

revoke all on function public.submit_expense_request(uuid, text, text, text, numeric, date, text)
  from public, anon;
grant execute on function public.submit_expense_request(uuid, text, text, text, numeric, date, text)
  to authenticated;
revoke all on function public.transition_expense_request(uuid, text, text, uuid, text)
  from public, anon;
grant execute on function public.transition_expense_request(uuid, text, text, uuid, text)
  to authenticated;