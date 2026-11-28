create table public.recruit_admin_company_storage_allocations (
  company_id uuid primary key references public.companies(id) on delete cascade,
  allocated_bytes bigint check (allocated_bytes is null or allocated_bytes >= 0),
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  file_count bigint not null default 0 check (file_count >= 0),
  measured_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.recruit_admin_company_storage_allocations enable row level security;
revoke all on public.recruit_admin_company_storage_allocations from public, anon, authenticated;
grant select, insert, update, delete on public.recruit_admin_company_storage_allocations to service_role;

create or replace function public.recruit_admin_company_usage()
returns table (
  company_id uuid,
  active_members bigint,
  candidate_count bigint,
  project_count bigint,
  ai_tokens bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with member_usage as (
    select membership.company_id, count(*)::bigint as active_members
    from public.company_memberships membership
    where membership.status = 'active'
    group by membership.company_id
  ),
  candidate_usage as (
    select candidate.company_id, count(*)::bigint as candidate_count
    from public.candidates candidate
    group by candidate.company_id
  ),
  project_usage as (
    select project.company_id, count(*)::bigint as project_count
    from public.projects project
    group by project.company_id
  ),
  ai_usage as (
    select usage.company_id,
      coalesce(sum(usage.input_tokens::numeric + usage.output_tokens::numeric), 0)::bigint as ai_tokens
    from public.ai_usage_logs usage
    group by usage.company_id
  )
  select company.id,
    coalesce(members.active_members, 0),
    coalesce(candidates.candidate_count, 0),
    coalesce(projects.project_count, 0),
    coalesce(ai.ai_tokens, 0)
  from public.companies company
  left join member_usage members on members.company_id = company.id
  left join candidate_usage candidates on candidates.company_id = company.id
  left join project_usage projects on projects.company_id = company.id
  left join ai_usage ai on ai.company_id = company.id;
$$;

revoke all on function public.recruit_admin_company_usage() from public, anon, authenticated;
grant execute on function public.recruit_admin_company_usage() to service_role;

create or replace function public.recruit_admin_reserve_company_storage(
  requested_company_id uuid,
  byte_delta bigint
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if requested_company_id is null or byte_delta is null then
    raise exception 'Company and byte delta are required.';
  end if;

  insert into public.recruit_admin_company_storage_allocations (company_id)
  values (requested_company_id)
  on conflict (company_id) do nothing;

  update public.recruit_admin_company_storage_allocations allocation
  set used_bytes = greatest(0, allocation.used_bytes + byte_delta),
      updated_at = now()
  where allocation.company_id = requested_company_id
    and (
      byte_delta <= 0
      or allocation.allocated_bytes is null
      or allocation.used_bytes + byte_delta <= allocation.allocated_bytes
    );

  return found;
end;
$$;

revoke all on function public.recruit_admin_reserve_company_storage(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.recruit_admin_reserve_company_storage(uuid, bigint)
  to service_role;