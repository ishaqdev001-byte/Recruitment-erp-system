import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getWhatsAppAdmin, whatsappHeaders } from "@/lib/server/whatsapp";

export const runtime = "nodejs";

type ZernioInboxEvent = {
  id?: string;
  event?: string;
  timestamp?: string;
  message?: {
    id?: string;
    platformMessageId?: string;
    conversationId?: string;
    text?: string;
    message?: string;
    direction?: string;
    senderName?: string;
    senderId?: string;
    createdAt?: string;
    deliveryStatus?: string;
    type?: string;
    attachments?: { type?: string }[];
  };
  conversation?: { id?: string; participantId?: string; participantName?: string };
  account?: { accountId?: string; platform?: string };
  error?: { code?: string | number; message?: string };
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function eventStatus(eventName: string) {
  if (eventName === "message.received") return "received";
  if (eventName === "message.sent") return "sent";
  if (eventName === "message.delivered") return "delivered";
  if (eventName === "message.read") return "read";
  if (eventName === "message.failed") return "failed";
  return null;
}

export async function POST(request: Request) {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim() ?? "";
  const signature = request.headers.get("x-zernio-signature") ?? "";
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return new Response("Forbidden", { status: 401, headers: whatsappHeaders });
  const rawBody = await request.text();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!safeEqual(signature.toLowerCase(), expected)) return new Response("Forbidden", { status: 401, headers: whatsappHeaders });

  try {
    const payload = JSON.parse(rawBody) as ZernioInboxEvent;
    const status = eventStatus(payload.event ?? "");
    const messageId = payload.message?.id ?? payload.message?.platformMessageId;
    const conversationId = payload.conversation?.id ?? payload.message?.conversationId;
    const accountId = payload.account?.accountId;
    if (!status || !messageId || !conversationId || !accountId || payload.account?.platform !== "whatsapp") {
      return NextResponse.json({ ok: true, ignored: true }, { headers: whatsappHeaders });
    }

    const admin = await getWhatsAppAdmin();
    const { data: connection, error: connectionError } = await admin.from("whatsapp_connections")
      .select("company_id").eq("zernio_account_id", accountId).maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) return NextResponse.json({ ok: true, ignored: true }, { headers: whatsappHeaders });

    const contactPhone = (payload.conversation?.participantId ?? "").replace(/\D/g, "");
    const message = payload.message ?? {};
    const providerError = payload.error?.message?.slice(0, 500) ?? "";
    if (payload.event === "message.delivered" || payload.event === "message.read" || payload.event === "message.failed") {
      const { error } = await admin.from("whatsapp_messages").update({ status, provider_error: providerError })
        .eq("company_id", connection.company_id).eq("provider_message_id", messageId);
      if (error) throw error;
      return NextResponse.json({ ok: true }, { headers: whatsappHeaders });
    }
    if (!contactPhone) return NextResponse.json({ ok: true, ignored: true }, { headers: whatsappHeaders });

    const text = typeof message.text === "string" ? message.text : typeof message.message === "string" ? message.message : "";
    const attachmentType = message.attachments?.[0]?.type ?? message.type ?? "text";
    const { error } = await admin.from("whatsapp_messages").upsert({
      company_id: connection.company_id,
      account_id: accountId,
      conversation_id: conversationId,
      provider_message_id: messageId,
      request_id: null,
      contact_phone: contactPhone,
      contact_name: payload.conversation?.participantName ?? message.senderName ?? "",
      direction: payload.event === "message.sent" || message.direction === "outgoing" ? "outbound" : "inbound",
      message_type: attachmentType.slice(0, 30),
      body: text || (attachmentType === "text" ? "" : `${attachmentType} attachment`),
      status,
      provider_error: providerError,
      sent_by: null,
      created_at: message.createdAt ?? payload.timestamp ?? new Date().toISOString(),
    }, { onConflict: "provider_message_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: whatsappHeaders });
  } catch (error) {
    console.error("Zernio WhatsApp webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500, headers: whatsappHeaders });
  }
}
