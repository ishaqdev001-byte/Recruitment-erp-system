import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getWhatsAppAccess, getWhatsAppAdmin, isZernioConfigured, whatsappHeaders, zernioRequest } from "@/lib/server/whatsapp";

export const runtime = "nodejs";

function equalSecret(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function redirectToCommunications(request: Request, status: string, detail?: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
  const destination = new URL("/", origin);
  destination.searchParams.set("view", "communications");
  destination.searchParams.set("whatsapp", status);
  if (detail) destination.searchParams.set("whatsapp_error", detail.slice(0, 250));
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("zernio_whatsapp_state")?.value ?? "";
  const expectedProfileId = cookieStore.get("zernio_whatsapp_profile")?.value ?? "";
  const state = url.searchParams.get("state") ?? "";
  const errorValue = url.searchParams.get("error");
  const connectedPlatform = url.searchParams.get("connected");
  const profileId = url.searchParams.get("profileId") ?? "";
  const accountId = url.searchParams.get("accountId") ?? "";
  const response = (status: string, detail?: string) => {
    const redirect = redirectToCommunications(request, status, detail);
    redirect.cookies.delete("zernio_whatsapp_state");
    redirect.cookies.delete("zernio_whatsapp_profile");
    return redirect;
  };

  if (!expectedState || !state || !equalSecret(expectedState, state)) return response("error", "WhatsApp connection state could not be verified. Start again from Communications.");
  if (errorValue) return response("error", url.searchParams.get("error_message") || errorValue);
  if (connectedPlatform !== "whatsapp" || !accountId || profileId !== expectedProfileId) {
    return response("error", "Zernio returned an incomplete or unexpected WhatsApp connection.");
  }

  try {
    const access = await getWhatsAppAccess("communications.whatsapp.manage");
    if ("error" in access) return response("error", access.error);
    if (!isZernioConfigured()) return response("error", "Zernio API key or webhook secret is not configured on the server.");
    const accounts = await zernioRequest(`/accounts?profileId=${encodeURIComponent(profileId)}&platform=whatsapp`) as { accounts?: { _id?: string; id?: string; accountId?: string; platform?: string; username?: string; displayName?: string; isActive?: boolean }[] };
    const account = accounts.accounts?.find((item) => (item._id ?? item.id ?? item.accountId) === accountId && item.platform === "whatsapp");
    if (!account) return response("error", "Zernio did not confirm this WhatsApp account in the company profile.");

    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const webhookSecret = process.env.ZERNIO_WEBHOOK_SECRET!.trim();
    const webhook = await zernioRequest("/webhooks/settings", {
      method: "POST",
      body: JSON.stringify({
        name: `RecruitOS WhatsApp ${access.companyId.slice(0, 8)}`,
        url: `${origin.replace(/\/$/, "")}/api/communications/whatsapp/webhook`,
        secret: webhookSecret,
        events: ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"],
        accountIds: [accountId],
      }),
    }) as { webhook?: { _id?: string } };
    if (!webhook.webhook?._id) throw new Error("Zernio did not return the inbox webhook ID.");

    const admin = await getWhatsAppAdmin();
    const { error: saveError } = await admin.from("whatsapp_connections").upsert({
      company_id: access.companyId,
      zernio_profile_id: profileId,
      zernio_account_id: accountId,
      display_phone_number: account.username ?? "",
      verified_name: account.displayName ?? "",
      webhook_id: webhook.webhook._id,
      connected_by: access.userId,
    }, { onConflict: "company_id" });
    if (saveError) throw saveError;
    return response("connected");
  } catch (error) {
    console.error("Zernio WhatsApp callback failed", error);
    return response("error", error instanceof Error ? error.message : "Unable to save the WhatsApp connection.");
  }
}