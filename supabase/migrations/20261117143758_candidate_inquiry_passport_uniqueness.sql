ALTER TABLE public.candidate_inquiries
  ADD COLUMN IF NOT EXISTS passport_number text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.candidates AS candidate
    WHERE nullif(regexp_replace(btrim(candidate.details ->> 'passportNumber'), '[[:space:]]+', '', 'g'), '') IS NOT NULL
    GROUP BY
      candidate.company_id,
      lower(regexp_replace(btrim(candidate.details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate passport numbers already exist within a company. Resolve them before applying company-scoped passport uniqueness.';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.candidates_passport_number_unique_idx;

CREATE UNIQUE INDEX candidates_passport_number_company_unique_idx
  ON public.candidates (
    company_id,
    lower(regexp_replace(btrim(details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
  )
  WHERE nullif(regexp_replace(btrim(details ->> 'passportNumber'), '[[:space:]]+', '', 'g'), '') IS NOT NULL;

CREATE INDEX candidates_passport_number_lookup_idx
  ON public.candidates (
    lower(regexp_replace(btrim(details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
  )
  WHERE nullif(regexp_replace(btrim(details ->> 'passportNumber'), '[[:space:]]+', '', 'g'), '') IS NOT NULL;

CREATE UNIQUE INDEX candidate_inquiries_passport_number_company_unique_idx
  ON public.candidate_inquiries (
    company_id,
    lower(regexp_replace(btrim(passport_number), '[[:space:]]+', '', 'g'))
  )
  WHERE nullif(regexp_replace(btrim(passport_number), '[[:space:]]+', '', 'g'), '') IS NOT NULL;

CREATE INDEX candidate_inquiries_passport_number_lookup_idx
  ON public.candidate_inquiries (
    lower(regexp_replace(btrim(passport_number), '[[:space:]]+', '', 'g'))
  )
  WHERE nullif(regexp_replace(btrim(passport_number), '[[:space:]]+', '', 'g'), '') IS NOT NULL;

CREATE OR REPLACE FUNCTION private.enforce_company_passport_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  passport_value text;
  normalized_passport text;
BEGIN
  IF TG_TABLE_NAME = 'candidates' THEN
    passport_value := NEW.details ->> 'passportNumber';
  ELSE
    passport_value := NEW.passport_number;
  END IF;

  normalized_passport := lower(
    regexp_replace(btrim(coalesce(passport_value, '')), '[[:space:]]+', '', 'g')
  );
  IF normalized_passport = '' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.company_id::text || ':' || normalized_passport, 0)
  );

  IF TG_TABLE_NAME = 'candidates' THEN
    IF EXISTS (
      SELECT 1
      FROM public.candidates AS candidate
      WHERE candidate.company_id = NEW.company_id
        AND candidate.id <> NEW.id
        AND lower(regexp_replace(btrim(candidate.details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
          = normalized_passport
    ) OR EXISTS (
      SELECT 1
      FROM public.candidate_inquiries AS inquiry
      WHERE inquiry.company_id = NEW.company_id
        AND inquiry.id IS DISTINCT FROM NEW.inquiry_id
        AND lower(regexp_replace(btrim(inquiry.passport_number), '[[:space:]]+', '', 'g'))
          = normalized_passport
    ) THEN
      RAISE unique_violation
        USING MESSAGE = 'Passport number already exists in this company.',
              CONSTRAINT = 'company_passport_number_unique';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.candidates AS candidate
      WHERE candidate.company_id = NEW.company_id
        AND lower(regexp_replace(btrim(candidate.details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
          = normalized_passport
    ) OR EXISTS (
      SELECT 1
      FROM public.candidate_inquiries AS inquiry
      WHERE inquiry.company_id = NEW.company_id
        AND inquiry.id <> NEW.id
        AND lower(regexp_replace(btrim(inquiry.passport_number), '[[:space:]]+', '', 'g'))
          = normalized_passport
    ) THEN
      RAISE unique_violation
        USING MESSAGE = 'Passport number already exists in this company.',
              CONSTRAINT = 'company_passport_number_unique';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_company_passport_uniqueness()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER candidates_enforce_company_passport_uniqueness
BEFORE INSERT OR UPDATE OF company_id, details, inquiry_id
ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION private.enforce_company_passport_uniqueness();

CREATE TRIGGER candidate_inquiries_enforce_company_passport_uniqueness
BEFORE INSERT OR UPDATE OF company_id, passport_number
ON public.candidate_inquiries
FOR EACH ROW
EXECUTE FUNCTION private.enforce_company_passport_uniqueness();

CREATE OR REPLACE FUNCTION public.current_user_role_setting(
  requested_company_id uuid,
  requested_setting text,
  fallback_value text DEFAULT ''
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN lower(trim(role.name)) = 'recruitment agent'
      AND requested_setting = 'candidate_scope' THEN 'assigned'
    WHEN lower(trim(role.name)) = 'recruitment agent'
      AND requested_setting = 'inquiry_scope'
      AND role.access_settings ->> requested_setting IN ('company', 'created')
      THEN role.access_settings ->> requested_setting
    WHEN lower(trim(role.name)) = 'recruitment agent'
      AND requested_setting = 'inquiry_scope' THEN 'created'
    WHEN lower(trim(role.name)) = 'recruitment agent'
      AND requested_setting = 'candidate_registration'
      THEN coalesce(role.access_settings ->> requested_setting, 'false')
    ELSE coalesce(role.access_settings ->> requested_setting, fallback_value)
  END
  FROM public.company_memberships AS membership
  JOIN public.company_roles AS role
    ON role.id = membership.role_id
   AND role.company_id = membership.company_id
  WHERE membership.user_id = (SELECT auth.uid())
    AND membership.company_id = requested_company_id
    AND membership.status = 'active'
  LIMIT 1;
$$;

DROP FUNCTION public.lookup_candidate_passport_registration(text);

CREATE FUNCTION public.lookup_candidate_passport_registration(
  requested_passport_number text,
  requested_exclude_inquiry_id uuid
)
RETURNS TABLE (
  is_registered boolean,
  registered_last_name text,
  registered_agent_name text,
  belongs_to_another_agent boolean,
  registered_in_another_company boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH authorized_registration_user AS (
    SELECT membership.company_id
    FROM public.company_memberships AS membership
    JOIN public.role_permissions AS role_permission
      ON role_permission.role_id = membership.role_id
     AND role_permission.company_id = membership.company_id
    WHERE membership.user_id = (SELECT auth.uid())
      AND membership.status = 'active'
      AND role_permission.permission_code IN (
        'candidates.register',
        'candidates.create',
        'candidate_inquiries.create'
      )
    LIMIT 1
  ),
  matching_record AS (
    SELECT
      candidate.id,
      candidate.last_name,
      candidate.agent_name,
      candidate.agent_user_id,
      1 AS match_order,
      candidate.created_at
    FROM public.candidates AS candidate
    JOIN authorized_registration_user AS authorized
      ON authorized.company_id = candidate.company_id
    WHERE lower(regexp_replace(btrim(candidate.details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
      = lower(regexp_replace(btrim(coalesce(requested_passport_number, '')), '[[:space:]]+', '', 'g'))

    UNION ALL

    SELECT
      inquiry.id,
      inquiry.last_name,
      inquiry.agent_name,
      inquiry.agent_user_id,
      2 AS match_order,
      inquiry.created_at
    FROM public.candidate_inquiries AS inquiry
    JOIN authorized_registration_user AS authorized
      ON authorized.company_id = inquiry.company_id
    WHERE inquiry.id IS DISTINCT FROM requested_exclude_inquiry_id
      AND lower(regexp_replace(btrim(inquiry.passport_number), '[[:space:]]+', '', 'g'))
        = lower(regexp_replace(btrim(coalesce(requested_passport_number, '')), '[[:space:]]+', '', 'g'))
  )
  SELECT
    matching.id IS NOT NULL,
    matching.last_name,
    matching.agent_name,
    matching.agent_user_id IS NOT NULL
      AND matching.agent_user_id <> (SELECT auth.uid()),
    EXISTS (
      SELECT 1
      FROM public.candidates AS candidate
      JOIN authorized_registration_user AS authorized
        ON authorized.company_id <> candidate.company_id
      WHERE lower(regexp_replace(btrim(candidate.details ->> 'passportNumber'), '[[:space:]]+', '', 'g'))
        = lower(regexp_replace(btrim(coalesce(requested_passport_number, '')), '[[:space:]]+', '', 'g'))
      UNION ALL
      SELECT 1
      FROM public.candidate_inquiries AS inquiry
      JOIN authorized_registration_user AS authorized
        ON authorized.company_id <> inquiry.company_id
      WHERE lower(regexp_replace(btrim(inquiry.passport_number), '[[:space:]]+', '', 'g'))
        = lower(regexp_replace(btrim(coalesce(requested_passport_number, '')), '[[:space:]]+', '', 'g'))
    )
  FROM authorized_registration_user AS authorized
  LEFT JOIN LATERAL (
    SELECT record.*
    FROM matching_record AS record
    ORDER BY record.match_order, record.created_at
    LIMIT 1
  ) AS matching ON true
  WHERE nullif(regexp_replace(btrim(coalesce(requested_passport_number, '')), '[[:space:]]+', '', 'g'), '') IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.lookup_candidate_passport_registration(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_candidate_passport_registration(text, uuid)
  TO authenticated;