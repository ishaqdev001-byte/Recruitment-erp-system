delete from public.role_permissions role_permission
using public.company_roles role
where role.id = role_permission.role_id
  and role.company_id = role_permission.company_id
  and lower(trim(role.name)) <> 'recruitment agent'
  and role_permission.permission_code = 'agent_finance.view';