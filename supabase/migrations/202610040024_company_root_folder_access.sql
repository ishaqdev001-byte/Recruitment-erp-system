create or replace function public.current_user_has_active_company_membership(requested_company_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
  );
$$;
revoke all on function public.current_user_has_active_company_membership(uuid) from public, anon;
grant execute on function public.current_user_has_active_company_membership(uuid) to authenticated;

create or replace function public.can_access_candidate_document(requested_company_id uuid, requested_document_type text, requested_action text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case
    when requested_action in ('view', 'download') then
      public.current_user_has_active_company_membership(requested_company_id)
    else
      public.current_user_has_company_permission(requested_company_id, 'documents.' || requested_action)
      and (requested_document_type <> 'medical'
        or public.current_user_has_company_permission(requested_company_id, 'medical_documents.view'))
      and (requested_document_type <> 'passport'
        or public.current_user_has_company_permission(requested_company_id, 'passport.view'))
  end;
$$;

drop policy if exists "Candidates are tenant and permission scoped" on public.candidates;
drop policy if exists "Company members can view candidate folders" on public.candidates;
create policy "Company members can view candidate folders" on public.candidates
  for select to authenticated using (public.current_user_has_active_company_membership(company_id));

create or replace function public.is_company_drive_finance_user(requested_company_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles company_role
      on company_role.id = membership.role_id and company_role.company_id = membership.company_id
    where membership.user_id = (select auth.uid())
      and membership.company_id = requested_company_id
      and membership.status = 'active'
      and (
        company_role.name in ('Company Owner / Primary Administrator', 'Primary Administrator', 'CEO', 'General Manager')
        or company_role.name ilike 'Finance %'
        or public.current_user_has_company_permission(requested_company_id, 'drive.finance.view')
      )
  );
$$;
revoke all on function public.is_company_drive_finance_user(uuid) from public, anon;
grant execute on function public.is_company_drive_finance_user(uuid) to authenticated;

create or replace function public.can_access_company_drive(
  requested_company_id uuid,
  requested_category text,
  requested_action text,
  requested_creator_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when requested_category = 'finance' then
      case requested_action
        when 'view' then public.is_company_drive_finance_user(requested_company_id)
        when 'create' then public.current_user_has_company_permission(requested_company_id, 'drive.finance.manage')
        when 'edit' then public.current_user_has_company_permission(requested_company_id, 'drive.finance.manage')
        when 'move' then public.current_user_has_company_permission(requested_company_id, 'drive.finance.manage')
        when 'delete' then public.is_company_drive_admin(requested_company_id)
          or public.current_user_has_company_permission(requested_company_id, 'drive.finance.manage')
        else false
      end
    when requested_category = 'shared' then
      case requested_action
        when 'view' then public.current_user_has_company_permission(requested_company_id, 'drive.view')
        when 'create' then public.current_user_has_company_permission(requested_company_id, 'drive.upload')
        when 'edit' then public.current_user_has_company_permission(requested_company_id, 'drive.edit')
        when 'move' then public.current_user_has_company_permission(requested_company_id, 'drive.move')
        when 'delete' then public.is_company_drive_admin(requested_company_id)
          or (requested_creator_id = (select auth.uid()) and public.current_user_has_company_permission(requested_company_id, 'drive.delete.own'))
        else false
      end
    else false
  end;
$$;
revoke all on function public.can_access_company_drive(uuid, text, text, uuid) from public, anon;
grant execute on function public.can_access_company_drive(uuid, text, text, uuid) to authenticated;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, 'drive.finance.view'
from public.company_roles role
where role.name in ('Company Owner / Primary Administrator', 'Primary Administrator', 'CEO', 'General Manager', 'Finance Manager', 'Finance User')
on conflict (role_id, permission_code) do nothing;

insert into public.company_drive_items (
  company_id, parent_id, item_type, category, name, is_system, created_by, modified_by
)
select root.company_id, root.id, 'folder', 'shared', 'Users', true, root.created_by, root.created_by
from public.company_drive_items root
where root.category = 'shared'
  and root.item_type = 'folder'
  and root.is_system
  and root.parent_id is null
  and not exists (
    select 1 from public.company_drive_items users_folder
    where users_folder.company_id = root.company_id
      and users_folder.category = 'shared'
      and users_folder.parent_id = root.id
      and users_folder.item_type = 'folder'
      and users_folder.is_system
      and lower(users_folder.name) = 'users'
  );

drop trigger if exists company_drive_items_identity_immutable on public.company_drive_items;
drop trigger if exists company_drive_items_audit on public.company_drive_items;
update public.company_drive_items user_folder
set parent_id = users_folder.id
from public.company_drive_items company_root
join public.company_drive_items users_folder
  on users_folder.company_id = company_root.company_id
  and users_folder.category = 'shared'
  and users_folder.parent_id = company_root.id
  and users_folder.item_type = 'folder'
  and users_folder.is_system
  and lower(users_folder.name) = 'users'
where user_folder.company_id = company_root.company_id
  and user_folder.category = 'shared'
  and user_folder.parent_id = company_root.id
  and user_folder.item_type = 'folder'
  and user_folder.is_system
  and user_folder.id <> users_folder.id
  and company_root.category = 'shared'
  and company_root.item_type = 'folder'
  and company_root.is_system
  and company_root.parent_id is null;

update public.company_drive_items owner_item
set parent_id = company_root.id
from public.company_drive_items owner_folder
join public.company_drive_items users_folder on users_folder.id = owner_folder.parent_id
join public.company_drive_items company_root on company_root.id = users_folder.parent_id
join public.companies company on company.id = owner_folder.company_id
where owner_item.parent_id = owner_folder.id
  and owner_folder.company_id = company.id
  and owner_folder.created_by = company.primary_admin_user_id
  and owner_folder.category = 'shared'
  and owner_folder.item_type = 'folder'
  and owner_folder.is_system
  and owner_folder.parent_id = users_folder.id
  and lower(users_folder.name) = 'users'
  and company_root.parent_id is null;

delete from public.company_drive_items owner_folder
using public.company_drive_items users_folder,
      public.company_drive_items company_root,
      public.companies company
where owner_folder.parent_id = users_folder.id
  and users_folder.parent_id = company_root.id
  and owner_folder.company_id = company.id
  and owner_folder.created_by = company.primary_admin_user_id
  and owner_folder.category = 'shared'
  and owner_folder.item_type = 'folder'
  and owner_folder.is_system
  and users_folder.category = 'shared'
  and users_folder.item_type = 'folder'
  and users_folder.is_system
  and lower(users_folder.name) = 'users'
  and company_root.category = 'shared'
  and company_root.item_type = 'folder'
  and company_root.is_system
  and company_root.parent_id is null;

create or replace function public.prevent_company_drive_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
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

create trigger company_drive_items_identity_immutable before update on public.company_drive_items
  for each row execute function public.prevent_company_drive_identity_change();
create trigger company_drive_items_audit after insert or update or delete on public.company_drive_items
  for each row execute function public.audit_company_drive_change();

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
  ), users_folder as (
    select item.id
    from public.company_drive_items item
    join company_root root on item.parent_id = root.id
    where item.company_id = requested_company_id
      and item.category = 'shared'
      and item.item_type = 'folder'
      and item.is_system
      and lower(item.name) = 'users'
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
  join users_folder on folder_chain.parent_id = users_folder.id
  where folder_chain.is_system
    and folder_chain.created_by = (select auth.uid())
    and public.current_user_has_company_permission(requested_company_id, 'drive.view')
  limit 1;
$$;
revoke all on function public.company_drive_personal_folder_path(uuid, uuid) from public, anon;
grant execute on function public.company_drive_personal_folder_path(uuid, uuid) to authenticated;