insert into public.permissions (code, description)
values (
  'candidates.sources.manage',
  'Manage the company candidate registration source options'
)
on conflict (code) do nothing;

create table public.candidate_source_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  source text not null check (length(btrim(source)) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index candidate_source_options_company_source_idx
  on public.candidate_source_options (company_id, lower(btrim(source)));

insert into public.candidate_source_options (company_id, source)
select distinct candidate.company_id, btrim(candidate.details ->> 'source')
from public.candidates candidate
where nullif(btrim(candidate.details ->> 'source'), '') is not null
on conflict do nothing;

alter table public.candidate_source_options enable row level security;

create policy "Company members can view candidate source options"
  on public.candidate_source_options
  for select to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'candidates.view')
    or public.current_user_has_company_permission(company_id, 'candidates.register')
    or public.current_user_has_company_permission(company_id, 'candidates.edit')
  );

create policy "Authorized roles can add candidate source options"
  on public.candidate_source_options
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'candidates.sources.manage')
  );

grant select, insert on public.candidate_source_options to authenticated;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'candidates.sources.manage'
from public.company_roles role
where lower(role.name) in ('chairman', 'company owner / primary administrator', 'primary administrator')
on conflict (role_id, permission_code) do nothing;

create or replace function public.seed_company_default_roles(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_roles (company_id, name, description, is_system_default)
  select target_company_id, default_role.name, default_role.description, true
  from (values
    ('Chairman', 'Creator and owner of the company. Holds full control over all branches, roles, operations, and approvals.'),
    ('General Manager', 'Oversees day-to-day company operations, recruitment, finance, and team activity across all branches.'),
    ('CEO', 'Provides executive oversight across company operations, users, finance, and reporting.'),
    ('Finance Manager', 'Manages finance records, approvals, and finance team activity.'),
    ('Documents Officer', 'Maintains candidate documents and verifies document records.'),
    ('Document Officer', 'Maintains candidate documents and verifies document records.'),
    ('Medical Officer', 'Manages candidate medical-document access and related candidate records.'),
    ('Doctor', 'Reviews and examines booked candidates, records examination results and uploads medical reports.'),
    ('Branch Manager', 'Oversees candidate, document, passport, and team activity for a branch. First-level approver.'),
    ('Supervisor', 'Main branch supervisor. Second-level approver. Appointed by the Chairman.'),
    ('Administrator', 'Administers company operations, records, permissions, and user access.'),
    ('Finance User', 'Records and reviews day-to-day company finance activity.'),
    ('Recruitment Manager', 'Manages recruitment agents and pipeline activity.'),
    ('Recruitment Agent', 'Registers and supports candidates through recruitment.'),
    ('Finance Officer', 'Handles day-to-day finance records and transactions.')
  ) as default_role(name, description)
  on conflict (company_id, name) do update
    set description = excluded.description,
        is_system_default = true
    where public.company_roles.description = '';

  insert into public.role_permissions (role_id, company_id, permission_code)
  select company_role.id, target_company_id, permission.code
  from public.company_roles company_role
  cross join public.permissions permission
  where company_role.company_id = target_company_id
    and (
      company_role.name in ('Chairman', 'General Manager', 'CEO', 'Administrator')
      or (
        company_role.name = 'Finance Manager'
        and permission.code in ('finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'audit.view')
      )
      or (
        company_role.name = 'Finance User'
        and permission.code in ('finance.view', 'finance.create')
      )
      or (
        company_role.name = 'Finance Officer'
        and permission.code in ('finance.view', 'finance.create', 'finance.edit')
      )
      or (
        company_role.name in ('Documents Officer', 'Document Officer')
        and permission.code in ('candidates.view', 'documents.view', 'documents.upload', 'documents.download', 'documents.edit')
      )
      or (
        company_role.name = 'Medical Officer'
        and permission.code in ('candidates.view', 'documents.view', 'documents.upload', 'documents.download', 'medical_documents.view')
      )
      or (
        company_role.name = 'Doctor'
        and permission.code in (
          'candidates.view', 'documents.view', 'documents.upload', 'documents.download',
          'medical_documents.view', 'medical.view', 'medical.update'
        )
      )
      or (
        company_role.name = 'Branch Manager'
        and permission.code in (
          'candidates.view', 'candidates.create', 'candidates.edit', 'documents.view',
          'documents.upload', 'documents.download', 'passport.view', 'passport.edit',
          'users.view', 'audit.view', 'finance.view', 'branches.view',
          'approvals.view', 'approvals.manage'
        )
      )
      or (
        company_role.name = 'Supervisor'
        and permission.code in (
          'candidates.view', 'documents.view', 'documents.download',
          'passport.view', 'users.view', 'audit.view', 'finance.view',
          'branches.view', 'approvals.view', 'approvals.manage'
        )
      )
      or (
        company_role.name = 'Recruitment Manager'
        and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit', 'documents.view', 'documents.upload', 'documents.download', 'users.view')
      )
      or (
        company_role.name = 'Recruitment Agent'
        and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit')
      )
      or (
        lower(company_role.name) in ('chairman', 'company owner / primary administrator', 'primary administrator')
        and permission.code = 'candidates.sources.manage'
      )
    )
  on conflict (role_id, permission_code) do nothing;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.candidates candidate
    where nullif(btrim(candidate.details ->> 'passportNumber'), '') is not null
    group by lower(btrim(candidate.details ->> 'passportNumber'))
    having count(*) > 1
  ) then
    raise exception 'Duplicate passport numbers already exist. Resolve them before applying the candidate passport uniqueness index.';
  end if;
end;
$$;

create unique index candidates_passport_number_unique_idx
  on public.candidates (lower(btrim(details ->> 'passportNumber')))
  where nullif(btrim(details ->> 'passportNumber'), '') is not null;