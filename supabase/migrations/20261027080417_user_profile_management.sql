-- Extend profiles and track user profile photos
alter table public.profiles
  add column if not exists bio text not null default '' check (length(bio) <= 5000),
  add column if not exists photo_url text;

-- Create table to track user profile photos
create table if not exists public.user_profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  file_type text not null check (length(file_type) between 1 and 12),
  mime_type text not null check (length(mime_type) between 1 and 127),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760), -- 10MB max
  storage_path text not null unique,
  is_current boolean not null default true,
  uploaded_at timestamptz not null default now(),
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  check (storage_path like 'company/' || company_id::text || '/users/' || user_id::text || '/%'),
  check (storage_path not like '%..%'),
  check (position(E'\\' in storage_path) = 0)
);

create unique index if not exists user_profile_photos_one_current_idx
  on public.user_profile_photos (user_id, company_id)
  where is_current = true;

create index if not exists user_profile_photos_user_current_idx
  on public.user_profile_photos (user_id, company_id, is_current)
  where is_current = true;

create index if not exists user_profile_photos_uploaded_idx
  on public.user_profile_photos (user_id, uploaded_at desc);

-- Enable RLS on profile photos table
alter table public.user_profile_photos enable row level security;

-- RLS policies for profile photos
-- Users can view their own profile photos
drop policy if exists "Users can view their own profile photos" on public.user_profile_photos;
create policy "Users can view their own profile photos"
  on public.user_profile_photos for select
  using (auth.uid() = user_id);

-- Users can insert their own profile photos
drop policy if exists "Users can upload their own profile photos" on public.user_profile_photos;
create policy "Users can upload their own profile photos"
  on public.user_profile_photos for insert
  with check (auth.uid() = user_id);

-- Users can update their own profile photos (mark as inactive)
drop policy if exists "Users can deactivate their profile photos" on public.user_profile_photos;
create policy "Users can deactivate their profile photos"
  on public.user_profile_photos for update
  using (auth.uid() = user_id);

-- Users can delete their own profile photos
drop policy if exists "Users can delete their own profile photos" on public.user_profile_photos;
create policy "Users can delete their own profile photos"
  on public.user_profile_photos for delete
  using (auth.uid() = user_id);

-- Grant service role full access
revoke all on public.user_profile_photos from public, anon, authenticated;
grant select, insert, update, delete on public.user_profile_photos to service_role;

-- Create audit function for profile updates
create or replace function public.audit_profile_update()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  user_company_id uuid;
begin
  -- Get user's primary company for audit logging
  select company_id into user_company_id
  from public.company_memberships
  where user_id = new.id
    and status = 'active'
  limit 1;

  if user_company_id is not null then
    insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
    values (
      user_company_id,
      auth.uid(),
      'profile_updated',
      'profile',
      new.id,
      jsonb_build_object(
        'display_name', case when old.display_name is distinct from new.display_name then new.display_name else null end,
        'phone', case when old.phone is distinct from new.phone then new.phone else null end,
        'branch', case when old.branch is distinct from new.branch then new.branch else null end,
        'bio', case when old.bio is distinct from new.bio then new.bio else null end
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_audit_update on public.profiles;
create trigger profiles_audit_update after update on public.profiles
  for each row
  when (old.display_name is distinct from new.display_name
    or old.phone is distinct from new.phone
    or old.branch is distinct from new.branch
    or old.bio is distinct from new.bio)
  execute function public.audit_profile_update();

-- Create audit function for profile photo uploads
create or replace function public.audit_profile_photo_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'profile_photo_uploaded';
  elsif not old.is_current and new.is_current then
    action_name := 'profile_photo_activated';
  elsif old.is_current and not new.is_current then
    action_name := 'profile_photo_deactivated';
  else
    action_name := 'profile_photo_updated';
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id,
    auth.uid(),
    action_name,
    'profile_photo',
    new.id,
    jsonb_build_object('file_size', new.file_size, 'mime_type', new.mime_type)
  );

  return new;
end;
$$;

drop trigger if exists user_profile_photos_audit on public.user_profile_photos;
create trigger user_profile_photos_audit after insert or update on public.user_profile_photos
  for each row execute function public.audit_profile_photo_change();
