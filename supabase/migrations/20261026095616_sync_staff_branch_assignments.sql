update public.company_staff_members staff
set branch_id = membership.branch_id
from public.company_memberships membership
where membership.company_id = staff.company_id
  and membership.user_id = staff.linked_user_id
  and staff.branch_id is distinct from membership.branch_id;

create or replace function public.sync_company_staff_branch_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_staff_members
  set branch_id = new.branch_id
  where company_id = new.company_id
    and linked_user_id = new.user_id
    and branch_id is distinct from new.branch_id;
  return new;
end;
$$;

revoke all on function public.sync_company_staff_branch_assignment() from public, anon, authenticated;

drop trigger if exists company_memberships_z_sync_staff_branch on public.company_memberships;
create trigger company_memberships_z_sync_staff_branch
  after insert or update of branch_id on public.company_memberships
  for each row execute function public.sync_company_staff_branch_assignment();