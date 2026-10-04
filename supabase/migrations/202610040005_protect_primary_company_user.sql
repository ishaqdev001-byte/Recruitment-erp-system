alter table public.companies
  add column if not exists primary_admin_user_id uuid
  references auth.users (id) on delete restrict;

update public.companies company
set primary_admin_user_id = primary_membership.user_id
from (
  select distinct on (membership.company_id)
    membership.company_id,
    membership.user_id
  from public.company_memberships membership
  join public.company_roles role
    on role.id = membership.role_id
   and role.company_id = membership.company_id
  where role.name in ('Company Owner / Primary Administrator', 'Primary Administrator')
  order by membership.company_id, membership.created_at, membership.user_id
) primary_membership
where company.id = primary_membership.company_id
  and company.primary_admin_user_id is null;

create function public.protect_primary_company_user_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  protected_user_id uuid;
  assigned_role_name text;
begin
  if tg_op = 'DELETE' then
    select company.primary_admin_user_id into protected_user_id
    from public.companies company
    where company.id = old.company_id;

    if old.user_id = protected_user_id then
      raise exception 'The primary company administrator membership is protected';
    end if;
    return old;
  end if;

  select company.primary_admin_user_id into protected_user_id
  from public.companies company
  where company.id = new.company_id;

  if tg_op = 'UPDATE' and old.user_id = protected_user_id then
    raise exception 'The primary company administrator membership is protected';
  end if;

  select role.name into assigned_role_name
  from public.company_roles role
  where role.id = new.role_id
    and role.company_id = new.company_id;

  if assigned_role_name in ('Company Owner / Primary Administrator', 'Primary Administrator') then
    if protected_user_id is not null and protected_user_id <> new.user_id then
      raise exception 'A primary company administrator is already assigned';
    end if;

    update public.companies
    set primary_admin_user_id = new.user_id
    where id = new.company_id
      and primary_admin_user_id is null;
  end if;

  return new;
end;
$$;

create trigger company_memberships_protect_primary_user
  before insert or update or delete on public.company_memberships
  for each row execute function public.protect_primary_company_user_membership();

revoke all on function public.protect_primary_company_user_membership() from public, anon, authenticated;