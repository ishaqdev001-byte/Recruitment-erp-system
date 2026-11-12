create or replace function public.update_company_staff_id_for_member(
  requested_company_id uuid,
  requested_staff_member_id uuid,
  requested_sequence integer,
  requested_prefix text,
  requested_branch_id uuid,
  requested_updated_by uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  configured_prefix text;
  updated_staff_id text;
begin
  if requested_sequence < 1 or requested_sequence > 999998 then
    raise exception 'Staff ID number must be between 1 and 999998'
      using errcode = '22023';
  end if;

  select settings.staff_id_prefix
    into configured_prefix
    from public.company_staff_id_settings as settings
    where settings.company_id = requested_company_id
    for update;

  if not found then
    raise exception 'Staff ID settings are not configured for this company'
      using errcode = 'P0002';
  end if;

  if requested_prefix is distinct from configured_prefix then
    raise exception 'Staff ID prefix changed; refresh and try again'
      using errcode = '40001';
  end if;

  updated_staff_id := configured_prefix || '-' || lpad(requested_sequence::text, 4, '0');

  update public.company_staff_members as staff
    set staff_id = updated_staff_id,
        updated_by = requested_updated_by
    where staff.id = requested_staff_member_id
      and staff.company_id = requested_company_id
      and (requested_branch_id is null or staff.branch_id = requested_branch_id);

  if not found then
    raise exception 'Staff member not found'
      using errcode = 'P0002';
  end if;

  update public.company_staff_id_settings as settings
    set next_sequence = greatest(settings.next_sequence, requested_sequence + 1)
    where settings.company_id = requested_company_id;

  return updated_staff_id;
end;
$function$;

revoke all on function public.update_company_staff_id_for_member(uuid, uuid, integer, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.update_company_staff_id_for_member(uuid, uuid, integer, text, uuid, uuid)
  to service_role;