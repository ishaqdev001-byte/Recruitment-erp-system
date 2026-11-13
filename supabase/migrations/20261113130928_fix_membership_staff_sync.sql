create or replace function public.sync_company_membership_staff_record()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  is_primary_company_user boolean;
begin
  if new.status not in ('active', 'invited') then
    return new;
  end if;

  select company.primary_admin_user_id = new.user_id
  into is_primary_company_user
  from public.companies company
  where company.id = new.company_id;

  if coalesce(is_primary_company_user, false) then
    perform public.ensure_company_staff_member(
      new.company_id,
      new.user_id,
      new.role_id
    );
  else
    update public.company_staff_members staff
    set position = role.name
    from public.company_roles role
    where staff.company_id = new.company_id
      and staff.linked_user_id = new.user_id
      and role.id = new.role_id
      and role.company_id = new.company_id;
  end if;

  return new;
end;
$function$;