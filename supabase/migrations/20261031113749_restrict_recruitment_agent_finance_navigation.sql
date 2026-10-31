delete from public.role_permissions role_permission
using public.company_roles role
where role.id = role_permission.role_id
  and role.company_id = role_permission.company_id
  and lower(trim(role.name)) = 'recruitment agent'
  and (
    role_permission.permission_code like 'finance.%'
    or role_permission.permission_code like 'requisitions.%'
  );

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
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and role_permission.permission_code = requested_permission
      and not (
        lower(trim(role.name)) = 'recruitment agent'
        and (
          requested_permission = 'human_resources.view'
          or requested_permission like 'attendance.%'
          or requested_permission like 'approvals.%'
          or requested_permission like 'communications.%'
          or requested_permission like 'drive.%'
          or requested_permission like 'finance.%'
          or requested_permission like 'leave.%'
          or requested_permission like 'requisitions.%'
          or requested_permission like 'tasks.%'
        )
      )
  );
$$;