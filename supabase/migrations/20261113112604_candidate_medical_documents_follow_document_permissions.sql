create or replace function public.can_access_candidate_document(
  requested_company_id uuid,
  requested_document_type text,
  requested_action text,
  requested_candidate_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select requested_action in ('view', 'upload', 'download', 'edit', 'delete')
    and (
      public.current_user_has_company_permission(
        requested_company_id, 'documents.' || requested_action
      )
      or (
        requested_action in ('view', 'download')
        and public.current_user_has_company_permission(
          requested_company_id, 'drive.view'
        )
      )
    )
    and (
      requested_document_type <> 'passport'
      or public.current_user_has_company_permission(
        requested_company_id, 'passport.view'
      )
    )
    and (
      requested_candidate_id is null
      or public.current_user_can_access_candidate(
        requested_company_id, requested_candidate_id
      )
    )
    and (
      requested_candidate_id is null
      or public.current_user_can_see_branch(requested_company_id, (
        select candidate.branch_id
        from public.candidates candidate
        where candidate.id = requested_candidate_id
          and candidate.company_id = requested_company_id
      ))
    );
$$;

revoke all on function public.can_access_candidate_document(
  uuid, text, text, uuid
) from public, anon;
grant execute on function public.can_access_candidate_document(
  uuid, text, text, uuid
) to authenticated;