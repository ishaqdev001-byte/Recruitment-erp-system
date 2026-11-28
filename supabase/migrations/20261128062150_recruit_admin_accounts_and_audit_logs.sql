create table public.recruit_admin_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  is_root boolean not null default false,
  is_active boolean not null default true,
  permissions text[] not null default '{}',
  password_change_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruit_admin_accounts_email_check check (
    length(btrim(email)) between 3 and 254
  ),
  constraint recruit_admin_accounts_display_name_check check (
    length(btrim(display_name)) between 2 and 100
  ),
  constraint recruit_admin_accounts_permissions_check check (
    permissions <@ array[
      'companies.view',
      'usage.view',
      'storage.view',
      'storage.refresh',
      'storage.allocate'
    ]::text[]
  )
);

create unique index recruit_admin_accounts_email_lower_key
  on public.recruit_admin_accounts (lower(email));

create unique index recruit_admin_accounts_single_root_key
  on public.recruit_admin_accounts (is_root)
  where is_root;

alter table public.recruit_admin_accounts enable row level security;
revoke all on public.recruit_admin_accounts from public, anon, authenticated;
grant select, insert, update, delete on public.recruit_admin_accounts to service_role;

create table public.recruit_admin_activity_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text not null,
  actor_is_root boolean not null,
  action text not null check (length(action) between 1 and 100),
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index recruit_admin_activity_logs_created_at_idx
  on public.recruit_admin_activity_logs (created_at desc);

create index recruit_admin_activity_logs_actor_created_idx
  on public.recruit_admin_activity_logs (actor_user_id, created_at desc);

create index recruit_admin_activity_logs_subadmin_created_idx
  on public.recruit_admin_activity_logs (created_at desc)
  where not actor_is_root;

alter table public.recruit_admin_activity_logs enable row level security;
revoke all on public.recruit_admin_activity_logs from public, anon, authenticated;
grant select, insert on public.recruit_admin_activity_logs to service_role;