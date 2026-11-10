alter table public.sms_message_logs
  add column if not exists candidate_ids uuid[] not null default array[]::uuid[];

create table public.candidate_agent_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  request_id uuid not null,
  sender_id uuid not null,
  recipient_id uuid not null,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  body text not null check (length(btrim(body)) between 1 and 480),
  candidate_ids uuid[] not null default array[]::uuid[],
  candidate_names text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  foreign key (company_id, sender_id)
    references public.company_memberships (company_id, user_id) on delete cascade,
  foreign key (company_id, recipient_id)
    references public.company_memberships (company_id, user_id) on delete cascade,
  unique (company_id, request_id, recipient_id)
);

create index candidate_agent_notes_inbox_idx
  on public.candidate_agent_notes (company_id, recipient_id, created_at desc);

alter table public.candidate_agent_notes enable row level security;
revoke all on public.candidate_agent_notes from public, anon, authenticated;
grant select, insert on public.candidate_agent_notes to authenticated;

create policy "Recruitment agents can read only their candidate notes"
  on public.candidate_agent_notes for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
       and role.company_id = membership.company_id
      where membership.company_id = candidate_agent_notes.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and lower(trim(role.name)) = 'recruitment agent'
    )
  );

create policy "SMS senders can create candidate agent notes"
  on public.candidate_agent_notes for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.company_memberships sender
      join public.role_permissions permission
        on permission.company_id = sender.company_id
       and permission.role_id = sender.role_id
       and permission.permission_code = 'communications.sms.send'
      where sender.company_id = candidate_agent_notes.company_id
        and sender.user_id = (select auth.uid())
        and sender.status = 'active'
    )
    and public.current_user_has_company_permission(
      candidate_agent_notes.company_id,
      'candidates.view'
    )
    and exists (
      select 1
      from public.sms_message_logs sms_log
      where sms_log.company_id = candidate_agent_notes.company_id
        and sms_log.request_id = candidate_agent_notes.request_id
        and sms_log.created_by = (select auth.uid())
        and sms_log.provider_status = 'sent'
        and sms_log.message = candidate_agent_notes.body
        and candidate_agent_notes.candidate_ids <@ sms_log.candidate_ids
    )
    and exists (
      select 1
      from public.company_memberships recipient
      join public.company_roles role
        on role.id = recipient.role_id
       and role.company_id = recipient.company_id
      where recipient.company_id = candidate_agent_notes.company_id
        and recipient.user_id = candidate_agent_notes.recipient_id
        and recipient.status = 'active'
        and lower(trim(role.name)) = 'recruitment agent'
    )
    and cardinality(candidate_agent_notes.candidate_ids) > 0
    and cardinality(candidate_agent_notes.candidate_ids) = (
      select count(*)
      from public.candidates candidate
      where candidate.company_id = candidate_agent_notes.company_id
        and candidate.agent_user_id = candidate_agent_notes.recipient_id
        and candidate.id = any(candidate_agent_notes.candidate_ids)
    )
    and cardinality(candidate_agent_notes.candidate_names) =
      cardinality(candidate_agent_notes.candidate_ids)
  );

create or replace function public.notify_candidate_agent_note()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  values (
    new.company_id,
    new.recipient_id,
    'candidates.view',
    'communications',
    'New message from your company',
    new.subject,
    'candidate.agent-note',
    new.id
  );
  return new;
end;
$$;

revoke all on function public.notify_candidate_agent_note() from public, anon, authenticated;

create trigger candidate_agent_note_notification
  after insert on public.candidate_agent_notes
  for each row execute function public.notify_candidate_agent_note();

drop policy if exists "Workspace communications are recipient and candidate permission scoped"
  on public.workspace_communications;

create policy "Workspace communications are recipient and candidate permission scoped"
  on public.workspace_communications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'candidates.view')
    and not exists (
      select 1
      from public.company_memberships membership
      join public.company_roles role
        on role.id = membership.role_id
       and role.company_id = membership.company_id
      where membership.company_id = workspace_communications.company_id
        and membership.user_id = (select auth.uid())
        and membership.status = 'active'
        and lower(trim(role.name)) = 'recruitment agent'
    )
  );