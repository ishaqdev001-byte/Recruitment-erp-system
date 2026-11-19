ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_inquiries ENABLE ROW LEVEL SECURITY;

GRANT DELETE ON public.candidates, public.candidate_inquiries TO authenticated;

DROP POLICY IF EXISTS "Authorized users can delete candidates" ON public.candidates;
CREATE POLICY "Authorized users can delete candidates"
  ON public.candidates
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_company_permission(company_id, 'candidates.delete')
    AND public.current_user_can_access_candidate(company_id, id)
  );

DROP POLICY IF EXISTS "Authorized users can delete open candidate inquiries" ON public.candidate_inquiries;
CREATE POLICY "Authorized users can delete open candidate inquiries"
  ON public.candidate_inquiries
  FOR DELETE TO authenticated
  USING (
    status = 'inquiry'
    AND public.current_user_has_company_permission(company_id, 'candidates.delete')
    AND (
      public.current_user_role_setting(company_id, 'inquiry_scope', 'company') <> 'created'
      OR created_by = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION private.prevent_registered_candidate_inquiry_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.candidates AS candidate
    WHERE candidate.company_id = OLD.company_id
      AND candidate.inquiry_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'This inquiry has already been registered and cannot be deleted.'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_registered_candidate_inquiry_deletion()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_registered_candidate_inquiry_deletion ON public.candidate_inquiries;
CREATE TRIGGER prevent_registered_candidate_inquiry_deletion
  BEFORE DELETE ON public.candidate_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_registered_candidate_inquiry_deletion();