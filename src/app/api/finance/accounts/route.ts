import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const accountTypes = ["cash", "bank", "mobile_money", "project", "other"] as const;
const transactionTypes = ["deposit", "withdrawal"] as const;
const paymentMethods = ["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"] as const;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getAccountsAccess(permission: "finance.view" | "finance.create") {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id, role_id, branch_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };
  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) return { error: "You do not have permission to access company accounts.", status: 403 as const };
  const { data: isMainBranch, error: branchError } = await supabase.rpc("current_user_is_main_branch_user", {
    requested_company_id: membership.company_id,
  });
  if (branchError || (!isMainBranch && !membership.branch_id)) return { error: "Unable to verify your company branch.", status: 503 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Accounts require SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };
  const [{ data: company, error: companyError }, { data: role, error: roleError }] = await Promise.all([
    admin.from("companies").select("primary_admin_user_id").eq("id", membership.company_id).maybeSingle(),
    admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
  ]);
  if (companyError || roleError || !company || !role) return { error: "Unable to verify account access.", status: 500 as const };
  const canManageAccounts = company.primary_admin_user_id === user.id
    || ["CEO", "Finance Manager"].includes(role.name);
  const canAdministerAccounts = company.primary_admin_user_id === user.id || role.name === "CEO";
  return {
    admin,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id,
    isMainBranch: Boolean(isMainBranch),
    canManageAccounts,
    canAdministerAccounts,
  };
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export async function GET(request: Request) {
  try {
    const access = await getAccountsAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (new URL(request.url).searchParams.get("options") === "1") {
      const accountsQuery = access.admin.from("company_accounts").select("id, name, account_type, account_number, status")
        .eq("company_id", access.companyId).eq("status", "active").order("name");
      if (!access.isMainBranch) accountsQuery.eq("branch_id", access.branchId!);
      const [{ data: accounts, error: accountError }, { data: canCreate, error: createError }] = await Promise.all([
        accountsQuery,
        (await createSupabaseServerClient()).rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "finance.create" }),
      ]);
      if (accountError || createError) throw accountError ?? createError;
      return NextResponse.json({
        accounts: accounts ?? [],
        permissions: { canCreate: Boolean(canCreate), canManageAccounts: access.canManageAccounts, canAdministerAccounts: access.canAdministerAccounts },
      }, { headers });
    }
    const accountsQuery = access.admin.from("company_accounts")
      .select("id, name, account_type, account_number, description, status, created_at")
      .eq("company_id", access.companyId).order("name");
    const ledgerQuery = access.admin.from("company_account_transactions")
      .select("id, account_id, transaction_type, direction, amount, transaction_date, payment_method, reference, description, source_type, source_id, created_at")
      .eq("company_id", access.companyId).order("transaction_date", { ascending: false }).order("created_at", { ascending: false });
    const expensesQuery = access.admin.from("company_expenses")
      .select("id, account_id, expense_type, description, paid_to, amount, payment_method, reference, paid_at, created_at")
      .eq("company_id", access.companyId).order("paid_at", { ascending: false });
    if (!access.isMainBranch) {
      accountsQuery.eq("branch_id", access.branchId!);
      ledgerQuery.eq("branch_id", access.branchId!);
      expensesQuery.eq("branch_id", access.branchId!);
    }
    const [{ data: accounts, error: accountError }, { data: ledger, error: ledgerError }, { data: expenses, error: expenseError }, { data: canCreate, error: createError }] = await Promise.all([
      accountsQuery,
      ledgerQuery,
      expensesQuery,
      (await createSupabaseServerClient()).rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "finance.create" }),
    ]);
    if (accountError || ledgerError || expenseError || createError) throw accountError ?? ledgerError ?? expenseError ?? createError;
    const totals = new Map<string, number>();
    for (const entry of ledger ?? []) {
      totals.set(entry.account_id, (totals.get(entry.account_id) ?? 0) + (entry.direction === "credit" ? 1 : -1) * Number(entry.amount));
    }
    const accountsWithBalances = (accounts ?? []).map((account) => ({ ...account, balance: Math.round((totals.get(account.id) ?? 0) * 100) / 100 }));
    const accountNames = new Map(accountsWithBalances.map((account) => [account.id, account.name]));
    return NextResponse.json({
      accounts: accountsWithBalances,
      transactions: (ledger ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount), account_name: accountNames.get(entry.account_id) ?? "Account" })),
      expenses: (expenses ?? []).map((expense) => ({ ...expense, amount: Number(expense.amount), account_name: accountNames.get(expense.account_id) ?? "Account" })),
      totals: {
        accountCount: accountsWithBalances.filter((account) => account.status === "active").length,
        totalBalance: Math.round(accountsWithBalances.reduce((sum, account) => sum + account.balance, 0) * 100) / 100,
      },
      permissions: { canCreate: Boolean(canCreate), canManageAccounts: access.canManageAccounts, canAdministerAccounts: access.canAdministerAccounts },
    }, { headers });
  } catch (error) {
    console.error("Company accounts request failed", error);
    return NextResponse.json({ error: "Company accounts are unavailable. Apply the company accounts migration and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccountsAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Choose an account action." }, { status: 400, headers });

    if (body.action === "create-account") {
      if (!access.canManageAccounts) return NextResponse.json({ error: "Only the company owner, CEO, or Finance Manager can create accounts." }, { status: 403, headers });
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const accountType = body.accountType;
      const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const openingBalance = Number(body.openingBalance ?? 0);
      if (!name || name.length > 120 || !accountTypes.includes(accountType as (typeof accountTypes)[number])
        || accountNumber.length > 100 || description.length > 500 || !Number.isFinite(openingBalance) || openingBalance < 0 || openingBalance > 999999999999.99) {
        return NextResponse.json({ error: "Enter a valid account name, type, and opening balance." }, { status: 400, headers });
      }
      const accountId = randomUUID();
      const { data: account, error } = await access.admin.from("company_accounts").insert({
        id: accountId,
        company_id: access.companyId,
        name,
        account_type: accountType,
        account_number: accountNumber,
        description,
        branch_id: access.branchId,
        created_by: access.userId,
      }).select("id, name, account_type, account_number, description, status, created_at").single();
      if (error?.code === "23505") return NextResponse.json({ error: "An account with this name already exists." }, { status: 409, headers });
      if (error || !account) throw error ?? new Error("Account was not created.");
      if (openingBalance > 0) {
        const { error: openingError } = await access.admin.from("company_account_transactions").insert({
          company_id: access.companyId,
          branch_id: access.branchId,
          account_id: account.id,
          transaction_type: "opening_balance",
          direction: "credit",
          amount: Math.round(openingBalance * 100) / 100,
          transaction_date: validDate(body.openingDate) ? body.openingDate : new Date().toISOString().slice(0, 10),
          payment_method: "Other",
          reference: `OPEN-${account.id.slice(0, 8).toUpperCase()}`,
          description: "Opening balance",
          source_type: "account_opening",
          source_id: account.id,
          created_by: access.userId,
        });
        if (openingError) {
          await access.admin.from("company_accounts").delete().eq("id", account.id).eq("company_id", access.companyId);
          throw openingError;
        }
      }
      return NextResponse.json({ account }, { status: 201, headers });
    }

    if (body.action === "rename-account") {
      if (!access.canAdministerAccounts) return NextResponse.json({ error: "Only the company owner or CEO can rename accounts." }, { status: 403, headers });
      const accountId = typeof body.accountId === "string" ? body.accountId : "";
      const newName = typeof body.name === "string" ? body.name.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(accountId) || !newName || newName.length > 120) {
        return NextResponse.json({ error: "Enter a valid account ID and new account name." }, { status: 400, headers });
      }
      const accountQuery = access.admin.from("company_accounts")
        .select("id, name, is_default, branch_id").eq("id", accountId).eq("company_id", access.companyId);
      if (!access.isMainBranch) accountQuery.eq("branch_id", access.branchId!);
      const { data: account, error: accountError } = await accountQuery.maybeSingle();
      if (accountError || !account) return NextResponse.json({ error: "Select an account from this company." }, { status: 404, headers });
      const { error: renameError } = await access.admin.from("company_accounts")
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq("id", account.id).eq("company_id", access.companyId);
      if (renameError?.code === "23505") return NextResponse.json({ error: "An account with this name already exists." }, { status: 409, headers });
      if (renameError) throw renameError;
      return NextResponse.json({ account: { ...account, name: newName, is_default: Boolean(account.is_default) } }, { status: 200, headers });
    }

    if (body.action === "delete-account") {
      if (!access.canAdministerAccounts) return NextResponse.json({ error: "Only the company owner or CEO can delete accounts." }, { status: 403, headers });
      const accountId = typeof body.accountId === "string" ? body.accountId : "";
      if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
        return NextResponse.json({ error: "Enter a valid account ID to delete." }, { status: 400, headers });
      }
      const accountQuery = access.admin.from("company_accounts")
        .select("id, name, is_default, branch_id").eq("id", accountId).eq("company_id", access.companyId);
      if (!access.isMainBranch) accountQuery.eq("branch_id", access.branchId!);
      const { data: account, error: accountError } = await accountQuery.maybeSingle();
      if (accountError || !account) return NextResponse.json({ error: "Select an account from this company." }, { status: 404, headers });
      const balanceQuery = await access.admin.from("company_account_transactions")
        .select("direction, amount", { count: "exact", head: false })
        .eq("company_id", access.companyId)
        .eq("account_id", accountId);
      const totals = (balanceQuery.data ?? []).reduce((sum, entry) => sum + (entry.direction === "credit" ? Number(entry.amount) : -Number(entry.amount)), 0);
      if (Math.abs(totals) > 0.01) return NextResponse.json({ error: "Accounts can only be deleted when the balance is zero and there are no ledger entries." }, { status: 400, headers });
      const tablesToCheck = [
        access.admin.from("company_account_transactions").select("id").eq("company_id", access.companyId).eq("account_id", accountId).limit(1),
        access.admin.from("company_expenses").select("id").eq("company_id", access.companyId).eq("account_id", accountId).limit(1),
        access.admin.from("financial_receipts").select("id").eq("company_id", access.companyId).eq("account_id", accountId).limit(1),
        access.admin.from("invoice_payments").select("id").eq("company_id", access.companyId).eq("account_id", accountId).limit(1),
        access.admin.from("company_staff_paychecks").select("id").eq("company_id", access.companyId).eq("account_id", accountId).limit(1),
      ];
      const results = await Promise.all(tablesToCheck);
      if (results.some((result) => (result.data ?? []).length > 0)) {
        return NextResponse.json({ error: "This account has recorded activity and cannot be deleted." }, { status: 400, headers });
      }
      const { error: deleteError } = await access.admin.from("company_accounts").delete().eq("id", account.id).eq("company_id", access.companyId);
      if (deleteError) throw deleteError;
      return NextResponse.json({ success: true }, { status: 200, headers });
    }

    if (body.action === "record-movement") {
      const accountId = typeof body.accountId === "string" ? body.accountId : "";
      const movementType = body.movementType;
      const amount = Number(body.amount);
      const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
      const reference = typeof body.reference === "string" ? body.reference.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const transactionDate = body.transactionDate;
      if (!/^[0-9a-f-]{36}$/i.test(accountId) || !transactionTypes.includes(movementType as (typeof transactionTypes)[number])
        || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99
        || !paymentMethods.includes(paymentMethod as (typeof paymentMethods)[number])
        || !reference || reference.length > 100 || !description || description.length > 500 || !validDate(transactionDate)) {
        return NextResponse.json({ error: "Enter a valid account, amount, method, reference, description, and date." }, { status: 400, headers });
      }
      const accountQuery = access.admin.from("company_accounts").select("id, branch_id")
        .eq("id", accountId).eq("company_id", access.companyId).eq("status", "active");
      if (!access.isMainBranch) accountQuery.eq("branch_id", access.branchId!);
      const { data: account } = await accountQuery.maybeSingle();
      if (!account) return NextResponse.json({ error: "Select an active account from this company." }, { status: 400, headers });
      const { data: transaction, error } = await access.admin.from("company_account_transactions").insert({
        company_id: access.companyId,
        branch_id: access.branchId,
        account_id: account.id,
        transaction_type: movementType,
        direction: movementType === "deposit" ? "credit" : "debit",
        amount: Math.round(amount * 100) / 100,
        transaction_date: transactionDate,
        payment_method: paymentMethod,
        reference,
        description,
        source_type: "manual_movement",
        source_id: randomUUID(),
        created_by: access.userId,
      }).select("id").single();
      if (error || !transaction) throw error ?? new Error("Account movement was not recorded.");
      return NextResponse.json({ transaction }, { status: 201, headers });
    }

    if (body.action === "record-expense") {
      const accountId = typeof body.accountId === "string" ? body.accountId : "";
      const expenseType = typeof body.expenseType === "string" ? body.expenseType.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const paidTo = typeof body.paidTo === "string" ? body.paidTo.trim() : "";
      const amount = Number(body.amount);
      const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : "";
      const reference = typeof body.reference === "string" ? body.reference.trim() : "";
      const paidAt = body.paidAt;
      if (!/^[0-9a-f-]{36}$/i.test(accountId) || !expenseType || expenseType.length > 100
        || !description || description.length > 500 || paidTo.length > 200
        || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99
        || !paymentMethods.includes(paymentMethod as (typeof paymentMethods)[number])
        || !reference || reference.length > 100 || !validDate(paidAt)) {
        return NextResponse.json({ error: "Enter a valid expense type, description, account, amount, payment method, reference, and date." }, { status: 400, headers });
      }
      const accountQuery = access.admin.from("company_accounts").select("id, branch_id")
        .eq("id", accountId).eq("company_id", access.companyId).eq("status", "active");
      if (!access.isMainBranch) accountQuery.eq("branch_id", access.branchId!);
      const { data: account } = await accountQuery.maybeSingle();
      if (!account) return NextResponse.json({ error: "Select an active account from your branch." }, { status: 400, headers });
      const { data: expense, error } = await access.admin.from("company_expenses").insert({
        company_id: access.companyId,
        branch_id: access.branchId,
        account_id: accountId,
        expense_type: expenseType,
        description,
        paid_to: paidTo,
        amount: Math.round(amount * 100) / 100,
        payment_method: paymentMethod,
        reference,
        paid_at: paidAt,
        created_by: access.userId,
      }).select("id, reference").single();
      if (error?.code === "23503") return NextResponse.json({ error: "Select an active account from this company." }, { status: 400, headers });
      if (error || !expense) throw error ?? new Error("Expense was not recorded.");
      return NextResponse.json({ expense }, { status: 201, headers });
    }

    return NextResponse.json({ error: "Unknown account action." }, { status: 400, headers });
  } catch (error) {
    console.error("Company accounts update failed", error);
    return NextResponse.json({ error: "Unable to save this account transaction." }, { status: 503, headers });
  }
}