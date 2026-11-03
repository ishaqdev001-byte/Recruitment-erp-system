create table public.staff_chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  sender_id uuid not null,
  recipient_id uuid,
  body text not null,
  created_at timestamptz not null default now(),
  constraint staff_chat_messages_sender_membership_fk
    foreign key (company_id, sender_id)
    references public.company_memberships (company_id, user_id)
    on delete cascade,
  constraint staff_chat_messages_recipient_membership_fk
    foreign key (company_id, recipient_id)
    references public.company_memberships (company_id, user_id)
    on delete cascade,
  constraint staff_chat_messages_body_check
    check (length(btrim(body)) between 1 and 4000),
  constraint staff_chat_messages_recipient_check
    check (recipient_id is null or recipient_id <> sender_id)
);

create index staff_chat_group_messages_idx
  on public.staff_chat_messages (company_id, created_at desc)
  where recipient_id is null;

create index staff_chat_direct_messages_idx
  on public.staff_chat_messages (company_id, sender_id, recipient_id, created_at desc)
  where recipient_id is not null;

alter table public.staff_chat_messages enable row level security;
revoke all on public.staff_chat_messages from public, anon, authenticated;
grant select, insert on public.staff_chat_messages to authenticated;

create policy "Active company members can read their staff chat messages"
  on public.staff_chat_messages for select to authenticated
  using (
    exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = staff_chat_messages.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and (
          staff_chat_messages.recipient_id is null
          or staff_chat_messages.sender_id = (select auth.uid())
          or staff_chat_messages.recipient_id = (select auth.uid())
        )
    )
  );

create policy "Active company members can send staff chat messages"
  on public.staff_chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships sender_membership
      where sender_membership.company_id = staff_chat_messages.company_id
        and sender_membership.user_id = (select auth.uid())
        and sender_membership.status = 'active'
    )
    and (
      recipient_id is null
      or exists (
        select 1
        from public.company_memberships recipient_membership
        where recipient_membership.company_id = staff_chat_messages.company_id
          and recipient_membership.user_id = staff_chat_messages.recipient_id
          and recipient_membership.status = 'active'
      )
    )
  );

create or replace function public.notify_staff_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
  notification_title text;
  notification_body text;
begin
  select coalesce(nullif(btrim(profile.display_name), ''), 'A colleague')
    into sender_name
  from public.profiles profile
  where profile.id = new.sender_id;

  if new.recipient_id is null then
    notification_title := 'New staff group message';
    notification_body := sender_name || ' posted a message in staff chat.';
  else
    notification_title := 'New private staff message';
    notification_body := 'You have a private message from ' || sender_name || '.';
  end if;

  insert into public.workspace_notifications (
    company_id,
    recipient_id,
    required_permission,
    category,
    title,
    body,
    source_type,
    source_id
  )
  select
    new.company_id,
    membership.user_id,
    'staff_chat.view',
    'communications',
    notification_title,
    notification_body,
    'staff_chat.message',
    new.id
  from public.company_memberships membership
  where membership.company_id = new.company_id
    and membership.status = 'active'
    and membership.user_id <> new.sender_id
    and (
      new.recipient_id is null
      or membership.user_id = new.recipient_id
    );

  return new;
end;
$$;

revoke all on function public.notify_staff_chat_message()
  from public, anon, authenticated;

create trigger staff_chat_message_notification
  after insert on public.staff_chat_messages
  for each row execute function public.notify_staff_chat_message();

create or replace function private.can_deliver_workspace_notification(
  requested_company_id uuid,
  requested_user_id uuid,
  requested_permission text,
  requested_source_type text,
  requested_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships membership
    join public.company_roles role
      on role.id = membership.role_id
     and role.company_id = membership.company_id
    where membership.company_id = requested_company_id
      and membership.user_id = requested_user_id
      and membership.status = 'active'
      and (
        (
          requested_permission = 'staff_chat.view'
          and requested_source_type = 'staff_chat.message'
          and exists (
            select 1
            from public.staff_chat_messages message
            where message.id = requested_source_id
              and message.company_id = requested_company_id
              and (
                message.recipient_id is null
                or message.recipient_id = requested_user_id
              )
          )
        )
        or (
          requested_permission <> 'medical.alerts.view'
          and requested_permission <> 'staff_chat.view'
          and exists (
            select 1
            from public.role_permissions permission
            where permission.company_id = membership.company_id
              and permission.role_id = membership.role_id
              and permission.permission_code = requested_permission
          )
        )
        or (
          requested_permission = 'medical.alerts.view'
          and requested_source_type = 'medical.unfit-alert'
          and exists (
            select 1
            from public.medical_appointments appointment
            join public.companies company
              on company.id = appointment.company_id
            where appointment.id = requested_source_id
              and appointment.company_id = requested_company_id
              and (
                exists (
                  select 1
                  from public.role_permissions permission
                  where permission.company_id = membership.company_id
                    and permission.role_id = membership.role_id
                    and permission.permission_code = 'medical.alerts.view'
                )
                or requested_user_id = company.primary_admin_user_id
                or requested_user_id = appointment.created_by
                or lower(trim(role.name)) = 'supervisor'
              )
          )
        )
      )
  );
$$;

revoke all on function private.can_deliver_workspace_notification(
  uuid, uuid, text, text, uuid
) from public, anon, authenticated;