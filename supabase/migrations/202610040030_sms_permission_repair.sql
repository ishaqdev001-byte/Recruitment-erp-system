insert into public.permissions (code, description)
values ('communications.sms.send', 'Send SMS messages through the company SMS provider')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'communications.sms.send'
from public.company_roles role
where role.name in (
  'Company Owner / Primary Administrator', 'General Manager', 'CEO', 'Administrator',
  'Recruitment Manager', 'Recruitment Agent', 'Branch Manager', 'Finance Manager',
  'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer'
)
on conflict (role_id, permission_code) do nothing;