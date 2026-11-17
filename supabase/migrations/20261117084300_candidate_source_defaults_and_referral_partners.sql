INSERT INTO public.candidate_source_options (company_id, source)
SELECT company.id, default_source.source
FROM public.companies AS company
CROSS JOIN (
  VALUES
    ('TikTok'),
    ('Referred by Candidate'),
    ('Recruitment Agent'),
    ('Partner'),
    ('Referred By Friend'),
    ('Radio'),
    ('Television Advert'),
    ('Walk-in'),
    ('Sign Post')
) AS default_source(source)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Company members can view candidate source options"
  ON public.candidate_source_options;

CREATE POLICY "Company members can view candidate source options"
  ON public.candidate_source_options
  FOR SELECT TO authenticated
  USING (
    public.current_user_has_company_permission(company_id, 'candidates.view')
    OR public.current_user_has_company_permission(company_id, 'candidates.register')
    OR public.current_user_has_company_permission(company_id, 'candidates.create')
    OR public.current_user_has_company_permission(company_id, 'candidates.edit')
    OR public.current_user_has_company_permission(company_id, 'candidates.sources.manage')
  );

CREATE OR REPLACE FUNCTION public.seed_candidate_source_options_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.candidate_source_options (company_id, source)
  VALUES
    (NEW.id, 'TikTok'),
    (NEW.id, 'Referred by Candidate'),
    (NEW.id, 'Recruitment Agent'),
    (NEW.id, 'Partner'),
    (NEW.id, 'Referred By Friend'),
    (NEW.id, 'Radio'),
    (NEW.id, 'Television Advert'),
    (NEW.id, 'Walk-in'),
    (NEW.id, 'Sign Post')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_candidate_source_options_after_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS seed_candidate_source_options_after_insert
  ON public.companies;

CREATE TRIGGER seed_candidate_source_options_after_insert
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_candidate_source_options_after_insert();