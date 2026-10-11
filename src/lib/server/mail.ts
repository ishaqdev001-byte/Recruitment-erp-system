import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MailProvider = "gmail" | "outlook";
export type MailAccess =
  | { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; companyId: string; userId: string; userEmail: string }
  | { error: string; status: 401 | 403 };
export type MailConnection = {
  id: string;
  company_id: string;
  user_id: string;
  provider: MailProvider;
  email_address: string;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  expires_at: string;
  scopes: string;
  auth_type: "oauth" | "imap_smtp";
  credentials_ciphertext: string | null;
};

export function isMailProvider(value: string | null): value is MailProvider {
  return value === "gmail" || value === "outlook";
}

export function tokenEncryptionKey() {
  const value = process.env.MAIL_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("Set MAIL_TOKEN_ENCRYPTION_KEY to 64 hexadecimal characters (32 random bytes).");
  return Buffer.from(value, "hex");
}

export function encryptMailToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptMailToken(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new Error("Stored mail token is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", tokenEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function getImapSmtpSettings(connection: MailConnection) {
  if (!connection.credentials_ciphertext) throw new Error("IMAP/SMTP settings are missing.");
  const settings = JSON.parse(decryptMailToken(connection.credentials_ciphertext)) as {
    emailAddress: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    username: string;
    password: string;
  };
  if (!settings.emailAddress || !settings.imapHost || !settings.smtpHost || !settings.username || !settings.password) {
    throw new Error("Stored IMAP/SMTP settings are incomplete.");
  }
  return settings;
}

export async function getMailAccess(permission: "communications.email.read" | "communications.email.send" | "communications.whatsapp.read" | "communications.whatsapp.send" | "communications.whatsapp.manage"): Promise<MailAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 };
  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) {
    const action = permission.endsWith("send") ? "send" : permission.endsWith("manage") ? "manage" : "read";
    const resource = permission.includes("whatsapp") ? "the company WhatsApp inbox" : "linked email";
    return { error: `You do not have permission to ${action} ${resource}. Ask an administrator to grant ${permission}.`, status: 403 };
  }
  return { supabase, companyId: membership.company_id, userId: user.id, userEmail: user.email ?? "" };
}

export function mailClientId(provider: MailProvider) {
  return provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
}

export function mailClientSecret(provider: MailProvider) {
  return provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;
}

export function mailCallbackUrl(origin: string, provider: MailProvider) {
  const appOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || origin;
  return `${appOrigin.replace(/\/$/, "")}/api/communications/mail/callback?provider=${provider}`;
}

function providerTokenUrl(provider: MailProvider) {
  return provider === "gmail"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
}

function providerScopes(provider: MailProvider) {
  return provider === "gmail"
    ? "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"
    : "openid profile email offline_access User.Read Mail.Read Mail.Send";
}

export async function exchangeMailCode(provider: MailProvider, code: string, origin: string) {
  const clientId = mailClientId(provider);
  const clientSecret = mailClientSecret(provider);
  if (!clientId || !clientSecret) throw new Error(`${provider === "gmail" ? "Google" : "Microsoft"} OAuth is not configured on the server.`);
  const response = await fetch(providerTokenUrl(provider), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: mailCallbackUrl(origin, provider),
      ...(provider === "outlook" ? { scope: providerScopes(provider) } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof payload?.access_token !== "string" || typeof payload.refresh_token !== "string") {
    console.error("Mail OAuth token exchange rejected", provider, response.status, payload?.error);
    throw new Error("The mail provider could not authorize this account. Check the OAuth app and callback URL settings.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000).toISOString(),
    scopes: typeof payload.scope === "string" ? payload.scope : providerScopes(provider),
  };
}

export async function getMailAccountEmail(provider: MailProvider, accessToken: string) {
  const url = provider === "gmail" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const payload = await response.json().catch(() => null) as { email?: unknown; mail?: unknown; userPrincipalName?: unknown } | null;
  const address = provider === "gmail" ? payload?.email : payload?.mail ?? payload?.userPrincipalName;
  if (!response.ok || typeof address !== "string" || !address.includes("@")) throw new Error("The provider did not return a valid mailbox address.");
  return address;
}

export async function getValidMailAccessToken(
  access: Extract<MailAccess, { supabase: unknown }>,
  connection: MailConnection,
) {
  if (Date.parse(connection.expires_at) > Date.now() + 60_000) return decryptMailToken(connection.access_token_ciphertext);
  const clientId = mailClientId(connection.provider);
  const clientSecret = mailClientSecret(connection.provider);
  if (!clientId || !clientSecret) throw new Error("The mail provider is not configured on the server.");
  const refreshToken = decryptMailToken(connection.refresh_token_ciphertext);
  const response = await fetch(providerTokenUrl(connection.provider), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      ...(connection.provider === "outlook" ? { scope: providerScopes(connection.provider) } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || typeof payload?.access_token !== "string") {
    console.error("Mail token refresh failed", connection.provider, response.status, payload?.error);
    throw new Error("Your linked mailbox authorization expired. Unlink and link the mailbox again.");
  }
  const refreshedToken = payload.access_token;
  const nextRefreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : refreshToken;
  const expiresAt = new Date(Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000).toISOString();
  const { error } = await access.supabase.from("mail_connections").update({
    access_token_ciphertext: encryptMailToken(refreshedToken),
    refresh_token_ciphertext: encryptMailToken(nextRefreshToken),
    expires_at: expiresAt,
    scopes: typeof payload.scope === "string" ? payload.scope : connection.scopes,
  }).eq("id", connection.id).eq("user_id", access.userId);
  if (error) throw new Error("Unable to save refreshed mailbox credentials.");
  return refreshedToken;
}

export function decodeMailBase64(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function findGmailText(payload: Record<string, unknown>): string {
  const body = payload.body as { data?: unknown } | undefined;
  if (typeof body?.data === "string" && payload.mimeType === "text/plain") return decodeMailBase64(body.data);
  const parts = Array.isArray(payload.parts) ? payload.parts as Record<string, unknown>[] : [];
  for (const part of parts) {
    const text = findGmailText(part);
    if (text) return text;
  }
  if (typeof body?.data === "string") return decodeMailBase64(body.data).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

export function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function base64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}
