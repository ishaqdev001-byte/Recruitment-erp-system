create table public.company_recruitment_agents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  username text not null check (length(btrim(username)) between 3 and 80),
  email text,
  phone text,
  branch_id uuid references public.company_branches (id) on delete set null,
  linked_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index company_recruitment_agents_username_idx
  on public.company_recruitment_agents (company_id, lower(btrim(username)));

create unique index company_recruitment_agents_linked_user_idx
  on public.company_recruitment_agents (company_id, linked_user_id)
  where linked_user_id is not null;

create index company_recruitment_agents_branch_idx
  on public.company_recruitment_agents (company_id, branch_id, status);

alter table public.company_recruitment_agents enable row level security;
revoke all on public.company_recruitment_agents from public, anon, authenticated;
grant all on public.company_recruitment_agents to service_role;

insert into public.company_recruitment_agents (
  company_id,
  name,
  username,
  email,
  phone,
  branch_id,
  linked_user_id,
  status
)
select
  membership.company_id,
  coalesce(
    nullif(btrim(profile.display_name), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    auth_user.email,
    'Recruitment Agent'
  ),
  'agent_' || substr(replace(membership.user_id::text, '-', ''), 1, 16),
  auth_user.email,
  profile.phone,
  membership.branch_id,
  membership.user_id,
  case when membership.status = 'active' then 'active' else 'disabled' end
from public.company_memberships membership
join public.company_roles role
  on role.id = membership.role_id
 and role.company_id = membership.company_id
join auth.users auth_user on auth_user.id = membership.user_id
left join public.profiles profile on profile.id = membership.user_id
where lower(btrim(role.name)) = 'recruitment agent';

alter table public.candidates
  add column agent_id uuid references public.company_recruitment_agents (id) on delete set null;

create index candidates_company_agent_idx
  on public.candidates (company_id, agent_id)
  where agent_id is not null;

update public.candidates candidate
set agent_id = agent.id
from public.company_recruitment_agents agent
where candidate.company_id = agent.company_id
  and candidate.agent_user_id = agent.linked_user_id;

alter table public.candidate_inquiries
  add column agent_id uuid references public.company_recruitment_agents (id) on delete set null;

create index candidate_inquiries_company_agent_idx
  on public.candidate_inquiries (company_id, agent_id)
  where agent_id is not null;

update public.candidate_inquiries inquiry
set agent_id = agent.id
from public.company_recruitment_agents agent
where inquiry.company_id = agent.company_id
  and inquiry.agent_user_id = agent.linked_user_id;

create table public.company_agent_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_id uuid references public.company_recruitment_agents (id) on delete set null,
  request_id uuid not null,
  sms_request_id uuid not null default gen_random_uuid(),
  sender_id uuid references auth.users (id) on delete set null,
  recipient_name text not null,
  recipient_phone text not null,
  subject text not null check (length(btrim(subject)) between 1 and 100),
  body text not null check (length(btrim(body)) between 1 and 480),
  candidate_ids uuid[] not null default array[]::uuid[],
  candidate_names text[] not null default array[]::text[],
  provider_status text not null default 'sending'
    check (provider_status in ('sending', 'sent', 'failed', 'unknown')),
  provider_error text,
  provider_token text,
  cost numeric(12, 2),
  balance numeric(12, 2),
  created_at timestamptz not null default now(),
  unique (company_id, request_id, agent_id),
  unique (company_id, sms_request_id)
);

create index company_agent_messages_inbox_idx
  on public.company_agent_messages (company_id, agent_id, created_at desc);

alter table public.company_agent_messages enable row level security;
revoke all on public.company_agent_messages from public, anon, authenticated;
grant all on public.company_agent_messages to service_role;

insert into public.permissions (code, description)
values (
  'agents.manage',
  'Create and manage the company recruitment agent roster and link agent accounts.'
)
on conflict (code) do update
set description = excluded.description;

create or replace function public.seed_agents_manage_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(new.name)) in ('chairman', 'company owner / primary administrator') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'agents.manage')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.seed_agents_manage_permission()
  from public, anon, authenticated;

create trigger company_role_seed_agents_manage_permission
  after insert or update of name on public.company_roles
  for each row execute function public.seed_agents_manage_permission();

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'agents.manage'
from public.company_roles role
where lower(btrim(role.name)) in ('chairman', 'company owner / primary administrator')
on conflict do nothing;

create or replace function public.current_user_can_access_candidate(
  requested_company_id uuid,
  requested_candidate_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.candidates candidate
    join public.company_memberships membership
      on membership.company_id = candidate.company_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    where candidate.id = requested_candidate_id
      and candidate.company_id = requested_company_id
      and (
        (
          lower(btrim(role.name)) <> 'recruitment agent'
          and coalesce(role.access_settings ->> 'candidate_scope', 'company') <> 'assigned'
        )
        or candidate.agent_user_id = (select auth.uid())
        or exists (
          select 1
          from public.company_recruitment_agents agent
          where agent.id = candidate.agent_id
            and agent.company_id = candidate.company_id
            and agent.linked_user_id = (select auth.uid())
            and agent.status = 'active'
            and lower(btrim(role.name)) = 'recruitment agent'
        )
      )
  );
$$;