ALTER TABLE public.expense_requests
  ADD COLUMN serial_number bigint,
  ADD COLUMN deleted_at timestamptz;

WITH numbered_requests AS (
  SELECT
    request.id,
    row_number() OVER (
      PARTITION BY request.company_id
      ORDER BY request.created_at, request.id
    ) AS serial_number
  FROM public.expense_requests AS request
)
UPDATE public.expense_requests AS request
SET serial_number = numbered_requests.serial_number
FROM numbered_requests
WHERE numbered_requests.id = request.id;

ALTER TABLE public.expense_requests
  ALTER COLUMN serial_number SET NOT NULL;

CREATE UNIQUE INDEX expense_requests_company_serial_number_key
  ON public.expense_requests (company_id, serial_number);

CREATE TABLE private.expense_request_serial_sequences (
  company_id uuid PRIMARY KEY
    REFERENCES public.companies (id) ON DELETE CASCADE,
  last_number bigint NOT NULL CHECK (last_number >= 0)
);

REVOKE ALL ON TABLE private.expense_request_serial_sequences
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.expense_request_serial_sequences (company_id, last_number)
SELECT company_id, max(serial_number)
FROM public.expense_requests
GROUP BY company_id;

CREATE OR REPLACE FUNCTION private.assign_expense_request_serial_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO private.expense_request_serial_sequences (company_id, last_number)
  VALUES (NEW.company_id, 1)
  ON CONFLICT (company_id)
  DO UPDATE SET last_number =
    private.expense_request_serial_sequences.last_number + 1
  RETURNING last_number INTO NEW.serial_number;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.assign_expense_request_serial_number()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER expense_requests_assign_serial_number
BEFORE INSERT ON public.expense_requests
FOR EACH ROW
EXECUTE FUNCTION private.assign_expense_request_serial_number();

INSERT INTO public.permissions (code, description)
VALUES
  ('expense_requests.edit', 'Edit expense requests before requisition initiation'),
  ('expense_requests.delete', 'Delete expense requests before requisition initiation'),
  ('projects.view_full', 'View full project details; without this permission, only half-view fields are shown')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION private.guard_deleted_expense_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Deleted expense requests cannot be changed.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_deleted_expense_request()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER expense_requests_guard_deleted
BEFORE UPDATE ON public.expense_requests
FOR EACH ROW
EXECUTE FUNCTION private.guard_deleted_expense_request();

DROP POLICY IF EXISTS "Expense requests follow assigned approval visibility"
  ON public.expense_requests;

CREATE POLICY "Expense requests follow assigned approval visibility"
  ON public.expense_requests
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (
        created_by = (SELECT auth.uid())
        AND NOT EXISTS (
          SELECT 1
          FROM public.company_memberships AS membership
          JOIN public.company_roles AS role
            ON role.id = membership.role_id
           AND role.company_id = membership.company_id
          WHERE membership.company_id = expense_requests.company_id
            AND membership.user_id = (SELECT auth.uid())
            AND membership.status = 'active'
            AND role.name = 'Administration Officer'
        )
      )
      OR (
        status = 'pending_line_manager_review'
        AND (
          (
            line_manager_user_id = (SELECT auth.uid())
            AND public.current_user_is_linked_company_staff(company_id)
            AND NOT EXISTS (
              SELECT 1
              FROM public.company_memberships AS membership
              JOIN public.company_roles AS role
                ON role.id = membership.role_id
               AND role.company_id = membership.company_id
              WHERE membership.company_id = expense_requests.company_id
                AND membership.user_id = (SELECT auth.uid())
                AND membership.status = 'active'
                AND role.name = 'Administration Officer'
            )
          )
          OR (
            public.current_user_has_company_permission(
              company_id,
              'expense_requests.review'
            )
            AND EXISTS (
              SELECT 1
              FROM public.company_memberships AS membership
              JOIN public.company_roles AS role
                ON role.id = membership.role_id
               AND role.company_id = membership.company_id
              WHERE membership.company_id = expense_requests.company_id
                AND membership.user_id = (SELECT auth.uid())
                AND membership.status = 'active'
                AND role.name = 'General Manager'
                AND (
                  line_manager_fallback
                  OR NOT app_private.has_active_non_admin_line_manager(
                    expense_requests.company_id,
                    expense_requests.line_manager_user_id
                  )
                )
            )
          )
        )
      )
      OR (
        status = 'pending_administration_officer_initiation'
        AND public.current_user_has_company_permission(
          company_id,
          'expense_requests.initiate'
        )
      )
      OR (
        NOT EXISTS (
          SELECT 1
          FROM public.company_memberships AS membership
          JOIN public.company_roles AS role
            ON role.id = membership.role_id
           AND role.company_id = membership.company_id
          WHERE membership.company_id = expense_requests.company_id
            AND membership.user_id = (SELECT auth.uid())
            AND membership.status = 'active'
            AND role.name = 'Administration Officer'
        )
        AND (
          (
            staged_visibility = true
            AND currently_visible_to_permission IS NOT NULL
            AND public.current_user_has_company_permission(
              company_id,
              currently_visible_to_permission
            )
          )
          OR (
            staged_visibility = true
            AND stage_entered_at < (now() - interval '24 hours')
            AND (
              public.current_user_has_company_permission(company_id, 'expense_requests.view')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.review')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.verify')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.authorize')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.cashout')
            )
          )
          OR (
            staged_visibility = false
            AND (
              public.current_user_has_company_permission(company_id, 'expense_requests.view')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.review')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.verify')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.authorize')
              OR public.current_user_has_company_permission(company_id, 'expense_requests.cashout')
            )
          )
        )
      )
      OR (
        public.current_user_has_company_permission(company_id, 'requisitions.view')
        AND (
          public.current_user_is_main_branch_user(company_id)
          OR EXISTS (
            SELECT 1
            FROM public.company_memberships AS membership
            WHERE membership.company_id = expense_requests.company_id
              AND membership.user_id = (SELECT auth.uid())
              AND membership.status = 'active'
              AND membership.branch_id = expense_requests.branch_id
          )
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.update_expense_request_before_initiation(
  requested_request_id uuid,
  requested_expense_name text,
  requested_purpose text,
  requested_expense_category_id uuid,
  requested_due_date date,
  requested_comment text,
  requested_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  request_row public.expense_requests%rowtype;
  actor_role_name text;
  category_name text;
  item jsonb;
  item_description text;
  item_quantity numeric(14,4);
  normalized_items jsonb := '[]'::jsonb;
  recipient_count integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO request_row
  FROM public.expense_requests
  WHERE id = requested_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.current_user_has_company_permission(
    request_row.company_id,
    'expense_requests.edit'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to edit expense requests.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_memberships AS membership
    WHERE membership.company_id = request_row.company_id
      AND membership.user_id = actor_id
      AND membership.status = 'active'
      AND (
        public.current_user_is_main_branch_user(request_row.company_id)
        OR membership.branch_id = request_row.branch_id
      )
  ) THEN
    RAISE EXCEPTION 'This expense request is outside your branch.'
      USING ERRCODE = '42501';
  END IF;

  IF request_row.deleted_at IS NOT NULL
    OR request_row.requisition_id IS NOT NULL
    OR request_row.status NOT IN (
      'pending_line_manager_review',
      'pending_administration_officer_initiation'
    ) THEN
    RAISE EXCEPTION 'Only requests awaiting approval or initiation can be edited.'
      USING ERRCODE = '42501';
  END IF;

  IF length(trim(coalesce(requested_expense_name, ''))) NOT BETWEEN 1 AND 200
    OR length(trim(coalesce(requested_purpose, ''))) NOT BETWEEN 1 AND 2000
    OR length(trim(coalesce(requested_comment, ''))) NOT BETWEEN 1 AND 2000
    OR requested_due_date IS NULL
    OR requested_items IS NULL
    OR jsonb_typeof(requested_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(requested_items) < 1
    OR jsonb_array_length(requested_items) > 50 THEN
    RAISE EXCEPTION 'Enter a valid expense name, purpose, category, due date, comment, and line items.'
      USING ERRCODE = '22023';
  END IF;

  SELECT category.name INTO category_name
  FROM public.expense_categories AS category
  WHERE category.id = requested_expense_category_id
    AND category.company_id = request_row.company_id
    AND category.is_active;
  IF category_name IS NULL THEN
    RAISE EXCEPTION 'Select an active expense category from this company.'
      USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(requested_items)
  LOOP
    IF item ? 'rate' OR item ? 'unitRate' OR item ? 'amount' THEN
      RAISE EXCEPTION 'Unit rates are entered during requisition initiation.'
        USING ERRCODE = '22023';
    END IF;

    item_description := nullif(trim(item->>'description'), '');
    BEGIN
      item_quantity := (item->>'quantity')::numeric(14,4);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Each item must have a valid quantity.'
        USING ERRCODE = '22023';
    END;

    IF item_description IS NULL
      OR length(item_description) > 200
      OR item_quantity IS NULL
      OR item_quantity <= 0 THEN
      RAISE EXCEPTION 'Each item needs a description and positive quantity.'
        USING ERRCODE = '22023';
    END IF;

    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'rate', 0
    ));
  END LOOP;

  SELECT role.name INTO actor_role_name
  FROM public.company_memberships AS membership
  JOIN public.company_roles AS role
    ON role.id = membership.role_id
   AND role.company_id = membership.company_id
  WHERE membership.company_id = request_row.company_id
    AND membership.user_id = actor_id
    AND membership.status = 'active'
  LIMIT 1;

  UPDATE public.expense_requests
  SET expense_name = trim(requested_expense_name),
      purpose = trim(requested_purpose),
      expense_category_id = requested_expense_category_id,
      expense_category_name = category_name,
      due_date = requested_due_date,
      request_comment = trim(requested_comment),
      line_items = normalized_items,
      status = 'pending_line_manager_review',
      rejected_stage = NULL,
      line_manager_comment = NULL,
      line_manager_reviewed_at = NULL,
      general_manager_comment = CASE
        WHEN request_row.line_manager_fallback THEN NULL
        ELSE general_manager_comment
      END,
      general_manager_user_id = CASE
        WHEN request_row.line_manager_fallback THEN NULL
        ELSE general_manager_user_id
      END,
      general_manager_reviewed_at = CASE
        WHEN request_row.line_manager_fallback THEN NULL
        ELSE general_manager_reviewed_at
      END,
      currently_visible_to_permission = CASE
        WHEN request_row.line_manager_fallback THEN 'expense_requests.review'
        ELSE NULL
      END,
      next_approver_id = request_row.line_manager_user_id,
      next_approver_stage = CASE
        WHEN request_row.line_manager_fallback THEN 'general_manager_review'
        ELSE 'line_manager_review'
      END,
      stage_entered_at = now()
  WHERE id = request_row.id;

  IF request_row.line_manager_user_id IS NOT NULL
    AND NOT request_row.line_manager_fallback THEN
    recipient_count := public.notify_expense_request_recipients(
      request_row.company_id,
      request_row.id,
      NULL,
      request_row.line_manager_user_id,
      'Updated expense request awaiting line-manager review',
      request_row.request_number || ' from ' || request_row.requested_by_name || ' was updated and requires your review.'
    );
  ELSE
    recipient_count := public.notify_expense_request_recipients(
      request_row.company_id,
      request_row.id,
      'expense_requests.review',
      NULL,
      'Updated expense request awaiting General Manager review',
      request_row.request_number || ' from ' || request_row.requested_by_name || ' was updated and requires your review.'
    );
  END IF;

  IF recipient_count = 0 THEN
    RAISE EXCEPTION 'No active reviewer is available for this expense request.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'serialNumber', request_row.serial_number,
    'status', 'pending_line_manager_review'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_expense_request_before_initiation(
  uuid, text, text, uuid, date, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_expense_request_before_initiation(
  uuid, text, text, uuid, date, text, jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_expense_request_before_initiation(
  requested_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  request_row public.expense_requests%rowtype;
  actor_name text;
  actor_role_name text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO request_row
  FROM public.expense_requests
  WHERE id = requested_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.current_user_has_company_permission(
    request_row.company_id,
    'expense_requests.delete'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to delete expense requests.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.company_memberships AS membership
    WHERE membership.company_id = request_row.company_id
      AND membership.user_id = actor_id
      AND membership.status = 'active'
      AND (
        public.current_user_is_main_branch_user(request_row.company_id)
        OR membership.branch_id = request_row.branch_id
      )
  ) THEN
    RAISE EXCEPTION 'This expense request is outside your branch.'
      USING ERRCODE = '42501';
  END IF;

  IF request_row.deleted_at IS NOT NULL
    OR request_row.requisition_id IS NOT NULL
    OR request_row.status NOT IN (
      'pending_line_manager_review',
      'pending_administration_officer_initiation'
    ) THEN
    RAISE EXCEPTION 'Only requests awaiting approval or initiation can be deleted.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(nullif(trim(profile.display_name), ''), auth_user.email, 'Staff member')
  INTO actor_name
  FROM auth.users AS auth_user
  LEFT JOIN public.profiles AS profile ON profile.id = auth_user.id
  WHERE auth_user.id = actor_id;

  SELECT role.name INTO actor_role_name
  FROM public.company_memberships AS membership
  JOIN public.company_roles AS role
    ON role.id = membership.role_id
   AND role.company_id = membership.company_id
  WHERE membership.company_id = request_row.company_id
    AND membership.user_id = actor_id
    AND membership.status = 'active'
  LIMIT 1;

  UPDATE public.expense_requests
  SET deleted_at = now()
  WHERE id = request_row.id;

  INSERT INTO public.approval_history (
    company_id, request_id, request_type, stage, action, actor_id,
    actor_name, actor_role, notes
  )
  VALUES (
    request_row.company_id, request_row.id, 'expense', 'request_deletion',
    'deleted', actor_id, actor_name, actor_role_name,
    'Expense request deleted before requisition initiation.'
  );

  RETURN jsonb_build_object(
    'requestId', request_row.id,
    'requestNumber', request_row.request_number,
    'deleted', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expense_request_before_initiation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_expense_request_before_initiation(uuid)
  TO authenticated;