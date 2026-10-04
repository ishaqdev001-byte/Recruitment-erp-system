-- File bytes stay in private InterServer storage; PostgreSQL stores metadata only.

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  status text not null default 'active'
    check (status in ('active', 'pending_verification', 'suspended', 'deactivated', 'trial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.permissions (
  code text primary key,
  description text not null
);

create table public.company_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (company_id, name),
  unique (id, company_id)
);

create table public.role_permissions (
  role_id uuid not null,
  company_id uuid not null,
  permission_code text not null references public.permissions (code) on delete cascade,
  primary key (role_id, permission_code),
  foreign key (role_id, company_id)
    references public.company_roles (id, company_id) on delete cascade
);

create table public.company_memberships (
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null,
  status text not null default 'active' check (status in ('invited', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id),
  foreign key (role_id, company_id)
    references public.company_roles (id, company_id) on delete restrict
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  file_number text not null,
  first_name text not null,
  last_name text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, file_number),
  unique (id, company_id)
);

create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  candidate_id uuid not null,
  file_name text not null check (length(trim(file_name)) between 1 and 255),
  original_file_name text not null check (length(trim(original_file_name)) between 1 and 255),
  file_type text not null check (length(file_type) between 1 and 20),
  mime_type text not null check (length(mime_type) between 1 and 127),
  file_size bigint not null check (file_size between 1 and 4194304),
  storage_path text not null unique,
  document_type text not null check (document_type in (
    'cv', 'passport', 'medical', 'id', 'certificate', 'contract',
    'visa', 'payment_receipt', 'photo', 'other'
  )),
  uploaded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at date,
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'archived')),
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade,
  check (storage_path not like '/%'),
  check (position('..' in storage_path) = 0),
  check (position(E'\\' in storage_path) = 0),
  check (storage_path like 'company/' || company_id::text || '/candidates/' || candidate_id::text || '/%')
);

create table public.passport_custody (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  candidate_id uuid not null,
  passport_in_custody boolean not null default false,
  received_date date,
  received_by uuid references auth.users (id) on delete set null,
  assigned_agent uuid references auth.users (id) on delete set null,
  storage_location text not null default '',
  passport_number text,
  passport_expiry date,
  expected_return_date date,
  returned_date date,
  returned_to text,
  return_notes text not null default '',
  status text not null default 'candidate_has_passport'
    check (status in ('in_company_custody', 'returned_to_candidate', 'candidate_has_passport', 'with_external_authority', 'expired', 'issue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade,
  check (not passport_in_custody or received_date is not null),
  check (returned_date is null or passport_in_custody = false)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index company_memberships_user_status_idx on public.company_memberships (user_id, status);
create index candidates_company_created_idx on public.candidates (company_id, created_at desc);
create index candidate_documents_company_candidate_idx on public.candidate_documents (company_id, candidate_id, created_at desc);
create index candidate_documents_expiry_idx on public.candidate_documents (company_id, expires_at) where expires_at is not null;
create index passport_custody_company_candidate_idx on public.passport_custody (company_id, candidate_id);
create index audit_logs_company_created_idx on public.audit_logs (company_id, created_at desc);

insert into public.permissions (code, description) values
  ('candidates.view', 'View company candidates'),
  ('candidates.create', 'Create company candidates'),
  ('candidates.edit', 'Edit company candidates'),
  ('candidates.delete', 'Delete company candidates'),
  ('documents.view', 'View company document metadata'),
  ('documents.upload', 'Upload company documents'),
  ('documents.download', 'Download company documents'),
  ('documents.edit', 'Rename or replace company documents'),
  ('documents.delete', 'Delete company documents'),
  ('medical_documents.view', 'View restricted medical documents'),
  ('passport.view', 'View passport and custody records'),
  ('passport.edit', 'Manage passport custody records'),
  ('users.view', 'View company users and roles'),
  ('users.invite', 'Invite company users'),
  ('users.edit', 'Manage company users and roles'),
  ('finance.view', 'View company finance records'),
  ('finance.create', 'Create company finance records'),
  ('finance.edit', 'Edit company finance records'),
  ('finance.approve', 'Approve company finance records'),
  ('audit.view', 'View company audit logs')
on conflict (code) do nothing;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates
  for each row execute function public.set_updated_at();
create trigger candidate_documents_set_updated_at before update on public.candidate_documents
  for each row execute function public.set_updated_at();
create trigger passport_custody_set_updated_at before update on public.passport_custody
  for each row execute function public.set_updated_at();

create function public.prevent_candidate_document_reclassification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id is distinct from new.id
    or old.company_id is distinct from new.company_id
    or old.candidate_id is distinct from new.candidate_id
    or old.document_type is distinct from new.document_type
    or old.uploaded_by is distinct from new.uploaded_by then
    raise exception 'Document ownership, type, and uploader are immutable';
  end if;
  return new;
end;
$$;

create trigger candidate_documents_identity_immutable
  before update on public.candidate_documents
  for each row execute function public.prevent_candidate_document_reclassification();

create function public.current_user_has_company_permission(requested_company_id uuid, requested_permission text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and role_permission.permission_code = requested_permission
  );
$$;

create function public.current_user_is_platform_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins admin
    where admin.user_id = (select auth.uid())
  );
$$;

create function public.can_access_candidate_document(requested_company_id uuid, requested_document_type text, requested_action text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.current_user_has_company_permission(requested_company_id, 'documents.' || requested_action)
    and (requested_document_type <> 'medical'
      or public.current_user_has_company_permission(requested_company_id, 'medical_documents.view'))
    and (requested_document_type <> 'passport'
      or public.current_user_has_company_permission(requested_company_id, 'passport.view'));
$$;

create function public.create_profile_for_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_profile after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

create function public.audit_candidate_document_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  action_name text;
  target_id uuid;
  target_company_id uuid;
  target_candidate_id uuid;
  target_document_type text;
begin
  if tg_op = 'DELETE' then
    action_name := 'document_deleted';
    target_id := old.id;
    target_company_id := old.company_id;
    target_candidate_id := old.candidate_id;
    target_document_type := old.document_type;
  else
    target_id := new.id;
    target_company_id := new.company_id;
    target_candidate_id := new.candidate_id;
    target_document_type := new.document_type;
    action_name := case
      when tg_op = 'INSERT' then 'document_uploaded'
      when old.storage_path is distinct from new.storage_path then 'document_replaced'
      when old.file_name is distinct from new.file_name then 'document_renamed'
      else 'document_updated'
    end;
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id, (select auth.uid()), action_name, 'candidate_document', target_id,
    jsonb_build_object('candidate_id', target_candidate_id, 'document_type', target_document_type)
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger candidate_documents_audit after insert or update or delete on public.candidate_documents
  for each row execute function public.audit_candidate_document_change();

create function public.audit_passport_custody_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := case when new.passport_in_custody then 'passport_received' else 'passport_custody_created' end;
  elsif not old.passport_in_custody and new.passport_in_custody then
    action_name := 'passport_received';
  elsif old.passport_in_custody and not new.passport_in_custody then
    action_name := 'passport_returned';
  else
    action_name := 'passport_custody_updated';
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    new.company_id, (select auth.uid()), action_name, 'passport_custody', new.id,
    jsonb_build_object('candidate_id', new.candidate_id, 'status', new.status)
  );
  return new;
end;
$$;

create trigger passport_custody_audit after insert or update on public.passport_custody
  for each row execute function public.audit_passport_custody_change();

create function public.log_candidate_document_access(requested_document_id uuid, requested_action text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  target_document_type text;
begin
  if requested_action not in ('view', 'download') then
    raise exception 'Unsupported document access action';
  end if;

  select company_id, document_type
    into target_company_id, target_document_type
    from public.candidate_documents
    where id = requested_document_id;

  if not found or not public.can_access_candidate_document(
    target_company_id, target_document_type, requested_action
  ) then
    raise exception 'Document access denied';
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    target_company_id,
    (select auth.uid()),
    case
      when target_document_type = 'medical' then 'medical_document_accessed'
      when requested_action = 'download' then 'document_downloaded'
      else 'document_viewed'
    end,
    'candidate_document',
    requested_document_id,
    jsonb_build_object('document_type', target_document_type)
  );
end;
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.permissions enable row level security;
alter table public.company_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.company_memberships enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_documents enable row level security;
alter table public.passport_custody enable row level security;
alter table public.audit_logs enable row level security;

create policy "Company members and platform admins can view companies" on public.companies
  for select to authenticated using (
    public.current_user_has_company_permission(id, 'users.view')
    or public.current_user_is_platform_admin()
  );
create policy "Users can view their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users can view their own memberships" on public.company_memberships
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Authorized users can view company memberships" on public.company_memberships
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'users.view'));
create policy "Company members can view roles" on public.company_roles
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'users.view'));
create policy "Authorized users can manage roles" on public.company_roles
  for all to authenticated using (public.current_user_has_company_permission(company_id, 'users.edit'))
  with check (public.current_user_has_company_permission(company_id, 'users.edit'));
create policy "Company members can view role permissions" on public.role_permissions
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'users.view'));
create policy "Authenticated users can view permission catalog" on public.permissions
  for select to authenticated using (true);

create policy "Candidates are tenant and permission scoped" on public.candidates
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'candidates.view'));
create policy "Authorized users can create candidates" on public.candidates
  for insert to authenticated with check (public.current_user_has_company_permission(company_id, 'candidates.create'));
create policy "Authorized users can edit candidates" on public.candidates
  for update to authenticated using (public.current_user_has_company_permission(company_id, 'candidates.edit'))
  with check (public.current_user_has_company_permission(company_id, 'candidates.edit'));
create policy "Authorized users can delete candidates" on public.candidates
  for delete to authenticated using (public.current_user_has_company_permission(company_id, 'candidates.delete'));

create policy "Documents are tenant and type permission scoped" on public.candidate_documents
  for select to authenticated using (public.can_access_candidate_document(company_id, document_type, 'view'));
create policy "Authorized users can upload candidate documents" on public.candidate_documents
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and public.can_access_candidate_document(company_id, document_type, 'upload')
  );
create policy "Authorized users can edit candidate documents" on public.candidate_documents
  for update to authenticated using (public.can_access_candidate_document(company_id, document_type, 'edit'))
  with check (public.can_access_candidate_document(company_id, document_type, 'edit'));
create policy "Authorized users can delete candidate documents" on public.candidate_documents
  for delete to authenticated using (public.can_access_candidate_document(company_id, document_type, 'delete'));

create policy "Passport custody is tenant and permission scoped" on public.passport_custody
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'passport.view'));
create policy "Authorized users can create passport custody records" on public.passport_custody
  for insert to authenticated with check (public.current_user_has_company_permission(company_id, 'passport.edit'));
create policy "Authorized users can edit passport custody records" on public.passport_custody
  for update to authenticated using (public.current_user_has_company_permission(company_id, 'passport.edit'))
  with check (public.current_user_has_company_permission(company_id, 'passport.edit'));
create policy "Authorized users can delete passport custody records" on public.passport_custody
  for delete to authenticated using (public.current_user_has_company_permission(company_id, 'passport.edit'));

create policy "Company audit logs are permission scoped" on public.audit_logs
  for select to authenticated using (public.current_user_has_company_permission(company_id, 'audit.view'));

grant select on public.companies, public.permissions to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.company_roles, public.candidates,
  public.candidate_documents, public.passport_custody to authenticated;
grant select on public.role_permissions, public.company_memberships to authenticated;
grant select on public.audit_logs to authenticated;
revoke insert, update, delete on public.role_permissions, public.company_memberships from authenticated;
revoke all on public.platform_admins from anon, authenticated;
revoke all on function public.current_user_has_company_permission(uuid, text) from public, anon;
revoke all on function public.current_user_is_platform_admin() from public, anon;
revoke all on function public.can_access_candidate_document(uuid, text, text) from public, anon;
revoke all on function public.log_candidate_document_access(uuid, text) from public, anon;
grant execute on function public.current_user_has_company_permission(uuid, text) to authenticated;
grant execute on function public.current_user_is_platform_admin() to authenticated;
grant execute on function public.can_access_candidate_document(uuid, text, text) to authenticated;
grant execute on function public.log_candidate_document_access(uuid, text) to authenticated;