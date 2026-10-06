import { NextResponse } from "next/server";
import { getInvoiceAccess } from "@/lib/server/invoices";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data, error } = await access.supabase.rpc("list_invoice_recipients", { requested_company_id: access.companyId });
    if (error) {
      console.error("Invoice recipient query failed", error);
      return NextResponse.json({ error: "Unable to search invoice recipients." }, { status: 500, headers: responseHeaders });
    }

    const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
    const recipients = (data ?? []).filter((recipient: { recipient_name: string }) => recipient.recipient_name.toLocaleLowerCase().includes(query));
    return NextResponse.json({ recipients }, { headers: responseHeaders });
  } catch (error) {
    console.error("Invoice recipient request failed", error);
    return NextResponse.json({ error: "Invoice recipient search is unavailable." }, { status: 503, headers: responseHeaders });
  }
}