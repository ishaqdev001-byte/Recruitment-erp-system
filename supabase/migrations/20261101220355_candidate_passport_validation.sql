create or replace function public.lookup_candidate_passport_registration(
  requested_passport_number text
)
returns table (is_registered boolean, registered_by text)
language sql
stable
security definer
set search_path = ''
as $$
  with authorized_registration_user as (
    select membership.company_id
    from public.company_memberships membership
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and role_permission.permission_code in ('candidates.register', 'candidates.create')
      and public.current_user_role_setting(
        membership.company_id,
        'candidate_registration',
        'true'
      ) = 'true'
    limit 1
  ),
  matching_candidate as (
    select candidate.created_by
    from public.candidates candidate
    where lower(btrim(candidate.details ->> 'passportNumber'))
      = lower(btrim(requested_passport_number))
    limit 1
  )
  select
    exists (select 1 from matching_candidate),
    (
      select coalesce(nullif(btrim(profile.display_name), ''), 'Former team member')
      from matching_candidate
      left join public.profiles profile on profile.id = matching_candidate.created_by
    )
  where nullif(btrim(coalesce(requested_passport_number, '')), '') is not null
    and exists (select 1 from authorized_registration_user);
$$;

revoke all on function public.lookup_candidate_passport_registration(text)
  from public, anon;
grant execute on function public.lookup_candidate_passport_registration(text)
  to authenticated;