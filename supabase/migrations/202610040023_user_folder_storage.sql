alter table public.company_drive_items
  drop constraint if exists company_drive_items_storage_path_check;
alter table public.company_drive_items
  add constraint company_drive_items_storage_path_check
  check (
    storage_path is null
    or (
      (
        storage_path like 'company/' || company_id::text || '/drive/%'
        or storage_path like 'company/' || company_id::text || '/finance/%'
        or storage_path like 'company/' || company_id::text || '/users/' || created_by::text || '/%'
      )
      and storage_path not like '%..%'
      and position(E'\\' in storage_path) = 0
    )
  );

create or replace function public.company_drive_personal_folder_path(
  requested_company_id uuid,
  requested_folder_id uuid
)
returns table(folder_ids uuid[], folder_names text[])
language sql stable security definer
set search_path = ''
as $$
  with recursive company_root as (
    select item.id
    from public.company_drive_items item
    where item.company_id = requested_company_id
      and item.category = 'shared'
      and item.item_type = 'folder'
      and item.is_system
      and item.parent_id is null
    limit 1
  ), folder_chain as (
    select
      item.id,
      item.parent_id,
      item.name,
      item.is_system,
      item.created_by,
      0 as depth,
      array[item.id]::uuid[] as folder_ids,
      array[item.name]::text[] as folder_names
    from public.company_drive_items item
    where item.id = requested_folder_id
      and item.company_id = requested_company_id
      and item.category = 'shared'
      and item.item_type = 'folder'

    union all

    select
      parent.id,
      parent.parent_id,
      parent.name,
      parent.is_system,
      parent.created_by,
      child.depth + 1,
      child.folder_ids || parent.id,
      child.folder_names || parent.name
    from public.company_drive_items parent
    join folder_chain child on child.parent_id = parent.id
    where parent.company_id = requested_company_id
      and parent.category = 'shared'
      and parent.item_type = 'folder'
      and child.depth < 32
  )
  select folder_chain.folder_ids, folder_chain.folder_names
  from folder_chain
  cross join company_root
  where folder_chain.is_system
    and folder_chain.created_by = (select auth.uid())
    and folder_chain.parent_id = company_root.id
    and public.current_user_has_company_permission(requested_company_id, 'drive.view')
  limit 1;
$$;

revoke all on function public.company_drive_personal_folder_path(uuid, uuid) from public, anon;
grant execute on function public.company_drive_personal_folder_path(uuid, uuid) to authenticated;