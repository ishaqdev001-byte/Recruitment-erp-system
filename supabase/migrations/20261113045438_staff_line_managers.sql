alter table public.company_staff_members
  add column if not exists line_manager_staff_id uuid
  references public.company_staff_members (id)
  on delete set null;

create index if not exists company_staff_members_line_manager_idx
  on public.company_staff_members (company_id, line_manager_staff_id)
  where line_manager_staff_id is not null;