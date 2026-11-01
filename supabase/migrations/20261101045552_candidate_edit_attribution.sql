alter table public.candidates
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

create or replace function public.set_candidate_attribution()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := coalesce((select auth.uid()), new.created_by);
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce((select auth.uid()), old.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists candidates_set_attribution on public.candidates;
create trigger candidates_set_attribution
  before insert or update on public.candidates
  for each row execute function public.set_candidate_attribution();