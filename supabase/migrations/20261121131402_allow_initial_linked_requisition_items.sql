create or replace function private.guard_linked_requisition_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_requisition_id uuid;
  target_company_id uuid;
begin
  if tg_op = 'DELETE' then
    target_requisition_id := old.requisition_id;
    target_company_id := old.company_id;
  else
    target_requisition_id := new.requisition_id;
    target_company_id := new.company_id;
  end if;

  if exists (
    select 1
    from public.company_requisitions requisition
    where requisition.id = target_requisition_id
      and requisition.company_id = target_company_id
      and requisition.source_expense_request_id is not null
  ) then
    if tg_op = 'INSERT'
      and current_setting(
        'kilax.allow_initial_linked_requisition_items',
        true
      ) = 'true' then
      return new;
    end if;

    raise exception 'Items on linked expense-request requisitions are read-only.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_linked_requisition_items()
  from public, anon, authenticated;

alter function private.create_requisition_from_expense_request(uuid, uuid)
  rename to create_requisition_from_expense_request_internal;

create function private.create_requisition_from_expense_request(
  requested_request_id uuid,
  requested_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_insert_permission text;
  result jsonb;
begin
  if requested_actor_id is null
    or requested_actor_id is distinct from (select auth.uid())
    or not public.current_user_has_company_permission(
      (
        select request.company_id
        from public.expense_requests request
        where request.id = requested_request_id
      ),
      'expense_requests.initiate'
    ) then
    raise exception 'You do not have permission to initiate this expense request.'
      using errcode = '42501';
  end if;

  previous_insert_permission := current_setting(
    'kilax.allow_initial_linked_requisition_items',
    true
  );
  perform set_config(
    'kilax.allow_initial_linked_requisition_items',
    'true',
    true
  );

  result := private.create_requisition_from_expense_request_internal(
    requested_request_id,
    requested_actor_id
  );

  perform set_config(
    'kilax.allow_initial_linked_requisition_items',
    coalesce(previous_insert_permission, 'false'),
    true
  );

  return result;
end;
$$;

revoke all on function private.create_requisition_from_expense_request(uuid, uuid)
  from public, anon, authenticated;