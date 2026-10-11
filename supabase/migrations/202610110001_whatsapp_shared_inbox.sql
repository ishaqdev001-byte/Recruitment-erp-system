create table public.whatsapp_connections (
  company_id uuid primary key references public.companies (id) on delete cascade,
  phone_number_id text not null unique check (phone_number_id ~ '^[0-9]{5,30}$'),
  business_account_id text not null check (business_account_id ~ '^[0-9]{5,30}$'),
  display_phone_number text not null default '',
  verified_name text not null default '',
  access_token_ciphertext text not null,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid,
  provider_message_id text unique,
  contact_phone text not null check (contact_phone ~ '^[0-9]{8,15}$'),
  contact_name text not null default '' check (length(contact_name) <= 200),
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text' check (length(message_type) between 1 and 30),
  body text not null default '' check (length(body) <= 10000),
  status text not null check (status in ('sending', 'sent', 'delivered', 'read', 'failed', 'received', 'unknown')),
  provider_error text not null default '' check (length(provider_error) <= 500),
  sent_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, request_id)
);

create index whatsapp_messages_company_created_idx on public.whatsapp_messages (company_id, created_at desc);
create index whatsapp_messages_company_contact_idx on public.whatsapp_messages (company_id, contact_phone, created_at desc);

insert into public.permissions (code, description) values
  ('communications.whatsapp.read', 'Read the company WhatsApp inbox'),
  ('communications.whatsapp.send', 'Send messages from the company WhatsApp number'),
  ('communications.whatsapp.manage', 'Connect and manage the company WhatsApp number')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name in (
  'Company Owner / Primary Administrator', 'Primary Administrator', 'General Manager', 'CEO', 'Administrator',
  'Recruitment Manager', 'Recruitment Agent', 'Branch Manager', 'Finance Manager',
  'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer'
)
  and permission.code in ('communications.whatsapp.read', 'communications.whatsapp.send')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'communications.whatsapp.manage'
from public.company_roles role
where role.name in ('Company Owner / Primary Administrator', 'Primary Administrator')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_whatsapp_permissions_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name in (
    'Company Owner / Primary Administrator', 'Primary Administrator', 'General Manager', 'CEO', 'Administrator',
    'Recruitment Manager', 'Recruitment Agent', 'Branch Manager', 'Finance Manager',
    'Finance Officer', 'Finance User', 'Document Officer', 'Documents Officer', 'Medical Officer'
  ) then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'communications.whatsapp.read'),
      (new.id, new.company_id, 'communications.whatsapp.send')
    on conflict (role_id, permission_code) do nothing;
  end if;
  if new.name in ('Company Owner / Primary Administrator', 'Primary Administrator') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'communications.whatsapp.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_seed_whatsapp_permissions on public.company_roles;
create trigger company_roles_seed_whatsapp_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_whatsapp_permissions_for_role();
revoke all on function public.seed_whatsapp_permissions_for_role() from public, anon, authenticated;

alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_connections, public.whatsapp_messages from public, anon, authenticated;
grant all on public.whatsapp_connections, public.whatsapp_messages to service_role;