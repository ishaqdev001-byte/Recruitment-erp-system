create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.company_roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  accepted_at timestamptz,
  foreign key (company_id, user_id) references public.company_memberships (company_id, user_id) on delete cascade,
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes'),
  check (accepted_at is null or accepted_at <= expires_at)
);

create index if not exists workspace_invitations_user_expiry_idx
  on public.workspace_invitations (user_id, expires_at desc)
  where accepted_at is null;

alter table public.workspace_invitations enable row level security;
grant select, insert, update, delete on public.workspace_invitations to service_role;