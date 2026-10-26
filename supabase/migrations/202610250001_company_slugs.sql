-- Add slug field to companies table for multi-tenant URL routing
alter table public.companies
  add column if not exists slug text;

-- Create a unique index on slug (case-insensitive)
create unique index if not exists idx_companies_slug on public.companies (lower(slug));

-- Update existing companies with slugs based on first word of name
update public.companies
set slug = lower(split_part(name, ' ', 1))
where slug is null;

-- Make slug not nullable after data migration
alter table public.companies
  alter column slug set not null;
