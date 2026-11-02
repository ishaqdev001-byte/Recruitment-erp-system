drop policy if exists "Medical appointments are tenant and permission scoped"
  on public.medical_appointments;
create policy "Medical appointments are tenant and permission scoped"
  on public.medical_appointments
  for select to authenticated
  using (
    (
      public.current_user_has_company_permission(company_id, 'finance.view')
      or public.current_user_has_company_permission(company_id, 'medical.view')
    )
    and public.current_user_can_see_branch(company_id, branch_id)
  );

drop policy if exists "Authorized users can book medical appointments"
  on public.medical_appointments;
create policy "Authorized users can book medical appointments"
  on public.medical_appointments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.current_user_has_company_permission(company_id, 'candidates.create')
      or public.current_user_has_company_permission(company_id, 'medical.update')
    )
    and public.current_user_can_see_branch(company_id, branch_id)
  );