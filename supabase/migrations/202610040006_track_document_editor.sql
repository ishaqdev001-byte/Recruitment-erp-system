alter table public.candidate_documents
  add column if not exists updated_by uuid references auth.users (id) on delete set null;

update public.candidate_documents
set updated_by = uploaded_by
where updated_by is null;

create function public.set_candidate_document_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce((select auth.uid()), new.updated_by, new.uploaded_by);
  return new;
end;
$$;

create trigger candidate_documents_set_updated_by
  before insert or update on public.candidate_documents
  for each row execute function public.set_candidate_document_updated_by();