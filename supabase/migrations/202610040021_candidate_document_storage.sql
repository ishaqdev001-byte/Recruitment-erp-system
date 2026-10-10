alter table public.candidate_documents
  drop constraint if exists candidate_documents_file_size_check;
alter table public.candidate_documents
  add constraint candidate_documents_file_size_check
  check (file_size between 1 and 26214400);

alter table public.candidate_documents
  drop constraint if exists candidate_documents_document_type_check;
alter table public.candidate_documents
  add constraint candidate_documents_document_type_check
  check (document_type in (
    'cv', 'passport', 'medical', 'id', 'certificate', 'contract',
    'visa', 'invoice', 'ticket', 'payment_receipt', 'photo', 'other'
  ));

alter table public.candidate_documents
  drop constraint if exists candidate_documents_check;
alter table public.candidate_documents
  add constraint candidate_documents_check
  check (
    storage_path like 'company/' || company_id::text || '/candidates/' || candidate_id::text || '/%'
    or storage_path like 'company/' || company_id::text || '/candidates/%--' || candidate_id::text || '/%'
  );