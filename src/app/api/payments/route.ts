import { NextResponse } from "next/server";
import { getInvoiceAccess, loadAllInvoices } from "@/lib/server/invoices";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const paymentMethods = new Set(["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"]);

export async function GET() {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const [{ data: receiptRows, error: receiptError }, invoices, { data: canRecord }] = await Promise.all([
      access.supabase.from("financial_receipts")
        .select("id, receipt_number, entry_type, candidate_id, received_from, category, amount, payment_method, external_reference, notes, received_at")
        .eq("company_id", access.companyId)
        .order("received_at", { ascending: false }),
      loadAllInvoices(access),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "finance.create",
      }),
    ]);
    if (receiptError) {
      console.error("Financial receipt query failed", receiptError);
      return NextResponse.json({ error: "Unable to load payments and deposits. Apply the latest finance migration if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    const transactions = [
      ...(receiptRows ?? []).map((receipt) => ({
        id: `receipt-${receipt.id}`,
        recordType: "receipt" as const,
        reference: receipt.receipt_number,
        entryType: receipt.entry_type,
        category: receipt.category,
        receivedFrom: receipt.received_from,
        candidateId: receipt.candidate_id,
        invoiceId: null,
        invoiceNumber: null,
        amount: Number(receipt.amount),
        paymentMethod: receipt.payment_method,
        externalReference: receipt.external_reference,
        notes: receipt.notes,
        receivedAt: receipt.received_at,
      })),
      ...invoices.flatMap((invoice) => invoice.payments.map((payment, installmentIndex) => ({
        id: `invoice-payment-${payment.id}`,
        recordType: "invoice_payment" as const,
        reference: `${invoice.invoice_number}-${String(installmentIndex + 1).padStart(2, "0")}`,
        entryType: "invoice_payment",
        category: "Invoice payment",
        receivedFrom: invoice.recipient_name,
        candidateId: invoice.recipient_type === "candidate" ? invoice.recipient_id : null,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        amount: Number(payment.amount),
        paymentMethod: "Invoice",
        externalReference: invoice.invoice_number,
        notes: invoice.description,
        receivedAt: payment.paid_at,
      }))),
    ].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));

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
    if (entryType === "other_income" && (!otherSource || otherSource.length > 200)) {
      return NextResponse.json({ error: "Enter the source of this income." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.from("financial_receipts").insert({
      company_id: access.companyId,
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