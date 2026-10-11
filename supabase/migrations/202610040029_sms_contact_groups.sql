create table if not exists public.sms_contact_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index if not exists sms_contact_groups_company_name_idx
  on public.sms_contact_groups (company_id, lower(name));

create table if not exists public.sms_contact_group_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  group_id uuid not null,
  display_name text not null default '' check (length(display_name) <= 200),
  phone text not null check (length(trim(phone)) between 1 and 40),
  contact_type text not null default 'Other' check (contact_type in ('Candidate', 'Employer', 'Staff', 'Other')),
  candidate_id uuid,
  created_at timestamptz not null default now(),
  foreign key (company_id, group_id) references public.sms_contact_groups (company_id, id) on delete cascade,
  unique (group_id, phone)
);

create index if not exists sms_contact_group_members_company_group_idx
  on public.sms_contact_group_members (company_id, group_id);

alter table public.sms_contact_groups enable row level security;
alter table public.sms_contact_group_members enable row level security;

drop policy if exists "SMS groups are company scoped" on public.sms_contact_groups;
create policy "SMS groups are company scoped" on public.sms_contact_groups
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'communications.sms.send')
  );

drop policy if exists "Authorized users manage SMS groups" on public.sms_contact_groups;
create policy "Authorized users manage SMS groups" on public.sms_contact_groups
  for all to authenticated using (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.sms.send')
  ) with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'communications.sms.send')
  );

drop policy if exists "SMS group members are company scoped" on public.sms_contact_group_members;
create policy "SMS group members are company scoped" on public.sms_contact_group_members
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'communications.sms.send')
  );

drop policy if exists "Authorized users manage SMS group members" on public.sms_contact_group_members;
create policy "Authorized users manage SMS group members" on public.sms_contact_group_members
  for all to authenticated using (
    public.current_user_has_company_permission(company_id, 'communications.sms.send')
    and exists (
      select 1 from public.sms_contact_groups group_record
      where group_record.id = group_id and group_record.company_id = sms_contact_group_members.company_id
    )
  ) with check (
    public.current_user_has_company_permission(company_id, 'communications.sms.send')
    and exists (
      select 1 from public.sms_contact_groups group_record
      where group_record.id = group_id and group_record.company_id = sms_contact_group_members.company_id
    )
  );

revoke all on public.sms_contact_groups, public.sms_contact_group_members from anon;
grant select, insert, update, delete on public.sms_contact_groups, public.sms_contact_group_members to authenticated;