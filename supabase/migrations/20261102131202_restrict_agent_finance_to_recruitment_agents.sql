update public.permissions
set description = case code
  when 'suppliers.view' then 'View company partners'
  when 'suppliers.create' then 'Register company partners'
  else description
end
where code in ('suppliers.view', 'suppliers.create');

create or replace function public.current_user_can_view_agent_finance(
  requested_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_company_permission(
      requested_company_id,
      'agent_finance.view'
    )
    and exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
       and role.company_id = membership.company_id
      where membership.user_id = (select auth.uid())
        and membership.company_id = requested_company_id
        and membership.status = 'active'
        and lower(trim(role.name)) = 'recruitment agent'
        and role.access_settings ->> 'agent_visa_finance' = 'true'
    );
$$;

revoke all on function public.current_user_can_view_agent_finance(uuid)
  from public, anon;
grant execute on function public.current_user_can_view_agent_finance(uuid)
  to authenticated;