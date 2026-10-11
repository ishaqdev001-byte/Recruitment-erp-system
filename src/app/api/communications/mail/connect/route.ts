import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { encryptMailToken, getMailAccess, isMailProvider, mailCallbackUrl, mailClientId, tokenEncryptionKey } from "@/lib/server/mail";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const providerValue = new URL(request.url).searchParams.get("provider");
  if (!isMailProvider(providerValue)) return NextResponse.json({ error: "Choose Gmail or Outlook." }, { status: 400, headers });
  const access = await getMailAccess("communications.email.read");
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const clientId = mailClientId(providerValue);
  const clientSecret = providerValue === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: `${providerValue === "gmail" ? "Google" : "Microsoft"} OAuth credentials are not configured on the server.` }, { status: 503, headers });
  try {
    tokenEncryptionKey();
    encryptMailToken("configuration-check");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mail token encryption is not configured." }, { status: 503, headers });
  }

  const state = randomBytes(32).toString("base64url");
  const callback = mailCallbackUrl(new URL(request.url).origin, providerValue);
  const authorizeUrl = providerValue === "gmail"
    ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
    : new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  authorizeUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    response_mode: "query",
    scope: providerValue === "gmail"
      ? "openid email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"
      : "openid profile email offline_access User.Read Mail.Read Mail.Send",
    state,
    ...(providerValue === "gmail" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }),
  }).toString();

  const response = NextResponse.json({ url: authorizeUrl.toString() }, { headers });
  response.cookies.set(`mail_oauth_${providerValue}`, state, {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: "/api/communications/mail/callback",
    maxAge: 600,
  });
  return response;
}
