create or replace function public.current_user_role_setting(
  requested_company_id uuid,
  requested_setting text,
  fallback_value text default ''
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when lower(trim(role.name)) = 'recruitment agent'
      and requested_setting = 'candidate_scope' then 'assigned'
    else coalesce(role.access_settings ->> requested_setting, fallback_value)
  end
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.user_id = (select auth.uid())
    and membership.company_id = requested_company_id
    and membership.status = 'active'
  limit 1;
$$;

drop policy if exists "Company members can view candidate folders" on public.candidates;

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
          lower(trim(role.name)) <> 'recruitment agent'
          and coalesce(role.access_settings ->> 'candidate_scope', 'company') <> 'assigned'
        )
        or candidate.agent_user_id = (select auth.uid())
      )
  );
$$;