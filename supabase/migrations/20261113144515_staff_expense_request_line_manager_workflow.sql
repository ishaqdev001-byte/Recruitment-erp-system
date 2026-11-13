insert into public.permissions (code, description)
values ('expense_requests.initiate', 'Initiate requisitions for approved staff expense requests')
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
    when 'Administration Officer' then array['expense_requests.initiate']
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

  if new.name = 'Administration Officer' then
    delete from public.role_permissions
    where role_id = new.id
      and company_id = new.company_id
      and permission_code in ('expense_requests.view', 'expense_requests.create');
  end if;

  return new;
end;
$$;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'expense_requests.initiate'
from public.company_roles role
where role.name = 'Administration Officer'
  and role.is_system_default
on conflict (role_id, permission_code) do nothing;

delete from public.role_permissions permission
using public.company_roles role
where permission.role_id = role.id
  and permission.company_id = role.company_id
  and role.name = 'Administration Officer'
  and permission.permission_code in ('expense_requests.view', 'expense_requests.create');

create or replace function public.prevent_administration_officer_expense_request_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.permission_code in ('expense_requests.view', 'expense_requests.create')
    and exists (
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

revoke all on function public.prevent_administration_officer_expense_request_access()
  from public, anon, authenticated;
drop trigger if exists role_permissions_prevent_administration_officer_expense_requests
  on public.role_permissions;
create trigger role_permissions_prevent_administration_officer_expense_requests
  before insert or update of role_id, company_id, permission_code
  on public.role_permissions
  for each row
  execute function public.prevent_administration_officer_expense_request_access();

alter table public.expense_requests
  add column line_manager_user_id uuid references auth.users (id) on delete set null,
  add column line_manager_comment text,
  add column line_manager_reviewed_at timestamptz,
  add column line_manager_fallback boolean not null default false,
  add column expense_category_id uuid,
  add column expense_category_name text not null default '',
  add column line_items jsonb not null default '[]'::jsonb,
  add column requisition_id uuid references public.company_requisitions (id) on delete set null,
  add column requisition_number text,
  add constraint expense_requests_category_company_fkey
    foreign key (expense_category_id, company_id)
    references public.expense_categories (id, company_id)
    on delete set null (expense_category_id);

alter table public.expense_requests
  drop constraint expense_requests_status_check,
  add constraint expense_requests_status_check
    check (status in (
      'pending_line_manager_review',
      'pending_administration_officer_initiation',
      'pending_general_manager_review',
      'pending_finance_verification',
      'pending_chairman_authorization',
      'authorized_pending_cashout',
      'paid',
      'rejected'
    )),
  drop constraint expense_requests_rejected_stage_check,
  add constraint expense_requests_rejected_stage_check
    check (rejected_stage in (
      'line_manager_review',
      'general_manager_review',
      'finance_verification',
      'chairman_authorization'
    )),
  add constraint expense_requests_line_items_array_check
    check (jsonb_typeof(line_items) = 'array');

create index expense_requests_line_manager_stage_idx
  on public.expense_requests (company_id, line_manager_user_id, status)
  where line_manager_user_id is not null;
create unique index expense_requests_requisition_id_key
  on public.expense_requests (requisition_id)
  where requisition_id is not null;

alter table public.company_requisitions
  add column source_expense_request_id uuid references public.expense_requests (id) on delete set null,
  add column source_expense_request_number text,
  add column requested_by_user_id uuid references auth.users (id) on delete set null,
  add column requested_by_name text not null default '',
  add column initiated_by_user_id uuid references auth.users (id) on delete set null,
  add column initiated_at timestamptz;

create unique index company_requisitions_source_expense_request_key
  on public.company_requisitions (source_expense_request_id)
  where source_expense_request_id is not null;

create or replace function public.current_user_is_linked_company_staff(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.company_memberships membership
      join public.company_staff_members staff
        on staff.company_id = membership.company_id
       and staff.linked_user_id = membership.user_id
       and staff.status = 'active'
      where membership.company_id = requested_company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function public.current_user_is_linked_company_staff(uuid)
  from public, anon;
grant execute on function public.current_user_is_linked_company_staff(uuid)
  to authenticated;

drop policy if exists "Expense requests visible with staged visibility enforcement"
  on public.expense_requests;
drop policy if exists "Expense requests are visible to permitted staff and their creator"
  on public.expense_requests;

create policy "Expense requests follow assigned approval visibility"
  on public.expense_requests for select to authenticated
  using (
    (
      created_by = (select auth.uid())
      and not exists (
        select 1
        from public.company_memberships membership
        join public.company_roles role
          on role.id = membership.role_id
         and role.company_id = membership.company_id
        where membership.company_id = expense_requests.company_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and role.name = 'Administration Officer'
      )
    )
    or (
      status = 'pending_line_manager_review'
      and (
        (
          line_manager_user_id = (select auth.uid())
          and public.current_user_is_linked_company_staff(company_id)
          and not exists (
            select 1
            from public.company_memberships membership
            join public.company_roles role
              on role.id = membership.role_id
             and role.company_id = membership.company_id
            where membership.company_id = expense_requests.company_id
              and membership.user_id = (select auth.uid())
              and membership.status = 'active'
              and role.name = 'Administration Officer'
          )
        )
        or (
          public.current_user_has_company_permission(company_id, 'expense_requests.review')
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
      and public.current_user_has_company_permission(company_id, 'expense_requests.initiate')
    )
    or (
      not exists (
        select 1
        from public.company_memberships membership
        join public.company_roles role
          on role.id = membership.role_id
         and role.company_id = membership.company_id
        where membership.company_id = expense_requests.company_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and role.name = 'Administration Officer'
      )
      and (
        (
          staged_visibility = true
          and currently_visible_to_permission is not null
          and public.current_user_has_company_permission(company_id, currently_visible_to_permission)
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
    )
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
      company_id, recipient_id, required_permission, category, title, body,
      source_type, source_id
    )
    select target_company_id, membership.user_id, 'expense_requests.view',
      'finance', notification_title, notification_body, 'expense_request', target_request_id
    from public.company_memberships membership
    where membership.company_id = target_company_id
      and membership.user_id = target_user_id
      and membership.status = 'active';
  else
    insert into public.workspace_notifications (
      company_id, recipient_id, required_permission, category, title, body,
      source_type, source_id
    )
    select target_company_id, membership.user_id, target_permission,
      'finance', notification_title, notification_body, 'expense_request', target_request_id
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

create or replace function private.can_deliver_workspace_notification(
  requested_company_id uuid,
  requested_user_id uuid,
  requested_permission text,
  requested_source_type text,
  requested_source_id uuid
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
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    where membership.company_id = requested_company_id
      and membership.user_id = requested_user_id
      and membership.status = 'active'
      and (
        (
          requested_permission = 'staff_chat.view'
          and requested_source_type = 'staff_chat.message'
          and exists (
            select 1
            from public.staff_chat_messages message
            where message.id = requested_source_id
              and message.company_id = requested_company_id
              and (message.recipient_id is null or message.recipient_id = requested_user_id)
          )
        )
        or (
          requested_permission = 'expense_requests.view'
          and requested_source_type = 'expense_request'
          and exists (
            select 1
            from public.expense_requests request
            where request.id = requested_source_id
              and request.company_id = requested_company_id
              and (
                request.line_manager_user_id = requested_user_id
                or request.created_by = requested_user_id
              )
              and role.name <> 'Administration Officer'
          )
        )
        or (
          requested_permission <> 'medical.alerts.view'
          and requested_permission <> 'staff_chat.view'
          and exists (
            select 1
            from public.role_permissions permission
            where permission.company_id = membership.company_id
              and permission.role_id = membership.role_id
              and permission.permission_code = requested_permission
          )
        )
        or (
          requested_permission = 'medical.alerts.view'
          and requested_source_type = 'medical.unfit-alert'
          and exists (
            select 1
            from public.medical_appointments appointment
            join public.companies company on company.id = appointment.company_id
            where appointment.id = requested_source_id
              and appointment.company_id = requested_company_id
              and (
                exists (
                  select 1
                  from public.role_permissions permission
                  where permission.company_id = membership.company_id
                    and permission.role_id = membership.role_id
                    and permission.permission_code = 'medical.alerts.view'
                )
                or requested_user_id = company.primary_admin_user_id
                or requested_user_id = appointment.created_by
                or lower(trim(role.name)) = 'supervisor'
              )
          )
        )
      )
  );
$$;

create or replace function public.submit_staff_expense_request(
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
as $$
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
  item_rate numeric(14,2);
  item_total numeric(16,2) := 0;
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
  if not found or actor_role_name = 'Administration Officer'
    or not public.current_user_is_linked_company_staff(requested_company_id) then
    raise exception 'Only active linked company staff may submit expense requests.'
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
    item_description := nullif(trim(item->>'description'), '');
    begin
      item_quantity := (item->>'quantity')::numeric(14,4);
      item_rate := (item->>'rate')::numeric(14,2);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Each item must have a valid quantity and rate.'
        using errcode = '22023';
    end;
    if item_description is null or length(item_description) > 200
      or item_quantity is null or item_quantity <= 0
      or item_rate is null or item_rate < 0 then
      raise exception 'Each item needs a description, positive quantity, and non-negative rate.'
        using errcode = '22023';
    end if;
    item_total := item_total + round(item_quantity * item_rate, 2);
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', item_rate
    ));
  end loop;

  item_total := round(item_total, 2);
  if item_total <= 0 or item_total > 999999999999.99 then
    raise exception 'The line items must total an amount greater than zero and within the supported limit.'
      using errcode = '22023';
  end if;

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
    and manager_role.name <> 'Administration Officer'
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
    requester_name, trim(requested_purpose), item_total, requested_due_date,
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
$$;

create or replace function public.transition_staff_expense_request(
  requested_request_id uuid,
  requested_action text,
  requested_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_row public.expense_requests%rowtype;
  actor_role_name text;
  actor_is_default boolean;
  actor_name text;
  recipient_count integer;
  requisition_result jsonb;
  new_requisition_id uuid;
  new_requisition_number text;
  next_status text;
  next_permission text;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(requested_comment, ''))) not between 1 and 2000 then
    raise exception 'Add a comment for this expense-request stage.'
      using errcode = '22023';
  end if;

  select role.name, role.is_system_default
  into actor_role_name, actor_is_default
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

  select * into request_row
  from public.expense_requests
  where id = requested_request_id
  for update;
  if not found then
    raise exception 'Expense request not found.' using errcode = 'P0002';
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
  into actor_name
  from auth.users auth_user
  left join public.profiles profile on profile.id = auth_user.id
  where auth_user.id = actor_id;

  if requested_action in ('line_manager_approve', 'line_manager_reject') then
    if request_row.status <> 'pending_line_manager_review'
      or (
        request_row.line_manager_user_id = actor_id
        and actor_role_name <> 'Administration Officer'
        and public.current_user_is_linked_company_staff(request_row.company_id)
      ) is not true and not (
        actor_role_name = 'General Manager'
        and public.current_user_has_company_permission(request_row.company_id, 'expense_requests.review')
        and (
          request_row.line_manager_fallback
          or not exists (
            select 1
            from public.company_staff_members staff
            join public.company_memberships membership
              on membership.company_id = staff.company_id
             and membership.user_id = staff.linked_user_id
             and membership.status = 'active'
            join public.company_roles manager_role
              on manager_role.id = membership.role_id
             and manager_role.company_id = membership.company_id
            where staff.company_id = request_row.company_id
              and staff.linked_user_id = request_row.line_manager_user_id
              and staff.status = 'active'
              and manager_role.name <> 'Administration Officer'
          )
        )
      ) then
      raise exception 'This request is not awaiting your line-manager review.'
        using errcode = '42501';
    end if;

    update public.expense_requests
    set line_manager_comment = trim(requested_comment),
        line_manager_reviewed_at = now(),
        general_manager_comment = case when request_row.line_manager_fallback then trim(requested_comment) else general_manager_comment end,
        general_manager_user_id = case when request_row.line_manager_fallback then actor_id else general_manager_user_id end,
        general_manager_reviewed_at = case when request_row.line_manager_fallback then now() else general_manager_reviewed_at end,
        status = case when requested_action = 'line_manager_approve'
          then 'pending_administration_officer_initiation' else 'rejected' end,
        rejected_stage = case when requested_action = 'line_manager_reject'
          then 'line_manager_review' else null end,
        currently_visible_to_permission = case when requested_action = 'line_manager_approve'
          then 'expense_requests.initiate' else null end,
        next_approver_id = null,
        next_approver_stage = case when requested_action = 'line_manager_approve'
          then 'administration_officer_initiation' else null end,
        stage_entered_at = now()
    where id = request_row.id;

    insert into public.approval_history (
      company_id, request_id, request_type, stage, action, actor_id,
      actor_name, actor_role, notes
    )
    values (
      request_row.company_id, request_row.id, 'expense', 'line_manager_review',
      case when requested_action = 'line_manager_approve' then 'approved' else 'rejected' end,
      actor_id, actor_name, actor_role_name, trim(requested_comment)
    );

    if requested_action = 'line_manager_approve' then
      insert into public.workspace_notifications (
        company_id, recipient_id, required_permission, category, title, body,
        source_type, source_id
      )
      select request_row.company_id, membership.user_id, 'expense_requests.initiate',
        'finance', 'Approved expense request awaiting requisition initiation',
        request_row.request_number || ' from ' || request_row.requested_by_name || ' is ready to initiate.',
        'expense_request', request_row.id
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
       and role.company_id = membership.company_id
      join public.role_permissions permission
        on permission.role_id = membership.role_id
       and permission.company_id = membership.company_id
       and permission.permission_code = 'expense_requests.initiate'
      where membership.company_id = request_row.company_id
        and membership.status = 'active'
        and role.name = 'Administration Officer'
        and role.is_system_default;
      get diagnostics recipient_count = row_count;
      if recipient_count = 0 then
        raise exception 'No active Administration Officer can initiate this request.'
          using errcode = 'P0002';
      end if;
    else
      perform public.notify_expense_request_recipients(
        request_row.company_id, request_row.id, null, request_row.created_by,
        'Expense request was rejected',
        request_row.request_number || ' was rejected during line-manager review.'
      );
    end if;

  elsif requested_action = 'initiate_requisition' then
    if actor_role_name <> 'Administration Officer'
      or actor_is_default is not true
      or not public.current_user_has_company_permission(request_row.company_id, 'expense_requests.initiate')
      or not public.current_user_has_company_permission(request_row.company_id, 'requisitions.create')
      or request_row.status <> 'pending_administration_officer_initiation'
      or request_row.requisition_id is not null then
      raise exception 'This request is not available for Administration Officer initiation.'
        using errcode = '42501';
    end if;

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
  else
    raise exception 'Choose a valid expense-request action.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'requisitionId', new_requisition_id,
    'requisitionNumber', new_requisition_number
  );
end;
$$;

revoke all on function public.submit_expense_request(uuid, text, text, text, numeric, date, text)
  from public, anon, authenticated;
grant execute on function public.submit_staff_expense_request(uuid, text, text, uuid, date, text, jsonb)
  to authenticated;
revoke all on function public.submit_staff_expense_request(uuid, text, text, uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.transition_staff_expense_request(uuid, text, text)
  to authenticated;
revoke all on function public.transition_staff_expense_request(uuid, text, text)
  from public, anon;

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

  if expected_status is null
    or (to_jsonb(new) - array['status', 'payment_status', 'amount_paid', 'updated_at'])
      is distinct from
       (to_jsonb(old) - array['status', 'payment_status', 'amount_paid', 'updated_at'])
    or new.status is distinct from expected_status
    or new.payment_status is distinct from expected_payment_status
    or new.amount_paid is distinct from expected_amount_paid then
    raise exception 'Linked expense-request requisitions are read-only; use the Expense Requests approval workflow.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_requisition_write() from public, anon, authenticated;
drop trigger if exists guard_linked_requisition_write on public.company_requisitions;
create trigger guard_linked_requisition_write
  before update on public.company_requisitions
  for each row execute function private.guard_linked_requisition_write();

create or replace function private.sync_expense_request_requisition_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requisition_status text;
begin
  if new.requisition_id is null or old.status is not distinct from new.status then
    return new;
  end if;

  requisition_status := case new.status
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

  if requisition_status is null then
    raise exception 'Unsupported linked expense-request status.' using errcode = '22023';
  end if;

  update public.company_requisitions
  set status = requisition_status,
      payment_status = case when new.status = 'paid' then 'paid' else 'unpaid' end,
      amount_paid = case when new.status = 'paid' then total_amount else 0 end
  where id = new.requisition_id
    and company_id = new.company_id
    and source_expense_request_id = new.id;

  return new;
end;
$$;

revoke all on function private.sync_expense_request_requisition_status()
  from public, anon, authenticated;
drop trigger if exists sync_expense_request_requisition_status
  on public.expense_requests;
create trigger sync_expense_request_requisition_status
  after update of status on public.expense_requests
  for each row execute function private.sync_expense_request_requisition_status();

create or replace function private.guard_linked_requisition_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_requisition_id uuid;
  target_company_id uuid;
begin
  if tg_op = 'DELETE' then
    target_requisition_id := old.requisition_id;
    target_company_id := old.company_id;
  else
    target_requisition_id := new.requisition_id;
    target_company_id := new.company_id;
  end if;

  if exists (
    select 1
    from public.company_requisitions requisition
    where requisition.id = target_requisition_id
      and requisition.company_id = target_company_id
      and requisition.source_expense_request_id is not null
  ) then
    raise exception 'Items on linked expense-request requisitions are read-only.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_requisition_items() from public, anon, authenticated;
drop trigger if exists guard_linked_requisition_items on public.company_requisition_items;
create trigger guard_linked_requisition_items
  before insert or update or delete on public.company_requisition_items
  for each row execute function private.guard_linked_requisition_items();

create or replace function private.guard_linked_requisition_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_requisition_id uuid;
  target_company_id uuid;
begin
  if tg_op = 'DELETE' then
    target_requisition_id := old.requisition_id;
    target_company_id := old.company_id;
  else
    target_requisition_id := new.requisition_id;
    target_company_id := new.company_id;
  end if;

  if exists (
    select 1
    from public.company_requisitions requisition
    where requisition.id = target_requisition_id
      and requisition.company_id = target_company_id
      and requisition.source_expense_request_id is not null
  ) then
    raise exception 'Linked expense-request requisitions are paid through the Expense Requests workflow.'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_requisition_payments() from public, anon, authenticated;
drop trigger if exists guard_linked_requisition_payments on public.requisition_payments;
create trigger guard_linked_requisition_payments
  before insert or update or delete on public.requisition_payments
  for each row execute function private.guard_linked_requisition_payments();