create or replace function public.set_candidate_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := coalesce((select auth.uid()), new.updated_by, new.created_by);
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce((select auth.uid()), new.updated_by, old.updated_by);
  end if;

  return new;
end;
$$;