drop policy if exists "Members can view their assigned role permissions" on public.role_permissions;
create policy "Members can view their assigned role permissions" on public.role_permissions
  for select to authenticated using (
    exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = role_permissions.company_id
        and membership.role_id = role_permissions.role_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );
