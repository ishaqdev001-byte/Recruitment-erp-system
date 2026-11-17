ALTER TABLE public.workspace_communications
  ALTER COLUMN candidate_id DROP NOT NULL,
  ALTER COLUMN submission_id DROP NOT NULL;

ALTER TABLE public.workspace_communications
  DROP CONSTRAINT IF EXISTS workspace_communications_event_type_check,
  ADD CONSTRAINT workspace_communications_event_type_check
    CHECK (event_type IN ('cancellation', 'reminder', 'project_assignment'));

CREATE OR REPLACE FUNCTION private.can_deliver_workspace_notification(
  requested_company_id uuid,
  requested_user_id uuid,
  requested_permission text,
  requested_source_type text,
  requested_source_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_memberships AS membership
    JOIN public.company_roles AS role
      ON role.id = membership.role_id
     AND role.company_id = membership.company_id
    WHERE membership.company_id = requested_company_id
      AND membership.user_id = requested_user_id
      AND membership.status = 'active'
      AND (
        (
          requested_permission = 'staff_chat.view'
          AND requested_source_type = 'staff_chat.message'
          AND EXISTS (
            SELECT 1
            FROM public.staff_chat_messages AS message
            WHERE message.id = requested_source_id
              AND message.company_id = requested_company_id
              AND (
                message.recipient_id IS NULL
                OR message.recipient_id = requested_user_id
              )
          )
        )
        OR (
          requested_permission = 'expense_requests.view'
          AND requested_source_type = 'expense_request'
          AND EXISTS (
            SELECT 1
            FROM public.expense_requests AS request
            WHERE request.id = requested_source_id
              AND request.company_id = requested_company_id
              AND (
                request.line_manager_user_id = requested_user_id
                OR request.created_by = requested_user_id
              )
              AND role.name <> 'Administration Officer'
          )
        )
        OR (
          requested_permission <> 'medical.alerts.view'
          AND requested_permission <> 'staff_chat.view'
          AND requested_permission <> 'expense_requests.view'
          AND EXISTS (
            SELECT 1
            FROM public.role_permissions AS permission
            WHERE permission.company_id = membership.company_id
              AND permission.role_id = membership.role_id
              AND permission.permission_code = requested_permission
          )
        )
        OR (
          requested_permission = 'medical.alerts.view'
          AND requested_source_type = 'medical.unfit-alert'
          AND EXISTS (
            SELECT 1
            FROM public.medical_appointments AS appointment
            JOIN public.companies AS company
              ON company.id = appointment.company_id
            WHERE appointment.id = requested_source_id
              AND appointment.company_id = requested_company_id
              AND (
                EXISTS (
                  SELECT 1
                  FROM public.role_permissions AS permission
                  WHERE permission.company_id = membership.company_id
                    AND permission.role_id = membership.role_id
                    AND permission.permission_code = 'medical.alerts.view'
                )
                OR
                requested_user_id = company.primary_admin_user_id
                OR requested_user_id = appointment.created_by
                OR lower(trim(role.name)) = 'supervisor'
              )
          )
        )
        OR (
          requested_source_type = 'project.assignment'
          AND EXISTS (
            SELECT 1
            FROM public.workspace_communications AS communication
            WHERE communication.id = requested_source_id
              AND communication.company_id = requested_company_id
              AND communication.recipient_id = requested_user_id
              AND communication.event_type = 'project_assignment'
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.can_deliver_workspace_notification(
  uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Workspace communications are recipient and candidate permission scoped"
  ON public.workspace_communications;

CREATE POLICY "Workspace communications are recipient and candidate permission scoped"
  ON public.workspace_communications FOR SELECT TO authenticated
  USING (
    recipient_id = (SELECT auth.uid())
    AND (
      (
        event_type = 'project_assignment'
        AND EXISTS (
          SELECT 1
          FROM public.company_memberships AS membership
          WHERE membership.company_id = workspace_communications.company_id
            AND membership.user_id = (SELECT auth.uid())
            AND membership.status = 'active'
        )
      )
      OR (
        event_type <> 'project_assignment'
        AND public.current_user_has_company_permission(
          company_id,
          'candidates.view'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.company_memberships AS membership
          JOIN public.company_roles AS role
            ON role.id = membership.role_id
           AND role.company_id = membership.company_id
          WHERE membership.company_id = workspace_communications.company_id
            AND membership.user_id = (SELECT auth.uid())
            AND membership.status = 'active'
            AND lower(trim(role.name)) = 'recruitment agent'
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION private.notify_project_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  manager_changed boolean;
  staff_changed boolean;
  assignment record;
  communication_id uuid;
  notification_body text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    manager_changed := true;
    staff_changed := true;
  ELSE
    manager_changed := NEW.project_manager_user_id IS DISTINCT FROM OLD.project_manager_user_id;
    staff_changed := NEW.assigned_staff_id IS DISTINCT FROM OLD.assigned_staff_id;
  END IF;

  IF NOT manager_changed AND NOT staff_changed THEN
    RETURN NEW;
  END IF;

  FOR assignment IN
    SELECT
      target.recipient_id,
      string_agg(target.assignment_label, ' and ' ORDER BY target.assignment_label) AS assignment_labels
    FROM (
      SELECT
        NEW.project_manager_user_id AS recipient_id,
        'Projects Manager'::text AS assignment_label
      WHERE manager_changed
        AND NEW.project_manager_user_id IS NOT NULL

      UNION ALL

      SELECT
        staff.linked_user_id AS recipient_id,
        'assigned staff member'::text AS assignment_label
      FROM public.company_staff_members AS staff
      WHERE staff.id = NEW.assigned_staff_id
        AND staff.company_id = NEW.company_id
        AND staff.status = 'Active'
        AND staff.linked_user_id IS NOT NULL
        AND staff_changed
    ) AS target
    JOIN public.company_memberships AS membership
      ON membership.company_id = NEW.company_id
     AND membership.user_id = target.recipient_id
     AND membership.status = 'active'
    GROUP BY target.recipient_id
  LOOP
    notification_body := format(
      'You have been assigned as %s to project "%s".',
      assignment.assignment_labels,
      NEW.project_name
    );

    INSERT INTO public.workspace_communications (
      company_id,
      recipient_id,
      candidate_id,
      project_id,
      submission_id,
      event_type,
      subject,
      body
    )
    VALUES (
      NEW.company_id,
      assignment.recipient_id,
      NULL,
      NEW.id,
      NULL,
      'project_assignment',
      'Project assigned: ' || NEW.project_name,
      notification_body
    )
    RETURNING id INTO communication_id;

    INSERT INTO public.workspace_notifications (
      company_id,
      recipient_id,
      required_permission,
      category,
      title,
      body,
      source_type,
      source_id
    )
    VALUES (
      NEW.company_id,
      assignment.recipient_id,
      'projects.view',
      'communications',
      'Project assigned to you',
      notification_body,
      'project.assignment',
      communication_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_project_assignment()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS projects_notify_assignment
  ON public.projects;

CREATE TRIGGER projects_notify_assignment
  AFTER INSERT OR UPDATE OF project_manager_user_id, assigned_staff_id
  ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_project_assignment();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'workspace_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_notifications';
  END IF;
END;
$$;