-- Add must_change_password flag to profiles.
-- Set by the platform when an admin creates a user with a default/temporary password.
-- The user must update their password on first login before accessing the workspace.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Allow the signed-in user to read and clear their own flag (service role can set it freely).
-- Users can only flip it from true → false (they clear it on first-login password change).
-- Only the service role (server-side) can set it to true.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and policyname = 'profiles_own_must_change_password_read'
  ) then
    create policy profiles_own_must_change_password_read
      on public.profiles
      for select
      using ((select auth.uid()) = id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
      and policyname = 'profiles_own_must_change_password_clear'
  ) then
    -- Users can update their own row, but only to set must_change_password = false
    create policy profiles_own_must_change_password_clear
      on public.profiles
      for update
      using  ((select auth.uid()) = id)
      with check (must_change_password = false);
  end if;
end;
$$;

-- Enable RLS if not already on (base migration enables it; this is a safety net)
alter table public.profiles enable row level security;
