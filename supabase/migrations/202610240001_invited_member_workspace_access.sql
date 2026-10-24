drop policy if exists "Active members can view their company identity" on public.companies;
create policy "Active members can view their company identity" on public.companies
  for select to authenticated using (
    exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = companies.id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );

drop policy if exists "Active members can view their assigned role" on public.company_roles;
create policy "Active members can view their assigned role" on public.company_roles
  for select to authenticated using (
    exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = company_roles.company_id
        and membership.role_id = company_roles.id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    )
  );
