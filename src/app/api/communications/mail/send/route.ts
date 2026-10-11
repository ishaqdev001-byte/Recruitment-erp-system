import { NextResponse } from "next/server";
import { base64Url, getImapSmtpSettings, getMailAccess, getValidMailAccessToken, isMailProvider, safeHeader, type MailConnection } from "@/lib/server/mail";
import { createSmtpTransport, resolvePublicMailHost } from "@/lib/server/imap-smtp";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const access = await getMailAccess("communications.email.send");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const provider = typeof body?.provider === "string" ? body.provider : null;
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const recipientEmail = typeof body?.to === "string" ? body.to.trim() : "";
    const recipientName = typeof body?.recipientName === "string" ? body.recipientName.trim().slice(0, 200) : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const messageBody = typeof body?.body === "string" ? body.body.trim() : "";
    if (!isMailProvider(provider) || !uuidPattern.test(requestId)
      || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipientEmail) || recipientEmail.length > 320
      || !subject || subject.length > 998 || /[\r\n]/.test(subject)
      || !messageBody || messageBody.length > 100000) {
      return NextResponse.json({ error: "Enter a valid recipient, subject, and message." }, { status: 400, headers });
    }
    const { data: connection, error: connectionError } = await access.supabase.from("mail_connections").select("*")
      .eq("company_id", access.companyId).eq("user_id", access.userId).eq("provider", provider).maybeSingle();
    if (connectionError || !connection) return NextResponse.json({ error: `Link your ${provider === "gmail" ? "Gmail" : "Outlook"} account before sending.` }, { status: 404, headers });

    const { data: claim, error: claimError } = await access.supabase.from("mail_message_logs").insert({
      company_id: access.companyId,
      user_id: access.userId,
      provider,
      request_id: requestId,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject,
      body: messageBody,
      provider_status: "sending",
    }).select("id").maybeSingle();
    if (claimError) {
      if (claimError.code === "23505") {
        const { data: previous } = await access.supabase.from("mail_message_logs")
          .select("id, provider_status, provider_error, created_at")
          .eq("company_id", access.companyId).eq("user_id", access.userId).eq("request_id", requestId).maybeSingle();
        if (previous?.provider_status === "sent") return NextResponse.json({ message: previous, duplicate: true }, { headers });
        return NextResponse.json({ error: previous?.provider_error || "This email was already processed or is still being sent. Check Sent mail before retrying.", status: previous?.provider_status ?? "unknown", duplicate: true }, { status: 409, headers });
      }
      console.error("Mail send claim failed", claimError);
      return NextResponse.json({ error: "Unable to safely record this email. No message was sent." }, { status: 503, headers });
    }
    if (!claim) return NextResponse.json({ error: "Unable to safely record this email. No message was sent." }, { status: 503, headers });

    try {
      const mailConnection = connection as MailConnection;
      let providerMessageId: string | null = null;
      let response: Response;
      if (provider === "outlook" && mailConnection.auth_type === "imap_smtp") {
        const settings = getImapSmtpSettings(mailConnection);
        const smtpServer = await resolvePublicMailHost(settings.smtpHost);
        const transport = createSmtpTransport(settings, smtpServer);
        try {
          const receipt = await transport.sendMail({
            from: { address: mailConnection.email_address },
            to: recipientName ? { name: safeHeader(recipientName), address: recipientEmail } : recipientEmail,
            subject,
            text: messageBody,
          });
          providerMessageId = receipt.messageId ?? null;
          response = new Response(null, { status: 202 });
        } catch (error) {
          const responseCode = (error as { responseCode?: unknown }).responseCode;
          if (typeof responseCode !== "number") throw error;
          response = Response.json({ error: "The SMTP server rejected this email." }, { status: 502 });
        } finally {
          transport.close();
        }
      } else {
        const accessToken = await getValidMailAccessToken(access, mailConnection);
        if (provider === "gmail") {
          const mime = [
            `To: ${recipientName ? `${safeHeader(recipientName)} <${recipientEmail}>` : recipientEmail}`,
            `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=UTF-8",
            "Content-Transfer-Encoding: 8bit",
            "",
            messageBody.replace(/\r?\n/g, "\r\n"),
          ].join("\r\n");
          response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ raw: base64Url(mime) }),
            cache: "no-store",
            signal: AbortSignal.timeout(25000),
          });
        } else {
          response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "Text", content: messageBody },
                toRecipients: [{ emailAddress: { address: recipientEmail, ...(recipientName ? { name: recipientName } : {}) } }],
              },
              saveToSentItems: true,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(25000),
          });
        }
      }
      if (!response.ok) {
        const providerPayload = await response.json().catch(() => null) as { error?: { message?: string; code?: string }; message?: string } | null;
        const errorMessage = (providerPayload?.error?.message ?? providerPayload?.message ?? "The mail provider rejected this email.").slice(0, 500);
        await access.supabase.from("mail_message_logs").update({ provider_status: "failed", provider_error: errorMessage })
          .eq("id", claim.id).eq("company_id", access.companyId);
        return NextResponse.json({ error: errorMessage, code: providerPayload?.error?.code }, { status: 502, headers });
      }
      if (provider === "gmail") {
        const receipt = await response.json().catch(() => null) as { id?: string } | null;
        providerMessageId = receipt?.id ?? null;
      }
      const { data: sent, error: updateError } = await access.supabase.from("mail_message_logs").update({
        provider_status: "sent",
        provider_message_id: providerMessageId,
      }).eq("id", claim.id).eq("company_id", access.companyId)
        .select("id, provider, recipient_email, recipient_name, subject, body, provider_status, created_at").single();
      if (updateError) console.error("Email sent but receipt update failed", updateError);
      return NextResponse.json({ message: sent ?? { ...claim, provider: provider, recipient_email: recipientEmail, recipient_name: recipientName, subject, body: messageBody, provider_status: "sent", created_at: new Date().toISOString() } }, { status: 201, headers });
    } catch (sendError) {
      console.error("Mail provider request result is unknown", provider, sendError);
      await access.supabase.from("mail_message_logs").update({ provider_status: "unknown", provider_error: "The connection ended before the provider confirmed the send. Check Sent mail before retrying." })
        .eq("id", claim.id).eq("company_id", access.companyId);
      return NextResponse.json({ error: "The send result is unknown. Check Sent mail before retrying.", status: "unknown" }, { status: 503, headers });
    }
  } catch (error) {
    console.error("Mail send request failed", error);
    return NextResponse.json({ error: "Email sending is unavailable." }, { status: 503, headers });
  }
}
