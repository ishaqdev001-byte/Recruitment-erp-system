import "server-only";

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getMailAccess } from "@/lib/server/mail";

export const whatsappHeaders = { "Cache-Control": "private, no-store" };
const zernioBaseUrl = "https://zernio.com/api/v1";

export function isZernioConfigured() {
  return Boolean(process.env.ZERNIO_API_KEY?.trim() && process.env.ZERNIO_WEBHOOK_SECRET?.trim());
}

export async function zernioRequest(path: string, init: RequestInit = {}) {
  const apiKey = process.env.ZERNIO_API_KEY?.trim();
  if (!apiKey) throw new Error("Set ZERNIO_API_KEY in the server environment.");
  const response = await fetch(`${zernioBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `Zernio API returned ${response.status}.`;
    throw new Error(message.slice(0, 400));
  }
  return payload ?? {};
}

export async function getWhatsAppAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("WhatsApp server storage is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getWhatsAppAccess(permission: "communications.whatsapp.read" | "communications.whatsapp.send" | "communications.whatsapp.manage") {
  const access = await getMailAccess(permission);
  if ("error" in access) return access;
  return access;
}

export function getWhatsAppProfileName(companyId: string) {
  return `RecruitOS ${companyId}`;
}

export async function getOrCreateZernioProfile(companyId: string) {
  const name = getWhatsAppProfileName(companyId);
  const list = await zernioRequest(`/profiles?name=${encodeURIComponent(name)}`) as { profiles?: { _id?: string }[] };
  const existing = list.profiles?.[0]?._id;
  if (existing) return existing;
  const idempotencyKey = createHash("sha256").update(`recruitos-zernio-profile:${companyId}`).digest("hex");
  const created = await zernioRequest("/profiles", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ name, description: "Company WhatsApp inbox for RecruitOS" }),
  }) as { profile?: { _id?: string } };
  if (!created.profile?._id) throw new Error("Zernio did not return the company profile ID.");
  return created.profile._id;
}