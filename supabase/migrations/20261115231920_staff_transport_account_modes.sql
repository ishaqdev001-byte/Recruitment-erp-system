ALTER TABLE public.company_staff_members
  ADD COLUMN transport_account_mode text NOT NULL DEFAULT 'fixed';

ALTER TABLE public.company_staff_members
  DROP CONSTRAINT IF EXISTS company_staff_members_transport_account_required_check;

ALTER TABLE public.company_staff_members
  ADD CONSTRAINT company_staff_members_transport_account_mode_check
  CHECK (
    transport_account_mode IN ('fixed', 'random')
    AND (
      (
        weekly_transport_allowance = 0
        AND transport_account_mode = 'fixed'
      )
      OR (
        transport_account_mode = 'fixed'
        AND transport_account_id IS NOT NULL
      )
      OR (
        transport_account_mode = 'random'
        AND transport_account_id IS NULL
      )
    )
  );