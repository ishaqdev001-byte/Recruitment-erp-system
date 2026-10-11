import { NextResponse } from "next/server";
import { findGmailText, getImapSmtpSettings, getMailAccess, getValidMailAccessToken, isMailProvider, type MailConnection, type MailProvider } from "@/lib/server/mail";
import { readImapFolder } from "@/lib/server/imap-smtp";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type MailFolder = "inbox" | "starred" | "sent" | "drafts";
type MailMessage = { id: string; provider: MailProvider; direction: "Inbound" | "Outbound"; from: string; to: string; subject: string; body: string; date: string; status: "Received" | "Sent" | "Draft" | "Failed" | "Unknown" };

function gmailHeader(headersValue: unknown[], name: string) {
  const header = headersValue.find((item) => item && typeof item === "object" && String((item as { name?: string }).name).toLowerCase() === name.toLowerCase()) as { value?: string } | undefined;
  return header?.value ?? "";
}

async function loadGmail(accessToken: string, folder: MailFolder): Promise<MailMessage[]> {
  const labelIds: Record<MailFolder, string> = { inbox: "INBOX", starred: "STARRED", sent: "SENT", drafts: "DRAFT" };
  const direction = folder === "sent" || folder === "drafts" ? "Outbound" : "Inbound";
  const status = folder === "drafts" ? "Draft" : folder === "sent" ? "Sent" : "Received";
  const listUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${folder === "drafts" ? "drafts" : "messages"}`);
  listUrl.searchParams.set("maxResults", "25");
  if (folder !== "drafts") listUrl.searchParams.set("labelIds", labelIds[folder]);
  const listResponse = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  const listPayload = await listResponse.json().catch(() => null) as { messages?: { id: string }[]; drafts?: { message?: { id?: string } }[]; error?: { message?: string } } | null;
  if (!listResponse.ok) throw new Error(listPayload?.error?.message || "Unable to read the Gmail inbox.");
  const messageIds = folder === "drafts"
    ? (listPayload?.drafts ?? []).flatMap((draft) => draft.message?.id ? [draft.message.id] : [])
    : (listPayload?.messages ?? []).map(({ id }) => id);
  return Promise.all(messageIds.map(async (id) => {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    const payload = await response.json().catch(() => null) as { id?: string; snippet?: string; internalDate?: string; payload?: { headers?: unknown[] } & Record<string, unknown>; error?: { message?: string } } | null;
    if (!response.ok || !payload) throw new Error(payload?.error?.message || "Unable to read a Gmail message.");
    const messagePayload = payload.payload ?? {};
    const messageHeaders = Array.isArray(messagePayload.headers) ? messagePayload.headers : [];
    return {
      id: `gmail-${payload.id ?? id}`,
      provider: "gmail" as const,
      direction,
      from: gmailHeader(messageHeaders, "From"),
      to: gmailHeader(messageHeaders, "To"),
      subject: gmailHeader(messageHeaders, "Subject") || "(No subject)",
      body: findGmailText(messagePayload) || payload.snippet || "",
      date: payload.internalDate ? new Date(Number(payload.internalDate)).toISOString() : new Date().toISOString(),
      status,
    };
  }));
}

async function loadOutlook(accessToken: string, folder: MailFolder): Promise<MailMessage[]> {
  const folderNames: Record<Exclude<MailFolder, "starred">, string> = { inbox: "inbox", sent: "sentitems", drafts: "drafts" };
  const url = new URL(folder === "starred"
    ? "https://graph.microsoft.com/v1.0/me/messages"
    : `https://graph.microsoft.com/v1.0/me/mailFolders/${folderNames[folder]}/messages`);
  url.searchParams.set("$top", "25");
  url.searchParams.set("$select", "id,subject,from,toRecipients,body,bodyPreview,receivedDateTime");
  url.searchParams.set("$orderby", "receivedDateTime desc");
  if (folder === "starred") url.searchParams.set("$filter", "flag/flagStatus eq 'flagged'");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => null) as { value?: { id: string; subject?: string; from?: { emailAddress?: { name?: string; address?: string } }; toRecipients?: { emailAddress?: { address?: string } }[]; body?: { content?: string; contentType?: string }; bodyPreview?: string; receivedDateTime?: string }[]; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Unable to read the Outlook inbox.");
  return (payload?.value ?? []).map((item) => ({
    id: `outlook-${item.id}`,
    provider: "outlook",
    direction: folder === "sent" || folder === "drafts" ? "Outbound" : "Inbound",
    from: item.from?.emailAddress?.name
      ? `${item.from.emailAddress.name} <${item.from.emailAddress.address ?? ""}>`
      : item.from?.emailAddress?.address ?? "",
    to: (item.toRecipients ?? []).map((recipient) => recipient.emailAddress?.address).filter(Boolean).join(", "),
    subject: item.subject || "(No subject)",
    body: item.body?.contentType?.toLowerCase() === "text" ? item.body.content ?? "" : item.bodyPreview ?? item.body?.content?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? "",
    date: item.receivedDateTime ?? new Date().toISOString(),
    status: folder === "drafts" ? "Draft" : folder === "sent" ? "Sent" : "Received",
  }));
}

export async function GET(request: Request) {
  try {
    const access = await getMailAccess("communications.email.read");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const provider = new URL(request.url).searchParams.get("provider");
    if (!isMailProvider(provider)) return NextResponse.json({ error: "Choose Gmail or Outlook." }, { status: 400, headers });
    const folderValue = new URL(request.url).searchParams.get("folder") ?? "inbox";
    if (!["inbox", "starred", "sent", "drafts"].includes(folderValue)) return NextResponse.json({ error: "Choose a valid mail folder." }, { status: 400, headers });
    const folder = folderValue as MailFolder;
    const { data: connection, error: connectionError } = await access.supabase.from("mail_connections").select("*")
      .eq("company_id", access.companyId).eq("user_id", access.userId).eq("provider", provider).maybeSingle();
    if (connectionError || !connection) return NextResponse.json({ error: `Link your ${provider === "gmail" ? "Gmail" : "Outlook"} account first.` }, { status: 404, headers });
    const mailConnection = connection as MailConnection;
    const inbox = provider === "outlook" && mailConnection.auth_type === "imap_smtp"
      ? await readImapFolder(getImapSmtpSettings(mailConnection), folder)
      : await loadOAuthInbox(access, mailConnection, provider, folder);
    const { data: sentRows, error: sentError } = folder === "sent" && mailConnection.auth_type === "imap_smtp"
      ? await access.supabase.from("mail_message_logs")
      .select("id, recipient_email, recipient_name, subject, body, provider_status, created_at")
      .eq("company_id", access.companyId).eq("user_id", access.userId).eq("provider", provider)
      .order("created_at", { ascending: false }).limit(50)
      : { data: [], error: null };
    if (sentError) throw sentError;
    const sent: MailMessage[] = (sentRows ?? []).map((item) => ({
      id: `sent-${provider}-${item.id}`,
      provider,
      direction: "Outbound",
      from: mailConnection.email_address,
      to: item.recipient_name ? `${item.recipient_name} <${item.recipient_email}>` : item.recipient_email,
      subject: item.subject,
      body: item.body,
      date: item.created_at,
      status: item.provider_status === "sent" ? "Sent" : item.provider_status === "failed" ? "Failed" : "Unknown",
    }));
    return NextResponse.json({ messages: [...inbox, ...sent].sort((left, right) => Date.parse(right.date) - Date.parse(left.date)), mailbox: mailConnection.email_address }, { headers });
  } catch (error) {
    console.error("Mailbox message load failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load mailbox messages." }, { status: 503, headers });
  }
}

async function loadOAuthInbox(
  access: Parameters<typeof getValidMailAccessToken>[0],
  connection: MailConnection,
  provider: MailProvider,
  folder: MailFolder,
) {
  const accessToken = await getValidMailAccessToken(access, connection);
  return provider === "gmail" ? loadGmail(accessToken, folder) : loadOutlook(accessToken, folder);
}
