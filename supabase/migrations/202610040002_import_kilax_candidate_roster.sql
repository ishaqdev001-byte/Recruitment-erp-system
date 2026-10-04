alter table public.candidates
  add column if not exists source_row_number smallint,
  add column if not exists phone text not null default '',
  add column if not exists date_of_birth date,
  add column if not exists place_of_birth text not null default '',
  add column if not exists agent_name text not null default '',
  add column if not exists religion text not null default '',
  add column if not exists position text not null default '',
  add column if not exists nationality text not null default '',
  add column if not exists father_name text not null default '',
  add column if not exists mother_name text not null default '';

create unique index if not exists candidates_company_source_row_idx
  on public.candidates (company_id, source_row_number)
  where source_row_number is not null;

create table if not exists public.candidate_passports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  candidate_id uuid not null,
  passport_number text not null,
  issue_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, company_id),
  foreign key (candidate_id, company_id)
    references public.candidates (id, company_id) on delete cascade
);

create index if not exists candidate_passports_company_expiry_idx
  on public.candidate_passports (company_id, expiry_date);

alter table public.candidate_passports enable row level security;

create policy "Passport details require company passport permission" on public.candidate_passports
  for select to authenticated
  using (public.current_user_has_company_permission(company_id, 'passport.view'));
create policy "Authorized users can create passport details" on public.candidate_passports
  for insert to authenticated
  with check (public.current_user_has_company_permission(company_id, 'passport.edit'));
create policy "Authorized users can edit passport details" on public.candidate_passports
  for update to authenticated
  using (public.current_user_has_company_permission(company_id, 'passport.edit'))
  with check (public.current_user_has_company_permission(company_id, 'passport.edit'));
create policy "Authorized users can delete passport details" on public.candidate_passports
  for delete to authenticated
  using (public.current_user_has_company_permission(company_id, 'passport.edit'));

grant select, insert, update, delete on public.candidate_passports to authenticated;

insert into public.company_roles (id, company_id, name)
values (
  '8f42d7e3-2aa0-44c1-971b-b72b923e8e01',
  '7b4f08da-81a8-4f4b-9f74-31c326dae701',
  'Company Owner / Primary Administrator'
)
on conflict (id) do nothing;

insert into public.role_permissions (role_id, company_id, permission_code)
select
  '8f42d7e3-2aa0-44c1-971b-b72b923e8e01',
  '7b4f08da-81a8-4f4b-9f74-31c326dae701',
  permission.code
from public.permissions permission
on conflict (role_id, permission_code) do nothing;

insert into public.candidates (
  id, company_id, source_row_number, file_number, first_name, last_name, phone,
  date_of_birth, place_of_birth, agent_name, religion, position, nationality,
  father_name, mother_name
) values
  ('a1000000-0000-4000-8000-000000000001', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 1, 'KDR-0001', 'OWEN', 'BABU', '785496222', '1992-09-01', 'JINJA', 'ssebu', 'Christian', 'Male Cleaner', 'Ugandan', 'SEBUGUZI HENRY', 'NALUKENGE RITAH'),
  ('a1000000-0000-4000-8000-000000000002', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 2, 'KDR-0002', 'BASITWA', 'KALOKE', '755846284', '2006-08-08', 'SSEMBABULE', 'pamu', 'Muslim', 'Male Cleaner', 'Ugandan', 'TADEO GOMBA', 'NAKAMATE RUTH'),
  ('a1000000-0000-4000-8000-000000000003', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 3, 'KDR-0003', 'JOEL', 'MAYAMBALA', '714236854', '1991-03-24', 'ENTEBBE', 'lukia', 'Christian', 'Male Cleaner', 'Ugandan', 'BYARUHANGA JOHN', 'ANKWASA LYNNET'),
  ('a1000000-0000-4000-8000-000000000004', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 4, 'KDR-0004', 'RONALD', 'AGABA', '784598634', '1993-08-22', 'NTUNGAMO', 'ann', 'Christian', 'Male Cleaner', 'Ugandan', 'LUKOWA LUKE', 'NABYOYA RITA'),
  ('a1000000-0000-4000-8000-000000000005', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 5, 'KDR-0005', 'ALISON', 'SSEJEMBA', '782456942', '1991-12-24', 'KALUNGI', 'tiwi', 'Christian', 'Male Cleaner', 'Ugandan', 'HUZAAFA TOM', 'NAMAGANDA RITAH'),
  ('a1000000-0000-4000-8000-000000000006', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 6, 'KDR-0006', 'ALLAN', 'KYAGULANYI', '784512521', '2001-02-24', 'WAKISO', 'sam', 'Muslim', 'Male Cleaner', 'Ugandan', 'SSEKABILA MAHADI', 'NAGAWA NURU'),
  ('a1000000-0000-4000-8000-000000000007', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 7, 'KDR-0007', 'VICTOR', 'NIWAHEREZA', '781743407', '2004-04-09', 'KAZO', 'franko', 'Christian', 'Male Cleaner', 'Ugandan', 'KATUMBA ABDURAHUMAN', 'NAKANWAGI JULIAN'),
  ('a1000000-0000-4000-8000-000000000008', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 8, 'KDR-0008', 'MUZAMILU', 'WANDALI', '701816962', '1982-10-25', 'MBALE', 'ssebu', 'Christian', 'Male Cleaner', 'Ugandan', 'SETUMBA WILFRED', 'NABUKEERA FLORENCE'),
  ('a1000000-0000-4000-8000-000000000009', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 9, 'KDR-0009', 'AMUPIIRE', 'ABEL', '750941800', '1996-01-05', 'KAMWEZI', 'lukia', 'Christian', 'Male Cleaner', 'Ugandan', 'NSUBUGA ALEX', 'NANDUDU WINNE'),
  ('a1000000-0000-4000-8000-000000000010', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 10, 'KDR-0010', 'BRIAN RYAN', 'NIWAGABA', '756785721', '2002-09-18', 'MAYA', 'lukia', 'Christian', 'Male Cleaner', 'Ugandan', 'ASSIMWE JONAH', 'KOBUSOZI JENIAH'),
  ('a1000000-0000-4000-8000-000000000011', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 11, 'KDR-0011', 'BUKENYA', 'SOLOMON', '784553678', '2001-08-10', 'KAMPALA', 'flavia', 'Christian', 'Male Cleaner', 'Ugandan', 'LUFAYA HUZAIFAH', 'NAKABUUSI MERCY'),
  ('a1000000-0000-4000-8000-000000000012', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 12, 'KDR-0012', 'DENIS', 'KATUMBA', '781181098', '1998-11-11', 'MBALWA', 'flavia', 'Christian', 'Male Cleaner', 'Ugandan', 'KASOZI FRANK', 'NAKAYIMA IRENE'),
  ('a1000000-0000-4000-8000-000000000013', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 13, 'KDR-0013', 'HENRY', 'KUGUMA', '744822843', '1999-03-23', 'ENTEBBE', 'pegiun', 'Christian', 'Male Cleaner', 'Ugandan', 'SSEKYANI MARK', 'NAMAKULA GORETY'),
  ('a1000000-0000-4000-8000-000000000014', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 14, 'KDR-0014', 'CHARLES', 'KAKYANJA', '700502897', '1999-07-11', 'LUGAZI', 'pigbu', 'Christian', 'Male Cleaner', 'Ugandan', 'SSEKYANI STUART', 'NANSOVE SHAMIRAH'),
  ('a1000000-0000-4000-8000-000000000015', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 15, 'KDR-0015', 'BENSON', 'MAGEZI', '778239408', '1992-05-07', 'KANUNGU', 'papito', 'Christian', 'Male Cleaner', 'Ugandan', 'SSEKANDI TOM', 'NDAGIRE SARAH'),
  ('a1000000-0000-4000-8000-000000000016', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 16, 'KDR-0016', 'SAJJA', 'MUZAMIRU', '700316584', '2000-07-16', 'IGANGA', 'omuto', 'Christian', 'Male Cleaner', 'Ugandan', 'MUTUMBA TOM', 'TUSIIME SHAMIM'),
  ('a1000000-0000-4000-8000-000000000017', '7b4f08da-81a8-4f4b-9f74-31c326dae701', 17, 'KDR-0017', 'SOWED', 'KULABAKO', '788536942', '2000-11-09', 'JINJA', 'swabula', 'Christian', 'Male Cleaner', 'Ugandan', 'WUDAYA KAFERO', 'KIYOLE MARY')
on conflict (company_id, file_number) do nothing;

insert into public.candidate_passports (
  company_id, candidate_id, passport_number, issue_date, expiry_date
)
select
  candidate.company_id,
  candidate.id,
  passport.passport_number,
  passport.issue_date::date,
  passport.expiry_date::date
from (values
  ('KDR-0001', 'A00270682', '2020-09-01', '2030-08-31'),
  ('KDR-0002', 'B00498243', '2024-11-15', '2034-11-14'),
  ('KDR-0003', 'B00739530', '2025-11-10', '2035-11-09'),
  ('KDR-0004', 'A00055110', '2019-04-11', '2029-04-10'),
  ('KDR-0005', 'B00797225', '2026-02-17', '2036-02-16'),
  ('KDR-0006', 'A01058723', '2023-03-07', '2033-03-06'),
  ('KDR-0007', 'B00791633', '2026-02-09', '2036-02-08'),
  ('KDR-0008', 'B00546386', '2025-01-29', '2035-01-28'),
  ('KDR-0009', 'A00633491', '2022-02-25', '2032-02-24'),
  ('KDR-0010', 'B00797368', '2026-02-18', '2036-02-18'),
  ('KDR-0011', 'B00533726', '2025-01-13', '2035-01-12'),
  ('KDR-0012', 'B00698209', '2025-09-11', '2035-09-10'),
  ('KDR-0013', 'A00535770', '2021-11-18', '2031-11-17'),
  ('KDR-0014', 'A00385942', '2021-04-22', '2031-04-21'),
  ('KDR-0015', 'A00282736', '2020-10-15', '2030-10-14'),
  ('KDR-0016', 'B00818650', '2026-03-16', '2036-03-15'),
  ('KDR-0017', 'B00624054', '2025-05-22', '2035-05-21')
) as passport(file_number, passport_number, issue_date, expiry_date)
join public.candidates candidate
  on candidate.company_id = '7b4f08da-81a8-4f4b-9f74-31c326dae701'
 and candidate.file_number = passport.file_number
on conflict (candidate_id, company_id) do nothing;