import "server-only"

import { canViewCandidateFinance } from "@/lib/server/candidate-finance-access"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type CandidateFinanceData = {
  candidate: {
    id: string
    name: string
    fileNumber: string
  }
  summary: {
    totalInvoiced: number
    totalDeposits: number
    totalPaid: number
    outstandingBalance: number
  }
  invoices: {
    id: string
    invoice_number: string
    description: string
    amount: number
    status: string
    issued_at: string
    created_at: string
  }[]
  receipts: {
    id: string
    receipt_number: string
    category: string
    amount: number
    payment_method: string
    notes: string
    received_at: string
    created_at: string
  }[]
  payments: {
    id: string
    invoice_id: string
    amount: number
    paid_at: string
    created_at: string
  }[]
}

export type CandidateFinanceResult =
  | { data: CandidateFinanceData }
  | { error: string; status: 401 | 403 | 404 | 500 | 503 }

export async function loadCandidateFinance(
  candidateId: string,
): Promise<CandidateFinanceResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user)
    return { error: "Authentication required.", status: 401 }

  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, company_id, first_name, last_name, file_number")
    .eq("id", candidateId)
    .maybeSingle()
  if (candidateError) {
    console.error("Candidate finance candidate lookup failed", candidateError)
    return { error: "Unable to verify this candidate.", status: 503 }
  }
  if (!candidate) return { error: "Candidate not found.", status: 404 }

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, role_id")
    .eq("company_id", candidate.company_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle()
  if (membershipError) {
    console.error("Candidate finance membership lookup failed", membershipError)
    return { error: "Unable to verify your company access.", status: 503 }
  }
  if (!membership)
    return { error: "You do not have permission to view finance records.", status: 403 }

  const [
    { data: role, error: roleError },
    { data: company, error: companyError },
    { data: hasFinancePermission, error: permissionError },
  ] = await Promise.all([
    supabase
      .from("company_roles")
      .select("name")
      .eq("id", membership.role_id)
      .eq("company_id", candidate.company_id)
      .maybeSingle(),
    supabase
      .from("companies")
      .select("primary_admin_user_id")
      .eq("id", candidate.company_id)
      .maybeSingle(),
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: candidate.company_id,
      requested_permission: "finance.view",
    }),
  ])
  if (roleError || companyError || permissionError) {
    console.error(
      "Candidate finance authorization lookup failed",
      roleError ?? companyError ?? permissionError,
    )
    return { error: "Unable to verify your finance access.", status: 503 }
  }
  if (!role || !company)
    return { error: "Unable to verify your company role.", status: 503 }
  if (
    !canViewCandidateFinance(
      role.name,
      Boolean(hasFinancePermission),
      company.primary_admin_user_id === user.id,
    )
  )
    return { error: "You do not have permission to view finance records.", status: 403 }

  const [
    { data: invoices, error: invoicesError },
    { data: receipts, error: receiptsError },
  ] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, description, amount, status, issued_at, created_at")
      .eq("company_id", candidate.company_id)
      .eq("recipient_id", candidate.id)
      .eq("recipient_type", "candidate")
      .order("issued_at", { ascending: false }),
    supabase
      .from("financial_receipts")
      .select("id, receipt_number, category, amount, payment_method, notes, received_at, created_at")
      .eq("company_id", candidate.company_id)
      .eq("candidate_id", candidate.id)
      .eq("entry_type", "candidate_deposit")
      .order("received_at", { ascending: false }),
  ])
  if (invoicesError || receiptsError) {
    console.error("Candidate finance records query failed", invoicesError ?? receiptsError)
    return { error: "Unable to load candidate finance records.", status: 500 }
  }

  let payments: CandidateFinanceData["payments"] = []
  if (invoices?.length) {
    const { data: paymentRows, error: paymentsError } = await supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount, paid_at, created_at")
      .eq("company_id", candidate.company_id)
      .in("invoice_id", invoices.map((invoice) => invoice.id))
      .order("paid_at", { ascending: false })
    if (paymentsError) {
      console.error("Candidate invoice payments query failed", paymentsError)
      return { error: "Unable to load candidate invoice payments.", status: 500 }
    }
    payments = (paymentRows ?? []).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    }))
  }

  const candidateInvoices = (invoices ?? []).map((invoice) => ({
    ...invoice,
    amount: Number(invoice.amount),
  }))
  const candidateReceipts = (receipts ?? []).map((receipt) => ({
    ...receipt,
    amount: Number(receipt.amount),
  }))
  const totalInvoiced = candidateInvoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  const totalDeposits = candidateReceipts.reduce((sum, receipt) => sum + receipt.amount, 0)
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0)

  return {
    data: {
      candidate: {
        id: candidate.id,
        name: `${candidate.first_name} ${candidate.last_name}`.trim(),
        fileNumber: candidate.file_number,
      },
      summary: {
        totalInvoiced,
        totalDeposits,
        totalPaid,
        outstandingBalance: totalInvoiced - totalPaid,
      },
      invoices: candidateInvoices,
      receipts: candidateReceipts,
      payments,
    },
  }
}
