alter table public.company_roles
  add column if not exists access_settings jsonb not null default '{}'::jsonb;

alter table public.company_roles
  drop constraint if exists company_roles_access_settings_object_check;
alter table public.company_roles
  add constraint company_roles_access_settings_object_check
  check (jsonb_typeof(access_settings) = 'object');

alter table public.candidates
  add column if not exists agent_user_id uuid references auth.users (id) on delete set null;

create index if not exists candidates_company_agent_created_idx
  on public.candidates (company_id, agent_user_id, created_at desc)
  where agent_user_id is not null;

update public.candidates candidate
set agent_user_id = agent.user_id
from (
  select membership.company_id, membership.user_id, profile.display_name
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  join public.profiles profile on profile.id = membership.user_id
  where membership.status = 'active'
    and lower(role.name) like '%agent%'
    and nullif(trim(profile.display_name), '') is not null
) agent
where candidate.company_id = agent.company_id
  and lower(trim(candidate.agent_name)) = lower(trim(agent.display_name))
  and candidate.agent_user_id is null
  and 1 = (
    select count(*)
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.profiles profile on profile.id = membership.user_id
    where membership.company_id = candidate.company_id
      and membership.status = 'active'
      and lower(role.name) like '%agent%'
      and lower(trim(profile.display_name)) = lower(trim(candidate.agent_name))
  );

insert into public.permissions (code, description) values
  ('candidates.register', 'Register candidate records from an inquiry'),
  ('candidate_inquiries.view', 'View candidate inquiries'),
  ('candidate_inquiries.create', 'Create candidate inquiries'),
  ('agent_finance.view', 'View invoices and receipts for assigned candidates and invoices billed to the agent'),
  ('human_resources.view', 'Access the employee Human Resource self-service module')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'human_resources.view'
from public.company_roles role
where role.name <> 'Recruitment Agent'
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role_permission.role_id, role_permission.company_id, 'candidate_inquiries.view'
from public.role_permissions role_permission
where role_permission.permission_code in ('candidates.view', 'candidates.create')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role_permission.role_id, role_permission.company_id, 'candidate_inquiries.create'
from public.role_permissions role_permission
where role_permission.permission_code = 'candidates.create'
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select role_permission.role_id, role_permission.company_id, 'candidates.register'
from public.role_permissions role_permission
join public.company_roles role
  on role.id = role_permission.role_id
 and role.company_id = role_permission.company_id
where role_permission.permission_code = 'candidates.create'
  and role.name <> 'Recruitment Agent'
on conflict (role_id, permission_code) do nothing;

update public.company_roles
set access_settings = access_settings || jsonb_build_object(
  'candidate_scope', 'assigned',
  'inquiry_scope', 'created',
  'candidate_registration', false,
  'agent_visa_finance', true
)
where name = 'Recruitment Agent';

delete from public.role_permissions role_permission
using public.company_roles role
where role.id = role_permission.role_id
  and role.company_id = role_permission.company_id
  and role.name = 'Recruitment Agent'
  and (
    role_permission.permission_code in ('candidates.create', 'candidates.register', 'candidates.edit')
    or role_permission.permission_code like 'finance.%'
    or role_permission.permission_code like 'drive.%'
    or role_permission.permission_code like 'tasks.%'
    or role_permission.permission_code like 'approvals.%'
    or role_permission.permission_code like 'communications.%'
    or role_permission.permission_code = 'human_resources.view'
  );

create or replace function public.current_user_has_company_permission(
  requested_company_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    join public.role_permissions role_permission
      on role_permission.role_id = membership.role_id
     and role_permission.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and role_permission.permission_code = requested_permission
      and not (
        lower(trim(role.name)) = 'recruitment agent'
        and (
          requested_permission = 'human_resources.view'
          or requested_permission like 'drive.%'
          or requested_permission like 'tasks.%'
          or requested_permission like 'approvals.%'
          or requested_permission like 'communications.%'
        )
      )
  );
$$;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where role.name = 'Recruitment Agent'
  and permission.code in (
    'candidates.view',
    'candidate_inquiries.view',
    'candidate_inquiries.create',
    'documents.view',
    'documents.download',
    'agent_finance.view'
  )
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_recruitment_agent_access_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name = 'Recruitment Agent' then
    new.access_settings := new.access_settings || jsonb_build_object(
      'candidate_scope', 'assigned',
      'inquiry_scope', 'created',
      'candidate_registration', false,
      'agent_visa_finance', true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists company_roles_recruitment_agent_access_defaults on public.company_roles;
create trigger company_roles_recruitment_agent_access_defaults
  before insert on public.company_roles
  for each row execute function public.seed_recruitment_agent_access_defaults();
revoke all on function public.seed_recruitment_agent_access_defaults() from public, anon, authenticated;

create or replace function public.seed_recruitment_agent_role(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent_role_id uuid;
begin
  insert into public.company_roles (company_id, name, description)
  values (target_company_id, 'Recruitment Agent', 'Registers and supports candidates through recruitment.')
  on conflict (company_id, name) do update
    set description = excluded.description
  returning id into agent_role_id;

  delete from public.role_permissions
  where role_id = agent_role_id
    and company_id = target_company_id
    and permission_code not in (
      'candidates.view',
      'candidate_inquiries.view',
      'candidate_inquiries.create',
      'documents.view',
      'documents.download',
      'agent_finance.view'
    );

  insert into public.role_permissions (role_id, company_id, permission_code)
  select agent_role_id, target_company_id, permission.code
  from public.permissions permission
  where permission.code in (
    'candidates.view',
    'candidate_inquiries.view',
    'candidate_inquiries.create',
    'documents.view',
    'documents.download',
    'agent_finance.view'
  )
  on conflict (role_id, permission_code) do nothing;
end;
$$;
revoke all on function public.seed_recruitment_agent_role(uuid) from public, anon, authenticated;

create or replace function public.current_user_role_setting(
  requested_company_id uuid,
  requested_setting text,
  fallback_value text default ''
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(role.access_settings ->> requested_setting, fallback_value)
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where membership.user_id = (select auth.uid())
    and membership.company_id = requested_company_id
    and membership.status = 'active'
  limit 1;
$$;
revoke all on function public.current_user_role_setting(uuid, text, text) from public, anon;
grant execute on function public.current_user_role_setting(uuid, text, text) to authenticated;

create or replace function public.current_user_can_access_candidate(
  requested_company_id uuid,
  requested_candidate_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.candidates candidate
    join public.company_memberships membership
      on membership.company_id = candidate.company_id
     and membership.user_id = (select auth.uid())
     and membership.status = 'active'
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    where candidate.id = requested_candidate_id
      and candidate.company_id = requested_company_id
      and (
        coalesce(role.access_settings ->> 'candidate_scope', 'company') <> 'assigned'
        or candidate.agent_user_id = (select auth.uid())
      )
  );
$$;
revoke all on function public.current_user_can_access_candidate(uuid, uuid) from public, anon;
grant execute on function public.current_user_can_access_candidate(uuid, uuid) to authenticated;

create or replace function public.current_user_can_view_agent_finance(requested_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_has_company_permission(requested_company_id, 'agent_finance.view')
    and exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
       and role.company_id = membership.company_id
      where membership.user_id = (select auth.uid())
        and membership.company_id = requested_company_id
        and membership.status = 'active'
        and role.access_settings ->> 'agent_visa_finance' = 'true'
    );
$$;
revoke all on function public.current_user_can_view_agent_finance(uuid) from public, anon;
grant execute on function public.current_user_can_view_agent_finance(uuid) to authenticated;

drop policy if exists "Candidates are tenant and permission scoped" on public.candidates;
drop policy if exists "Candidates are company and role scoped" on public.candidates;
create policy "Candidates are company and role scoped" on public.candidates
  for select to authenticated using (
    (
      public.current_user_has_company_permission(company_id, 'candidates.view')
      or public.current_user_has_company_permission(company_id, 'candidates.edit')
    )
    and public.current_user_can_see_branch(company_id, branch_id)
    and public.current_user_can_access_candidate(company_id, id)
  );

drop policy if exists "Authorized users can create candidates" on public.candidates;
create policy "Authorized users can create candidates" on public.candidates
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (
      public.current_user_has_company_permission(company_id, 'candidates.register')
      or public.current_user_has_company_permission(company_id, 'candidates.create')
    )
    and public.current_user_role_setting(company_id, 'candidate_registration', 'true') = 'true'
    and (
      public.current_user_role_setting(company_id, 'candidate_scope', 'company') <> 'assigned'
      or agent_user_id = (select auth.uid())
    )
    and public.current_user_can_see_branch(company_id, branch_id)
  );

drop policy if exists "Authorized users can edit candidates" on public.candidates;
create policy "Authorized users can edit candidates" on public.candidates
  for update to authenticated using (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    and public.current_user_can_see_branch(company_id, branch_id)
    and public.current_user_can_access_candidate(company_id, id)
  ) with check (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    and public.current_user_can_see_branch(company_id, branch_id)
    and public.current_user_can_access_candidate(company_id, id)
  );

drop policy if exists "Documents are tenant and type permission scoped" on public.candidate_documents;
create policy "Documents are tenant and type permission scoped" on public.candidate_documents
  for select to authenticated using (
    public.can_access_candidate_document(company_id, document_type, 'view', candidate_id)
  );
drop policy if exists "Authorized users can upload candidate documents" on public.candidate_documents;
create policy "Authorized users can upload candidate documents" on public.candidate_documents
  for insert to authenticated with check (
    uploaded_by = (select auth.uid())
    and public.can_access_candidate_document(company_id, document_type, 'upload', candidate_id)
  );
drop policy if exists "Authorized users can edit candidate documents" on public.candidate_documents;
create policy "Authorized users can edit candidate documents" on public.candidate_documents
  for update to authenticated using (
    public.can_access_candidate_document(company_id, document_type, 'edit', candidate_id)
  ) with check (
    public.can_access_candidate_document(company_id, document_type, 'edit', candidate_id)
  );
drop policy if exists "Authorized users can delete candidate documents" on public.candidate_documents;
create policy "Authorized users can delete candidate documents" on public.candidate_documents
  for delete to authenticated using (
    public.can_access_candidate_document(company_id, document_type, 'delete', candidate_id)
  );

create or replace function public.can_access_candidate_document(
  requested_company_id uuid,
  requested_document_type text,
  requested_action text,
  requested_candidate_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select   (
    public.current_user_has_company_permission(
      requested_company_id, 'documents.' || requested_action
    )
    or (
      requested_action in ('view', 'download')
      and public.current_user_has_company_permission(requested_company_id, 'drive.view')
    )
  )
    and (requested_document_type <> 'medical'
      or public.current_user_has_company_permission(requested_company_id, 'medical_documents.view'))
    and (requested_document_type <> 'passport'
      or public.current_user_has_company_permission(requested_company_id, 'passport.view'))
    and (
      requested_candidate_id is null
      or public.current_user_can_access_candidate(requested_company_id, requested_candidate_id)
    )
    and (
      requested_candidate_id is null
      or public.current_user_can_see_branch(requested_company_id, (
        select candidate.branch_id
        from public.candidates candidate
        where candidate.id = requested_candidate_id
          and candidate.company_id = requested_company_id
      ))
    );
$$;
revoke all on function public.can_access_candidate_document(uuid, text, text, uuid) from public, anon;
grant execute on function public.can_access_candidate_document(uuid, text, text, uuid) to authenticated;

create or replace function public.can_access_candidate_document(
  requested_company_id uuid,
  requested_document_type text,
  requested_action text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      public.current_user_has_company_permission(
        requested_company_id, 'documents.' || requested_action
      )
      or (
        requested_action in ('view', 'download')
        and public.current_user_has_company_permission(requested_company_id, 'drive.view')
      )
    )
    and (requested_document_type <> 'medical'
      or public.current_user_has_company_permission(requested_company_id, 'medical_documents.view'))
    and (requested_document_type <> 'passport'
      or public.current_user_has_company_permission(requested_company_id, 'passport.view'));
$$;
revoke all on function public.can_access_candidate_document(uuid, text, text) from public, anon;
grant execute on function public.can_access_candidate_document(uuid, text, text) to authenticated;

create or replace function public.log_candidate_document_access(
  requested_document_id uuid,
  requested_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_record public.candidate_documents%rowtype;
begin
  if requested_action not in ('view', 'download') then
    raise exception 'Unsupported document access action';
  end if;

  select * into document_record
  from public.candidate_documents
  where id = requested_document_id;

  if not found or not public.can_access_candidate_document(
    document_record.company_id,
    document_record.document_type,
    requested_action,
    document_record.candidate_id
  ) then
    raise exception 'Document access denied';
  end if;

  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    document_record.company_id,
    (select auth.uid()),
    case
      when document_record.document_type = 'medical' then 'medical_document_accessed'
      when requested_action = 'download' then 'document_downloaded'
      else 'document_viewed'
    end,
    'candidate_document',
    requested_document_id,
    jsonb_build_object('document_type', document_record.document_type, 'action', requested_action)
  );
end;
$$;
revoke all on function public.log_candidate_document_access(uuid, text) from public, anon;
grant execute on function public.log_candidate_document_access(uuid, text) to authenticated;

drop policy if exists "Candidate inquiries are company and candidate-permission scoped" on public.candidate_inquiries;
drop policy if exists "Candidate inquiries are company and role scoped" on public.candidate_inquiries;
create policy "Candidate inquiries are company and role scoped" on public.candidate_inquiries
  for select to authenticated using (
    (
      public.current_user_has_company_permission(company_id, 'candidate_inquiries.view')
      or public.current_user_has_company_permission(company_id, 'candidates.view')
    )
    and public.current_user_can_see_branch(company_id, branch_id)
    and (
      coalesce(public.current_user_role_setting(company_id, 'inquiry_scope', 'company'), 'company') <> 'created'
      or created_by = (select auth.uid())
    )
  );

drop policy if exists "Authorized users can record candidate inquiries" on public.candidate_inquiries;
create policy "Authorized users can record candidate inquiries" on public.candidate_inquiries
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and (
      public.current_user_has_company_permission(company_id, 'candidate_inquiries.create')
      or public.current_user_has_company_permission(company_id, 'candidates.create')
    )
    and (
      coalesce(public.current_user_role_setting(company_id, 'inquiry_scope', 'company'), 'company') <> 'created'
      or (
        handled_by_user_id = (select auth.uid())
        and (discovery_source <> 'agent' or agent_user_id = (select auth.uid()))
      )
    )
    and public.current_user_can_see_branch(company_id, branch_id)
  );

drop policy if exists "Authorized users can edit candidate inquiries" on public.candidate_inquiries;
create policy "Authorized users can edit candidate inquiries" on public.candidate_inquiries
  for update to authenticated using (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    and public.current_user_can_see_branch(company_id, branch_id)
  ) with check (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    and public.current_user_can_see_branch(company_id, branch_id)
    and (
      coalesce(public.current_user_role_setting(company_id, 'inquiry_scope', 'company'), 'company') <> 'created'
      or created_by = (select auth.uid())
    )
  );

alter table public.invoices
  drop constraint if exists invoices_recipient_type_check;
alter table public.invoices
  add constraint invoices_recipient_type_check
  check (recipient_type in ('contractor', 'supplier', 'candidate', 'agent'));

create index if not exists invoices_company_recipient_issued_idx
  on public.invoices (company_id, recipient_type, recipient_id, issued_at desc);

create or replace function public.validate_invoice_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recipient_type = 'contractor' then
    select contractor.company_name into new.recipient_name
    from public.employers contractor
    where contractor.id = new.recipient_id and contractor.company_id = new.company_id;
  elsif new.recipient_type = 'supplier' then
    select supplier.supplier_name into new.recipient_name
    from public.suppliers supplier
    where supplier.id = new.recipient_id and supplier.company_id = new.company_id;
  elsif new.recipient_type = 'candidate' then
    select concat_ws(' ', candidate.first_name, candidate.last_name) into new.recipient_name
    from public.candidates candidate
    where candidate.id = new.recipient_id and candidate.company_id = new.company_id;
  else
    select coalesce(nullif(trim(profile.display_name), ''), 'Agent') into new.recipient_name
    from public.company_memberships membership
    left join public.profiles profile on profile.id = membership.user_id
    where membership.user_id = new.recipient_id
      and membership.company_id = new.company_id
      and membership.status = 'active';
  end if;

  if new.recipient_name is null then
    raise exception 'Invoice recipient must belong to the same company' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_invoice_recipient() from public, anon, authenticated;

create or replace function public.list_invoice_recipients(requested_company_id uuid)
returns table (recipient_type text, recipient_id uuid, recipient_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'contractor'::text, contractor.id, contractor.company_name
  from public.employers contractor
  where contractor.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'finance.view')
  union all
  select 'supplier'::text, supplier.id, supplier.supplier_name
  from public.suppliers supplier
  where supplier.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'finance.view')
  union all
  select 'candidate'::text, candidate.id, concat_ws(' ', candidate.first_name, candidate.last_name)
  from public.candidates candidate
  where candidate.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'finance.view')
  union all
  select 'agent'::text, membership.user_id,
    coalesce(nullif(trim(profile.display_name), ''), 'Agent')
  from public.company_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  join public.company_roles role
    on role.id = membership.role_id and role.company_id = membership.company_id
  where membership.company_id = requested_company_id
    and membership.status = 'active'
    and lower(role.name) like '%agent%'
    and public.current_user_has_company_permission(requested_company_id, 'finance.view');
$$;
revoke all on function public.list_invoice_recipients(uuid) from public, anon;
grant execute on function public.list_invoice_recipients(uuid) to authenticated;

drop policy if exists "Invoices are tenant and permission scoped" on public.invoices;
drop policy if exists "Invoices are tenant and role scoped" on public.invoices;
create policy "Invoices are tenant and role scoped" on public.invoices
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    or (
      public.current_user_can_view_agent_finance(company_id)
      and (
        (recipient_type = 'agent' and recipient_id = (select auth.uid()))
        or (
          recipient_type = 'candidate'
          and visa_candidate_id is not null
          and exists (
            select 1
            from public.candidates candidate
            where candidate.id = invoices.visa_candidate_id
              and candidate.company_id = invoices.company_id
              and candidate.agent_user_id = (select auth.uid())
              and candidate.details ->> 'visaStatus' = 'Received'
              and public.current_user_can_see_branch(candidate.company_id, candidate.branch_id)
          )
        )
      )
    )
  );

drop policy if exists "Invoice payments are tenant and permission scoped" on public.invoice_payments;
drop policy if exists "Invoice payments are tenant and role scoped" on public.invoice_payments;
create policy "Invoice payments are tenant and role scoped" on public.invoice_payments
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    or (
      public.current_user_can_view_agent_finance(company_id)
      and exists (
        select 1 from public.invoices invoice
        where invoice.id = invoice_payments.invoice_id
          and invoice.company_id = invoice_payments.company_id
          and (
            (invoice.recipient_type = 'agent' and invoice.recipient_id = (select auth.uid()))
            or (
              invoice.recipient_type = 'candidate'
              and invoice.visa_candidate_id is not null
              and exists (
                select 1 from public.candidates candidate
                where candidate.id = invoice.visa_candidate_id
                  and candidate.company_id = invoice.company_id
                  and candidate.agent_user_id = (select auth.uid())
                  and candidate.details ->> 'visaStatus' = 'Received'
                  and public.current_user_can_see_branch(candidate.company_id, candidate.branch_id)
              )
            )
          )
      )
    )
  );

drop policy if exists "Invoice deposit allocations are tenant and permission scoped" on public.invoice_deposit_allocations;
drop policy if exists "Invoice deposit allocations are tenant and role scoped" on public.invoice_deposit_allocations;
create policy "Invoice deposit allocations are tenant and role scoped" on public.invoice_deposit_allocations
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    or (
      public.current_user_can_view_agent_finance(company_id)
      and exists (
        select 1 from public.invoices invoice
        where invoice.id = invoice_deposit_allocations.invoice_id
          and invoice.company_id = invoice_deposit_allocations.company_id
          and invoice.recipient_type = 'candidate'
          and invoice.visa_candidate_id is not null
          and exists (
            select 1 from public.candidates candidate
            where candidate.id = invoice.visa_candidate_id
              and candidate.company_id = invoice.company_id
              and candidate.agent_user_id = (select auth.uid())
              and candidate.details ->> 'visaStatus' = 'Received'
              and public.current_user_can_see_branch(candidate.company_id, candidate.branch_id)
          )
      )
    )
  );

drop policy if exists "Financial receipts are tenant and permission scoped" on public.financial_receipts;
drop policy if exists "Financial receipts are tenant and role scoped" on public.financial_receipts;
create policy "Financial receipts are tenant and role scoped" on public.financial_receipts
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    or (
      candidate_id is not null
      and public.current_user_can_view_agent_finance(company_id)
      and exists (
        select 1 from public.candidates candidate
        where candidate.id = financial_receipts.candidate_id
          and candidate.company_id = financial_receipts.company_id
          and candidate.agent_user_id = (select auth.uid())
          and public.current_user_can_see_branch(candidate.company_id, candidate.branch_id)
      )
    )
  );