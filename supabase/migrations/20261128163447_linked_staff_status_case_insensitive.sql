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
       and lower(btrim(staff.status)) = 'active'
      where membership.company_id = requested_company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
    );
$$;

revoke all on function public.current_user_is_linked_company_staff(uuid)
  from public, anon;
grant execute on function public.current_user_is_linked_company_staff(uuid)
  to authenticated;