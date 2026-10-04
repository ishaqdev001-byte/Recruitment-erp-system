insert into public.companies (id, name, status)
values (
  '7b4f08da-81a8-4f4b-9f74-31c326dae701',
  'Kilax Dammy Recruit',
  'trial'
)
on conflict (id) do nothing;