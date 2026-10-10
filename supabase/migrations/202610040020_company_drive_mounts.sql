create table if not exists public.company_drive_mounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Windows network location' check (length(trim(label)) between 1 and 100),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  foreign key (company_id, user_id) references public.company_memberships (company_id, user_id) on delete cascade
);

create unique index if not exists company_drive_mounts_one_active_user_idx
  on public.company_drive_mounts (company_id, user_id)
  where revoked_at is null;
create index if not exists company_drive_mounts_user_created_idx
  on public.company_drive_mounts (user_id, created_at desc);

alter table public.company_drive_mounts enable row level security;
drop policy if exists "Users can view their own company drive mounts" on public.company_drive_mounts;
create policy "Users can view their own company drive mounts" on public.company_drive_mounts
  for select to authenticated using (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'drive.view')
  );
drop policy if exists "Users can create their own company drive mounts" on public.company_drive_mounts;
create policy "Users can create their own company drive mounts" on public.company_drive_mounts
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and revoked_at is null
    and public.current_user_has_company_permission(company_id, 'drive.view')
  );
drop policy if exists "Users can revoke their own company drive mounts" on public.company_drive_mounts;
create policy "Users can revoke their own company drive mounts" on public.company_drive_mounts
  for update to authenticated using (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'drive.view')
  ) with check (
    user_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'drive.view')
  );

grant select, insert, update on public.company_drive_mounts to authenticated;
grant select, insert, update, delete on public.company_drive_mounts to service_role;