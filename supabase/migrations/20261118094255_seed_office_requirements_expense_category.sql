INSERT INTO public.expense_categories (company_id, name)
SELECT company.id, 'Office Requirements'
FROM public.companies AS company
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_office_requirements_expense_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.expense_categories (company_id, name)
  VALUES (NEW.id, 'Office Requirements')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_office_requirements_expense_category()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER seed_office_requirements_expense_category_after_insert
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.seed_office_requirements_expense_category();