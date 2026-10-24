import { NextResponse } from "next/server";
import { getInvoiceAccess } from "@/lib/server/invoices";
import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Invoice sharing requires SUPABASE_SERVICE_ROLE_KEY in the server environment." }, { status: 503, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
    const recipientEmail = typeof body?.recipientEmail === "string" ? body.recipientEmail.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId) || !recipientEmail || !recipientEmail.includes("@")) {
      return NextResponse.json({ error: "Enter a valid invoice ID and recipient email." }, { status: 400, headers: responseHeaders });
    }

    // Get invoice details
    const { data: invoice, error: invoiceError } = await access.supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", access.companyId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404, headers: responseHeaders });
    }

    // Get company details
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("name, email")
      .eq("id", access.companyId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404, headers: responseHeaders });
    }

    // Create invoice share record
    const { data: share, error: shareError } = await access.supabase
      .from("invoice_shares")
      .insert({
        company_id: access.companyId,
        invoice_id: invoiceId,
        recipient_email: recipientEmail,
        message: message || null,
        shared_by: access.userId,
      })
      .select("*")
      .single();

    if (shareError || !share) {
      console.error("Invoice share creation failed", shareError);
      return NextResponse.json({ error: "Unable to share invoice." }, { status: 500, headers: responseHeaders });
    }

    // TODO: Send email notification to recipientEmail with invoice details and download link
    // This would involve integrating with an email service (Sendgrid, Resend, etc.)
    // For now, we'll just create the share record

    return NextResponse.json({
      share: {
        id: share.id,
        invoiceId: share.invoice_id,
        recipientEmail: share.recipient_email,
        sharedAt: share.created_at,
      },
    }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Invoice share request failed", error);
    return NextResponse.json({ error: "Invoice sharing is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
