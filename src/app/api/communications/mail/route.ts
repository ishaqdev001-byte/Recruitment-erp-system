import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMailAccess, isMailProvider, type MailProvider } from "@/lib/server/mail";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const access = await getMailAccess("communications.email.read");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const { data, error } = await access.supabase.from("mail_connections")
      .select("id, provider, email_address, connected_at")
      .eq("company_id", access.companyId).eq("user_id", access.userId)
      .order("connected_at", { ascending: true });
    if (error) throw error;
    const sendPermission = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "communications.email.send",
    });
    const configured = {
      gmail: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      outlook: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    };
    return NextResponse.json({ mailboxes: data ?? [], configured, canSend: !sendPermission.error && Boolean(sendPermission.data) }, { headers });
  } catch (error) {
    console.error("Mailboxes request failed", error);
    return NextResponse.json({ error: "Linked mailboxes are unavailable." }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getMailAccess("communications.email.read");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const providerValue = new URL(request.url).searchParams.get("provider");
    if (!isMailProvider(providerValue)) return NextResponse.json({ error: "Choose Gmail or Outlook." }, { status: 400, headers });
    const { error } = await access.supabase.from("mail_connections").delete()
      .eq("company_id", access.companyId).eq("user_id", access.userId).eq("provider", providerValue);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Mailbox unlink failed", error);
    return NextResponse.json({ error: "Unable to unlink this mailbox." }, { status: 503, headers });
  }
}
