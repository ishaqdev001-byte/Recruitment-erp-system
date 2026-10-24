-- ═══════════════════════════════════════════════════════════════════════════
-- Invoice Sharing System
--
-- Stores invoice sharing records for sharing invoices with agents and external recipients
-- Tracks who shared which invoice with whom and when
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.invoice_shares (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  recipient_email text not null check (length(trim(recipient_email)) between 5 and 254),
  message text not null default '' check (length(message) <= 500),
  shared_by uuid not null references auth.users (id) on delete restrict,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (invoice_id, company_id) references public.invoices (id, company_id) on delete cascade
);

create index if not exists invoice_shares_company_invoice_idx
  on public.invoice_shares (company_id, invoice_id);
create index if not exists invoice_shares_recipient_email_idx
  on public.invoice_shares (company_id, recipient_email);
create index if not exists invoice_shares_created_at_idx
  on public.invoice_shares (company_id, created_at desc);

-- Enable row level security
alter table public.invoice_shares enable row level security;

drop policy if exists "Invoice shares are tenant and permission scoped" on public.invoice_shares;
create policy "Invoice shares are tenant and permission scoped" on public.invoice_shares
  for select to authenticated using (
    public.current_user_has_company_permission(company_id, 'finance.view')
  );

drop policy if exists "Authorized users can share invoices" on public.invoice_shares;
create policy "Authorized users can share invoices" on public.invoice_shares
  for insert to authenticated with check (
    shared_by = (select auth.uid())
    and public.current_user_has_company_permission(company_id, 'finance.create')
  );

-- Grant permissions
revoke all on public.invoice_shares from public, anon, authenticated;
grant select on public.invoice_shares to authenticated;
grant insert on public.invoice_shares to authenticated;
grant select, insert, update on public.invoice_shares to service_role;
