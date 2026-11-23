-- Add projects_manager_enabled flag to companies table for feature toggle
alter table public.companies
  add column if not exists projects_manager_enabled boolean not null default true;

-- Seed existing companies with the flag enabled
update public.companies
set projects_manager_enabled = true
where projects_manager_enabled is null;

-- Create index for efficient company settings lookups
create index if not exists companies_projects_manager_idx
  on public.companies (projects_manager_enabled)
  where projects_manager_enabled = true;
