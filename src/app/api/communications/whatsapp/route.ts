import { NextResponse } from "next/server";
import { getWhatsAppAccess, getWhatsAppAdmin, isZernioConfigured, whatsappHeaders, zernioRequest } from "@/lib/server/whatsapp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await getWhatsAppAccess("communications.whatsapp.read");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: whatsappHeaders });
    const admin = await getWhatsAppAdmin();
    const { data, error } = await admin.from("whatsapp_connections")
      .select("zernio_profile_id, zernio_account_id, display_phone_number, verified_name, webhook_id, connected_at, updated_at")
      .eq("company_id", access.companyId).maybeSingle();
    if (error) throw error;
    const [sendPermission, managePermission] = await Promise.all([
      access.supabase.rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "communications.whatsapp.send" }),
      access.supabase.rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "communications.whatsapp.manage" }),
    ]);
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json({
      connection: data ?? null,
      canSend: !sendPermission.error && Boolean(sendPermission.data),
      canManage: !managePermission.error && Boolean(managePermission.data),
      configured: isZernioConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      webhookUrl: `${origin.replace(/\/$/, "")}/api/communications/whatsapp/webhook`,
    }, { headers: whatsappHeaders });
  } catch (error) {
    console.error("WhatsApp connection load failed", error);
    return NextResponse.json({ error: "WhatsApp settings are unavailable. Check the WhatsApp migration and Zernio server configuration." }, { status: 503, headers: whatsappHeaders });
  }
}

export async function DELETE() {
  try {
    const access = await getWhatsAppAccess("communications.whatsapp.manage");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: whatsappHeaders });
    const admin = await getWhatsAppAdmin();
    const { data: connection, error: lookupError } = await admin.from("whatsapp_connections")
      .select("zernio_account_id, webhook_id").eq("company_id", access.companyId).maybeSingle();
    if (lookupError) throw lookupError;
    if (connection?.webhook_id) {
      await zernioRequest(`/webhooks/settings?webhookId=${encodeURIComponent(connection.webhook_id)}`, { method: "DELETE" });
    }
    if (connection?.zernio_account_id) {
      await zernioRequest(`/accounts/${encodeURIComponent(connection.zernio_account_id)}`, { method: "DELETE" });
    }
    const { error } = await admin.from("whatsapp_connections").delete().eq("company_id", access.companyId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: whatsappHeaders });
  } catch (error) {
    console.error("WhatsApp disconnect failed", error);
    return NextResponse.json({ error: "Unable to disconnect the WhatsApp number." }, { status: 503, headers: whatsappHeaders });
  }
}