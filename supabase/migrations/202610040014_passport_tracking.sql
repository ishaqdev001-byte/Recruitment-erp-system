create table if not exists public.passport_tracking_sequences (
  company_id uuid primary key references public.companies (id) on delete cascade,
  last_number integer not null default 0 check (last_number >= 0)
);

alter table public.candidate_passports
  add column if not exists tracking_number integer,
  add column if not exists passport_status text not null default 'available',
  add column if not exists storage_branch text not null default '',
  add column if not exists storage_location text not null default '',
  add column if not exists withdrawn_at date,
  add column if not exists withdrawal_requested_by text not null default '',
  add column if not exists transferred_at date,
  add column if not exists transfer_destination text not null default '',
  add column if not exists status_updated_by uuid references auth.users (id) on delete set null;

update public.candidate_passports passport
set storage_branch = coalesce(nullif(candidate.details ->> 'passportBranch', ''), ''),
    storage_location = coalesce(nullif(candidate.details ->> 'passportStorageLocation', ''), ''),
    passport_status = case
      when lower(coalesce(candidate.details ->> 'passportStatus', '')) in ('with agent', 'with_agent') then 'with_agent'
      when nullif(candidate.details ->> 'passportBranch', '') is not null
        and nullif(candidate.details ->> 'passportStorageLocation', '') is not null then 'available'
      when length(trim(candidate.agent_name)) > 0 then 'with_agent'
      else 'available'
    end
from public.candidates candidate
where candidate.id = passport.candidate_id and candidate.company_id = passport.company_id;

with max_tracking as (
  select company_id, coalesce(max(tracking_number), 0) as max_number
  from public.candidate_passports
  group by company_id
), unnumbered as (
  select passport.id,
    coalesce(max_tracking.max_number, 0) + row_number() over (
      partition by passport.company_id order by passport.created_at, passport.id
    ) as next_number
  from public.candidate_passports passport
  left join max_tracking on max_tracking.company_id = passport.company_id
  where passport.tracking_number is null
)
update public.candidate_passports passport
set tracking_number = unnumbered.next_number
from unnumbered
where passport.id = unnumbered.id;

alter table public.candidate_passports
  alter column tracking_number set not null,
  drop constraint if exists candidate_passports_passport_status_check,
  drop constraint if exists candidate_passports_tracking_number_positive,
  drop constraint if exists candidate_passports_withdrawn_details,
  drop constraint if exists candidate_passports_transfer_details,
  add constraint candidate_passports_passport_status_check
    check (passport_status in ('available', 'with_agent', 'withdrawn', 'transferred')),
  add constraint candidate_passports_tracking_number_positive check (tracking_number > 0),
  add constraint candidate_passports_withdrawn_details check (
    passport_status <> 'withdrawn' or (withdrawn_at is not null and length(trim(withdrawal_requested_by)) > 0)
  ),
  add constraint candidate_passports_transfer_details check (
    passport_status <> 'transferred' or (transferred_at is not null and length(trim(transfer_destination)) > 0)
  );

create unique index if not exists candidate_passports_company_tracking_idx
  on public.candidate_passports (company_id, tracking_number);
create index if not exists candidate_passports_company_status_idx
  on public.candidate_passports (company_id, passport_status);

insert into public.passport_tracking_sequences (company_id, last_number)
select company_id, max(tracking_number)
from public.candidate_passports
group by company_id
on conflict (company_id) do update
  set last_number = greatest(public.passport_tracking_sequences.last_number, excluded.last_number);

create or replace function public.assign_passport_tracking_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tracking_number is null then
    insert into public.passport_tracking_sequences (company_id, last_number)
    values (new.company_id, 1)
    on conflict (company_id) do update
      set last_number = public.passport_tracking_sequences.last_number + 1
    returning last_number into new.tracking_number;
  end if;
  return new;
end;
$$;
drop trigger if exists candidate_passports_assign_tracking_number on public.candidate_passports;
create trigger candidate_passports_assign_tracking_number before insert on public.candidate_passports
  for each row execute function public.assign_passport_tracking_number();
revoke all on function public.assign_passport_tracking_number() from public, anon, authenticated;

create or replace function public.sync_candidate_passport()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  passport_number_value text := trim(coalesce(new.details ->> 'passportNumber', ''));
  requested_status text := lower(trim(coalesce(new.details ->> 'passportStatus', 'available')));
  normalized_status text;
  branch_value text := trim(coalesce(new.details ->> 'passportBranch', ''));
  location_value text := trim(coalesce(new.details ->> 'passportStorageLocation', ''));
  issue_value date;
  expiry_value date;
begin
  if passport_number_value = '' then
    return new;
  end if;

  if requested_status in ('with agent', 'with_agent') then
    normalized_status := 'with_agent';
  else
    normalized_status := 'available';
  end if;

  if coalesce(new.details ->> 'passportIssue', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then
    issue_value := (new.details ->> 'passportIssue')::date;
  end if;
  if coalesce(new.details ->> 'passportExpiry', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' then
    expiry_value := (new.details ->> 'passportExpiry')::date;
  end if;

  insert into public.candidate_passports (
    company_id, candidate_id, passport_number, issue_date, expiry_date,
    passport_status, storage_branch, storage_location, status_updated_by
  ) values (
    new.company_id, new.id, passport_number_value, issue_value, expiry_value,
    normalized_status, branch_value, location_value, (select auth.uid())
  )
  on conflict (candidate_id, company_id) do update set
    passport_number = excluded.passport_number,
    issue_date = excluded.issue_date,
    expiry_date = excluded.expiry_date,
    storage_branch = case when candidate_passports.passport_status in ('available', 'with_agent') then excluded.storage_branch else candidate_passports.storage_branch end,
    storage_location = case when candidate_passports.passport_status in ('available', 'with_agent') then excluded.storage_location else candidate_passports.storage_location end,
    passport_status = case when candidate_passports.passport_status in ('available', 'with_agent') then excluded.passport_status else candidate_passports.passport_status end;
  return new;
end;
$$;
drop trigger if exists candidates_sync_passport on public.candidates;
create trigger candidates_sync_passport after insert or update on public.candidates
  for each row execute function public.sync_candidate_passport();
revoke all on function public.sync_candidate_passport() from public, anon, authenticated;

create or replace function public.list_passport_tracking(requested_company_id uuid)
returns table (
  id uuid,
  candidate_id uuid,
  tracking_number integer,
  passport_number text,
  issue_date date,
  expiry_date date,
  passport_status text,
  storage_branch text,
  storage_location text,
  withdrawn_at date,
  withdrawal_requested_by text,
  transferred_at date,
  transfer_destination text,
  candidate_name text,
  file_number text,
  agent_name text,
  company_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select passport.id, passport.candidate_id, passport.tracking_number, passport.passport_number,
    passport.issue_date, passport.expiry_date, passport.passport_status, passport.storage_branch,
    passport.storage_location, passport.withdrawn_at, passport.withdrawal_requested_by,
    passport.transferred_at, passport.transfer_destination,
    concat_ws(' ', candidate.first_name, candidate.last_name), candidate.file_number,
    candidate.agent_name, company.name
  from public.candidate_passports passport
  join public.candidates candidate on candidate.id = passport.candidate_id and candidate.company_id = passport.company_id
  join public.companies company on company.id = passport.company_id
  where passport.company_id = requested_company_id
    and public.current_user_has_company_permission(requested_company_id, 'passport.view')
  order by passport.tracking_number;
$$;
revoke all on function public.list_passport_tracking(uuid) from public, anon;
grant execute on function public.list_passport_tracking(uuid) to authenticated;

drop trigger if exists candidate_passports_set_updated_at on public.candidate_passports;
create trigger candidate_passports_set_updated_at before update on public.candidate_passports
  for each row execute function public.set_updated_at();