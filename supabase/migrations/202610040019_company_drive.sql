create table if not exists public.company_drive_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  parent_id uuid,
  item_type text not null check (item_type in ('folder', 'file')),
  category text not null default 'shared' check (category in ('shared', 'finance')),
  name text not null check (length(trim(name)) between 1 and 255 and name !~ '[\\/[:cntrl:]]'),
  is_system boolean not null default false,
  file_type text,
  mime_type text,
  file_size bigint,
  storage_path text,
  source_type text check (source_type in ('invoice', 'receipt')),
  source_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  modified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id, category),
  foreign key (parent_id, company_id, category)
    references public.company_drive_items (id, company_id, category) on delete restrict,
  check (
    (item_type = 'folder' and file_type is null and mime_type is null and file_size is null and storage_path is null and source_type is null and source_id is null)
    or
    (item_type = 'file' and file_type is not null and mime_type is not null and file_size > 0 and storage_path is not null)
  ),
  check ((source_type is null and source_id is null) or (category = 'finance' and item_type = 'file' and source_type is not null and source_id is not null)),
  check (storage_path is null or (
    storage_path like 'company/' || company_id::text || '/drive/%'
    and storage_path not like '%..%'
    and position(E'\\' in storage_path) = 0
  ))
);

create unique index if not exists company_drive_items_name_uidx
  on public.company_drive_items (company_id, category, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create unique index if not exists company_drive_items_source_uidx
  on public.company_drive_items (company_id, source_type, source_id)
  where source_type is not null and source_id is not null;
create index if not exists company_drive_items_parent_idx
  on public.company_drive_items (company_id, category, parent_id, item_type, lower(name));
create index if not exists company_drive_items_creator_idx
  on public.company_drive_items (company_id, created_by, created_at desc);
drop trigger if exists company_drive_items_set_updated_at on public.company_drive_items;
create trigger company_drive_items_set_updated_at before update on public.company_drive_items
  for each row execute function public.set_updated_at();

create or replace function public.is_company_drive_admin(requested_company_id uuid)
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
      and company_role.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager')
  );
$$;
revoke all on function public.is_company_drive_admin(uuid) from public, anon;
grant execute on function public.is_company_drive_admin(uuid) to authenticated;

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
      and company_role.name in ('Company Owner / Primary Administrator', 'Finance Manager')
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
language sql stable security definer
set search_path = ''
as $$
  select case
    when requested_category = 'finance' then
      public.is_company_drive_finance_user(requested_company_id)
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

insert into public.permissions (code, description) values
  ('drive.view', 'View company shared drive files and folders'),
  ('drive.upload', 'Upload files and create shared drive folders'),
  ('drive.edit', 'Rename company shared drive items'),
  ('drive.move', 'Move company shared drive items'),
  ('drive.delete.own', 'Delete shared drive files and folders created by the current user'),
  ('drive.delete.any', 'Delete any company shared drive file or folder'),
  ('drive.finance.view', 'View finance documents in the company drive'),
  ('drive.finance.manage', 'Manage finance documents in the company drive')
on conflict (code) do nothing;

create or replace function public.seed_company_drive_permissions_for_role()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.role_permissions (role_id, company_id, permission_code)
  values
    (new.id, new.company_id, 'drive.view'),
    (new.id, new.company_id, 'drive.upload'),
    (new.id, new.company_id, 'drive.edit'),
    (new.id, new.company_id, 'drive.move'),
    (new.id, new.company_id, 'drive.delete.own')
  on conflict (role_id, permission_code) do nothing;

  if new.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values (new.id, new.company_id, 'drive.delete.any')
    on conflict (role_id, permission_code) do nothing;
  end if;

  if new.name in ('Company Owner / Primary Administrator', 'Finance Manager') then
    insert into public.role_permissions (role_id, company_id, permission_code)
    values
      (new.id, new.company_id, 'drive.finance.view'),
      (new.id, new.company_id, 'drive.finance.manage')
    on conflict (role_id, permission_code) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists company_roles_seed_company_drive_permissions on public.company_roles;
create trigger company_roles_seed_company_drive_permissions
  after insert or update of name on public.company_roles
  for each row execute function public.seed_company_drive_permissions_for_role();
revoke all on function public.seed_company_drive_permissions_for_role() from public, anon, authenticated;

insert into public.role_permissions (role_id, company_id, permission_code)
select role.id, role.company_id, permission.code
from public.company_roles role
cross join public.permissions permission
where permission.code in ('drive.view', 'drive.upload', 'drive.edit', 'drive.move', 'drive.delete.own')
   or (role.name in ('Company Owner / Primary Administrator', 'CEO', 'General Manager') and permission.code = 'drive.delete.any')
   or (role.name in ('Company Owner / Primary Administrator', 'Finance Manager') and permission.code in ('drive.finance.view', 'drive.finance.manage'))
on conflict (role_id, permission_code) do nothing;

create or replace function public.validate_company_drive_parent()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  parent_type text;
begin
  if new.parent_id is null then return new; end if;

  select item.item_type into parent_type
  from public.company_drive_items item
  where item.id = new.parent_id
    and item.company_id = new.company_id
    and item.category = new.category;
  if parent_type is distinct from 'folder' then
    raise exception 'Select a folder in this company drive' using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' and new.item_type = 'folder' then
    if new.parent_id = old.id then
      raise exception 'A folder cannot be moved into itself' using errcode = '23514';
    end if;
    if exists (
      with recursive descendants(id) as (
        select old.id
        union all
        select child.id from public.company_drive_items child
        join descendants parent on child.parent_id = parent.id
      )
      select 1 from descendants where id = new.parent_id
    ) then
      raise exception 'A folder cannot be moved into one of its descendants' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists company_drive_items_validate_parent on public.company_drive_items;
create trigger company_drive_items_validate_parent before insert or update of parent_id, company_id, category, item_type on public.company_drive_items
  for each row execute function public.validate_company_drive_parent();
revoke all on function public.validate_company_drive_parent() from public, anon, authenticated;

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
    or old.file_type is distinct from new.file_type
    or old.mime_type is distinct from new.mime_type
    or old.file_size is distinct from new.file_size
    or old.storage_path is distinct from new.storage_path
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
drop trigger if exists company_drive_items_identity_immutable on public.company_drive_items;
create trigger company_drive_items_identity_immutable before update on public.company_drive_items
  for each row execute function public.prevent_company_drive_identity_change();
revoke all on function public.prevent_company_drive_identity_change() from public, anon;

create or replace function public.audit_company_drive_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  drive_item public.company_drive_items%rowtype;
  action_name text;
begin
  drive_item := case when tg_op = 'DELETE' then old else new end;
  action_name := case
    when tg_op = 'INSERT' and drive_item.item_type = 'folder' then 'drive_folder_created'
    when tg_op = 'INSERT' then 'drive_file_uploaded'
    when tg_op = 'DELETE' and drive_item.item_type = 'folder' then 'drive_folder_deleted'
    when tg_op = 'DELETE' then 'drive_file_deleted'
    when old.parent_id is distinct from new.parent_id then 'drive_item_moved'
    else 'drive_item_renamed'
  end;
  insert into public.audit_logs (company_id, user_id, action, entity_type, entity_id, metadata)
  values (
    drive_item.company_id, (select auth.uid()), action_name, 'company_drive_item', drive_item.id,
    jsonb_build_object('name', drive_item.name, 'category', drive_item.category, 'item_type', drive_item.item_type, 'created_by', drive_item.created_by)
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists company_drive_items_audit on public.company_drive_items;
create trigger company_drive_items_audit after insert or update or delete on public.company_drive_items
  for each row execute function public.audit_company_drive_change();
revoke all on function public.audit_company_drive_change() from public, anon, authenticated;

alter table public.company_drive_items enable row level security;
drop policy if exists "Company drive items are permission scoped" on public.company_drive_items;
create policy "Company drive items are permission scoped" on public.company_drive_items
  for select to authenticated using (
    public.can_access_company_drive(company_id, category, 'view', created_by)
  );
drop policy if exists "Company users can create drive items" on public.company_drive_items;
create policy "Company users can create drive items" on public.company_drive_items
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and modified_by = (select auth.uid())
    and public.can_access_company_drive(company_id, category, 'create', created_by)
  );
drop policy if exists "Company users can edit or move drive items" on public.company_drive_items;
create policy "Company users can edit or move drive items" on public.company_drive_items
  for update to authenticated using (
    public.can_access_company_drive(company_id, category, 'edit', created_by)
  ) with check (
    modified_by = (select auth.uid())
    and public.can_access_company_drive(company_id, category, 'edit', created_by)
  );
drop policy if exists "Creators and company drive admins can delete items" on public.company_drive_items;
create policy "Creators and company drive admins can delete items" on public.company_drive_items
  for delete to authenticated using (
    public.can_access_company_drive(company_id, category, 'delete', created_by)
    and (not is_system or public.is_company_drive_admin(company_id))
  );

drop policy if exists "Company drive users can view company membership names" on public.company_memberships;
create policy "Company drive users can view company membership names" on public.company_memberships
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'drive.view')
  );
drop policy if exists "Company drive users can view company profiles" on public.profiles;
create policy "Company drive users can view company profiles" on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.company_memberships membership
      where membership.user_id = profiles.id
        and public.current_user_has_company_permission(membership.company_id, 'drive.view')
    )
  );

drop policy if exists "Company drive users can view company identity" on public.companies;
create policy "Company drive users can view company identity" on public.companies
  for select to authenticated using (
    public.current_user_has_company_permission(id, 'drive.view')
  );

grant select, insert, update, delete on public.company_drive_items to authenticated;