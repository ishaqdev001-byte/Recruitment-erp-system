-- Requisition payments and verifier item-edit capability.
-- Finance / cashier can adjust item qty/rate while at the finance_review stage,
-- then record one or more payments against a requisition once it is fully approved.

-- ─── Requisition payments ───────────────────────────────────────────────────────

create table if not exists public.requisition_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  requisition_id uuid not null references public.company_requisitions (id) on delete cascade,
  account_id uuid not null,
  amount numeric(16, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  reference text not null default '' check (length(reference) <= 100),
  notes text not null default '' check (length(notes) <= 1000),
  recorded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- Enforce account belongs to same company
  foreign key (account_id, company_id)
    references public.company_accounts (id, company_id) on delete restrict
);

create index if not exists requisition_payments_requisition_idx
  on public.requisition_payments (company_id, requisition_id, payment_date desc);
create index if not exists requisition_payments_account_idx
  on public.requisition_payments (company_id, account_id);

alter table public.requisition_payments enable row level security;
revoke all on public.requisition_payments from public, anon, authenticated;
grant select on public.requisition_payments to authenticated;

create policy "Requisition payments visible to company members"
  on public.requisition_payments for select to authenticated
  using (
    exists (
      select 1 from public.company_memberships m
      where m.company_id = requisition_payments.company_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- Add payment-tracking columns to company_requisitions
alter table public.company_requisitions
  add column if not exists amount_paid numeric(16, 2) not null default 0,
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partial', 'paid'));

-- ─── RPC: update_requisition_items_as_verifier ──────────────────────────────────
-- Finance / cashier can edit items while the requisition is at finance_review stage.
-- Only qty, rate, and description per item can be changed; the header is untouched.

create or replace function public.update_requisition_items_as_verifier(
  p_company_id uuid,
  p_requisition_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_total numeric(16,2) := 0;
  v_item jsonb;
  v_sort integer := 0;
  v_item_qty numeric(14,4);
  v_item_rate numeric(14,2);
begin
  -- Permission check
  if not public.current_user_has_company_permission(p_company_id, 'requisitions.verify') then
    raise exception 'You do not have permission to edit requisition items at this stage.' using errcode = '42501';
  end if;

  select * into v_req
  from public.company_requisitions
  where id = p_requisition_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Requisition not found.' using errcode = 'P0002';
  end if;

  -- Only editable while at the finance_review stage
  if v_req.status <> 'finance_review' then
    raise exception 'Items can only be edited by Finance at the Finance Review stage.' using errcode = '22023';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one line item is required.' using errcode = '22023';
  end if;

  -- Replace all items
  delete from public.company_requisition_items
  where requisition_id = p_requisition_id and company_id = p_company_id;

  for v_item in select jsonb_array_elements(p_items)
  loop
    v_item_qty := (v_item->>'quantity')::numeric(14,4);
    v_item_rate := (v_item->>'rate')::numeric(14,2);
    if v_item_qty <= 0 or v_item_rate < 0 then
      raise exception 'Each item must have a positive quantity and non-negative rate.' using errcode = '22023';
    end if;
    insert into public.company_requisition_items (
      company_id, requisition_id, description, quantity, rate, sort_order
    ) values (
      p_company_id, p_requisition_id,
      trim(v_item->>'description'),
      v_item_qty, v_item_rate, v_sort
    );
    v_total := v_total + (v_item_qty * v_item_rate);
    v_sort := v_sort + 1;
  end loop;

  update public.company_requisitions
  set total_amount = v_total
  where id = p_requisition_id and company_id = p_company_id;

  return jsonb_build_object('requisition_id', p_requisition_id, 'total_amount', v_total);
end;
$$;

-- ─── RPC: record_requisition_payment ────────────────────────────────────────────

create or replace function public.record_requisition_payment(
  p_company_id uuid,
  p_requisition_id uuid,
  p_account_id uuid,
  p_amount numeric(16,2),
  p_payment_date date,
  p_reference text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req record;
  v_new_paid numeric(16,2);
  v_payment_status text;
  v_payment_id uuid;
begin
  -- Permission check
  if not public.current_user_has_company_permission(p_company_id, 'requisitions.verify') then
    raise exception 'You do not have permission to record requisition payments.' using errcode = '42501';
  end if;

  -- Validate account is active and belongs to this company
  if not exists (
    select 1 from public.company_accounts a
    where a.id = p_account_id and a.company_id = p_company_id and a.status = 'active'
  ) then
    raise exception 'Select an active company account.' using errcode = '22023';
  end if;

  select * into v_req
  from public.company_requisitions
  where id = p_requisition_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Requisition not found.' using errcode = 'P0002';
  end if;

  -- Only approved requisitions can be paid
  if v_req.status <> 'approved' then
    raise exception 'Only fully authorised requisitions can be paid.' using errcode = '22023';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = '22023';
  end if;

  -- Calculate new paid total
  v_new_paid := v_req.amount_paid + p_amount;

  -- Determine payment status
  if v_new_paid >= v_req.total_amount then
    v_payment_status := 'paid';
    -- Cap at total_amount to prevent overpayment rounding issues
    v_new_paid := least(v_new_paid, v_req.total_amount);
  else
    v_payment_status := 'partial';
  end if;

  -- Insert payment record
  insert into public.requisition_payments (
    company_id, requisition_id, account_id, amount,
    payment_date, reference, notes, recorded_by
  ) values (
    p_company_id, p_requisition_id, p_account_id, p_amount,
    coalesce(p_payment_date, current_date),
    coalesce(trim(p_reference), ''),
    coalesce(trim(p_notes), ''),
    auth.uid()
  )
  returning id into v_payment_id;

  -- Update requisition paid amount and status
  update public.company_requisitions
  set amount_paid = v_new_paid,
      payment_status = v_payment_status
  where id = p_requisition_id and company_id = p_company_id;

  -- Post a debit ledger entry on the account
  insert into public.company_account_transactions (
    company_id, account_id, transaction_type, direction, amount,
    transaction_date, payment_method, reference, description,
    source_type, source_id, created_by
  ) values (
    p_company_id, p_account_id, 'expense', 'debit', p_amount,
    coalesce(p_payment_date, current_date),
    'Requisition Payment',
    coalesce(nullif(trim(p_reference), ''), v_req.requisition_number),
    'Requisition payment: ' || v_req.requisition_number || ' — ' || v_req.title,
    'requisition_payment', v_payment_id,
    auth.uid()
  );

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'amount_paid', v_new_paid,
    'total_amount', v_req.total_amount,
    'balance', greatest(v_req.total_amount - v_new_paid, 0),
    'payment_status', v_payment_status
  );
end;
$$;
