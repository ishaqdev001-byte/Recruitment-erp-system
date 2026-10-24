-- ═══════════════════════════════════════════════════════════════════════════
-- Payment Information Configuration
--
-- Stores company payment details used in invoice generation and payments
-- Each company can configure one or more payment methods with full details
-- Payment information is used by finance staff when generating invoices
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.company_payment_info (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  payment_method text not null check (length(trim(payment_method)) between 1 and 60),
  bank_name text not null default '' check (length(bank_name) <= 150),
  account_name text not null default '' check (length(account_name) <= 150),
  account_number text not null default '' check (length(account_number) <= 100),
  swift_code text not null default '' check (length(swift_code) <= 20),
  currency text not null default 'UGX' check (length(trim(currency)) between 1 and 10),
  payment_reference text not null default '' check (length(payment_reference) <= 100),
  description text not null default '' check (length(description) <= 500),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, company_id)
);

create unique index if not exists company_payment_info_default_uidx
  on public.company_payment_info (company_id)
  where is_default and is_active;
create index if not exists company_payment_info_company_active_idx
  on public.company_payment_info (company_id, is_active, payment_method);

-- Ensure company branding and address fields exist for invoice generation
alter table public.companies
  add column if not exists registration_number text not null default '',
  add column if not exists country text not null default '',
  add column if not exists city text not null default '',
  add column if not exists office_address text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists website text not null default '';

-- Trigger to update updated_at timestamp
drop trigger if exists company_payment_info_set_updated_at on public.company_payment_info;
create trigger company_payment_info_set_updated_at before update on public.company_payment_info
  for each row execute function public.set_updated_at();

-- Set only one default payment info per company
create or replace function public.ensure_single_default_payment_info()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default and new.is_active then
    update public.company_payment_info
    set is_default = false, updated_at = now()
    where company_id = new.company_id and id != new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists company_payment_info_ensure_default on public.company_payment_info;
create trigger company_payment_info_ensure_default before insert or update on public.company_payment_info
  for each row execute function public.ensure_single_default_payment_info();

-- Enable row level security
alter table public.company_payment_info enable row level security;

drop policy if exists "Payment info is tenant scoped" on public.company_payment_info;
create policy "Payment info is tenant scoped" on public.company_payment_info
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

drop policy if exists "Finance users can manage payment info" on public.company_payment_info;
create policy "Finance users can manage payment info" on public.company_payment_info
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

drop policy if exists "Finance users can update payment info" on public.company_payment_info;
create policy "Finance users can update payment info" on public.company_payment_info
  for update to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.create')
  ) with check (
    public.current_user_has_company_permission(company_id, 'finance.create')
  );

-- Grant permissions
revoke all on public.company_payment_info from public, anon, authenticated;
grant select on public.company_payment_info to authenticated;
grant insert, update on public.company_payment_info to authenticated;
grant select, insert, update, delete on public.company_payment_info to service_role;
