import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

/**
 * GET /api/candidates/[candidateId]/finance
 *
 * Fetches financial transactions for a candidate including:
 * - Invoices (visa charges, deposits)
 * - Financial receipts (candidate deposits)
 * - Transaction summary
 *
 * Only accessible to users with finance.view permission.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: responseHeaders });
    }

    const { candidateId } = await params;

    // Get candidate and verify access
    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select("id, company_id, first_name, last_name, file_number")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError || !candidate) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404, headers: responseHeaders });
    }

    // Verify finance.view permission
    const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: candidate.company_id,
      requested_permission: "finance.view",
    });
    if (permissionError || !allowed) {
      return NextResponse.json({ error: "You do not have permission to view finance records." }, { status: 403, headers: responseHeaders });
    }

    // Fetch invoices related to this candidate
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, invoice_number, description, amount, status, issued_at, created_at")
      .eq("company_id", candidate.company_id)
      .eq("recipient_id", candidateId)
      .eq("recipient_type", "candidate")
      .order("issued_at", { ascending: false });
    if (invoicesError) {
      console.error("Invoices query failed", invoicesError);
      return NextResponse.json({ error: "Unable to load invoices." }, { status: 500, headers: responseHeaders });
    }

    // Fetch financial receipts (deposits) for this candidate
    const { data: receipts, error: receiptsError } = await supabase
      .from("financial_receipts")
      .select("id, receipt_number, category, amount, payment_method, notes, received_at, created_at")
      .eq("company_id", candidate.company_id)
      .eq("candidate_id", candidateId)
      .eq("entry_type", "candidate_deposit")
      .order("received_at", { ascending: false });
    if (receiptsError) {
      console.error("Receipts query failed", receiptsError);
      return NextResponse.json({ error: "Unable to load receipts." }, { status: 500, headers: responseHeaders });
    }

    // Fetch invoice payments
    const { data: payments, error: paymentsError } = await supabase
      .from("invoice_payments")
      .select("id, invoice_id, amount, paid_at, created_at")
      .eq("company_id", candidate.company_id)
      .in("invoice_id", (invoices ?? []).map((inv) => inv.id))
      .order("paid_at", { ascending: false });
    if (paymentsError) {
      console.error("Payments query failed", paymentsError);
      return NextResponse.json({ error: "Unable to load payments." }, { status: 500, headers: responseHeaders });
    }

    // Calculate summary
    const totalInvoiced = (invoices ?? []).reduce((sum, inv) => sum + Number(inv.amount), 0);
    const totalDeposits = (receipts ?? []).reduce((sum, rec) => sum + Number(rec.amount), 0);
    const totalPaid = (payments ?? []).reduce((sum, pmt) => sum + Number(pmt.amount), 0);
    const outstandingBalance = totalInvoiced - totalPaid;

    return NextResponse.json(
      {
        candidate: {
          id: candidate.id,
          name: `${candidate.first_name} ${candidate.last_name}`,
          fileNumber: candidate.file_number,
        },
        summary: {
          totalInvoiced,
          totalDeposits,
          totalPaid,
          outstandingBalance,
        },
        invoices: invoices ?? [],
        receipts: receipts ?? [],
        payments: payments ?? [],
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("Candidate finance request failed", error);
    return NextResponse.json({ error: "Unable to load candidate finance data." }, { status: 503, headers: responseHeaders });
  }
}
