CREATE TABLE private.candidate_number_counters (
  prefix text NOT NULL,
  sequence_type text NOT NULL CHECK (sequence_type IN ('IQ', 'IQA', 'FLN')),
  recorded_on date NOT NULL,
  last_number integer NOT NULL CHECK (last_number BETWEEN 1 AND 9999),
  PRIMARY KEY (prefix, sequence_type, recorded_on)
);

ALTER TABLE private.candidate_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.candidate_number_counters FROM PUBLIC, anon, authenticated;

ALTER TABLE public.candidate_inquiries
  ADD COLUMN inquiry_number text;

ALTER TABLE public.candidates
  ADD COLUMN inquiry_number text;

CREATE OR REPLACE FUNCTION private.company_candidate_number_prefix(requested_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  company_name text;
  company_prefix text;
BEGIN
  SELECT company.name
  INTO company_name
  FROM public.companies AS company
  WHERE company.id = requested_company_id;

  IF company_name IS NULL THEN
    RAISE EXCEPTION 'Cannot generate a candidate number without a company name.';
  END IF;

  SELECT string_agg(initial, '' ORDER BY word_ordinal)
  INTO company_prefix
  FROM (
    SELECT left(clean_word, 1) AS initial, word_ordinal
    FROM (
      SELECT
        regexp_replace(word, '[^A-Za-z]', '', 'g') AS clean_word,
        ordinal AS word_ordinal
      FROM regexp_split_to_table(company_name, '\s+') WITH ORDINALITY AS tokens(word, ordinal)
    ) AS normalized_words
    WHERE clean_word <> ''
    ORDER BY word_ordinal
    LIMIT 3
  ) AS initials;

  IF company_prefix IS NULL THEN
    company_prefix := upper(left(regexp_replace(company_name, '[^A-Za-z]', '', 'g'), 3));
  END IF;

  RETURN coalesce(nullif(company_prefix, ''), 'CO');
END;
$$;

CREATE OR REPLACE FUNCTION private.candidate_number_series(
  requested_company_id uuid,
  requested_created_by uuid,
  requested_agent_user_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id uuid;
BEGIN
  actor_user_id := coalesce((SELECT auth.uid()), requested_created_by);

  IF actor_user_id IS NOT NULL AND (
    actor_user_id = requested_agent_user_id
    OR EXISTS (
      SELECT 1
      FROM public.company_memberships AS membership
      JOIN public.company_roles AS company_role
        ON company_role.id = membership.role_id
       AND company_role.company_id = membership.company_id
      WHERE membership.company_id = requested_company_id
        AND membership.user_id = actor_user_id
        AND position('agent' IN lower(company_role.name)) > 0
    )
  ) THEN
    RETURN 'IQA';
  END IF;

  RETURN 'IQ';
END;
$$;

CREATE OR REPLACE FUNCTION private.next_company_candidate_number(
  requested_company_id uuid,
  requested_sequence_type text,
  requested_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  company_prefix text;
  recorded_date date;
  sequence_number integer;
  date_part text;
BEGIN
  IF requested_sequence_type NOT IN ('IQ', 'IQA', 'FLN') THEN
    RAISE EXCEPTION 'Unsupported candidate number type: %', requested_sequence_type;
  END IF;

  company_prefix := private.company_candidate_number_prefix(requested_company_id);
  recorded_date := (coalesce(requested_at, clock_timestamp()) AT TIME ZONE 'Africa/Kampala')::date;

  INSERT INTO private.candidate_number_counters AS counter (
    prefix,
    sequence_type,
    recorded_on,
    last_number
  )
  VALUES (company_prefix, requested_sequence_type, recorded_date, 1)
  ON CONFLICT (prefix, sequence_type, recorded_on)
  DO UPDATE SET last_number = counter.last_number + 1
  WHERE counter.last_number < 9999
  RETURNING last_number INTO sequence_number;

  IF sequence_number IS NULL THEN
    RAISE EXCEPTION 'The daily candidate number limit has been reached for % on %.', requested_sequence_type, recorded_date;
  END IF;

  date_part := CASE
    WHEN requested_sequence_type = 'FLN' THEN to_char(recorded_date, 'YYMMDD')
    ELSE to_char(recorded_date, 'YYYYMMDD')
  END;

  RETURN company_prefix
    || requested_sequence_type
    || date_part
    || lpad(sequence_number::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_candidate_inquiry_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id uuid;
  sequence_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.inquiry_number := OLD.inquiry_number;
    RETURN NEW;
  END IF;

  actor_user_id := coalesce((SELECT auth.uid()), NEW.created_by);
  sequence_type := private.candidate_number_series(
    NEW.company_id,
    actor_user_id,
    NEW.agent_user_id
  );
  NEW.inquiry_number := private.next_company_candidate_number(
    NEW.company_id,
    sequence_type,
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_candidate_registration_numbers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id uuid;
  inquiry_number_value text;
  sequence_type text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.inquiry_number := OLD.inquiry_number;
    NEW.file_number := OLD.file_number;
    RETURN NEW;
  END IF;

  actor_user_id := coalesce((SELECT auth.uid()), NEW.created_by);
  inquiry_number_value := NULL;

  IF NEW.inquiry_id IS NOT NULL THEN
    SELECT inquiry.inquiry_number
    INTO inquiry_number_value
    FROM public.candidate_inquiries AS inquiry
    WHERE inquiry.id = NEW.inquiry_id
      AND inquiry.company_id = NEW.company_id;
  END IF;

  IF inquiry_number_value IS NULL THEN
    sequence_type := private.candidate_number_series(
      NEW.company_id,
      actor_user_id,
      NEW.agent_user_id
    );
    inquiry_number_value := private.next_company_candidate_number(
      NEW.company_id,
      sequence_type,
      NEW.created_at
    );
  END IF;

  NEW.inquiry_number := inquiry_number_value;

  NEW.file_number := private.next_company_candidate_number(
    NEW.company_id,
    'FLN',
    NEW.created_at
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.company_candidate_number_prefix(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.candidate_number_series(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.next_company_candidate_number(uuid, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_candidate_inquiry_number()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assign_candidate_registration_numbers()
  FROM PUBLIC, anon, authenticated;

INSERT INTO private.candidate_number_counters AS counter (
  prefix,
  sequence_type,
  recorded_on,
  last_number
)
SELECT
  matched.number_parts[1],
  'FLN',
  to_date(matched.number_parts[2], 'YYMMDD'),
  max(matched.number_parts[3]::integer)
FROM (
  SELECT regexp_match(
    file_number,
    '^([A-Z]{1,3})FLN([0-9]{6})([0-9]{4})$'
  ) AS number_parts
  FROM public.candidates
) AS matched
WHERE matched.number_parts IS NOT NULL
  AND to_char(to_date(matched.number_parts[2], 'YYMMDD'), 'YYMMDD') = matched.number_parts[2]
GROUP BY matched.number_parts[1], matched.number_parts[2]
ON CONFLICT (prefix, sequence_type, recorded_on)
DO UPDATE SET last_number = greatest(
  counter.last_number,
  EXCLUDED.last_number
);

DO $$
DECLARE
  inquiry record;
  candidate record;
  sequence_type text;
BEGIN
  FOR inquiry IN
    SELECT id, company_id, created_by, agent_user_id, created_at
    FROM public.candidate_inquiries
    WHERE nullif(btrim(inquiry_number), '') IS NULL
    ORDER BY created_at, id
  LOOP
    sequence_type := private.candidate_number_series(
      inquiry.company_id,
      inquiry.created_by,
      inquiry.agent_user_id
    );
    UPDATE public.candidate_inquiries
    SET inquiry_number = private.next_company_candidate_number(
      inquiry.company_id,
      sequence_type,
      inquiry.created_at
    )
    WHERE id = inquiry.id;
  END LOOP;
END;
$$;

ALTER TABLE public.candidates DISABLE TRIGGER USER;

UPDATE public.candidates AS candidate
SET inquiry_number = inquiry.inquiry_number
FROM public.candidate_inquiries AS inquiry
WHERE candidate.inquiry_id = inquiry.id
  AND candidate.company_id = inquiry.company_id
  AND nullif(btrim(candidate.inquiry_number), '') IS NULL;

DO $$
DECLARE
  candidate record;
  sequence_type text;
BEGIN
  FOR candidate IN
    SELECT id, company_id, created_by, agent_user_id, created_at
    FROM public.candidates
    WHERE nullif(btrim(inquiry_number), '') IS NULL
    ORDER BY created_at, id
  LOOP
    sequence_type := private.candidate_number_series(
      candidate.company_id,
      candidate.created_by,
      candidate.agent_user_id
    );
    UPDATE public.candidates
    SET inquiry_number = private.next_company_candidate_number(
      candidate.company_id,
      sequence_type,
      candidate.created_at
    )
    WHERE id = candidate.id;
  END LOOP;

  FOR candidate IN
    SELECT id, company_id, created_at
    FROM public.candidates
    WHERE nullif(btrim(file_number), '') IS NULL
    ORDER BY created_at, id
  LOOP
    UPDATE public.candidates
    SET file_number = private.next_company_candidate_number(
      candidate.company_id,
      'FLN',
      candidate.created_at
    )
    WHERE id = candidate.id;
  END LOOP;
END;
$$;

ALTER TABLE public.candidates ENABLE TRIGGER USER;

ALTER TABLE public.candidate_inquiries
  ALTER COLUMN inquiry_number SET NOT NULL;

ALTER TABLE public.candidates
  ALTER COLUMN inquiry_number SET NOT NULL;

CREATE UNIQUE INDEX candidate_inquiries_number_global_uidx
  ON public.candidate_inquiries (lower(btrim(inquiry_number)));

CREATE UNIQUE INDEX candidates_inquiry_number_global_uidx
  ON public.candidates (lower(btrim(inquiry_number)));

CREATE UNIQUE INDEX candidates_file_number_global_uidx
  ON public.candidates (lower(btrim(file_number)));

CREATE TRIGGER candidate_inquiries_assign_number
BEFORE INSERT OR UPDATE OF inquiry_number ON public.candidate_inquiries
FOR EACH ROW
EXECUTE FUNCTION private.assign_candidate_inquiry_number();

CREATE TRIGGER candidates_assign_registration_numbers
BEFORE INSERT OR UPDATE OF inquiry_number, file_number ON public.candidates
FOR EACH ROW
EXECUTE FUNCTION private.assign_candidate_registration_numbers();