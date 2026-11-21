CREATE OR REPLACE FUNCTION public.notify_approval_level(
  p_company_id uuid,
  p_request_id uuid,
  p_level text,
  p_title text,
  p_body text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  recipients uuid[];
BEGIN
  IF p_level = 'branch_manager' THEN
    SELECT ARRAY[branch.manager_user_id]
    INTO recipients
    FROM public.branch_approval_requests AS request
    JOIN public.company_branches AS branch
      ON branch.id = request.branch_id
     AND branch.company_id = request.company_id
    WHERE request.id = p_request_id
      AND request.company_id = p_company_id
      AND branch.manager_user_id IS NOT NULL;
  ELSE
    SELECT array_agg(membership.user_id)
    INTO recipients
    FROM public.branch_approval_requests AS request
    JOIN public.company_memberships AS membership
      ON membership.company_id = request.company_id
     AND membership.status = 'active'
    JOIN public.company_roles AS role
      ON role.id = membership.role_id
     AND role.company_id = membership.company_id
    JOIN public.role_permissions AS permission
      ON permission.company_id = membership.company_id
     AND permission.role_id = membership.role_id
     AND permission.permission_code = 'approvals.view'
    WHERE request.id = p_request_id
      AND request.company_id = p_company_id
      AND (
        (p_level = 'supervisor' AND role.name = 'Supervisor')
        OR (p_level = 'general_manager' AND role.name = 'General Manager')
        OR (p_level = 'ceo' AND role.name IN ('Chairman', 'CEO'))
      );
  END IF;

  PERFORM private.queue_workspace_notification(
    p_company_id,
    recipients,
    'approvals.view',
    'approvals',
    p_title,
    p_body,
    'approval.required.' || p_level,
    p_request_id
  );
END;
$function$;