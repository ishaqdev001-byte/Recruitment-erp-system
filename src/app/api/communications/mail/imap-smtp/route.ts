import { NextResponse } from "next/server";
import { encryptMailToken, getMailAccess, tokenEncryptionKey } from "@/lib/server/mail";
import { verifyImapSmtpSettings, type ImapSmtpSettings } from "@/lib/server/imap-smtp";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function parseSettings(value: Record<string, unknown>): ImapSmtpSettings | null {
  const emailAddress = typeof value.emailAddress === "string" ? value.emailAddress.trim() : "";
  const username = typeof value.username === "string" ? value.username.trim() : "";
  const password = typeof value.password === "string" ? value.password : "";
  const imapHost = typeof value.imapHost === "string" ? value.imapHost.trim() : "";
  const smtpHost = typeof value.smtpHost === "string" ? value.smtpHost.trim() : "";
  const imapPort = Number(value.imapPort);
  const smtpPort = Number(value.smtpPort);
  if (!emailPattern.test(emailAddress) || emailAddress.length > 320 || !username || username.length > 320
    || !password || password.length > 1000 || !imapHost || !smtpHost
    || !Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535
    || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535
    || typeof value.imapSecure !== "boolean" || typeof value.smtpSecure !== "boolean") return null;
  return { emailAddress, username, password, imapHost, smtpHost, imapPort, smtpPort, imapSecure: value.imapSecure, smtpSecure: value.smtpSecure };
}

export async function POST(request: Request) {
  const access = await getMailAccess("communications.email.read");
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  const settings = payload ? parseSettings(payload) : null;
  if (!settings) return NextResponse.json({ error: "Enter a valid email address and complete IMAP/SMTP server settings." }, { status: 400, headers });

  try {
    tokenEncryptionKey();
    await verifyImapSmtpSettings(settings);
  } catch {
    return NextResponse.json({ error: "Could not verify the mailbox. Check the public server hostnames, ports, TLS options, username, and password." }, { status: 422, headers });
  }

  const { error } = await access.supabase.from("mail_connections").upsert({
    company_id: access.companyId,
    user_id: access.userId,
    provider: "outlook",
    auth_type: "imap_smtp",
    email_address: settings.emailAddress,
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    expires_at: null,
    scopes: "IMAP/SMTP",
    credentials_ciphertext: encryptMailToken(JSON.stringify(settings)),
    updated_at: new Date().toISOString(),
  }, { onConflict: "company_id,user_id,provider" });
  if (error) {
    console.error("IMAP/SMTP mailbox save failed", error);
    return NextResponse.json({ error: "Unable to save the mailbox settings." }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true, emailAddress: settings.emailAddress }, { headers });
}