alter table public.staff_chat_messages
  add constraint staff_chat_messages_id_company_unique unique (id, company_id);

create table public.staff_chat_message_reads (
  message_id uuid not null references public.staff_chat_messages (id) on delete cascade,
  company_id uuid not null,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint staff_chat_message_reads_message_company_fk
    foreign key (message_id, company_id)
    references public.staff_chat_messages (id, company_id)
    on delete cascade,
  constraint staff_chat_message_reads_membership_fk
    foreign key (company_id, user_id)
    references public.company_memberships (company_id, user_id)
    on delete cascade
);

create index staff_chat_message_reads_company_user_idx
  on public.staff_chat_message_reads (company_id, user_id, read_at desc);

alter table public.staff_chat_message_reads enable row level security;
revoke all on public.staff_chat_message_reads from public, anon, authenticated;
grant select, insert on public.staff_chat_message_reads to authenticated;

create policy "Message authors can view their read receipts"
  on public.staff_chat_message_reads for select to authenticated
  using (
    exists (
      select 1
      from public.staff_chat_messages message
      where message.id = staff_chat_message_reads.message_id
        and message.company_id = staff_chat_message_reads.company_id
        and message.sender_id = (select auth.uid())
    )
  );

create policy "Active chat recipients can mark messages read"
  on public.staff_chat_message_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships membership
      join public.staff_chat_messages message
        on message.company_id = membership.company_id
       and message.id = staff_chat_message_reads.message_id
      where membership.company_id = staff_chat_message_reads.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and message.sender_id <> (select auth.uid())
        and (
          message.recipient_id is null
          or message.recipient_id = (select auth.uid())
        )
    )
  );

create table public.staff_chat_message_hidden (
  message_id uuid not null references public.staff_chat_messages (id) on delete cascade,
  company_id uuid not null,
  user_id uuid not null,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint staff_chat_message_hidden_message_company_fk
    foreign key (message_id, company_id)
    references public.staff_chat_messages (id, company_id)
    on delete cascade,
  constraint staff_chat_message_hidden_membership_fk
    foreign key (company_id, user_id)
    references public.company_memberships (company_id, user_id)
    on delete cascade
);

alter table public.staff_chat_message_hidden enable row level security;
revoke all on public.staff_chat_message_hidden from public, anon, authenticated;

grant delete on public.staff_chat_messages to authenticated;

create policy "Staff can delete their own private messages for everyone"
  on public.staff_chat_messages for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and recipient_id is not null
  );

create policy "Company owners and managers can delete group messages"
  on public.staff_chat_messages for delete to authenticated
  using (
    recipient_id is null
    and (
      exists (
        select 1
        from public.companies company
        where company.id = staff_chat_messages.company_id
          and company.primary_admin_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.company_memberships membership
        join public.company_roles role
          on role.id = membership.role_id
         and role.company_id = membership.company_id
        where membership.company_id = staff_chat_messages.company_id
          and membership.user_id = (select auth.uid())
          and membership.status = 'active'
          and lower(trim(role.name)) in ('general manager', 'supervisor')
      )
    )
  );

create policy "Private recipients can hide messages for themselves"
  on public.staff_chat_message_hidden for all to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.staff_chat_messages message
      where message.id = staff_chat_message_hidden.message_id
        and message.company_id = staff_chat_message_hidden.company_id
        and message.recipient_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships membership
      join public.staff_chat_messages message
        on message.company_id = membership.company_id
       and message.id = staff_chat_message_hidden.message_id
      where membership.company_id = staff_chat_message_hidden.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and message.recipient_id = (select auth.uid())
    )
  );

create or replace function public.cleanup_staff_chat_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.workspace_notifications
  where company_id = old.company_id
    and source_type = 'staff_chat.message'
    and source_id = old.id;
  return old;
end;
$$;

revoke all on function public.cleanup_staff_chat_message_notifications()
  from public, anon, authenticated;

create trigger staff_chat_message_notification_cleanup
  before delete on public.staff_chat_messages
  for each row
  execute function public.cleanup_staff_chat_message_notifications();