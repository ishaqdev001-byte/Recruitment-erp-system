create or replace function public.generate_company_recruitment_agent_code(
  p_company_id uuid,
  p_name text,
  p_created_at timestamptz,
  p_agent_id uuid,
  p_avoid_code text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  initials text;
  prefix_length integer;
  digit_count integer;
  max_suffix integer;
  suffix_offset integer;
  seed_suffix integer;
  candidate_suffix integer;
  candidate_code text;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('company-recruitment-agent-code'),
    pg_catalog.hashtext(p_company_id::text)
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
      pg_catalog.btrim(p_name),
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
    max_suffix := pg_catalog.power(10, digit_count)::integer - 1;
    seed_suffix := (
      pg_catalog.mod(
        pg_catalog.floor(
          pg_catalog.date_part(
            'epoch',
            coalesce(p_created_at, pg_catalog.statement_timestamp())
          ) * 1000
        )::bigint,
        max_suffix::bigint
      ) + 1
    )::integer;

    for suffix_offset in 0..(max_suffix - 1) loop
      candidate_suffix := (seed_suffix - 1 + suffix_offset) % max_suffix + 1;
      candidate_code :=
        pg_catalog.left(initials, prefix_length) ||
        pg_catalog.lpad(candidate_suffix::text, digit_count, '0');

      if candidate_code is distinct from p_avoid_code
        and not exists (
          select 1
          from public.company_recruitment_agents agent
          where agent.company_id = p_company_id
            and agent.agent_code = candidate_code
            and agent.id is distinct from p_agent_id
        ) then
        return candidate_code;
      end if;
    end loop;
  end loop;

  raise exception 'No available five-character agent code remains for this company.'
    using errcode = '23505';
end;
$$;

revoke all on function public.generate_company_recruitment_agent_code(
  uuid, text, timestamptz, uuid, text
) from public, anon, authenticated;
grant execute on function public.generate_company_recruitment_agent_code(
  uuid, text, timestamptz, uuid, text
) to service_role;

create or replace function public.assign_company_recruitment_agent_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.agent_code is distinct from old.agent_code and old.agent_code is not null then
      if pg_catalog.current_setting('app.agent_code_regeneration', true) is distinct from 'on' then
        raise exception 'An agent code cannot be changed.'
          using errcode = '23514';
      end if;
    end if;
    if new.agent_code is not null then
      return new;
    end if;
  end if;

  new.agent_code := public.generate_company_recruitment_agent_code(
    new.company_id,
    new.name,
    new.created_at,
    new.id,
    null
  );
  return new;
end;
$$;

revoke all on function public.assign_company_recruitment_agent_code()
  from public, anon, authenticated;

do $$
declare
  agent record;
begin
  perform pg_catalog.set_config('app.agent_code_regeneration', 'on', true);

  for agent in
    select id, company_id, name, created_at, agent_code
    from public.company_recruitment_agents
    order by company_id, created_at, id
  loop
    update public.company_recruitment_agents
    set agent_code = public.generate_company_recruitment_agent_code(
      agent.company_id,
      agent.name,
      agent.created_at,
      agent.id,
      agent.agent_code
    )
    where id = agent.id;
  end loop;
end;
$$;