alter table public.candidates
  add column if not exists details jsonb not null default '{}'::jsonb
  check (jsonb_typeof(details) = 'object');