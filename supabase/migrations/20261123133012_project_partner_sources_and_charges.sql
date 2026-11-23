create unique index if not exists suppliers_id_company_id_idx
  on public.suppliers (id, company_id);

alter table public.projects
  add column if not exists project_source_type text not null default 'contractor',
  add column if not exists partner_id uuid,
  add column if not exists partner_service_charge numeric not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_partner_company_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_partner_company_fkey
      foreign key (partner_id, company_id)
      references public.suppliers (id, company_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_source_type_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_source_type_check
      check (project_source_type in ('contractor', 'partner'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_partner_source_fields_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_partner_source_fields_check
      check (
        (
          project_source_type = 'contractor'
          and partner_id is null
          and partner_service_charge = 0
        )
        or (
          project_source_type = 'partner'
          and partner_id is not null
          and contractor_id is null
          and contractor_service_charge = 0
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_partner_service_charge_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_partner_service_charge_check
      check (partner_service_charge >= 0);
  end if;
end;
$$;

create index if not exists projects_company_partner_idx
  on public.projects (company_id, partner_id)
  where partner_id is not null;