alter table public.requisition_payments
  add column if not exists branch_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'requisition_payments_branch_company_fk'
      and conrelid = 'public.requisition_payments'::regclass
  ) then
    alter table public.requisition_payments
      add constraint requisition_payments_branch_company_fk
      foreign key (branch_id, company_id)
      references public.company_branches (id, company_id)
      on delete set null;
  end if;
end;
$$;

update public.requisition_payments payment
set branch_id = requisition.branch_id
from public.company_requisitions requisition
where requisition.id = payment.requisition_id
  and requisition.company_id = payment.company_id
  and payment.branch_id is distinct from requisition.branch_id;

create index if not exists requisition_payments_branch_idx
  on public.requisition_payments (company_id, branch_id, payment_date desc);

drop policy if exists "Requisitions visible to company members"
  on public.company_requisitions;
create policy "Requisitions visible to authorized branch members"
  on public.company_requisitions for select to authenticated
  using (
    public.current_user_can_see_branch(company_id, branch_id)
    and (
      public.current_user_has_company_permission(company_id, 'requisitions.view')
      or (created_by = (select auth.uid())
        and public.current_user_has_company_permission(company_id, 'requisitions.create'))
      or public.current_user_has_company_permission(company_id, 'requisitions.review')
      or public.current_user_has_company_permission(company_id, 'requisitions.verify')
      or public.current_user_has_company_permission(company_id, 'requisitions.authorize')
    )
  );

drop policy if exists "Requisition items visible to company members"
  on public.company_requisition_items;
create policy "Requisition items visible to authorized branch members"
  on public.company_requisition_items for select to authenticated
  using (
    public.current_user_can_see_branch(company_id, branch_id)
    and (
      public.current_user_has_company_permission(company_id, 'requisitions.view')
      or exists (
        select 1
        from public.company_requisitions requisition
        where requisition.id = company_requisition_items.requisition_id
          and requisition.company_id = company_requisition_items.company_id
          and requisition.created_by = (select auth.uid())
          and public.current_user_has_company_permission(requisition.company_id, 'requisitions.create')
      )
      or public.current_user_has_company_permission(company_id, 'requisitions.review')
      or public.current_user_has_company_permission(company_id, 'requisitions.verify')
      or public.current_user_has_company_permission(company_id, 'requisitions.authorize')
    )
  );

drop policy if exists "Requisition payments visible to company members"
  on public.requisition_payments;
create policy "Requisition payments visible to authorized branch members"
  on public.requisition_payments for select to authenticated
  using (
    public.current_user_can_see_branch(company_id, branch_id)
    and (
      public.current_user_has_company_permission(company_id, 'requisitions.view')
      or public.current_user_has_company_permission(company_id, 'requisitions.verify')
      or exists (
        select 1
        from public.company_requisitions requisition
        where requisition.id = requisition_payments.requisition_id
          and requisition.company_id = requisition_payments.company_id
          and requisition.created_by = (select auth.uid())
          and public.current_user_has_company_permission(company_id, 'requisitions.create')
      )
    )
  );

create or replace function public.enforce_requisition_branch_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_branch_id uuid;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select membership.branch_id
    into membership_branch_id
    from public.company_memberships membership
    where membership.company_id = new.company_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
    limit 1;

    if not found then
      raise exception 'Active company membership required.' using errcode = '42501';
    end if;

    new.branch_id := membership_branch_id;
    return new;
  end if;

  if not public.current_user_can_see_branch(old.company_id, old.branch_id)
    or not public.current_user_can_see_branch(new.company_id, new.branch_id) then
    raise exception 'You cannot access requisitions outside your branch.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_requisition_branch_scope() from public, anon, authenticated;

drop trigger if exists company_requisitions_enforce_branch_scope
  on public.company_requisitions;
create trigger company_requisitions_enforce_branch_scope
  before insert or update on public.company_requisitions
  for each row execute function public.enforce_requisition_branch_scope();

create or replace function public.enforce_requisition_item_branch_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requisition_branch_id uuid;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    select requisition.branch_id
    into requisition_branch_id
    from public.company_requisitions requisition
    where requisition.id = new.requisition_id
      and requisition.company_id = new.company_id;

    if not found then
      raise exception 'Requisition not found.' using errcode = 'P0002';
    end if;

    if (select auth.uid()) is not null then
      if not public.current_user_can_see_branch(new.company_id, requisition_branch_id)
        or (tg_op = 'UPDATE' and not public.current_user_can_see_branch(old.company_id, old.branch_id)) then
        raise exception 'You cannot access requisition items outside your branch.' using errcode = '42501';
      end if;
    end if;

    new.branch_id := requisition_branch_id;
    return new;
  end if;

  if (select auth.uid()) is not null
    and not public.current_user_can_see_branch(old.company_id, old.branch_id) then
    raise exception 'You cannot access requisition items outside your branch.' using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke all on function public.enforce_requisition_item_branch_scope() from public, anon, authenticated;

drop trigger if exists company_requisition_items_enforce_branch_scope
  on public.company_requisition_items;
create trigger company_requisition_items_enforce_branch_scope
  before insert or update or delete on public.company_requisition_items
  for each row execute function public.enforce_requisition_item_branch_scope();

create or replace function public.enforce_requisition_payment_branch_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requisition_branch_id uuid;
  account_branch_id uuid;
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    select requisition.branch_id
    into requisition_branch_id
    from public.company_requisitions requisition
    where requisition.id = new.requisition_id
      and requisition.company_id = new.company_id;

    if not found then
      raise exception 'Requisition not found.' using errcode = 'P0002';
    end if;

    select account.branch_id
    into account_branch_id
    from public.company_accounts account
    where account.id = new.account_id
      and account.company_id = new.company_id;

    if (select auth.uid()) is not null then
      if not public.current_user_can_see_branch(new.company_id, requisition_branch_id)
        or not public.current_user_can_see_branch(new.company_id, account_branch_id)
        or (tg_op = 'UPDATE' and not public.current_user_can_see_branch(old.company_id, old.branch_id)) then
        raise exception 'You cannot access requisition payments outside your branch.' using errcode = '42501';
      end if;
    end if;

    new.branch_id := requisition_branch_id;
    return new;
  end if;

  if (select auth.uid()) is not null
    and not public.current_user_can_see_branch(old.company_id, old.branch_id) then
    raise exception 'You cannot access requisition payments outside your branch.' using errcode = '42501';
  end if;

  return old;
end;
$$;

revoke all on function public.enforce_requisition_payment_branch_scope() from public, anon, authenticated;

drop trigger if exists requisition_payments_enforce_branch_scope
  on public.requisition_payments;
create trigger requisition_payments_enforce_branch_scope
  before insert or update or delete on public.requisition_payments
  for each row execute function public.enforce_requisition_payment_branch_scope();

create or replace function public.enforce_requisition_transaction_branch_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_branch_id uuid;
begin
  if new.source_type is distinct from 'requisition_payment' then
    return new;
  end if;

  select payment.branch_id
  into payment_branch_id
  from public.requisition_payments payment
  where payment.id = new.source_id
    and payment.company_id = new.company_id;

  if not found then
    raise exception 'Requisition payment not found.' using errcode = 'P0002';
  end if;

  if (select auth.uid()) is not null
    and not public.current_user_can_see_branch(new.company_id, payment_branch_id) then
    raise exception 'You cannot access requisition transactions outside your branch.' using errcode = '42501';
  end if;

  new.branch_id := payment_branch_id;
  return new;
end;
$$;

revoke all on function public.enforce_requisition_transaction_branch_scope() from public, anon, authenticated;

drop trigger if exists company_account_transactions_requisition_branch_scope
  on public.company_account_transactions;
create trigger company_account_transactions_requisition_branch_scope
  before insert on public.company_account_transactions
  for each row execute function public.enforce_requisition_transaction_branch_scope();
