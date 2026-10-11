"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, MessageCircle, RefreshCw, Send, Settings, X } from "lucide-react";

type WhatsAppMessage = {
  id: string;
  provider_message_id: string | null;
  conversation_id: string;
  contact_phone: string;
  contact_name: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string;
  status: string;
  created_at: string;
  sent_by: string | null;
};
type WhatsAppConversation = { id: string; contact_phone: string; contact_name: string; body: string; created_at: string; unread_count: number; status: string };
type Connection = { zernio_profile_id: string; zernio_account_id: string; display_phone_number: string; verified_name: string; webhook_id: string; connected_at: string; updated_at: string };
type WorkspacePayload = { connection?: Connection | null; canSend?: boolean; canManage?: boolean; configured?: boolean; error?: string };

export default function WhatsAppWorkspace({ onExit }: { onExit: () => void }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [composingNew, setComposingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [messageText, setMessageText] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("en_US");
  const [templateParams, setTemplateParams] = useState("");

  const refresh = async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    setError("");
    try {
      const [settingsResponse, conversationsResponse] = await Promise.all([
        fetch("/api/communications/whatsapp", { cache: "no-store" }),
        fetch("/api/communications/whatsapp/messages", { cache: "no-store" }),
      ]);
      const settings = await settingsResponse.json() as WorkspacePayload;
      const history = await conversationsResponse.json() as { conversations?: WhatsAppConversation[]; error?: string };
      if (!settingsResponse.ok) throw new Error(settings.error ?? "WhatsApp inbox access is unavailable.");
      if (!conversationsResponse.ok) throw new Error(history.error ?? "Unable to load WhatsApp conversations.");
      const nextConversations = history.conversations ?? [];
      setConnection(settings.connection ?? null);
      setCanSend(Boolean(settings.canSend));
      setCanManage(Boolean(settings.canManage));
      setConfigured(Boolean(settings.configured));
      setConversations(nextConversations);
      setSelectedConversationId((current) => current && nextConversations.some((conversation) => conversation.id === current) ? current : nextConversations[0]?.id ?? "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load WhatsApp inbox.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(true); }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get("whatsapp");
    const detail = url.searchParams.get("whatsapp_error");
    if (status === "connected") setNotice("WhatsApp Business number connected through Zernio.");
    else if (status === "error") setError(detail || "Unable to connect the WhatsApp number through Zernio.");
    if (status) {
      url.searchParams.delete("whatsapp");
      url.searchParams.delete("whatsapp_error");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!selectedConversationId) { setMessages([]); return; }
    let active = true;
    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/communications/whatsapp/messages?conversationId=${encodeURIComponent(selectedConversationId)}`, { cache: "no-store" });
        const payload = await response.json() as { messages?: WhatsAppMessage[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load this conversation.");
        const conversation = conversations.find((item) => item.id === selectedConversationId);
        if (active) setMessages((payload.messages ?? []).map((message) => ({ ...message, contact_phone: conversation?.contact_phone ?? "", contact_name: conversation?.contact_name ?? message.contact_name })));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this conversation.");
      }
    };
    void loadMessages();
    return () => { active = false; };
  }, [selectedConversationId, conversations]);

  const selectedThread = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const orderedMessages = messages;

  const connectWhatsApp = async () => {
    setError("");
    try {
      const response = await fetch("/api/communications/whatsapp/connect", { cache: "no-store" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Unable to start Zernio connection.");
      window.location.assign(payload.url);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to start Zernio connection.");
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect the company WhatsApp number? Existing inbox history will be kept.")) return;
    setError("");
    const response = await fetch("/api/communications/whatsapp", { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setError(payload.error ?? "Unable to disconnect WhatsApp."); return; }
    setNotice("WhatsApp number disconnected. The inbox history remains available.");
    await refresh(true);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending || !canSend) return;
    setSending(true);
    setError("");
    const requestId = crypto.randomUUID();
    try {
      const response = await fetch("/api/communications/whatsapp/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedConversationId
          ? { requestId, conversationId: selectedConversationId, message: messageText }
          : { requestId, phoneNumber: recipientPhone, templateName, templateLanguage, templateParams: templateParams.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to send WhatsApp message.");
      setMessageText("");
      setRecipientPhone("");
      setTemplateName("");
      setTemplateLanguage("en_US");
      setTemplateParams("");
      setComposingNew(false);
      await refresh(true);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send WhatsApp message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--border)" }}>
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onExit} aria-label="Back to Communication Center" title="Back to Communication Center" className="border p-2" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><ArrowLeft size={16} aria-hidden="true" /></button>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center" style={{ background: "#25d36622", color: "#128c4a" }}><MessageCircle size={18} aria-hidden="true" /></div>
          <div className="min-w-0"><h1 className="truncate text-lg font-700" style={{ color: "var(--foreground)" }}>WhatsApp inbox</h1><p className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{connection ? `${connection.verified_name || "WhatsApp Business"} · ${connection.display_phone_number}` : "Company shared inbox"}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh inbox" title="Refresh inbox" className="border p-2 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} aria-hidden="true" /></button>
          {canManage && <button type="button" onClick={() => connection ? void disconnect() : void connectWhatsApp()} aria-label={connection ? "Disconnect WhatsApp" : "Connect WhatsApp"} title={connection ? "Disconnect WhatsApp" : "Connect WhatsApp"} className="border p-2" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Settings size={15} aria-hidden="true" /></button>}
        </div>
      </header>

      {error && <p role="alert" className="border-b px-4 py-2 text-sm text-red-500 sm:px-6" style={{ borderColor: "var(--border)" }}>{error}</p>}
      {notice && <p role="status" className="border-b px-4 py-2 text-sm sm:px-6" style={{ borderColor: "var(--border)", color: "#17845b" }}>{notice}<button type="button" aria-label="Dismiss notice" onClick={() => setNotice("")} className="ml-2"><X size={13} className="inline" aria-hidden="true" /></button></p>}

      {!configured && canManage && <div className="border-b bg-amber-500/10 px-4 py-3 text-sm sm:px-6" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Server setup is incomplete. Set ZERNIO_API_KEY, ZERNIO_WEBHOOK_SECRET, and SUPABASE_SERVICE_ROLE_KEY on the server.</div>}
      {!connection && !loading ? <main className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center" style={{ background: "#25d36622", color: "#128c4a" }}><MessageCircle size={26} aria-hidden="true" /></div>
          <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>No company number connected</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--muted-foreground)" }}>A company owner connects a WhatsApp Business number through Zernio. Authorized company members then share its inbox.</p>
          {canManage && <button type="button" onClick={() => void connectWhatsApp()} disabled={!configured} className="mt-5 px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Connect with Zernio</button>}
          {!canManage && <p className="mt-4 text-xs" style={{ color: "var(--muted-foreground)" }}>Ask the company owner to connect a number and grant you WhatsApp inbox access.</p>}
        </div>
      </main> : <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={`${selectedConversationId || composingNew ? "hidden sm:flex" : "flex"} w-full shrink-0 flex-col border-r sm:w-72 lg:w-80`} style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}><div className="text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Conversations · {conversations.length}</div></div>
          <div className="min-h-0 flex-1 overflow-auto divide-y" style={{ borderColor: "var(--border)" }}>
            {conversations.map((conversation) => <button key={conversation.id} type="button" onClick={() => { setSelectedConversationId(conversation.id); setComposingNew(false); setRecipientPhone(""); }} className="w-full px-4 py-3 text-left" style={{ background: selectedConversationId === conversation.id ? "var(--secondary)" : "transparent", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{conversation.contact_name || conversation.contact_phone}</span><time className="shrink-0 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{new Date(conversation.created_at).toLocaleDateString()}</time></div>
              <p className="mt-1 truncate text-xs" style={{ color: "var(--muted-foreground)" }}>{conversation.body}</p>
              <p className="mt-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{conversation.contact_phone} · {conversation.unread_count ? `${conversation.unread_count} unread` : conversation.status}</p>
            </button>)}
            {!conversations.length && !loading && <p className="px-4 py-8 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>New WhatsApp messages will appear here.</p>}
          </div>
          {canSend && connection && <button type="button" onClick={() => { setSelectedConversationId(""); setComposingNew(true); setRecipientPhone(""); setTemplateName(""); setTemplateParams(""); }} className="m-3 border px-3 py-2 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>New conversation</button>}
        </aside>

        <section className={`min-w-0 flex-1 flex-col ${selectedConversationId || composingNew || !conversations.length ? "flex" : "hidden sm:flex"}`}>
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--border)" }}>
            {selectedThread ? <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={() => setSelectedConversationId("")} aria-label="Back to conversations" title="Back to conversations" className="border p-2 sm:hidden" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><ArrowLeft size={15} aria-hidden="true" /></button><div className="min-w-0"><div className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{selectedThread.contact_name || selectedThread.contact_phone}</div><div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedThread.contact_phone}</div></div></div> : <div className="min-w-0 flex-1">{composingNew && <button type="button" onClick={() => setComposingNew(false)} className="mb-2 flex items-center gap-1 text-xs sm:hidden" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Conversations</button>}{composingNew && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Start with an approved WhatsApp template</p>}</div>}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-5 sm:px-6">
            {loading && <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading WhatsApp inbox...</p>}
            {orderedMessages.map((message) => <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[min(82%,38rem)] px-3 py-2.5" style={{ background: message.direction === "outbound" ? "#d8f5df" : "var(--card)", color: "#17211a", border: message.direction === "inbound" ? "1px solid var(--border)" : "1px solid #b9e7c3" }}>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10px]" style={{ color: "#52645a" }}><time>{new Date(message.created_at).toLocaleString()}</time>{message.direction === "outbound" && <><span>·</span><span>{message.status}</span></>}</div>
              </div>
            </div>)}
            {selectedThread && !orderedMessages.length && <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No messages in this conversation.</p>}
          </div>
          {canSend && connection && selectedConversationId && <form onSubmit={(event) => void sendMessage(event)} className="shrink-0 border-t p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
            <p className="mb-2 text-[11px]" style={{ color: "var(--muted-foreground)" }}>Free-form messages are allowed during WhatsApp's 24-hour customer-service window. Outside it, send an approved template to restart the conversation.</p>
            <div className="flex items-end gap-2"><textarea required maxLength={9999} rows={2} value={messageText} onChange={(event) => setMessageText(event.target.value)} aria-label="WhatsApp message" placeholder="Write a message" className="min-h-11 min-w-0 flex-1 resize-y border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <button type="submit" disabled={sending || !messageText.trim()} aria-label="Send WhatsApp message" title="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-50" style={{ background: "#128c4a", color: "white" }}>{sending ? <span className="text-xs">...</span> : <Send size={16} aria-hidden="true" />}</button></div>
          </form>}
          {canSend && connection && composingNew && <form onSubmit={(event) => void sendMessage(event)} className="shrink-0 space-y-3 border-t p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
            <div className="grid gap-2 sm:grid-cols-2"><label className="block"><span className="mb-1 block text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>Recipient phone number</span><input required inputMode="tel" value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} placeholder="International format, e.g. +256…" className="w-full border px-3 py-2 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>Approved template name</span><input required value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="e.g. appointment_reminder" className="w-full border px-3 py-2 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label></div>
            <div className="grid gap-2 sm:grid-cols-2"><label className="block"><span className="mb-1 block text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>Template language</span><input required value={templateLanguage} onChange={(event) => setTemplateLanguage(event.target.value)} placeholder="en_US" className="w-full border px-3 py-2 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-700" style={{ color: "var(--muted-foreground)" }}>Template parameters</span><input value={templateParams} onChange={(event) => setTemplateParams(event.target.value)} placeholder="Values in template order, comma-separated" className="w-full border px-3 py-2 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label></div>
            <div className="flex justify-end"><button type="submit" disabled={sending || !recipientPhone || !templateName || !templateLanguage} className="flex items-center gap-2 px-3 py-2 text-xs font-600 disabled:opacity-50" style={{ background: "#128c4a", color: "white" }}>{sending ? "Sending..." : <><Send size={13} aria-hidden="true" /> Send template</>}</button></div>
          </form>}
          {selectedThread && !canSend && <p className="border-t px-4 py-3 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>You can read this inbox but do not have permission to send messages.</p>}
        </section>
      </div>}

    </div>
  );
}