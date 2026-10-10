alter table public.tasks
  add column sms_reminder_enabled boolean not null default false;

alter table public.task_notifications
  add column sms_status text not null default 'not_requested'
    check (sms_status in ('not_requested', 'queued', 'sending', 'sent', 'failed', 'unknown')),
  add column sms_error text not null default '',
  add column sms_token text,
  add column sms_cost numeric,
  add column sms_balance numeric;

create table public.sms_message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 100),
  message text not null check (length(message) between 1 and 480),
  contacts text[] not null check (cardinality(contacts) between 1 and 3000),
  contact_name text not null default 'Manual numbers' check (length(contact_name) between 1 and 200),
  contact_type text not null default 'Other' check (contact_type in ('Candidate', 'Employer', 'Staff', 'Other')),
  provider_status text not null default 'sending' check (provider_status in ('sending', 'sent', 'failed', 'unknown')),
  provider_error text not null default '',
  provider_token text,
  recipients integer,
  cost numeric,
  balance numeric,
  created_at timestamptz not null default now(),
  unique (company_id, request_id)
);

create index sms_message_logs_company_created_idx on public.sms_message_logs (company_id, created_at desc);

insert into public.permissions (code, description) values
  ('communications.sms.send', 'Send SMS messages through the company SMS provider')
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

create or replace function public.seed_sms_permission_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name in (
    'Company Owner / Primary Administrator', 'General Manager', 'CEO', 'Administrator',
    'Recruitment Manager', 'Recruitment Agent', 'Branch Manager', 'Finance Manager',
    'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'communications.sms.send')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_sms_permission on public.company_roles;
create trigger company_roles_seed_sms_permission
  after insert or update of name on public.company_roles
  for each row execute function public.seed_sms_permission_for_role();
revoke all on function public.seed_sms_permission_for_role() from public, anon, authenticated;

alter table public.sms_message_logs enable row level security;

create policy "SMS logs are tenant scoped" on public.sms_message_logs
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'communications.sms.send')
  );

create policy "Authorized senders can record SMS requests" on public.sms_message_logs
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.sms.send')
  );

create policy "Authorized senders can update SMS request results" on public.sms_message_logs
  for update to authenticated using (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.sms.send')
  ) with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.sms.send')
  );

create policy "SMS reminders use task access" on public.task_notifications
  for update to authenticated using (
    public.current_user_has_company_permission(company_id, 'tasks.view')
  ) with check (
    public.current_user_has_company_permission(company_id, 'tasks.view')
  );