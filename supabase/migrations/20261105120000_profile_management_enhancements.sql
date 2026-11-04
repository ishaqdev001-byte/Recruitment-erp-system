-- Enhanced profile management with bio field and additional profile metadata
-- Note: avatar_url already exists from 20261104093919_user_profile_photos.sql

alter table public.profiles
  add column if not exists bio text not null default '' check (length(bio) <= 5000);

-- Create audit function for profile updates (if not already exists)
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
        'bio', case when old.bio is distinct from new.bio then new.bio else null end,
        'avatar_url', case when old.avatar_url is distinct from new.avatar_url then 'changed' else null end
      )
    );
  end if;

  return new;
end;
$$;

-- Drop existing trigger if it exists
drop trigger if exists profiles_audit_update on public.profiles;

-- Create trigger for profile updates
create trigger profiles_audit_update after update on public.profiles
  for each row
  when (old.display_name is distinct from new.display_name
    or old.phone is distinct from new.phone
    or old.branch is distinct from new.branch
    or old.bio is distinct from new.bio
    or old.avatar_url is distinct from new.avatar_url)
  execute function public.audit_profile_update();
