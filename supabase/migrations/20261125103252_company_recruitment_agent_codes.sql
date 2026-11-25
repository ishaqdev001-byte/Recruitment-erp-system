alter table public.company_recruitment_agents
  add column agent_code text;

create function public.assign_company_recruitment_agent_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  initials text;
  prefix_length integer;
  digit_count integer;
  suffix_number integer;
  candidate_code text;
begin
  if tg_op = 'UPDATE' then
    if new.agent_code is distinct from old.agent_code and old.agent_code is not null then
      raise exception 'An agent code cannot be changed.'
        using errcode = '23514';
    end if;
    if new.agent_code is not null then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('company-recruitment-agent-code'),
    pg_catalog.hashtext(new.company_id::text)
  );

  select pg_catalog.upper(
    coalesce(
      pg_catalog.string_agg(
        pg_catalog.left(clean_word, 1),
        '' order by word_position
      ),
      ''
    )
  )
  into initials
  from (
    select
      word_position,
      pg_catalog.regexp_replace(word, '[^A-Za-z]', '', 'g') as clean_word
    from pg_catalog.regexp_split_to_table(
      pg_catalog.btrim(new.name),
      '\s+'
    ) with ordinality as split_words(word, word_position)
    where pg_catalog.regexp_replace(word, '[^A-Za-z]', '', 'g') <> ''
    order by word_position
    limit 3
  ) name_initials;

  if initials = '' then
    initials := 'A';
  end if;

  for prefix_length in reverse least(3, pg_catalog.length(initials))..1 loop
    digit_count := 5 - prefix_length;

    for suffix_number in 0..(pg_catalog.power(10, digit_count)::integer - 1) loop
      candidate_code :=
        pg_catalog.left(initials, prefix_length) ||
        pg_catalog.lpad(suffix_number::text, digit_count, '0');

      if not exists (
        select 1
        from public.company_recruitment_agents agent
        where agent.company_id = new.company_id
          and agent.agent_code = candidate_code
          and agent.id is distinct from new.id
      ) then
        new.agent_code := candidate_code;
        return new;
      end if;
    end loop;
  end loop;

  raise exception 'No available five-character agent code remains for this company.'
    using errcode = '23505';
end;
$$;

revoke all on function public.assign_company_recruitment_agent_code()
  from public, anon, authenticated;

create trigger company_recruitment_agents_assign_code
  before insert or update of name, agent_code
  on public.company_recruitment_agents
  for each row
  execute function public.assign_company_recruitment_agent_code();

update public.company_recruitment_agents
set name = name
where agent_code is null;

alter table public.company_recruitment_agents
  alter column agent_code set not null,
  add constraint company_recruitment_agents_agent_code_format
    check (
      length(agent_code) = 5
      and agent_code ~ '^[A-Z]{1,3}[0-9]{2,4}$'
    );

create unique index company_recruitment_agents_company_code_idx
  on public.company_recruitment_agents (company_id, agent_code);