-- ═══════════════════════════════════════════════════════════════════════════
-- Branch System: multi-branch architecture with data isolation
--
-- Adds:
--   • company_branches table with is_main_branch flag
--   • Auto-seeded Main Branch (HQ) for every company
--   • branch_id on company_memberships and all data tables
--   • All existing data allocated to the Main Branch
--   • Branch-aware permission functions:
--       current_user_branch_id
--       current_user_is_main_branch_user
--       current_user_can_see_branch
--       current_user_is_branch_manager
--       current_user_role_name
--   • Updated RLS policies for branch-scoped data isolation
--   • Chairman + Supervisor roles (Chairman replaces
--     "Company Owner / Primary Administrator")
--   • New permissions: branches.manage, branches.view,
--                      approvals.view, approvals.manage
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. New permissions ───────────────────────────────────────────────────────

insert into public.permissions (code, description)
values
  ('branches.manage', 'Create, edit, and deactivate company branches'),
  ('branches.view',   'View company branches and their members'),
  ('approvals.view',   'View approval requests in the branch approval chain'),
  ('approvals.manage', 'Submit, approve, or reject approval requests')
on conflict (code) do nothing;

-- ─── 2. company_branches table ────────────────────────────────────────────────

create table if not exists public.company_branches (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 120),
  code            text not null check (length(trim(code)) between 1 and 20),
  is_main_branch  boolean not null default false,
  address         text not null default '' check (length(address) <= 500),
  phone           text not null default '' check (length(phone) <= 60),
  manager_user_id uuid references auth.users (id) on delete set null,
  status          text not null default 'active' check (status in ('active', 'inactive')),
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name),
  unique (company_id, code)
);

create index if not exists company_branches_company_status_idx
  on public.company_branches (company_id, status, name);

drop trigger if exists company_branches_set_updated_at on public.company_branches;
create trigger company_branches_set_updated_at before update on public.company_branches
  for each row execute function public.set_updated_at();

-- ─── 3. Seed Main Branch for every existing company ──────────────────────────

insert into public.company_branches (company_id, name, code, is_main_branch, status)
select c.id, 'Main Branch', 'HQ', true, 'active'
from public.companies c
on conflict (company_id, name) do nothing;

-- ─── 4. Trigger: auto-create Main Branch on new company insert ───────────────

create or replace function public.seed_company_main_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_branches (company_id, name, code, is_main_branch, status, created_by)
  values (new.id, 'Main Branch', 'HQ', true, 'active', new.primary_admin_user_id)
  on conflict (company_id, name) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_seed_main_branch on public.companies;
create trigger companies_seed_main_branch
  after insert on public.companies
  for each row execute function public.seed_company_main_branch();

revoke all on function public.seed_company_main_branch() from public, anon, authenticated;

-- ─── 5. Add branch_id to company_memberships ─────────────────────────────────

alter table public.company_memberships
  add column if not exists branch_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_memberships_branch_company_fk'
      and conrelid = 'public.company_memberships'::regclass
  ) then
    alter table public.company_memberships
      add constraint company_memberships_branch_company_fk
      foreign key (branch_id, company_id)
        references public.company_branches (id, company_id) on delete set null;
  end if;
end;
$$;

create index if not exists company_memberships_branch_idx
  on public.company_memberships (company_id, branch_id)
  where branch_id is not null;

-- ─── 6. Add branch_id to all data tables ──────────────────────────────────────

do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'candidates',
    'candidate_inquiries',
    'medical_appointments',
    'company_accounts',
    'company_account_transactions',
    'company_expenses',
    'invoices',
    'invoice_payments',
    'invoice_deposit_allocations',
    'company_income_types',
    'company_staff_members',
    'financial_receipts',
    'company_staff_paychecks',
    'company_requisitions',
    'company_requisition_items',
    'employers',
    'suppliers',
    'projects'
  ]) loop
    begin
      execute format('alter table public.%I add column if not exists branch_id uuid', tbl);
    exception when undefined_table then
      -- table may not exist yet (optional module); skip
    end;

    begin
      if not exists (
        select 1 from pg_constraint
        where conname = tbl || '_branch_company_fk'
          and conrelid = format('public.%I', tbl)::regclass
      ) then
        execute format(
          'alter table public.%I add constraint %I foreign key (branch_id, company_id) references public.company_branches (id, company_id) on delete set null',
          tbl, tbl || '_branch_company_fk'
        );
      end if;
    exception when undefined_table then
      -- skip
    end;

    begin
      execute format(
        'create index if not exists %I_branch_idx on public.%I (company_id, branch_id)',
        tbl, tbl
      );
    exception when undefined_table then
      -- skip
    end;
  end loop;
end;
$$;

-- ─── 7. Allocate ALL existing data to the Main Branch ────────────────────────

do $$
declare
  tbl text;
begin
  -- Most tables can be updated directly.
  -- projects has a trigger (enforce_project_update_permission) that blocks
  -- plain UPDATE statements; we skip it here and handle it separately below.
  for tbl in select unnest(array[
    'candidates',
    'candidate_inquiries',
    'medical_appointments',
    'company_accounts',
    'company_account_transactions',
    'company_expenses',
    'invoices',
    'invoice_payments',
    'invoice_deposit_allocations',
    'company_income_types',
    'company_staff_members',
    'financial_receipts',
    'company_staff_paychecks',
    'company_requisitions',
    'company_requisition_items',
    'employers',
    'suppliers'
  ]) loop
    begin
      execute format(
        $sql$
          update public.%I t
          set branch_id = mb.id
          from public.company_branches mb
          where t.company_id = mb.company_id
            and mb.is_main_branch = true
            and t.branch_id is null
        $sql$,
        tbl
      );
    exception when undefined_table then
      -- skip tables that do not exist yet
    end;
  end loop;

  -- Allocate existing memberships to the main branch
  -- This migration backfill is safe, but the protection trigger blocks all
  -- updates to the primary administrator's membership, including branch_id.
  alter table public.company_memberships
    disable trigger company_memberships_protect_primary_user;

  update public.company_memberships cm
  set branch_id = mb.id
  from public.company_branches mb
  where cm.company_id = mb.company_id
    and mb.is_main_branch = true
    and cm.branch_id is null;

  alter table public.company_memberships
    enable trigger company_memberships_protect_primary_user;
end;
$$;

-- projects: disable the permission trigger for the one-time backfill, then re-enable
alter table public.projects disable trigger projects_enforce_update_permission;

update public.projects t
set branch_id = mb.id
from public.company_branches mb
where t.company_id = mb.company_id
  and mb.is_main_branch = true
  and t.branch_id is null;

alter table public.projects enable trigger projects_enforce_update_permission;

-- ─── 8. Branch-aware permission functions ─────────────────────────────────────

-- Returns the caller's branch_id (NULL = not yet set / edge case)
create or replace function public.current_user_branch_id(requested_company_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.branch_id
  from public.company_memberships m
  where m.user_id = (select auth.uid())
    and m.company_id = requested_company_id
    and m.status = 'active'
  limit 1;
$$;

-- Returns true if the caller is on the main branch
create or replace function public.current_user_is_main_branch_user(requested_company_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    left join public.company_branches b
      on b.id = m.branch_id and b.company_id = m.company_id
    where m.user_id = (select auth.uid())
      and m.company_id = requested_company_id
      and m.status = 'active'
      and (m.branch_id is null or b.is_main_branch = true)
  );
$$;

-- Core isolation gate:
--   Main-branch users → see everything
--   Non-main users    → see only rows where branch_id = their branch
create or replace function public.current_user_can_see_branch(requested_company_id uuid, row_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    left join public.company_branches b
      on b.id = m.branch_id and b.company_id = m.company_id
    where m.user_id = (select auth.uid())
      and m.company_id = requested_company_id
      and m.status = 'active'
      and (
        m.branch_id is null               -- legacy / no branch assigned yet
        or b.is_main_branch = true         -- explicitly on main branch
        or m.branch_id = row_branch_id     -- same branch as the row
      )
  );
$$;

-- Returns true if the caller has the Branch Manager role on the given branch
create or replace function public.current_user_is_branch_manager(requested_company_id uuid, requested_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.company_roles r
      on r.id = m.role_id and r.company_id = m.company_id
    where m.user_id = (select auth.uid())
      and m.company_id = requested_company_id
      and m.status = 'active'
      and m.branch_id = requested_branch_id
      and r.name = 'Branch Manager'
  );
$$;

-- Returns the caller's role name in the given company
create or replace function public.current_user_role_name(requested_company_id uuid)
returns text
language sql stable security definer
set search_path = ''
as $$
  select r.name
  from public.company_memberships m
  join public.company_roles r
    on r.id = m.role_id and r.company_id = m.company_id
  where m.user_id = (select auth.uid())
    and m.company_id = requested_company_id
    and m.status = 'active'
  limit 1;
$$;

revoke all on function
  public.current_user_branch_id(uuid),
  public.current_user_is_main_branch_user(uuid),
  public.current_user_can_see_branch(uuid, uuid),
  public.current_user_is_branch_manager(uuid, uuid),
  public.current_user_role_name(uuid)
from public, anon, authenticated;

grant execute on function
  public.current_user_branch_id(uuid),
  public.current_user_is_main_branch_user(uuid),
  public.current_user_can_see_branch(uuid, uuid),
  public.current_user_is_branch_manager(uuid, uuid),
  public.current_user_role_name(uuid)
to authenticated;

-- ─── 9. Update can_access_candidate_document for branch scoping ──────────────

-- 4-arg version: includes candidate branch check
create or replace function public.can_access_candidate_document(
  requested_company_id uuid,
  requested_document_type text,
  requested_action text,
  requested_candidate_id uuid
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    public.current_user_has_company_permission(requested_company_id, 'documents.' || requested_action)
    and (requested_document_type <> 'medical'
      or public.current_user_has_company_permission(requested_company_id, 'medical_documents.view'))
    and (requested_document_type <> 'passport'
      or public.current_user_has_company_permission(requested_company_id, 'passport.view'))
    and (
      requested_candidate_id is null
      or public.current_user_can_see_branch(requested_company_id, (
        select c.branch_id from public.candidates c where c.id = requested_candidate_id
      ))
    );
$$;

-- 3-arg version: backward-compatible (no branch check on candidate)
create or replace function public.can_access_candidate_document(
  requested_company_id uuid,
  requested_document_type text,
  requested_action text
)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    public.current_user_has_company_permission(requested_company_id, 'documents.' || requested_action)
    and (requested_document_type <> 'medical'
      or public.current_user_has_company_permission(requested_company_id, 'medical_documents.view'))
    and (requested_document_type <> 'passport'
      or public.current_user_has_company_permission(requested_company_id, 'passport.view'));
$$;

-- ─── 10. RLS for company_branches ─────────────────────────────────────────────

alter table public.company_branches enable row level security;
revoke all on public.company_branches from public, anon, authenticated;
grant select, insert, update on public.company_branches to authenticated;
grant select, insert, update on public.company_branches to service_role;

drop policy if exists "Branches visible to company members" on public.company_branches;
create policy "Branches visible to company members"
  on public.company_branches for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'branches.view')
  );

drop policy if exists "Authorized users can create branches" on public.company_branches;
create policy "Authorized users can create branches"
  on public.company_branches for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'branches.manage')
  );

drop policy if exists "Authorized users can update branches" on public.company_branches;
create policy "Authorized users can update branches"
  on public.company_branches for update to authenticated
  using  (public.current_user_has_company_permission(company_id, 'branches.manage'))
  with check (public.current_user_has_company_permission(company_id, 'branches.manage'));

-- ─── 11. Update existing RLS policies for branch scoping ──────────────────────

-- candidates
drop policy if exists "Candidates are tenant and permission scoped" on public.candidates;
create policy "Candidates are tenant and permission scoped"
  on public.candidates for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'candidates.view')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

drop policy if exists "Authorized users can create candidates" on public.candidates;
create policy "Authorized users can create candidates"
  on public.candidates for insert to authenticated with check (
    public.current_user_has_company_permission(company_id, 'candidates.create')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

drop policy if exists "Authorized users can edit candidates" on public.candidates;
create policy "Authorized users can edit candidates"
  on public.candidates for update to authenticated
  using (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    and public.current_user_can_see_branch(company_id, branch_id)
  )
  with check (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- candidate_inquiries
drop policy if exists "Candidate inquiries are company and candidate-permission scoped" on public.candidate_inquiries;
create policy "Candidate inquiries are company and candidate-permission scoped"
  on public.candidate_inquiries for select to authenticated using (
    (public.current_user_has_company_permission(company_id, 'candidates.view')
      or public.current_user_has_company_permission(company_id, 'candidates.create'))
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- invoices
drop policy if exists "Invoices are tenant and permission scoped" on public.invoices;
create policy "Invoices are tenant and permission scoped"
  on public.invoices for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- invoice_payments
drop policy if exists "Invoice payments are tenant and permission scoped" on public.invoice_payments;
create policy "Invoice payments are tenant and permission scoped"
  on public.invoice_payments for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- invoice_deposit_allocations
drop policy if exists "Invoice deposit allocations are tenant and permission scoped" on public.invoice_deposit_allocations;
create policy "Invoice deposit allocations are tenant and permission scoped"
  on public.invoice_deposit_allocations for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- company_income_types
drop policy if exists "Income types are tenant and permission scoped" on public.company_income_types;
create policy "Income types are tenant and permission scoped"
  on public.company_income_types for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- medical_appointments (covers both Finance and Doctor/Medical Officer access)
drop policy if exists "Medical appointments are tenant and permission scoped" on public.medical_appointments;
drop policy if exists "Doctor can view medical appointments" on public.medical_appointments;
create policy "Medical appointments are tenant and permission scoped"
  on public.medical_appointments for select to authenticated using (
    (public.current_user_has_company_permission(company_id, 'finance.view')
      or public.current_user_has_company_permission(company_id, 'medical.view'))
    and public.current_user_can_see_branch(company_id, branch_id)
  );

-- company_requisitions
drop policy if exists "Requisitions visible to company members" on public.company_requisitions;
create policy "Requisitions visible to company members"
  on public.company_requisitions for select to authenticated using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_requisitions.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    and public.current_user_can_see_branch(company_requisitions.company_id, company_requisitions.branch_id)
  );

-- company_requisition_items
drop policy if exists "Requisition items visible to company members" on public.company_requisition_items;
create policy "Requisition items visible to company members"
  on public.company_requisition_items for select to authenticated using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = company_requisition_items.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
    and public.current_user_can_see_branch(company_requisition_items.company_id, company_requisition_items.branch_id)
  );

-- ─── 12. Chairman and Supervisor roles ────────────────────────────────────────

-- Rename the primary admin role to "Chairman"
update public.company_roles
set name        = 'Chairman',
    description = 'Creator and owner of the company. Holds full control over all branches, roles, operations, and approvals.'
where name in ('Company Owner / Primary Administrator', 'Primary Administrator')
  and not exists (
    select 1 from public.company_roles cr2
    where cr2.company_id = company_roles.company_id
      and cr2.name = 'Chairman'
  );

-- Clean up any orphaned old-name rows that now have a Chairman duplicate
delete from public.company_roles
where name in ('Company Owner / Primary Administrator', 'Primary Administrator')
  and exists (
    select 1 from public.company_roles cr2
    where cr2.company_id = company_roles.company_id
      and cr2.name = 'Chairman'
  );

-- Grant all permissions to Chairman
insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, p.code
from public.company_roles cr
cross join public.permissions p
where cr.name = 'Chairman'
on conflict (role_id, permission_code) do nothing;

-- Update the protect trigger to also recognise "Chairman"
create or replace function public.protect_primary_company_user_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_user_id  uuid;
  assigned_role_name text;
begin
  if tg_op = 'DELETE' then
    select company.primary_admin_user_id into protected_user_id
    from public.companies company where company.id = old.company_id;
    if old.user_id = protected_user_id then
      raise exception 'The primary company administrator membership is protected';
    end if;
    return old;
  end if;

  select company.primary_admin_user_id into protected_user_id
  from public.companies company where company.id = new.company_id;

  if tg_op = 'UPDATE' and old.user_id = protected_user_id then
    raise exception 'The primary company administrator membership is protected';
  end if;

  select role.name into assigned_role_name
  from public.company_roles role
  where role.id = new.role_id and role.company_id = new.company_id;

  if assigned_role_name in ('Chairman', 'Company Owner / Primary Administrator', 'Primary Administrator') then
    if protected_user_id is not null and protected_user_id <> new.user_id then
      raise exception 'A primary company administrator is already assigned';
    end if;
    update public.companies
    set primary_admin_user_id = new.user_id
    where id = new.company_id and primary_admin_user_id is null;
  end if;

  return new;
end;
$$;

-- ─── 13. Seed Supervisor role for existing companies ──────────────────────────

insert into public.company_roles (company_id, name, description, is_system_default)
select c.id,
       'Supervisor',
       'Main branch supervisor. Second-level approval in the branch chain. Appointed by the Chairman.',
       true
from public.companies c
on conflict (company_id, name) do update
  set description = excluded.description,
      is_system_default = true
  where public.company_roles.description = '';

insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, p.code
from public.company_roles cr
cross join public.permissions p
where cr.name = 'Supervisor'
  and p.code in (
    'candidates.view', 'documents.view', 'documents.download',
    'passport.view', 'users.view', 'audit.view', 'finance.view',
    'branches.view', 'approvals.view', 'approvals.manage'
  )
on conflict (role_id, permission_code) do nothing;

-- Grant branch + approval perms to existing roles that need them
insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, p.code
from public.company_roles cr
cross join public.permissions p
where cr.name in ('General Manager', 'CEO', 'Administrator')
  and p.code in ('branches.manage', 'branches.view', 'approvals.view', 'approvals.manage')
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select cr.id, cr.company_id, p.code
from public.company_roles cr
cross join public.permissions p
where cr.name = 'Branch Manager'
  and p.code in (
    'finance.view', 'branches.view', 'approvals.view', 'approvals.manage'
  )
on conflict (role_id, permission_code) do nothing;

-- ─── 14. Update seed_company_default_roles to include Chairman + Supervisor ───

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
    ('Chairman',             'Creator and owner of the company. Holds full control over all branches, roles, operations, and approvals.'),
    ('General Manager',      'Oversees day-to-day company operations, recruitment, finance, and team activity across all branches.'),
    ('CEO',                  'Provides executive oversight across company operations, users, finance, and reporting.'),
    ('Finance Manager',      'Manages finance records, approvals, and finance team activity.'),
    ('Documents Officer',    'Maintains candidate documents and verifies document records.'),
    ('Document Officer',     'Maintains candidate documents and verifies document records.'),
    ('Medical Officer',      'Manages candidate medical-document access and related candidate records.'),
    ('Doctor',               'Reviews and examines booked candidates, records examination results and uploads medical reports.'),
    ('Branch Manager',       'Oversees candidate, document, passport, and team activity for a branch. First-level approver.'),
    ('Supervisor',           'Main branch supervisor. Second-level approver. Appointed by the Chairman.'),
    ('Administrator',        'Administers company operations, records, permissions, and user access.'),
    ('Finance User',         'Records and reviews day-to-day company finance activity.'),
    ('Recruitment Manager',  'Manages recruitment agents and pipeline activity.'),
    ('Recruitment Agent',    'Registers and supports candidates through recruitment.'),
    ('Finance Officer',      'Handles day-to-day finance records and transactions.')
  ) as default_role(name, description)
  on conflict (company_id, name) do update
    set description      = excluded.description,
        is_system_default = true
    where public.company_roles.description = '';

  insert into public.role_permissions (role_id, company_id, permission_code)
  select company_role.id, target_company_id, permission.code
  from public.company_roles company_role
  cross join public.permissions permission
  where company_role.company_id = target_company_id
    and (
      company_role.name in ('Chairman', 'General Manager', 'CEO', 'Administrator')
      or (company_role.name = 'Finance Manager'
          and permission.code in ('finance.view', 'finance.create', 'finance.edit', 'finance.approve', 'audit.view'))
      or (company_role.name in ('Finance User')
          and permission.code in ('finance.view', 'finance.create'))
      or (company_role.name = 'Finance Officer'
          and permission.code in ('finance.view', 'finance.create', 'finance.edit'))
      or (company_role.name in ('Documents Officer', 'Document Officer')
          and permission.code in ('candidates.view', 'documents.view', 'documents.upload', 'documents.download', 'documents.edit'))
      or (company_role.name = 'Medical Officer'
          and permission.code in ('candidates.view', 'documents.view', 'documents.upload', 'documents.download', 'medical_documents.view'))
      or (company_role.name = 'Doctor'
          and permission.code in (
            'candidates.view', 'documents.view', 'documents.upload', 'documents.download',
            'medical_documents.view', 'medical.view', 'medical.update'
          ))
      or (company_role.name = 'Branch Manager'
          and permission.code in (
            'candidates.view', 'candidates.create', 'candidates.edit', 'documents.view',
            'documents.upload', 'documents.download', 'passport.view', 'passport.edit',
            'users.view', 'audit.view', 'finance.view', 'branches.view',
            'approvals.view', 'approvals.manage'
          ))
      or (company_role.name = 'Supervisor'
          and permission.code in (
            'candidates.view', 'documents.view', 'documents.download',
            'passport.view', 'users.view', 'audit.view', 'finance.view',
            'branches.view', 'approvals.view', 'approvals.manage'
          ))
      or (company_role.name = 'Recruitment Manager'
          and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit', 'documents.view', 'documents.upload', 'documents.download', 'users.view'))
      or (company_role.name = 'Recruitment Agent'
          and permission.code in ('candidates.view', 'candidates.create', 'candidates.edit'))
    )
  on conflict (role_id, permission_code) do nothing;
end;
$$;
