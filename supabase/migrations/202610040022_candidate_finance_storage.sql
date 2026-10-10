do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_record.conname
    from pg_constraint constraint_record
    where constraint_record.conrelid = 'public.company_drive_items'::regclass
      and constraint_record.contype = 'c'
      and pg_get_constraintdef(constraint_record.oid) ilike '%storage_path%'
      and pg_get_constraintdef(constraint_record.oid) ilike '%/drive/%'
  loop
    execute format('alter table public.company_drive_items drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.company_drive_items
  add constraint company_drive_items_storage_path_check
  check (
    storage_path is null
    or (
      (
        storage_path like 'company/' || company_id::text || '/drive/%'
        or storage_path like 'company/' || company_id::text || '/finance/%'
      )
      and storage_path not like '%..%'
      and position(E'\\' in storage_path) = 0
    )
  );

create or replace function public.prevent_company_drive_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.id is distinct from new.id
    or old.company_id is distinct from new.company_id
    or old.category is distinct from new.category
    or old.item_type is distinct from new.item_type
    or (
      old.file_type is distinct from new.file_type
      or old.mime_type is distinct from new.mime_type
      or old.file_size is distinct from new.file_size
      or old.storage_path is distinct from new.storage_path
    )
    and not (
      (
        old.category = 'finance'
        and new.category = 'finance'
        and public.is_company_drive_finance_user(old.company_id)
      )
      or (
        old.category = 'shared'
        and new.category = 'shared'
        and old.created_by = (select auth.uid())
        and public.current_user_has_company_permission(old.company_id, 'drive.upload')
      )
    )
    or old.source_type is distinct from new.source_type
    or old.source_id is distinct from new.source_id
    or old.created_by is distinct from new.created_by
    or old.is_system is distinct from new.is_system
    or new.modified_by is distinct from (select auth.uid())
    or (old.is_system and (old.parent_id is distinct from new.parent_id or old.name is distinct from new.name)
      and not public.is_company_drive_admin(old.company_id)) then
    raise exception 'Drive item ownership and storage metadata are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;