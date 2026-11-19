import "server-only"

import { createClient } from "@supabase/supabase-js"

import {
  loadAllInvoices,
  type InvoiceAccess,
  type InvoiceWithBalance,
} from "@/lib/server/invoices"

type Access = Extract<InvoiceAccess, { supabase: unknown }>

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Finance ledger requires the server-side Supabase service role.")
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function loadCompanyExpenses(access: Access) {
  const [{ data: membership, error: membershipError }, { data: isMainBranch, error: branchError }] =
    await Promise.all([
      access.supabase
        .from("company_memberships")
        .select("role_id, branch_id")
        .eq("company_id", access.companyId)
        .eq("user_id", access.userId)
        .eq("status", "active")
        .maybeSingle(),
      access.supabase.rpc("current_user_is_main_branch_user", {
        requested_company_id: access.companyId,
      }),
    ])

  if (membershipError || branchError || !membership) {
    throw membershipError ?? branchError ?? new Error("Unable to verify finance branch access.")
  }

  if (!isMainBranch && !membership.branch_id) {
    throw new Error("Unable to verify finance branch access.")
  }

  const admin = createAdminClient()
  const { data: role, error: roleError } = await admin
    .from("company_roles")
    .select("name")
    .eq("id", membership.role_id)
    .eq("company_id", access.companyId)
    .maybeSingle()

  if (roleError || !role) {
    throw roleError ?? new Error("Unable to verify finance role.")
  }

  const expensesQuery = admin
    .from("company_expenses")
    .select(
      "id, account_id, expense_type, description, paid_to, amount, payment_method, reference, paid_at",
    )
    .eq("company_id", access.companyId)
    .order("paid_at", { ascending: false })

  if (!isMainBranch && role.name.trim().toLowerCase() !== "chairman") {
    expensesQuery.eq("branch_id", membership.branch_id!)
  }

  const { data, error } = await expensesQuery
  if (error) throw error

  return data ?? []
}

export type PaymentTransaction = {
  id: string

  recordId: string

  recordType: "receipt" | "invoice_payment" | "company_expense"

  reference: string

  entryType:
    | "candidate_deposit"
    | "other_income"
    | "invoice_payment"
    | "company_expense"

  direction: "credit" | "debit"

  category: string

  receivedFrom: string

  candidateId: string | null

  accountId: string | null

  invoiceId: string | null

  invoiceNumber: string | null

  projectId: string | null

  projectName: string | null

  amount: number

  paymentMethod: string

  externalReference: string

  notes: string

  receivedAt: string
}

export type PaymentProject = { id: string; name: string }

export async function loadPaymentLedger(access: Access) {
  const [
    { data: receiptRows, error: receiptError },
    invoices,
    { data: projectRows, error: projectError },
    expenseRows,
  ] = await Promise.all([
    access.supabase
      .from("financial_receipts")

      .select(
        "id, receipt_number, entry_type, candidate_id, account_id, project_id, received_from, category, amount, payment_method, external_reference, notes, received_at",
      )

      .eq("company_id", access.companyId)

      .order("received_at", { ascending: false }),

    loadAllInvoices(access),

    access.supabase.rpc("list_project_contractor_finance", {
      requested_company_id: access.companyId,
    }),

    loadCompanyExpenses(access),
  ])

  if (receiptError) throw receiptError

  if (projectError) throw projectError

  const projectNames = new Map<string, string>()

  for (const project of (projectRows ?? []) as {
    project_id: string
    project_name: string
  }[]) {
    projectNames.set(project.project_id, project.project_name)
  }

  const visaProjects = new Map<string, string>()

  for (const invoice of invoices) {
    if (
      invoice.visa_candidate_id &&
      invoice.project_id &&
      !visaProjects.has(invoice.visa_candidate_id)
    ) {
      visaProjects.set(invoice.visa_candidate_id, invoice.project_id)
    }
  }

  const transactions: PaymentTransaction[] = [
    ...(receiptRows ?? []).map((receipt) => {
      const projectId =
        receipt.project_id ??
        (receipt.entry_type === "candidate_deposit" && receipt.candidate_id
          ? (visaProjects.get(receipt.candidate_id) ?? null)
          : null)

      return {
        id: `receipt-${receipt.id}`,

        recordId: receipt.id,

        recordType: "receipt" as const,

        reference: receipt.receipt_number,

        entryType: receipt.entry_type,

        direction: "credit" as const,

        category: receipt.category,

        receivedFrom: receipt.received_from,

        candidateId: receipt.candidate_id,

        accountId: receipt.account_id,

        invoiceId: null,

        invoiceNumber: null,

        projectId,

        projectName: projectId ? (projectNames.get(projectId) ?? null) : null,

        amount: Number(receipt.amount),

        paymentMethod: receipt.payment_method,

        externalReference: receipt.external_reference,

        notes: receipt.notes,

        receivedAt: receipt.received_at,
      }
    }),

    ...invoices.flatMap((invoice: InvoiceWithBalance) =>
      invoice.payments.map((payment, installmentIndex) => ({
        id: `invoice-payment-${payment.id}`,

        recordId: payment.id,

        recordType: "invoice_payment" as const,

        reference: `${invoice.invoice_number}-${String(installmentIndex + 1).padStart(2, "0")}`,

        entryType: "invoice_payment" as const,

        direction: "credit" as const,

        category: "Invoice payment",

        receivedFrom: invoice.recipient_name,

        candidateId:
          invoice.visa_candidate_id ??
          (invoice.recipient_type === "candidate"
            ? invoice.recipient_id
            : null),

        accountId: payment.account_id,

        invoiceId: invoice.id,

        invoiceNumber: invoice.invoice_number,

        projectId: invoice.project_id,

        projectName: invoice.project_id
          ? (projectNames.get(invoice.project_id) ?? null)
          : null,

        amount: Number(payment.amount),

        paymentMethod: "Invoice",

        externalReference: invoice.invoice_number,

        notes: invoice.description,

        receivedAt: payment.paid_at,
      })),
    ),

    ...expenseRows.map((expense) => ({
      id: `expense-${expense.id}`,

      recordId: expense.id,

      recordType: "company_expense" as const,

      reference: expense.reference,

      entryType: "company_expense" as const,

      direction: "debit" as const,

      category: expense.expense_type,

      receivedFrom: expense.paid_to,

      candidateId: null,

      accountId: expense.account_id,

      invoiceId: null,

      invoiceNumber: null,

      projectId: null,

      projectName: null,

      amount: Number(expense.amount),

      paymentMethod: expense.payment_method,

      externalReference: expense.reference,

      notes: expense.description,

      receivedAt: expense.paid_at,
    })),
  ].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))

  const projects: PaymentProject[] = (projectRows ?? []).map(
    (project: { project_id: string; project_name: string }) => ({
      id: project.project_id,

      name: project.project_name,
    }),
  )

  return { transactions, projects }
}
