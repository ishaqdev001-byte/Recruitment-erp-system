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