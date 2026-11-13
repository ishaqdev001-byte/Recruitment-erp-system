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
    join public.companies company
      on company.id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and company.primary_admin_user_id = membership.user_id
  ) or exists (
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
      and (
        requested_permission not in ('medical.view', 'medical.update', 'medical_documents.view')
        or (
          role.is_system_default
          and lower(trim(role.name)) in ('doctor', 'medical examiner')
        )
      )
      and not (
        lower(trim(role.name)) = 'recruitment agent'
        and (
          requested_permission = 'human_resources.view'
          or requested_permission like 'attendance.%'
          or requested_permission like 'approvals.%'
          or requested_permission like 'communications.%'
          or requested_permission like 'drive.%'
          or requested_permission like 'finance.%'
          or requested_permission like 'leave.%'
          or requested_permission like 'requisitions.%'
        )
      )
  );
$$;

create or replace function public.current_user_is_main_branch_user(
  requested_company_id uuid
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
    join public.companies company
      on company.id = membership.company_id
    left join public.company_branches branch
      on branch.id = membership.branch_id
     and branch.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and (
        company.primary_admin_user_id = membership.user_id
        or membership.branch_id is null
        or branch.is_main_branch = true
      )
  );
$$;

create or replace function public.allocate_company_payroll_reference(
  requested_company_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_prefix text;
  assigned_sequence bigint;
  sequence_text text;
begin
  insert into public.company_payroll_reference_settings (
    company_id,
    reference_prefix,
    next_sequence
  )
  select
    company.id,
    coalesce(
      nullif(
        left(
          regexp_replace(
            (
              select string_agg(
                upper(left(parts.part, 1)),
                ''
                order by parts.ordinality
              )
              from regexp_split_to_table(company.name, '\s+')
                with ordinality as parts(part, ordinality)
              where parts.part <> ''
            ),
            '[^A-Z0-9]',
            '',
            'g'
          ),
          10
        ),
        ''
      ),
      'PAY'
    ),
    1
  from public.companies company
  where company.id = requested_company_id
  on conflict (company_id) do nothing;

  update public.company_payroll_reference_settings settings
  set next_sequence = settings.next_sequence + 1
  where settings.company_id = requested_company_id
  returning settings.reference_prefix, settings.next_sequence - 1
  into assigned_prefix, assigned_sequence;

  if assigned_prefix is null then
    raise exception 'Payroll reference settings could not be allocated for this company';
  end if;

  sequence_text := assigned_sequence::text;
  return assigned_prefix || '-' || lpad(
    sequence_text,
    greatest(6, length(sequence_text)),
    '0'
  );
end;
$$;

create or replace function public.allocate_company_payroll_references(
  requested_company_id uuid,
  requested_count integer
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_prefix text;
  first_sequence bigint;
  sequence_number bigint;
  sequence_text text;
  allocated_references text[] := array[]::text[];
begin
  if requested_count is null or requested_count < 1 or requested_count > 500 then
    raise exception 'Payroll reference count must be between 1 and 500';
  end if;

  insert into public.company_payroll_reference_settings (
    company_id,
    reference_prefix,
    next_sequence
  )
  select
    company.id,
    coalesce(
      nullif(
        left(
          regexp_replace(
            (
              select string_agg(
                upper(left(parts.part, 1)),
                ''
                order by parts.ordinality
              )
              from regexp_split_to_table(company.name, '\s+')
                with ordinality as parts(part, ordinality)
              where parts.part <> ''
            ),
            '[^A-Z0-9]',
            '',
            'g'
          ),
          10
        ),
        ''
      ),
      'PAY'
    ),
    1
  from public.companies company
  where company.id = requested_company_id
  on conflict (company_id) do nothing;

  update public.company_payroll_reference_settings settings
  set next_sequence = settings.next_sequence + requested_count
  where settings.company_id = requested_company_id
  returning
    settings.reference_prefix,
    settings.next_sequence - requested_count
  into assigned_prefix, first_sequence;

  if assigned_prefix is null then
    raise exception 'Payroll reference settings could not be allocated for this company';
  end if;

  for sequence_number in first_sequence..first_sequence + requested_count - 1 loop
    sequence_text := sequence_number::text;
    allocated_references := array_append(
      allocated_references,
      assigned_prefix || '-' || lpad(
        sequence_text,
        greatest(6, length(sequence_text)),
        '0'
      )
    );
  end loop;

  return allocated_references;
end;
$$;

revoke all on function public.allocate_company_payroll_reference(uuid)
  from public, anon, authenticated;
grant execute on function public.allocate_company_payroll_reference(uuid)
  to service_role;

revoke all on function public.allocate_company_payroll_references(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.allocate_company_payroll_references(uuid, integer)
  to service_role;