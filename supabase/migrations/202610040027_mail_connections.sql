create table public.mail_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  provider text not null check (provider in ('gmail', 'outlook')),
  email_address text not null check (length(trim(email_address)) between 3 and 320),
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  expires_at timestamptz not null,
  scopes text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id, provider),
  foreign key (company_id, user_id) references public.company_memberships (company_id, user_id) on delete cascade
);

create table public.mail_message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  provider text not null check (provider in ('gmail', 'outlook')),
  request_id uuid not null,
  recipient_email text not null check (length(recipient_email) between 3 and 320),
  recipient_name text not null default '',
  subject text not null check (length(subject) between 1 and 998),
  body text not null check (length(body) between 1 and 100000),
  provider_status text not null default 'sending' check (provider_status in ('sending', 'sent', 'failed', 'unknown')),
  provider_message_id text,
  provider_error text not null default '',
  created_at timestamptz not null default now(),
  unique (company_id, user_id, request_id),
  foreign key (company_id, user_id) references public.company_memberships (company_id, user_id) on delete cascade
);

create index mail_connections_user_idx on public.mail_connections (company_id, user_id);
create index mail_message_logs_user_created_idx on public.mail_message_logs (company_id, user_id, created_at desc);

create trigger mail_connections_set_updated_at before update on public.mail_connections
  for each row execute function public.set_updated_at();

insert into public.permissions (code, description) values
  ('communications.email.read', 'Read mail from a linked Gmail or Outlook account'),
  ('communications.email.send', 'Send mail from a linked Gmail or Outlook account')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name in (
  'Company Owner / Primary Administrator', 'General Manager', 'CEO', 'Administrator',
  'Recruitment Manager', 'Recruitment Agent', 'Branch Manager', 'Finance Manager',
  'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer'
)
  and permission.code in ('communications.email.read', 'communications.email.send')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_email_permissions_for_role()
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
    values
      (new.id, new.company_id, 'communications.email.read'),
      (new.id, new.company_id, 'communications.email.send')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_email_permissions on public.company_roles;
create trigger company_roles_seed_email_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_email_permissions_for_role();
revoke all on function public.seed_email_permissions_for_role() from public, anon, authenticated;

alter table public.mail_connections enable row level security;
alter table public.mail_message_logs enable row level security;

create policy "Users can view their own mail connections" on public.mail_connections
  for select to authenticated using (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.read')
  );
create policy "Users can link their own mail accounts" on public.mail_connections
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.read')
  );
create policy "Users can refresh their own mail connections" on public.mail_connections
  for update to authenticated using (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.read')
  ) with check (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.read')
  );
create policy "Users can unlink their own mail accounts" on public.mail_connections
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Users can read their own mail logs" on public.mail_message_logs
  for select to authenticated using (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.read')
  );
create policy "Users can record their own mail sends" on public.mail_message_logs
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.send')
  );
create policy "Users can update their own mail send results" on public.mail_message_logs
  for update to authenticated using (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.send')
  ) with check (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.email.send')
  );
