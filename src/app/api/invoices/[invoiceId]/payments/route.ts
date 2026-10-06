import { NextResponse } from "next/server";
import { getInvoiceAccess, loadInvoiceWithBalance } from "@/lib/server/invoices";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  try {
    const access = await getInvoiceAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const { invoiceId } = await context.params;
    const body = await request.json().catch(() => null) as { amount?: unknown } | null;
    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a payment amount greater than zero." }, { status: 400, headers: responseHeaders });

    const { error } = await access.supabase.rpc("record_invoice_payment", { requested_invoice_id: invoiceId, payment_amount: amount });
    if (error) {
      const message = error.message.includes("exceeds the outstanding")
        ? "Payment cannot exceed the outstanding invoice balance."
        : error.message.includes("Invoice not found") ? "Invoice not found." : "Unable to record this payment.";
      return NextResponse.json({ error: message }, { status: error.code === "42501" ? 403 : 400, headers: responseHeaders });
    }
    const invoice = await loadInvoiceWithBalance(access, invoiceId);
    if (!invoice) return NextResponse.json({ error: "Payment saved, but invoice details could not be reloaded." }, { status: 500, headers: responseHeaders });
    return NextResponse.json({ invoice }, { headers: responseHeaders });
  } catch (error) {
    console.error("Invoice payment request failed", error);
    return NextResponse.json({ error: "Invoice payment is unavailable." }, { status: 503, headers: responseHeaders });
  }
}