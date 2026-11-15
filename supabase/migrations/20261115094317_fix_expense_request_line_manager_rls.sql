create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated, service_role;
grant usage on schema app_private to authenticated;

alter default privileges in schema app_private
  revoke execute on functions from public;

create or replace function app_private.has_active_non_admin_line_manager(
  requested_company_id uuid,
  requested_manager_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.current_user_has_company_permission(
      requested_company_id,
      'expense_requests.review'
    )
    and exists (
      select 1
      from public.company_memberships reviewer_membership
      join public.company_roles reviewer_role
        on reviewer_role.id = reviewer_membership.role_id
       and reviewer_role.company_id = reviewer_membership.company_id
      where reviewer_membership.company_id = requested_company_id
        and reviewer_membership.user_id = (select auth.uid())
        and reviewer_membership.status = 'active'
        and reviewer_role.name = 'General Manager'
    )
    and exists (
      select 1
      from public.company_staff_members staff
      join public.company_memberships manager_membership
        on manager_membership.company_id = staff.company_id
       and manager_membership.user_id = staff.linked_user_id
       and manager_membership.status = 'active'
      join public.company_roles manager_role
        on manager_role.id = manager_membership.role_id
       and manager_role.company_id = manager_membership.company_id
      where staff.company_id = requested_company_id
        and staff.linked_user_id = requested_manager_user_id
        and staff.status = 'active'
        and manager_role.name <> 'Administration Officer'
    );
$$;

revoke all on function app_private.has_active_non_admin_line_manager(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app_private.has_active_non_admin_line_manager(uuid, uuid)
  to authenticated;

drop policy if exists "Expense requests follow assigned approval visibility"
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
                or not app_private.has_active_non_admin_line_manager(
                  expense_requests.company_id,
                  expense_requests.line_manager_user_id
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