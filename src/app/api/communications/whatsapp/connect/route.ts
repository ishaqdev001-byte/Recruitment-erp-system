import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateZernioProfile, getWhatsAppAccess, getWhatsAppAdmin, isZernioConfigured, whatsappHeaders, zernioRequest } from "@/lib/server/whatsapp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const access = await getWhatsAppAccess("communications.whatsapp.manage");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: whatsappHeaders });
    if (!isZernioConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json({ error: "Set ZERNIO_API_KEY, ZERNIO_WEBHOOK_SECRET, and SUPABASE_SERVICE_ROLE_KEY in the server environment." }, { status: 503, headers: whatsappHeaders });
    }
    const admin = await getWhatsAppAdmin();
    const { data: connected, error } = await admin.from("whatsapp_connections")
      .select("zernio_account_id").eq("company_id", access.companyId).maybeSingle();
    if (error) throw error;
    if (connected) return NextResponse.json({ error: "A WhatsApp number is already connected. Disconnect it before connecting another." }, { status: 409, headers: whatsappHeaders });

    const profileId = await getOrCreateZernioProfile(access.companyId);
    const state = randomBytes(32).toString("base64url");
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const callback = new URL("/api/communications/whatsapp/callback", origin);
    callback.searchParams.set("state", state);
    const query = new URLSearchParams({
      profileId,
      redirect_url: callback.toString(),
      onboarding: "api",
      signup: "hosted",
    });
    const result = await zernioRequest(`/connect/whatsapp?${query}`) as { authUrl?: string };
    if (!result.authUrl) return NextResponse.json({ error: "Zernio did not return a WhatsApp connection URL." }, { status: 502, headers: whatsappHeaders });

    const cookieStore = await cookies();
    const secure = new URL(request.url).protocol === "https:";
    cookieStore.set("zernio_whatsapp_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/api/communications/whatsapp/callback", maxAge: 600 });
    cookieStore.set("zernio_whatsapp_profile", profileId, { httpOnly: true, secure, sameSite: "lax", path: "/api/communications/whatsapp/callback", maxAge: 600 });
    return NextResponse.json({ url: result.authUrl }, { headers: whatsappHeaders });
  } catch (error) {
    console.error("Zernio WhatsApp connect start failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start WhatsApp connection." }, { status: 503, headers: whatsappHeaders });
  }
}