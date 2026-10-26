import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }
type FinancePeriod = {
  start: string | null
  end: string
}

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function getPeriod(range: string, now: Date) {
  const today = now.toISOString().slice(0, 10)

  if (range === "Today") return { start: today, end: today }

  if (range === "This Week") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )

    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7))

    return { start: start.toISOString().slice(0, 10), end: today }
  }

  if (range === "This Year")
    return { start: `${now.getUTCFullYear()}-01-01`, end: today }

  if (range === "All Time") return { start: null, end: today }

  return { start: `${today.slice(0, 7)}-01`, end: today }
}

function isInPeriod(
  value: string | null | undefined,
  period: FinancePeriod,
) {
  if (!value) return false

  const date = value.slice(0, 10)

  return (!period.start || date >= period.start) && date <= period.end
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)

  return Number.isFinite(parsed) ? parsed : 0
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user)
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id, branch_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership)
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: membership.company_id,

        requested_permission: "finance.view",
      },
    )

    if (permissionError || !allowed)
      return NextResponse.json(
        { error: "You do not have permission to view company finances." },
        { status: 403, headers },
      )

    const admin = createAdminClient()

    if (!admin)
      return NextResponse.json(
        {
          error:
            "Finance overview requires SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers },
      )

    const companyId = membership.company_id
    const branchId = membership.branch_id
    const { data: isMainBranch, error: branchError } = await supabase.rpc("current_user_is_main_branch_user", {
      requested_company_id: companyId,
    })
    if (branchError || (!isMainBranch && !branchId)) {
      return NextResponse.json(
        { error: "Unable to verify your company branch." },
        { status: 503, headers },
      )
    }

    const accountsQuery = admin.from("company_accounts")
      .select("id, name, account_type, status")
      .eq("company_id", companyId)
    const ledgerQuery = admin.from("company_account_transactions")
      .select("account_id, direction, amount")
      .eq("company_id", companyId)
    const receiptsQuery = admin.from("financial_receipts")
      .select("id, entry_type, amount, received_at, category, received_from, receipt_number")
      .eq("company_id", companyId)
      .order("received_at", { ascending: false })
    const invoicesQuery = admin.from("invoices")
      .select("id, invoice_number, recipient_type, recipient_name, amount, due_date, issued_at, status")
      .eq("company_id", companyId)
    const invoicePaymentsQuery = admin.from("invoice_payments")
      .select("id, invoice_id, amount, paid_at")
      .eq("company_id", companyId)
    const depositAllocationsQuery = admin.from("invoice_deposit_allocations")
      .select("invoice_id, amount")
      .eq("company_id", companyId)
    const expensesQuery = admin.from("company_expenses")
      .select("id, description, paid_to, expense_type, amount, paid_at, reference")
      .eq("company_id", companyId)
      .order("paid_at", { ascending: false })
    const paychecksQuery = admin.from("company_staff_paychecks")
      .select("id, pay_period, net_amount, payment_date, payment_reference")
      .eq("company_id", companyId)
      .order("payment_date", { ascending: false })
    const requisitionsQuery = admin.from("company_requisitions")
      .select("id, requisition_number, title, currency_code, total_amount, amount_paid, status")
      .eq("company_id", companyId)
    const projectsQuery = admin.from("projects")
      .select("id")
      .eq("company_id", companyId)

    if (!isMainBranch) {
      accountsQuery.eq("branch_id", branchId)
      ledgerQuery.eq("branch_id", branchId)
      receiptsQuery.eq("branch_id", branchId)
      invoicesQuery.eq("branch_id", branchId)
      invoicePaymentsQuery.eq("branch_id", branchId)
      depositAllocationsQuery.eq("branch_id", branchId)
      expensesQuery.eq("branch_id", branchId)
      paychecksQuery.eq("branch_id", branchId)
      requisitionsQuery.eq("branch_id", branchId)
      projectsQuery.eq("branch_id", branchId)
    }

    const [
      { data: accounts, error: accountsError },

      { data: ledger, error: ledgerError },

      { data: receipts, error: receiptsError },

      { data: invoices, error: invoicesError },

      { data: invoicePayments, error: invoicePaymentsError },

      { data: depositAllocations, error: allocationsError },

      { data: expenses, error: expensesError },

      { data: paychecks, error: paychecksError },

      { data: requisitions, error: requisitionsError },

      { data: requisitionPayments, error: requisitionPaymentsError },

      { data: projects, error: projectsError },
    ] = await Promise.all([
      accountsQuery,
      ledgerQuery,
      receiptsQuery,
      invoicesQuery,
      invoicePaymentsQuery,
      depositAllocationsQuery,
      expensesQuery,
      paychecksQuery,
      requisitionsQuery,
      admin
        .from("requisition_payments")
        .select("id, amount, payment_date, requisition_id")
        .eq("company_id", companyId),
      projectsQuery,
    ])

    const queryError =
      accountsError ??
      ledgerError ??
      receiptsError ??
      invoicesError ??
      invoicePaymentsError ??
      allocationsError ??
      expensesError ??
      paychecksError ??
      requisitionsError ??
      requisitionPaymentsError ??
      projectsError

    if (queryError) {
      console.error("Finance overview query failed", queryError)

      return NextResponse.json(
        {
          error:
            "Unable to load the company finance summary. Check that the required finance migrations have been applied.",
        },
        { status: 503, headers },
      )
    }

    const scopedProjectIds = (projects ?? []).map((project) => project.id)
    const { data: contractorCharges, error: contractorChargesError } = scopedProjectIds.length
      ? await admin.from("project_contractor_charges")
        .select("id, contractor_name, amount, visa_received_at, project_id")
        .eq("company_id", companyId)
        .in("project_id", scopedProjectIds)
      : { data: [], error: null }
    if (contractorChargesError) {
      console.error("Finance contractor charges query failed", contractorChargesError)
      return NextResponse.json(
        { error: "Unable to load the company finance summary." },
        { status: 503, headers },
      )
    }
    const scopedRequisitionIds = new Set((requisitions ?? []).map((requisition) => requisition.id))

    const url = new URL(request.url)

    const requestedRange = url.searchParams.get("range") ?? "This Month"

    const range = [
      "Today",
      "This Week",
      "This Month",
      "This Year",
      "All Time",
    ].includes(requestedRange)
      ? requestedRange
      : "This Month"

    const now = new Date()

    const period = getPeriod(range, now)

    const paymentsByInvoice = new Map<string, number>()

    for (const payment of invoicePayments ?? []) {
      paymentsByInvoice.set(
        payment.invoice_id,
        (paymentsByInvoice.get(payment.invoice_id) ?? 0) +
          amount(payment.amount),
      )
    }

    const depositsByInvoice = new Map<string, number>()

    for (const allocation of depositAllocations ?? []) {
      depositsByInvoice.set(
        allocation.invoice_id,
        (depositsByInvoice.get(allocation.invoice_id) ?? 0) +
          amount(allocation.amount),
      )
    }

    const invoiceDue = (invoices ?? []).reduce((sum, invoice) => {
      if (invoice.status === "draft") return sum

      return (
        sum +
        Math.max(
          0,
          amount(invoice.amount) -
            (paymentsByInvoice.get(invoice.id) ?? 0) -
            (depositsByInvoice.get(invoice.id) ?? 0),
        )
      )
    }, 0)

    const accountBalances = new Map<string, number>()

    for (const entry of ledger ?? []) {
      accountBalances.set(
        entry.account_id,
        (accountBalances.get(entry.account_id) ?? 0) +
          (entry.direction === "credit" ? 1 : -1) * amount(entry.amount),
      )
    }

    const accountSummary = (accounts ?? []).map((account) => ({
      id: account.id,

      name: account.name,

      type: account.account_type,

      status: account.status,

      balance: accountBalances.get(account.id) ?? 0,
    }))

    const filteredReceipts = (receipts ?? []).filter((receipt) =>
      isInPeriod(receipt.received_at, period),
    )

    const filteredInvoicePayments = (invoicePayments ?? []).filter((payment) =>
      isInPeriod(payment.paid_at, period),
    )

    const filteredExpenses = (expenses ?? []).filter((expense) =>
      isInPeriod(expense.paid_at, period),
    )

    const filteredPaychecks = (paychecks ?? []).filter((paycheck) =>
      isInPeriod(paycheck.payment_date, period),
    )

    const filteredRequisitionPayments = (requisitionPayments ?? []).filter(
      (payment) => scopedRequisitionIds.has(payment.requisition_id) && isInPeriod(payment.payment_date, period),
    )

    const incomeBreakdown = [
      {
        label: "Candidate deposits",
        amount: filteredReceipts
          .filter((receipt) => receipt.entry_type === "candidate_deposit")
          .reduce((sum, receipt) => sum + amount(receipt.amount), 0),
        color: "#6366f1",
      },

      {
        label: "Invoice payments",
        amount: filteredInvoicePayments.reduce(
          (sum, payment) => sum + amount(payment.amount),
          0,
        ),
        color: "#10b981",
      },

      {
        label: "Other income",
        amount: filteredReceipts
          .filter((receipt) => receipt.entry_type === "other_income")
          .reduce((sum, receipt) => sum + amount(receipt.amount), 0),
        color: "#f59e0b",
      },
    ]

    const ugxRequisitionPayments = filteredRequisitionPayments.filter(
      (payment) => {
        const requisition = (requisitions ?? []).find(
          (item) => item.id === payment.requisition_id,
        )

        return requisition?.currency_code === "UGX"
      },
    )

    const expenseBreakdown = [
      {
        label: "Expenses",
        amount: filteredExpenses.reduce(
          (sum, expense) => sum + amount(expense.amount),
          0,
        ),
        color: "#ef4444",
      },

      {
        label: "Paychecks",
        amount: filteredPaychecks.reduce(
          (sum, paycheck) => sum + amount(paycheck.net_amount),
          0,
        ),
        color: "#8b5cf6",
      },

      {
        label: "Requisition payments (UGX)",
        amount: ugxRequisitionPayments.reduce(
          (sum, payment) => sum + amount(payment.amount),
          0,
        ),
        color: "#f97316",
      },
    ]

    const requisitionsDueByCurrency = new Map<string, number>()

    for (const requisition of requisitions ?? []) {
      if (requisition.status !== "approved") continue

      const due = Math.max(
        0,
        amount(requisition.total_amount) - amount(requisition.amount_paid),
      )

      if (due > 0) {
        const currency = requisition.currency_code || "UGX"

        requisitionsDueByCurrency.set(
          currency,
          (requisitionsDueByCurrency.get(currency) ?? 0) + due,
        )
      }
    }

    const requisitionDueBreakdown = Array.from(
      requisitionsDueByCurrency,
      ([currency, due]) => ({ currency, amount: due }),
    )

    const monthlyTrend = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1),
      )

      const month = monthDate.toISOString().slice(0, 7)

      const monthReceipts = (receipts ?? []).filter((item) =>
        item.received_at.startsWith(month),
      )

      const monthInvoicePayments = (invoicePayments ?? []).filter((item) =>
        item.paid_at.startsWith(month),
      )

      const monthExpenses = (expenses ?? []).filter((item) =>
        item.paid_at.startsWith(month),
      )

      const monthPaychecks = (paychecks ?? []).filter((item) =>
        item.payment_date.startsWith(month),
      )

      const monthRequisitionPayments = (requisitionPayments ?? []).filter(
        (item) =>
          scopedRequisitionIds.has(item.requisition_id) &&
          item.payment_date.startsWith(month) &&
          (requisitions ?? []).some(
            (requisition) =>
              requisition.id === item.requisition_id &&
              requisition.currency_code === "UGX",
          ),
      )

      return {
        month: monthNames[monthDate.getUTCMonth()],

        income:
          monthReceipts.reduce((sum, item) => sum + amount(item.amount), 0) +
          monthInvoicePayments.reduce(
            (sum, item) => sum + amount(item.amount),
            0,
          ),

        expenses:
          monthExpenses.reduce((sum, item) => sum + amount(item.amount), 0) +
          monthPaychecks.reduce(
            (sum, item) => sum + amount(item.net_amount),
            0,
          ) +
          monthRequisitionPayments.reduce(
            (sum, item) => sum + amount(item.amount),
            0,
          ),
      }
    })

    const totalIncome = incomeBreakdown.reduce(
      (sum, item) => sum + item.amount,
      0,
    )

    const totalExpenses = expenseBreakdown.reduce(
      (sum, item) => sum + item.amount,
      0,
    )

    const recentActivity = [
      ...filteredReceipts.slice(0, 6).map((item) => ({
        id: item.id,

        date: item.received_at,

        description: item.received_from || item.category,

        type:
          item.entry_type === "candidate_deposit"
            ? "Candidate deposit"
            : "Other income",

        amount: amount(item.amount),

        direction: "in" as const,

        reference: item.receipt_number,
      })),

      ...filteredExpenses.slice(0, 6).map((item) => ({
        id: item.id,

        date: item.paid_at,

        description: item.description || item.paid_to,

        type: item.expense_type,

        amount: amount(item.amount),

        direction: "out" as const,
        reference: item.reference,
      })),
      ...filteredInvoicePayments.slice(0, 6).map((item) => ({
        id: item.id,
        date: item.paid_at,
        description: `Invoice payment · ${(invoices ?? []).find((invoice) => invoice.id === item.invoice_id)?.recipient_name ?? "Customer"}`,
        type: "Invoice payment",
        amount: amount(item.amount),
        direction: "in" as const,
        reference:
          (invoices ?? []).find((invoice) => invoice.id === item.invoice_id)
            ?.invoice_number ?? "",
      })),
      ...filteredPaychecks.slice(0, 6).map((item) => ({
        id: item.id,
        date: item.payment_date,
        description: "Staff paycheck",
        type: "Payroll",
        amount: amount(item.net_amount),
        direction: "out" as const,
        reference: item.payment_reference,
      })),
      ...filteredRequisitionPayments.slice(0, 6).map((item) => ({
        id: item.id,
        date: item.payment_date,
        description: `Requisition payment · ${(requisitions ?? []).find((requisition) => requisition.id === item.requisition_id)?.title ?? "Requisition"}`,
        type: "Requisition payment",
        amount: amount(item.amount),
        direction: "out" as const,
        reference:
          (requisitions ?? []).find(
            (requisition) => requisition.id === item.requisition_id,
          )?.requisition_number ?? "",
      })),
    ]
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 8)

    return NextResponse.json(
      {
        range,

        period: { start: period.start, end: period.end },

        totals: {
          income: totalIncome,

          expenses: totalExpenses,

          net: totalIncome - totalExpenses,

          accountBalance: accountSummary
            .filter((account) => account.status === "active")
            .reduce((sum, account) => sum + account.balance, 0),

          invoiceDue,

          candidateDeposits: incomeBreakdown[0].amount,

          invoicePayments: incomeBreakdown[1].amount,

          otherIncome: incomeBreakdown[2].amount,

          paychecks: expenseBreakdown[1].amount,

          contractorDue: (contractorCharges ?? []).reduce(
            (sum, charge) => sum + amount(charge.amount),
            0,
          ),
        },

        accounts: accountSummary,

        requisitionDueByCurrency: requisitionDueBreakdown,

        incomeBreakdown,

        expenseBreakdown,

        monthlyTrend,

        recentActivity,
      },
      { headers },
    )
  } catch (error) {
    console.error("Finance overview request failed", error)

    return NextResponse.json(
      { error: "Company finance summary is unavailable." },
      { status: 503, headers },
    )
  }
}
