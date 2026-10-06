import { NextResponse } from "next/server";
import { getInvoiceAccess, loadAllInvoices, type InvoiceAccess } from "@/lib/server/invoices";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const invoices = await loadAllInvoices(access as Exclude<InvoiceAccess, { error: string }>);
    const { data: canCreate } = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "finance.create",
    });
    return NextResponse.json({ invoices, permissions: { canCreate: Boolean(canCreate) } }, { headers: responseHeaders });
  } catch (error) {
    console.error("Invoice list request failed", error);
    return NextResponse.json({ error: "Unable to load company invoices." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const recipientType = body?.recipientType;
    const recipientId = typeof body?.recipientId === "string" ? body.recipientId : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const amount = Number(body?.amount);
    const dueDate = typeof body?.dueDate === "string" ? body.dueDate : "";
    if (!body || !["contractor", "supplier", "candidate"].includes(String(recipientType))
      || !/^[0-9a-f-]{36}$/i.test(recipientId) || !description || description.length > 2000
      || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999.99
      || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) {
      return NextResponse.json({ error: "Enter a recipient, description, positive amount, and valid due date." }, { status: 400, headers: responseHeaders });
    }

    const { data: recipients, error: recipientError } = await access.supabase.rpc("list_invoice_recipients", { requested_company_id: access.companyId });
    const recipient = (recipients ?? []).find((item: { recipient_type: string; recipient_id: string }) => item.recipient_type === recipientType && item.recipient_id === recipientId);
    if (recipientError || !recipient) return NextResponse.json({ error: "Select a valid recipient from this company." }, { status: 400, headers: responseHeaders });

    const { data: invoice, error } = await access.supabase.from("invoices").insert({
      company_id: access.companyId,
      recipient_type: recipientType,
      recipient_id: recipientId,
      recipient_name: recipient.recipient_name,
      description,
      amount,
      due_date: dueDate,
      status: "sent",
      created_by: access.userId,
    }).select("*").single();
    if (error || !invoice) {
      console.error("Invoice creation failed", error);
      return NextResponse.json({ error: "Unable to create invoice." }, { status: 403, headers: responseHeaders });
    }
    return NextResponse.json({ invoice }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Invoice creation request failed", error);
    return NextResponse.json({ error: "Invoice creation is unavailable." }, { status: 503, headers: responseHeaders });
  }
}