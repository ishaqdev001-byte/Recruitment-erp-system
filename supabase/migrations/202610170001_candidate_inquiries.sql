create table if not exists public.candidate_inquiries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 200),
  last_name text not null check (length(trim(last_name)) between 1 and 200),
  phone text not null check (length(trim(phone)) between 1 and 100),
  discovery_source text not null check (discovery_source in ('radio', 'television', 'friend_referral', 'walk_in', 'sign_post', 'agent')),
  agent_user_id uuid references auth.users (id) on delete set null,
  agent_name text not null default '',
  desired_countries text[] not null check (cardinality(desired_countries) between 1 and 20),
  job_of_interest text not null check (length(trim(job_of_interest)) between 1 and 200),
  has_experience boolean not null default false,
  experience_description text not null default '' check (length(experience_description) <= 2000),
  communication_method text not null check (communication_method in ('call', 'text')),
  handled_by_user_id uuid not null references auth.users (id) on delete restrict,
  handled_by_name text not null check (length(trim(handled_by_name)) between 1 and 200),
  remarks text not null default '' check (length(remarks) <= 4000),
  status text not null default 'inquiry' check (status in ('inquiry', 'converted')),
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id),
  check ((discovery_source = 'agent' and agent_user_id is not null and length(trim(agent_name)) > 0)
    or (discovery_source <> 'agent' and agent_user_id is null and agent_name = '')),
  check (not has_experience or length(trim(experience_description)) > 0)
);

create index if not exists candidate_inquiries_company_status_created_idx
  on public.candidate_inquiries (company_id, status, created_at desc);
create index if not exists candidate_inquiries_reminder_due_idx
  on public.candidate_inquiries (company_id, last_reminded_at, created_at)
  where status = 'inquiry';

alter table public.candidates add column if not exists inquiry_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'candidates_inquiry_company_fk'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_inquiry_company_fk
      foreign key (inquiry_id, company_id)
      references public.candidate_inquiries (id, company_id) on delete set null (inquiry_id);
  end if;
end;
$$;
create unique index if not exists candidates_inquiry_company_uidx
  on public.candidates (company_id, inquiry_id)
  where inquiry_id is not null;

create table if not exists public.candidate_inquiry_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists candidate_inquiry_notifications_recipient_sent_idx
  on public.candidate_inquiry_notifications (company_id, recipient_id, sent_at desc);

alter table public.candidate_inquiries enable row level security;
alter table public.candidate_inquiry_notifications enable row level security;
revoke all on public.candidate_inquiries, public.candidate_inquiry_notifications from public, anon;
grant select, insert, update on public.candidate_inquiries to authenticated;
grant select, update on public.candidate_inquiry_notifications to authenticated;

drop policy if exists "Candidate inquiries are company and candidate-permission scoped" on public.candidate_inquiries;
create policy "Candidate inquiries are company and candidate-permission scoped" on public.candidate_inquiries
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'candidates.view')
    or public.current_user_has_company_permission(company_id, 'candidates.create')
  );
drop policy if exists "Authorized users can record candidate inquiries" on public.candidate_inquiries;
create policy "Authorized users can record candidate inquiries" on public.candidate_inquiries
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'candidates.create')
  );
drop policy if exists "Authorized users can edit candidate inquiries" on public.candidate_inquiries;
create policy "Authorized users can edit candidate inquiries" on public.candidate_inquiries
  for update to authenticated using (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
  ) with check (
    public.current_user_has_company_permission(company_id, 'candidates.edit')
  );
drop policy if exists "Inquiry reminders are recipient scoped" on public.candidate_inquiry_notifications;
create policy "Inquiry reminders are recipient scoped" on public.candidate_inquiry_notifications
  for select to authenticated using (
    recipient_id = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'candidates.view')
  );
drop policy if exists "Recipients can mark inquiry reminders read" on public.candidate_inquiry_notifications;
create policy "Recipients can mark inquiry reminders read" on public.candidate_inquiry_notifications
  for update to authenticated using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

create or replace function public.list_candidate_inquiry_people(requested_company_id uuid)
returns table (user_id uuid, display_name text, role_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select membership.user_id,
    coalesce(nullif(trim(profile.display_name), ''), 'Company user'),
    role.name
  from public.company_memberships membership
  join public.company_roles role on role.id = membership.role_id and role.company_id = membership.company_id
  left join public.profiles profile on profile.id = membership.user_id
  where membership.company_id = requested_company_id
    and membership.status = 'active'
    and (public.current_user_has_company_permission(requested_company_id, 'candidates.view')
      or public.current_user_has_company_permission(requested_company_id, 'candidates.create'))
  order by profile.display_name, role.name;
$$;
revoke all on function public.list_candidate_inquiry_people(uuid) from public, anon;
grant execute on function public.list_candidate_inquiry_people(uuid) to authenticated;

create or replace function public.dispatch_candidate_inquiry_reminders(requested_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_inquiry record;
  manager record;
  due_inquiry_ids uuid[] := '{}'::uuid[];
  candidate_names text := '';
  reminder_body text;
begin
  if (select auth.uid()) is null
    or not public.current_user_has_company_permission(requested_company_id, 'candidates.view') then
    return;
  end if;

  for due_inquiry in
    select inquiry.id, inquiry.first_name, inquiry.last_name
    from public.candidate_inquiries inquiry
    where inquiry.company_id = requested_company_id
      and inquiry.status = 'inquiry'
      and inquiry.created_at <= now() - interval '15 days'
      and (inquiry.last_reminded_at is null or inquiry.last_reminded_at <= now() - interval '15 days')
    order by inquiry.created_at
    for update
  loop
    due_inquiry_ids := array_append(due_inquiry_ids, due_inquiry.id);
    candidate_names := concat_ws(', ', nullif(candidate_names, ''), concat_ws(' ', due_inquiry.first_name, due_inquiry.last_name));
  end loop;

  if cardinality(due_inquiry_ids) = 0 then
    return;
  end if;

  for manager in
    select membership.user_id, coalesce(nullif(trim(profile.display_name), ''), 'Manager') as display_name
    from public.company_memberships membership
    join public.company_roles role on role.id = membership.role_id and role.company_id = membership.company_id
    left join public.profiles profile on profile.id = membership.user_id
    where membership.company_id = requested_company_id
      and membership.status = 'active'
      and role.name in ('General Manager', 'Supervisor', 'Recruitment Manager')
  loop
    reminder_body := 'Hello ' || manager.display_name
      || ', kindly follow up on these candidate(s) who came on inquiry but have not registered yet: '
      || candidate_names || '.';
    insert into public.candidate_inquiry_notifications (company_id, recipient_id, title, body)
    values (requested_company_id, manager.user_id, 'Candidate inquiry follow-up', reminder_body);
  end loop;

  if exists (
    select 1 from public.company_memberships membership
    join public.company_roles role on role.id = membership.role_id and role.company_id = membership.company_id
    where membership.company_id = requested_company_id and membership.status = 'active'
      and role.name in ('General Manager', 'Supervisor', 'Recruitment Manager')
  ) then
    update public.candidate_inquiries
    set last_reminded_at = now()
    where id = any(due_inquiry_ids);
  end if;
end;
$$;
revoke all on function public.dispatch_candidate_inquiry_reminders(uuid) from public, anon;
grant execute on function public.dispatch_candidate_inquiry_reminders(uuid) to authenticated;

create or replace function public.mark_candidate_inquiry_converted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.inquiry_id is null then
    return new;
  end if;

  update public.candidate_inquiries
  set status = 'converted', updated_at = now()
  where id = new.inquiry_id
    and company_id = new.company_id
    and status = 'inquiry';
  if not found then
    raise exception 'Candidate inquiry is not open for registration' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists candidates_mark_inquiry_converted on public.candidates;
create trigger candidates_mark_inquiry_converted
  after insert on public.candidates
  for each row when (new.inquiry_id is not null)
  execute function public.mark_candidate_inquiry_converted();
revoke all on function public.mark_candidate_inquiry_converted() from public, anon, authenticated;