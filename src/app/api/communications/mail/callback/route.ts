import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptMailToken, exchangeMailCode, getMailAccess, getMailAccountEmail, isMailProvider, mailCallbackUrl } from "@/lib/server/mail";

export const runtime = "nodejs";

function redirectToApp(request: Request, status: string, provider: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
  const destination = new URL("/", origin);
  destination.searchParams.set("view", "communications");
  destination.searchParams.set("mail", status);
  destination.searchParams.set("provider", provider);
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providerValue = url.searchParams.get("provider");
  if (!isMailProvider(providerValue)) return redirectToApp(request, "error", "mail");
  const cookieName = `mail_oauth_${providerValue}`;
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(cookieName)?.value;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  if (!expectedState || !state || state !== expectedState || !code || providerError) {
    const response = redirectToApp(request, providerError ? "denied" : "error", providerValue);
    response.cookies.delete(cookieName);
    return response;
  }

  try {
    const access = await getMailAccess("communications.email.read");
    if ("error" in access) return redirectToApp(request, "error", providerValue);
    const tokens = await exchangeMailCode(providerValue, code, new URL(request.url).origin);
    const emailAddress = await getMailAccountEmail(providerValue, tokens.accessToken);
    const { error } = await access.supabase.from("mail_connections").upsert({
      company_id: access.companyId,
      user_id: access.userId,
      provider: providerValue,
      email_address: emailAddress,
      access_token_ciphertext: encryptMailToken(tokens.accessToken),
      refresh_token_ciphertext: encryptMailToken(tokens.refreshToken),
      expires_at: tokens.expiresAt,
      scopes: tokens.scopes,
      updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,user_id,provider" });
    if (error) {
      console.error("Mail connection save failed", error);
      throw new Error("Unable to save the linked mailbox.");
    }
    const response = redirectToApp(request, "connected", providerValue);
    response.cookies.delete(cookieName);
    return response;
  } catch (error) {
    console.error("Mail OAuth callback failed", providerValue, error);
    const response = redirectToApp(request, "error", providerValue);
    response.cookies.delete(cookieName);
    return response;
  }
+}
