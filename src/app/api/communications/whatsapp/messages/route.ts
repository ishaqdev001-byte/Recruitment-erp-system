import { NextResponse } from "next/server";
import { getWhatsAppAccess, getWhatsAppAdmin, whatsappHeaders, zernioRequest } from "@/lib/server/whatsapp";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ZernioConversation = {
  id: string;
  platform?: string;
  accountId?: string;
  participantId?: string;
  participantName?: string;
  lastMessage?: string;
  updatedTime?: string;
  unreadCount?: number;
  status?: string;
};

export async function GET(request: Request) {
  try {
    const access = await getWhatsAppAccess("communications.whatsapp.read");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: whatsappHeaders });
    const admin = await getWhatsAppAdmin();
    const { data: connection, error } = await admin.from("whatsapp_connections")
      .select("zernio_account_id").eq("company_id", access.companyId).maybeSingle();
    if (error) throw error;
    if (!connection) return NextResponse.json({ conversations: [], messages: [] }, { headers: whatsappHeaders });

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    if (conversationId) {
      const query = new URLSearchParams({ accountId: connection.zernio_account_id, limit: "100", sortOrder: "asc" });
      const result = await zernioRequest(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${query}`) as { messages?: Record<string, unknown>[] };
      const messages = (result.messages ?? []).map((message) => ({
        id: String(message.id ?? message.platformMessageId ?? crypto.randomUUID()),
        provider_message_id: typeof message.platformMessageId === "string" ? message.platformMessageId : null,
        conversation_id: conversationId,
        contact_phone: "",
        contact_name: typeof message.senderName === "string" ? message.senderName : "",
        direction: message.direction === "outgoing" ? "outbound" : "inbound",
        message_type: "text",
        body: typeof message.message === "string" ? message.message : typeof message.text === "string" ? message.text : "",
        status: typeof message.deliveryStatus === "string" ? message.deliveryStatus : message.direction === "outgoing" ? "sent" : "received",
        created_at: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(),
        sent_by: null,
      }));
      return NextResponse.json({ messages }, { headers: whatsappHeaders });
    }

    const query = new URLSearchParams({ platform: "whatsapp", accountId: connection.zernio_account_id, limit: "100", sortOrder: "desc" });
    const result = await zernioRequest(`/inbox/conversations?${query}`) as { data?: ZernioConversation[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } };
    const conversations = (result.data ?? []).filter((item) => item.platform === "whatsapp" && item.accountId === connection.zernio_account_id).map((item) => ({
      id: item.id,
      platform: item.platform,
      accountId: item.accountId,
      contact_phone: item.participantId ?? "",
      contact_name: item.participantName ?? "",
      body: item.lastMessage ?? "",
      created_at: item.updatedTime ?? new Date().toISOString(),
      unread_count: item.unreadCount ?? 0,
      status: item.status ?? "active",
    }));
    return NextResponse.json({ conversations, hasMore: Boolean(result.pagination?.hasMore), nextCursor: result.pagination?.nextCursor ?? null }, { headers: whatsappHeaders });
  } catch (error) {
    console.error("Zernio WhatsApp inbox load failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp inbox is unavailable." }, { status: 503, headers: whatsappHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getWhatsAppAccess("communications.whatsapp.send");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: whatsappHeaders });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const conversationId = typeof body?.conversationId === "string" ? body.conversationId.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const rawPhone = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    const participantId = rawPhone.replace(/\D/g, "");
    const templateName = typeof body?.templateName === "string" ? body.templateName.trim() : "";
    const templateLanguage = typeof body?.templateLanguage === "string" ? body.templateLanguage.trim() : "";
    const templateParams = Array.isArray(body?.templateParams) ? body.templateParams.filter((item): item is string => typeof item === "string") : [];
    if (!uuidPattern.test(requestId)) return NextResponse.json({ error: "Invalid WhatsApp request ID." }, { status: 400, headers: whatsappHeaders });
    if (conversationId) {
      if (!message || message.length > 9999) return NextResponse.json({ error: "Message must contain between 1 and 9,999 characters." }, { status: 400, headers: whatsappHeaders });
    } else if (!/^\d{8,15}$/.test(participantId) || !/^[a-zA-Z0-9_]{1,512}$/.test(templateName) || !/^[a-zA-Z0-9_-]{2,20}$/.test(templateLanguage) || templateParams.length > 100) {
      return NextResponse.json({ error: "For a new conversation, enter an international phone number and the name, language, and parameters for an approved WhatsApp template." }, { status: 400, headers: whatsappHeaders });
    }

    const admin = await getWhatsAppAdmin();
    const { data: connection, error } = await admin.from("whatsapp_connections")
      .select("zernio_account_id").eq("company_id", access.companyId).maybeSingle();
    if (error) throw error;
    if (!connection) return NextResponse.json({ error: "The company has not connected a WhatsApp Business number." }, { status: 404, headers: whatsappHeaders });

    const result = conversationId
      ? await zernioRequest(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { "Idempotency-Key": requestId },
        body: JSON.stringify({ accountId: connection.zernio_account_id, message }),
      })
      : await zernioRequest("/inbox/conversations", {
        method: "POST",
        headers: { "Idempotency-Key": requestId },
        body: JSON.stringify({ accountId: connection.zernio_account_id, participantId, templateName, templateLanguage, templateParams }),
      });
    return NextResponse.json({ result }, { status: conversationId ? 200 : 201, headers: whatsappHeaders });
  } catch (error) {
    console.error("Zernio WhatsApp send failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "WhatsApp sending is unavailable." }, { status: 502, headers: whatsappHeaders });
  }
}
