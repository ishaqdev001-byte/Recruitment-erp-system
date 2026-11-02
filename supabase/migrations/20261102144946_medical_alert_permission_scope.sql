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
          requested_permission <> 'medical.alerts.view'
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
            join public.companies company
              on company.id = appointment.company_id
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

revoke all on function private.can_deliver_workspace_notification(
  uuid, uuid, text, text, uuid
) from public, anon, authenticated;