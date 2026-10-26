create or replace function public.list_candidate_inquiry_people(requested_company_id uuid)
returns table (user_id uuid, display_name text, role_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.user_id,
    coalesce(nullif(trim(profile.display_name), ''), 'Company user'),
    role.name
  from public.company_memberships membership
  join public.company_roles role on role.id = membership.role_id and role.company_id = membership.company_id
  left join public.profiles profile on profile.id = membership.user_id
  where membership.company_id = requested_company_id
    and membership.status = 'active'
    and public.current_user_can_see_branch(requested_company_id, membership.branch_id)
    and (public.current_user_has_company_permission(requested_company_id, 'candidates.view')
      or public.current_user_has_company_permission(requested_company_id, 'candidates.create'))
  order by profile.display_name, role.name;
$$;

revoke all on function public.list_candidate_inquiry_people(uuid) from public, anon;
grant execute on function public.list_candidate_inquiry_people(uuid) to authenticated;