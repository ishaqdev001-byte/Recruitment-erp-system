import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers },
      )
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )
    }

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_can_view_agent_finance",
      { requested_company_id: membership.company_id },
    )
    if (permissionError) {
      console.error("Agent finance permission check failed", permissionError)
      return NextResponse.json(
        { error: "Unable to verify agent finance access." },
        { status: 503, headers },
      )
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "You do not have permission to view agent invoices and receipts." },
        { status: 403, headers },
      )
    }

    const { data: candidates, error: candidateError } = await supabase
      .from("candidates")
      .select("id, first_name, last_name, details")
      .eq("company_id", membership.company_id)
    if (candidateError) throw candidateError

    const assignedCandidates = (candidates ?? []).filter((candidate) =>
      candidate.details &&
      typeof candidate.details === "object" &&
      !Array.isArray(candidate.details) &&
      (candidate.details as Record<string, unknown>).visaStatus === "Received",
    )
    const candidateIds = assignedCandidates.map((candidate) => candidate.id)

    const agentInvoiceQuery = supabase
      .from("invoices")
      .select("id, invoice_number, recipient_type, recipient_id, recipient_name, description, amount, due_date, issued_at, status, visa_candidate_id")
      .eq("company_id", membership.company_id)
      .eq("recipient_type", "agent")
      .eq("recipient_id", user.id)
      .order("issued_at", { ascending: false })

    const candidateInvoiceQuery = candidateIds.length
      ? supabase
          .from("invoices")
          .select("id, invoice_number, recipient_type, recipient_id, recipient_name, description, amount, due_date, issued_at, status, visa_candidate_id")
          .eq("company_id", membership.company_id)
          .eq("recipient_type", "candidate")
          .in("visa_candidate_id", candidateIds)
          .order("issued_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })

    const [
      { data: agentInvoices, error: agentInvoiceError },
      { data: candidateInvoices, error: candidateInvoiceError },
      { data: receipts, error: receiptError },
    ] = await Promise.all([
      agentInvoiceQuery,
      candidateInvoiceQuery,
      candidateIds.length
        ? supabase
            .from("financial_receipts")
            .select("id, receipt_number, candidate_id, received_from, category, amount, payment_method, external_reference, notes, received_at")
            .eq("company_id", membership.company_id)
            .in("candidate_id", candidateIds)
            .eq("entry_type", "candidate_deposit")
            .order("received_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (agentInvoiceError || candidateInvoiceError || receiptError) {
      throw agentInvoiceError ?? candidateInvoiceError ?? receiptError
    }

    const invoices = [...(agentInvoices ?? []), ...(candidateInvoices ?? [])]
    const invoiceIds = invoices.map((invoice) => invoice.id)
    const [{ data: payments, error: paymentError }, { data: allocations, error: allocationError }] =
      invoiceIds.length
        ? await Promise.all([
            supabase
              .from("invoice_payments")
              .select("id, invoice_id, amount, paid_at")
              .eq("company_id", membership.company_id)
              .in("invoice_id", invoiceIds)
              .order("paid_at", { ascending: true }),
            supabase
              .from("invoice_deposit_allocations")
              .select("invoice_id, amount")
              .eq("company_id", membership.company_id)
              .in("invoice_id", invoiceIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }]
    if (paymentError || allocationError) throw paymentError ?? allocationError

    const paymentMap = new Map<string, Array<{ id: string; amount: number; paid_at: string }>>()
    for (const payment of payments ?? []) {
      const current = paymentMap.get(payment.invoice_id) ?? []
      current.push({ id: payment.id, amount: Number(payment.amount), paid_at: payment.paid_at })
      paymentMap.set(payment.invoice_id, current)
    }
    const allocationMap = new Map<string, number>()
    for (const allocation of allocations ?? []) {
      allocationMap.set(
        allocation.invoice_id,
        (allocationMap.get(allocation.invoice_id) ?? 0) + Number(allocation.amount),
      )
    }

    return NextResponse.json({
      invoices: invoices.map((invoice) => ({
        ...invoice,
        amount: Number(invoice.amount),
        payments: paymentMap.get(invoice.id) ?? [],
        deposit_amount: allocationMap.get(invoice.id) ?? 0,
      })),
      receipts: receipts ?? [],
    }, { headers })
  } catch (error) {
    console.error("Agent finance request failed", error)
    return NextResponse.json(
      { error: "Unable to load invoices and receipts for your assigned candidates." },
      { status: 503, headers },
    )
  }
}
