alter table public.candidate_inquiries
  drop constraint if exists candidate_inquiries_job_of_interest_check;

do $$
declare
  job_interest_type text;
begin
  select data_type into job_interest_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'candidate_inquiries'
    and column_name = 'job_of_interest';

  if job_interest_type = 'text' then
    alter table public.candidate_inquiries
      alter column job_of_interest type text[]
      using array[job_of_interest];
  end if;
end;
$$;

alter table public.candidate_inquiries
  add constraint candidate_inquiries_job_of_interest_check
  check (
    cardinality(job_of_interest) between 1 and 20
    and array_position(job_of_interest, null) is null
  );

alter table public.candidate_inquiries
  drop constraint if exists candidate_inquiries_communication_method_check;
alter table public.candidate_inquiries
  add constraint candidate_inquiries_communication_method_check
  check (communication_method in ('call', 'text', 'both'));