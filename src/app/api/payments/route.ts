import { NextResponse } from "next/server";
import { getInvoiceAccess } from "@/lib/server/invoices";
import { loadPaymentLedger } from "@/lib/server/payment-ledger";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const paymentMethods = new Set(["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"]);

export async function GET() {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const [{ transactions, projects }, { data: canRecord }] = await Promise.all([
      loadPaymentLedger(access),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "finance.create",
      }),
    ]);

    let candidates: { candidate_id: string; file_number: string; candidate_name: string }[] = [];
    if (canRecord) {
      const { data, error } = await access.supabase.rpc("list_finance_candidates", { requested_company_id: access.companyId });
      if (error) {
        console.error("Payment candidate lookup failed", error);
        return NextResponse.json({ error: "Unable to load candidates for deposits." }, { status: 500, headers: responseHeaders });
      }
      candidates = data ?? [];
    }

    const candidateDeposits = transactions.filter((transaction) => transaction.entryType === "candidate_deposit");
    return NextResponse.json({
      transactions,
      projects,
      candidates,
      permissions: { canRecord: Boolean(canRecord) },
      totals: {
        totalReceived: transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
        candidateDeposits: candidateDeposits.reduce((sum, transaction) => sum + transaction.amount, 0),
        invoicePayments: transactions.filter((transaction) => transaction.entryType === "invoice_payment").reduce((sum, transaction) => sum + transaction.amount, 0),
        otherIncome: transactions.filter((transaction) => transaction.entryType === "other_income").reduce((sum, transaction) => sum + transaction.amount, 0),
      },
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Payments list request failed", error);
    return NextResponse.json({ error: "Payments and deposits are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const entryType = body?.entryType;
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const amount = Number(body?.amount);
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "";
    const externalReference = typeof body?.externalReference === "string" ? body.externalReference.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    const receivedAt = typeof body?.receivedAt === "string" ? body.receivedAt : "";
    const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const otherSource = typeof body?.otherSource === "string" ? body.otherSource.trim() : "";
    if (!body || (entryType !== "candidate_deposit" && entryType !== "other_income")
      || !category || category.length > 100 || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99
      || !paymentMethods.has(paymentMethod) || externalReference.length > 200 || notes.length > 2000
      || !/^\d{4}-\d{2}-\d{2}$/.test(receivedAt) || Number.isNaN(Date.parse(`${receivedAt}T00:00:00Z`))) {
      return NextResponse.json({ error: "Enter a valid receipt type, category, amount, payment method, and date." }, { status: 400, headers: responseHeaders });
    }
    if (entryType === "candidate_deposit" && !/^[0-9a-f-]{36}$/i.test(candidateId)) {
      return NextResponse.json({ error: "Select a registered candidate for this deposit." }, { status: 400, headers: responseHeaders });
    }
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) {
      return NextResponse.json({ error: "Select the company account receiving this money." }, { status: 400, headers: responseHeaders });
    }
    if (entryType === "other_income" && (!otherSource || otherSource.length > 200)) {
      return NextResponse.json({ error: "Enter the source of this income." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.from("financial_receipts").insert({
      company_id: access.companyId,
      account_id: accountId,
      created_by: access.userId,
      entry_type: entryType,
      candidate_id: entryType === "candidate_deposit" ? candidateId : null,
      received_from: entryType === "candidate_deposit" ? "Candidate" : otherSource,
      category,
      amount,
      payment_method: paymentMethod,
      external_reference: externalReference,
      notes,
      received_at: `${receivedAt}T12:00:00.000Z`,
    }).select("id, receipt_number").single();
    if (error || !data) {
      console.error("Financial receipt creation failed", error);
      return NextResponse.json({ error: "Unable to record this receipt. Verify the candidate and company permissions." }, { status: 403, headers: responseHeaders });
    }
    return NextResponse.json({ receipt: data }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Financial receipt creation request failed", error);
    return NextResponse.json({ error: "Receipt recording is unavailable." }, { status: 503, headers: responseHeaders });
  }
}