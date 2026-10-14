import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, MessageSquare, MessagesSquare, Phone, StickyNote, X, type LucideIcon } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";
import SmsWorkspace from "@/components/SmsWorkspace";
import WhatsAppWorkspace from "@/components/WhatsAppWorkspace";

type Channel = "Email" | "SMS" | "Phone" | "WhatsApp" | "Note";
type ContactType = "Candidate" | "Employer" | "Agent" | "Staff" | "Other";

interface Message {
  id: number | string;
  contact: string;
  contactType: ContactType;
  channel: Channel;
  direction: "Inbound" | "Outbound";
  subject: string;
  body: string;
  date: string;
  by: string;
  status: "Sent" | "Received" | "Draft" | "Failed" | "Logged" | "Sending" | "Unknown";
  smsLog?: boolean;
  mailLog?: boolean;
}

type SmsContact = { id: string; type: ContactType; name: string; phone: string };
type SmsHistoryItem = { id: string; title: string; message: string; contacts: string[]; contact_name: string; contact_type: ContactType; provider_status: string; provider_error: string; provider_token: string | null; recipients: number | null; cost: number | null; balance: number | null; created_at: string };
type MailProvider = "gmail" | "outlook";
type MailFolder = "inbox" | "starred" | "sent" | "drafts";
type Mailbox = { provider: MailProvider; email_address: string; connected_at: string; auth_type?: "oauth" | "imap_smtp" };
type MailboxesPayload = { mailboxes?: Mailbox[]; configured?: Partial<Record<MailProvider, boolean>>; canSend?: boolean; platformEmail?: string; defaultProvider?: MailProvider; error?: string };
type ProviderMail = { id: string; provider: MailProvider; direction: "Inbound" | "Outbound"; from: string; to: string; subject: string; body: string; date: string; status: "Received" | "Sent" | "Draft" | "Failed" | "Unknown" };

const messages: Message[] = [
  { id: 3, contact: "Suzan Mirembe", contactType: "Candidate", channel: "Phone", direction: "Outbound", subject: "Medical certificate follow-up", body: "Called to follow up on medical certificate. Candidate confirmed she will collect it from the clinic on Aug 27.", date: "Aug 25, 2026 11:15", by: "Director Vicent", status: "Logged" },
];

const templates = [
  { name: "Payment Reminder", body: "Dear [CANDIDATE_NAME], your payment of UGX [AMOUNT] is due on [DATE]. Please contact us to arrange payment." },
  { name: "Stage Update", body: "Dear [CANDIDATE_NAME], your application has been updated to [STAGE]. Contact us for more details." },
  { name: "Document Request", body: "Dear [CANDIDATE_NAME], please submit the following documents: [DOCUMENTS]. Contact us if you need assistance." },
  { name: "Placement Congratulations", body: "Congratulations [CANDIDATE_NAME]! Your placement with [EMPLOYER] has been confirmed. Departure date: [DATE]." },
  { name: "Invoice to Employer", body: "Dear [CONTACT_NAME], please find attached invoice [INVOICE_REF] for [DESCRIPTION]. Amount due: [AMOUNT]." },
];

const channelColor: Record<Channel, string> = { Email: "#3b82f6", SMS: "#10b981", Phone: "#f59e0b", WhatsApp: "#25d366", Note: "#6b7280" };
const channelIcon: Record<Channel, LucideIcon> = { Email: Mail, SMS: MessageSquare, Phone, WhatsApp: MessagesSquare, Note: StickyNote };
const contactColor: Record<ContactType, string> = { Candidate: "#6366f1", Employer: "#f59e0b", Agent: "#3b82f6", Staff: "#8b5cf6", Other: "#6b7280" };

export default function Communications({ userName = "Team", companyName = "", userEmail = "" }: { userName?: string; companyName?: string; userEmail?: string }) {
  const [msgs, setMsgs] = useState<Message[]>(messages);
  const [channelFilter, setChannelFilter] = useState<Channel | "All">("All");
  const [contactFilter, setContactFilter] = useState<ContactType | "All">("All");
  const [selected, setSelected] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);
  const [composeChannel, setComposeChannel] = useState<Channel>("SMS");
  const [smsRecipientId, setSmsRecipientId] = useState("");
  const [manualContacts, setManualContacts] = useState("");
  const [smsTitle, setSmsTitle] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [smsRequestId, setSmsRequestId] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [platformEmail, setPlatformEmail] = useState("");
  const [mailConfigured, setMailConfigured] = useState<Partial<Record<MailProvider, boolean>>>({});
  const [mailCanSend, setMailCanSend] = useState(false);
  const [activeMailProvider, setActiveMailProvider] = useState<MailProvider | "">("");
  const [mailFolder, setMailFolder] = useState<MailFolder>("inbox");
  const [mailMessages, setMailMessages] = useState<Message[]>([]);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState("");
  const [mailNotice, setMailNotice] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailRequestId, setMailRequestId] = useState("");
  const [sendingMail, setSendingMail] = useState(false);
  const [showImapSetup, setShowImapSetup] = useState(false);
  const [savingImapSetup, setSavingImapSetup] = useState(false);
  const [imapSetupError, setImapSetupError] = useState("");
  const [imapSetupNotice, setImapSetupNotice] = useState("");
  const [imapSettings, setImapSettings] = useState({ emailAddress: "", imapHost: "", imapPort: "993", imapSecure: true, smtpHost: "", smtpPort: "465", smtpSecure: true, username: "", password: "" });

  const loadSmsHistory = async () => {
    try {
      const response = await fetch("/api/communications/sms", { cache: "no-store" });
      const payload = await response.json() as { messages?: SmsHistoryItem[]; configured?: boolean };
      if (!response.ok) return;
      setSmsConfigured(Boolean(payload.configured));
      const smsMessages: Message[] = (payload.messages ?? []).map((item) => ({
        id: `sms-${item.id}`,
        contact: item.contact_name,
        contactType: item.contact_type,
        channel: "SMS",
        direction: "Outbound",
        subject: item.title,
        body: item.message,
        date: new Date(item.created_at).toLocaleString(),
        by: item.recipients === null ? "SMSUG" : `SMSUG · ${item.recipients} recipients${item.cost === null ? "" : ` · ${item.cost} units`}`,
        status: item.provider_status === "sent" ? "Sent" : item.provider_status === "failed" ? "Failed" : item.provider_status === "sending" ? "Sending" : "Unknown",
        smsLog: true,
      }));
      setMsgs((current) => [...smsMessages, ...current.filter((item) => !item.smsLog)]);
    } catch {
      return;
    }
  };

  useEffect(() => { void loadSmsHistory(); }, []);

  const loadMailMessages = async (provider: MailProvider) => {
    setMailLoading(true);
    setMailError("");
    try {
      const response = await fetch(`/api/communications/mail/messages?provider=${provider}&folder=${mailFolder}`, { cache: "no-store" });
      const payload = await response.json() as { messages?: ProviderMail[]; mailbox?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load this inbox.");
      const items = (payload.messages ?? []).map((item) => ({
        id: item.id,
        contact: item.direction === "Inbound" ? item.from : item.to,
        contactType: "Other" as const,
        channel: "Email" as const,
        direction: item.direction,
        subject: item.subject,
        body: item.body,
        date: new Date(item.date).toLocaleString(),
        by: `${provider === "gmail" ? "Gmail" : mailboxes.find((mailbox) => mailbox.provider === provider)?.auth_type === "imap_smtp" ? "IMAP/SMTP" : "Outlook"} · ${payload.mailbox ?? "linked mailbox"}`,
        status: item.status,
        mailLog: true,
      }));
      setMailMessages(items);
      setMsgs((current) => [...items, ...current.filter((entry) => !entry.mailLog)]);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Unable to load this inbox.");
    } finally {
      setMailLoading(false);
    }
  };

  const loadMailboxes = async () => {
    try {
      const response = await fetch("/api/communications/mail", { cache: "no-store" });
      const payload = await response.json() as MailboxesPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load linked mailboxes.");
      const linked = payload.mailboxes ?? [];
      setMailboxes(linked);
      setPlatformEmail(payload.platformEmail ?? "");
      setMailConfigured(payload.configured ?? {});
      setMailCanSend(Boolean(payload.canSend));
      const defaultProvider = payload.defaultProvider ?? (payload.platformEmail?.toLowerCase().endsWith("@gmail.com") ? "gmail" : "outlook");
      setActiveMailProvider((current) => linked.some((mailbox) => mailbox.provider === current) ? current : linked.some((mailbox) => mailbox.provider === defaultProvider) ? defaultProvider : linked[0]?.provider ?? defaultProvider);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Unable to load linked mailboxes.");
    }
  };

  useEffect(() => {
    void loadMailboxes();
    const url = new URL(window.location.href);
    const connectionStatus = url.searchParams.get("mail");
    const provider = url.searchParams.get("provider");
    if (connectionStatus) {
      setChannelFilter("Email");
      setMailNotice(connectionStatus === "connected"
        ? `${provider === "gmail" ? "Gmail" : "Outlook"} mailbox linked.`
        : connectionStatus === "denied" ? "Mailbox access was cancelled. No account was linked." : "Unable to link the mailbox. Check the provider app and callback configuration.");
      url.searchParams.delete("mail");
      url.searchParams.delete("provider");
      url.searchParams.delete("view");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (activeMailProvider && mailboxes.some((mailbox) => mailbox.provider === activeMailProvider)) {
      void loadMailMessages(activeMailProvider);
    }
  }, [activeMailProvider, mailboxes, mailFolder]);

  useEffect(() => {
    if (channelFilter !== "Email" || !activeMailProvider || !mailboxes.some((mailbox) => mailbox.provider === activeMailProvider)) return;
    const interval = window.setInterval(() => { void loadMailMessages(activeMailProvider); }, 120000);
    return () => window.clearInterval(interval);
  }, [activeMailProvider, channelFilter, mailboxes, mailFolder]);

  const connectMailbox = async (provider: MailProvider) => {
    setMailError("");
    try {
      const response = await fetch(`/api/communications/mail/connect?provider=${provider}`, { cache: "no-store" });
      const payload = await response.json() as { url?: string; error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Unable to start mailbox linking.");
      window.location.assign(payload.url);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Unable to start mailbox linking.");
    }
  };

  const unlinkMailbox = async (provider: MailProvider) => {
    const mailbox = mailboxes.find((item) => item.provider === provider);
    const label = provider === "gmail" ? "Gmail" : mailbox?.auth_type === "imap_smtp" ? "IMAP/SMTP" : "Outlook";
    if (!window.confirm(`Unlink ${label}?`)) return;
    const response = await fetch(`/api/communications/mail?provider=${provider}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setMailError(payload.error ?? "Unable to unlink this mailbox."); return; }
    setMailMessages((current) => current.filter((message) => typeof message.id !== "string" || (!message.id.startsWith(`${provider}-`) && !message.id.startsWith(`sent-${provider}-`))));
    setMsgs((current) => current.filter((message) => typeof message.id !== "string" || (!message.id.startsWith(`${provider}-`) && !message.id.startsWith(`sent-${provider}-`))));
    if (activeMailProvider === provider) setMailFolder("inbox");
    await loadMailboxes();
  };

  const selectMailProfile = (provider: MailProvider) => {
    setActiveMailProvider(provider);
    setMailFolder("inbox");
    setMailError("");
    setChannelFilter("Email");
  };

  const saveImapMailbox = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingImapSetup(true);
    setImapSetupError("");
    setImapSetupNotice("");
    try {
      const response = await fetch("/api/communications/mail/imap-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...imapSettings, imapPort: Number(imapSettings.imapPort), smtpPort: Number(imapSettings.smtpPort) }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to verify this mailbox.");
      setShowImapSetup(false);
      setImapSettings({ emailAddress: "", imapHost: "", imapPort: "993", imapSecure: true, smtpHost: "", smtpPort: "465", smtpSecure: true, username: "", password: "" });
      setImapSetupNotice("IMAP/SMTP mailbox connected.");
      await loadMailboxes();
    } catch (error) {
      setImapSetupError(error instanceof Error ? error.message : "Unable to verify this mailbox.");
    } finally {
      setSavingImapSetup(false);
    }
  };

  const openCompose = async (channel: Channel = "SMS") => {
    setShowCompose(true);
    setComposeChannel(channel);
    setSmsRecipientId("");
    setManualContacts("");
    setSmsTitle("");
    setSmsBody("");
    setSmsRequestId(crypto.randomUUID());
    setSmsError("");
    setMailTo("");
    setMailSubject("");
    setMailBody("");
    setMailRequestId(crypto.randomUUID());
    if (channel === "Email") {
      setContactsLoading(false);
      return;
    }
    setContactsLoading(true);
    try {
      const [contactsResponse, historyResponse] = await Promise.all([
        fetch("/api/communications/contacts", { cache: "no-store" }),
        fetch("/api/communications/sms", { cache: "no-store" }),
      ]);
      const contactsPayload = await contactsResponse.json() as { contacts?: SmsContact[]; error?: string };
      const historyPayload = await historyResponse.json() as { configured?: boolean };
      if (!contactsResponse.ok) throw new Error(contactsPayload.error ?? "Unable to load SMS contacts.");
      setContacts(contactsPayload.contacts ?? []);
      setSmsConfigured(Boolean(historyPayload.configured));
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : "Unable to load SMS contacts.");
    } finally {
      setContactsLoading(false);
    }
  };

  const selectedSmsContact = contacts.find((contact) => contact.id === smsRecipientId) ?? null;

  const sendSms = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (composeChannel !== "SMS" || sendingSms) return;
    setSendingSms(true);
    setSmsError("");
    try {
      const response = await fetch("/api/communications/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: smsRequestId,
          title: smsTitle,
          message: smsBody,
          contacts: selectedSmsContact ? [selectedSmsContact.phone] : manualContacts,
          contactName: selectedSmsContact?.name ?? "Manual numbers",
          contactType: selectedSmsContact?.type ?? "Other",
        }),
      });
      const payload = await response.json() as { error?: string; code?: string; status?: string; message?: SmsHistoryItem };
      if (!response.ok) {
        if (payload.code !== "sms_network_error" && payload.status !== "unknown") setSmsRequestId(crypto.randomUUID());
        throw new Error(payload.error ?? "SMSUG could not send this message.");
      }
      if (payload.message) {
        const item = payload.message;
        const sentMessage: Message = {
          id: `sms-${item.id}`,
          contact: item.contact_name,
          contactType: item.contact_type,
          channel: "SMS",
          direction: "Outbound",
          subject: item.title,
          body: item.message,
          date: item.created_at ? new Date(item.created_at).toLocaleString() : new Date().toLocaleString(),
          by: `SMSUG · ${item.recipients ?? 0} recipients${item.cost === null ? "" : ` · ${item.cost} units`}`,
          status: "Sent",
          smsLog: true,
        };
        setMsgs((current) => [sentMessage, ...current.filter((entry) => entry.id !== sentMessage.id)]);
      }
      setShowCompose(false);
      void loadSmsHistory();
    } catch (error) {
      setSmsError(error instanceof Error ? error.message : "SMSUG could not send this message.");
      void loadSmsHistory();
    } finally {
      setSendingSms(false);
    }
  };

  const sendEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (composeChannel !== "Email" || !activeMailProvider || sendingMail || !mailCanSend) return;
    setSendingMail(true);
    setMailError("");
    try {
      const response = await fetch("/api/communications/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: activeMailProvider, requestId: mailRequestId, to: mailTo, subject: mailSubject, body: mailBody }),
      });
      const payload = await response.json() as { message?: ProviderMail; error?: string; status?: string };
      if (!response.ok) {
        if (payload.status !== "unknown") setMailRequestId(crypto.randomUUID());
        throw new Error(payload.error ?? "Unable to send this email.");
      }
      setShowCompose(false);
      await loadMailMessages(activeMailProvider);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Unable to send this email.");
    } finally {
      setSendingMail(false);
    }
  };

  const filtered = msgs.filter((m) => {
    const mc = channelFilter === "All" || m.channel === channelFilter;
    const mct = contactFilter === "All" || m.contactType === contactFilter;
    return mc && mct;
  });

  if (channelFilter === "SMS") return <SmsWorkspace userName={userName} companyName={companyName} userEmail={userEmail} onExit={() => setChannelFilter("All")} />;
  if (channelFilter === "WhatsApp") return <WhatsAppWorkspace onExit={() => setChannelFilter("All")} />;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Communication Center</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>All communications with candidates, employers, and staff</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowTemplates(true)} className="px-3 py-1.5 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--secondary)" }}>
              Templates
            </button>
            <button onClick={() => void openCompose()} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              + Compose
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-1.5">
            {(["All", "Email", "SMS", "Phone", "WhatsApp", "Note"] as const).map((c) => (
              <button key={c} onClick={() => setChannelFilter(c as Channel | "All")}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-600 rounded"
                style={{ background: channelFilter === c ? (c === "All" ? "var(--primary)" : channelColor[c as Channel]) : "var(--secondary)", color: channelFilter === c ? "#fff" : "var(--muted-foreground)" }}>
                {c !== "All" && (() => {
                  const Icon = channelIcon[c as Channel];
                  return <Icon size={13} strokeWidth={1.8} aria-hidden="true" />;
                })()} {c}
              </button>
            ))}
          </div>
          <div className="h-4 w-px" style={{ background: "var(--border)" }} />
          <div className="flex gap-1.5">
            {(["All", "Candidate", "Employer", "Agent", "Staff", "Other"] as const).map((ct) => (
              <button key={ct} onClick={() => setContactFilter(ct as ContactType | "All")}
                className="px-2.5 py-1 text-xs font-600 rounded"
                style={{ background: contactFilter === ct ? "var(--secondary)" : "transparent", color: ct === "All" ? "var(--muted-foreground)" : contactColor[ct as ContactType] || "var(--muted-foreground)", border: `1px solid ${ct === "All" ? "var(--border)" : (contactColor[ct as ContactType] || "#6b7280") + "44"}` }}>
                {ct}
              </button>
            ))}
          </div>
        </div>

        <section hidden={channelFilter !== "Email"} className="shrink-0 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--border)", background: "var(--card)" }} aria-label="Linked mailboxes">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-[10px] font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Email profiles</span>
              {mailboxes.length > 0 && <nav role="tablist" aria-label="Attached email profiles" className="flex min-w-0 flex-wrap gap-1">
                {mailboxes.map((mailbox) => {
                  const label = mailbox.provider === "gmail" ? "Gmail" : mailbox.auth_type === "imap_smtp" ? "IMAP/SMTP" : "Outlook";
                  return <button key={mailbox.provider} type="button" role="tab" aria-selected={activeMailProvider === mailbox.provider} onClick={() => selectMailProfile(mailbox.provider)} className="max-w-64 truncate border-b-2 px-3 py-2 text-xs font-600" style={{ borderColor: activeMailProvider === mailbox.provider ? "var(--primary)" : "transparent", color: activeMailProvider === mailbox.provider ? "var(--primary)" : "var(--muted-foreground)" }}>{label} · {mailbox.email_address}</button>;
                })}
              </nav>}
              <button type="button" disabled={!mailConfigured.outlook} onClick={() => { setImapSetupError(""); setImapSettings((current) => ({ ...current, emailAddress: platformEmail, username: platformEmail })); setShowImapSetup(true); }} className="border px-2.5 py-1.5 text-xs font-600 disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{mailboxes.some((mailbox) => mailbox.provider === "outlook") ? "Replace with IMAP/SMTP" : "Add IMAP/SMTP"}</button>
              {!mailboxes.some((mailbox) => mailbox.provider === "gmail") && <button type="button" disabled={!mailConfigured.gmail} onClick={() => void connectMailbox("gmail")} className="border px-2.5 py-1.5 text-xs font-600 disabled:cursor-not-allowed disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Connect Gmail</button>}
              {activeMailProvider && mailboxes.some((mailbox) => mailbox.provider === activeMailProvider) && <button type="button" onClick={() => void unlinkMailbox(activeMailProvider)} className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><X size={13} aria-hidden="true" />Disconnect</button>}
            </div>
            <div className="flex items-center gap-2">
              {activeMailProvider && mailboxes.some((mailbox) => mailbox.provider === activeMailProvider) && <><span className="hidden max-w-44 truncate text-xs sm:inline" style={{ color: "var(--muted-foreground)" }}>Inbox · {mailboxes.find((mailbox) => mailbox.provider === activeMailProvider)?.email_address}</span><button type="button" onClick={() => void loadMailMessages(activeMailProvider)} disabled={mailLoading} className="border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{mailLoading ? "Refreshing..." : "Refresh folder"}</button>{mailCanSend && <button type="button" onClick={() => void openCompose("Email")} className="px-2.5 py-1.5 text-xs font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>New email</button>}</>}
            </div>
          </div>
          {!mailConfigured.gmail && !mailConfigured.outlook && <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>Mailbox linking is not configured yet. A server administrator must set the mail token encryption key and Gmail OAuth credentials.</p>}
          {mailError && <p role="alert" className="mt-2 text-xs text-red-400">{mailError}</p>}
          {mailNotice && <p role="status" className="mt-2 text-xs" style={{ color: mailNotice.includes("linked") ? "#17845b" : "#bd3d3d" }}>{mailNotice}<button type="button" onClick={() => setMailNotice("")} aria-label="Dismiss mailbox status" className="ml-2"><X size={12} aria-hidden="true" /></button></p>}
          {imapSetupNotice && <p role="status" className="mt-2 text-xs" style={{ color: "#17845b" }}>{imapSetupNotice}<button type="button" onClick={() => setImapSetupNotice("")} aria-label="Dismiss mailbox status" className="ml-2"><X size={12} aria-hidden="true" /></button></p>}
          {activeMailProvider && mailboxes.some((mailbox) => mailbox.provider === activeMailProvider) && <div role="tablist" aria-label="Email folders" className="mt-3 flex flex-wrap gap-1 border-t pt-2" style={{ borderColor: "var(--border)" }}>
            {([{ id: "inbox", label: "Inbox" }, { id: "starred", label: "Starred" }, { id: "sent", label: "Sent" }, { id: "drafts", label: "Drafts" }] as const).map((folder) => <button key={folder.id} type="button" role="tab" aria-selected={mailFolder === folder.id} onClick={() => setMailFolder(folder.id)} className="px-2.5 py-1 text-xs font-600" style={{ background: mailFolder === folder.id ? "var(--secondary)" : "transparent", color: mailFolder === folder.id ? "var(--primary)" : "var(--muted-foreground)" }}>{folder.label}</button>)}
          </div>}
        </section>

        <div className="min-h-0 flex-1 overflow-auto divide-y" style={{ borderColor: "var(--border)" }}>
          {channelFilter === "Email" && !mailLoading && !filtered.some((message) => message.channel === "Email") && <p className="px-6 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{mailboxes.length ? "No mail to show. Refresh the inbox to check for new messages." : "Link Gmail or add an IMAP/SMTP mailbox to receive and send email here."}</p>}
          {filtered.map((m) => (
            <div key={m.id}
              className="px-6 py-4 cursor-pointer flex gap-4"
              style={{ background: selected?.id === m.id ? "var(--secondary)" : "transparent" }}
              onClick={() => setSelected(selected?.id === m.id ? null : m)}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: channelColor[m.channel] + "20", color: channelColor[m.channel] }}>
                {(() => {
                  const Icon = channelIcon[m.channel];
                  return <Icon size={17} strokeWidth={1.8} aria-hidden="true" />;
                })()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-700" style={{ color: "var(--foreground)" }}>{m.contact}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: contactColor[m.contactType], background: contactColor[m.contactType] + "20" }}>{m.contactType}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: channelColor[m.channel], background: channelColor[m.channel] + "20" }}>{m.channel}</span>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.direction}</span>
                </div>
                <div className="text-sm font-600 mb-0.5" style={{ color: "var(--foreground)" }}>{m.subject}</div>
                <div className="text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{m.body}</div>
                <div className="mono text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{m.date} · {m.by}</div>
              </div>
              <span className="mono text-xs font-600 self-start px-1.5 py-0.5 rounded"
                style={{ color: m.status === "Sent" || m.status === "Received" ? "#10b981" : m.status === "Failed" ? "#ef4444" : m.status === "Unknown" ? "#b7791f" : "#6b7280", background: m.status === "Sent" || m.status === "Received" ? "#10b98120" : m.status === "Failed" ? "#ef444420" : "#6b728020" }}>
                {m.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div className="detail-panel w-80 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelected(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <div className="flex items-center gap-2 mb-2">
              {(() => {
                const Icon = channelIcon[selected.channel];
                return <Icon size={19} strokeWidth={1.8} aria-hidden="true" />;
              })()}
              <h2 className="font-700 text-sm" style={{ color: "var(--foreground)" }}>{selected.subject}</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: channelColor[selected.channel], background: channelColor[selected.channel] + "20" }}>{selected.channel}</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: contactColor[selected.contactType], background: contactColor[selected.contactType] + "20" }}>{selected.contactType}</span>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Contact", value: selected.contact },
              { label: "Direction", value: selected.direction },
              { label: "Date", value: selected.date },
              { label: "Handled By", value: selected.by },
              { label: "Status", value: selected.status },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            <div>
              <div className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Message</div>
              <div className="text-sm rounded p-3" style={{ background: "var(--secondary)", color: "var(--foreground)", lineHeight: "1.6" }}>{selected.body}</div>
            </div>
            {selected.channel === "Email" && selected.direction === "Inbound" && mailCanSend && <button type="button" onClick={() => { void openCompose("Email"); setMailTo(selected.contact.match(/<([^>]+)>/)?.[1] ?? selected.contact); setMailSubject(selected.subject.startsWith("Re:") ? selected.subject : `Re: ${selected.subject}`); }} className="w-full py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Reply</button>}
          </div>
        </div>
      )}

      {showImapSetup && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6">
        <form onSubmit={(event) => void saveImapMailbox(event)} className="my-auto max-h-[94dvh] w-full max-w-2xl overflow-y-auto border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Add IMAP/SMTP mailbox</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Settings are tested before they are saved.</p></div><button type="button" aria-label="Close IMAP/SMTP setup" onClick={() => setShowImapSetup(false)} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Email address</span><input required type="email" maxLength={320} value={imapSettings.emailAddress} onChange={(event) => setImapSettings({ ...imapSettings, emailAddress: event.target.value })} autoComplete="email" placeholder="name@example.com" className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>IMAP server</span><input required value={imapSettings.imapHost} onChange={(event) => setImapSettings({ ...imapSettings, imapHost: event.target.value })} placeholder="imap.example.com" className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>IMAP port</span><input required type="number" min={1} max={65535} value={imapSettings.imapPort} onChange={(event) => setImapSettings({ ...imapSettings, imapPort: event.target.value })} className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--foreground)" }}><input type="checkbox" checked={imapSettings.imapSecure} onChange={(event) => setImapSettings({ ...imapSettings, imapSecure: event.target.checked })} /> IMAP uses SSL/TLS</label>
            <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>SMTP server</span><input required value={imapSettings.smtpHost} onChange={(event) => setImapSettings({ ...imapSettings, smtpHost: event.target.value })} placeholder="smtp.example.com" className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>SMTP port</span><input required type="number" min={1} max={65535} value={imapSettings.smtpPort} onChange={(event) => setImapSettings({ ...imapSettings, smtpPort: event.target.value })} className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--foreground)" }}><input type="checkbox" checked={imapSettings.smtpSecure} onChange={(event) => setImapSettings({ ...imapSettings, smtpSecure: event.target.checked })} /> SMTP uses SSL/TLS</label>
            <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Username</span><input required maxLength={320} value={imapSettings.username} onChange={(event) => setImapSettings({ ...imapSettings, username: event.target.value })} autoComplete="username" className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
            <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Password or app password</span><input required type="password" maxLength={1000} value={imapSettings.password} onChange={(event) => setImapSettings({ ...imapSettings, password: event.target.value })} autoComplete="new-password" className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
          </div>
          {imapSetupError && <p role="alert" className="mt-4 text-sm text-red-400">{imapSetupError}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowImapSetup(false)} disabled={savingImapSetup} className="border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={savingImapSetup} className="px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{savingImapSetup ? "Verifying..." : "Verify and connect"}</button></div>
        </form>
      </div>}

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6">
          <form onSubmit={(event) => void (composeChannel === "Email" ? sendEmail(event) : sendSms(event))} className="my-auto max-h-[94dvh] w-full max-w-lg overflow-y-auto border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>New communication</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{composeChannel === "Email" ? "Send from your linked mailbox." : "SMS sends immediately through SMSUG."}</p></div><button type="button" aria-label="Close compose" onClick={() => setShowCompose(false)} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Channel</span><select value={composeChannel} onChange={(event) => setComposeChannel(event.target.value as Channel)} className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}><option>SMS</option><option>Email</option><option>Phone</option><option>WhatsApp</option><option>Note</option></select></label>
              {composeChannel === "SMS" ? <>
                {smsConfigured === false && <div role="status" className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs" style={{ color: "var(--foreground)" }}>SMSUG is not configured. A server administrator must set SMSUG_API_KEY privately and enable API access in SMSUG Settings.</div>}
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Contact</span><SearchableSelect ariaLabel="Search SMS contact" value={smsRecipientId} onChange={setSmsRecipientId} disabled={contactsLoading} options={contacts.map((contact) => ({ value: contact.id, label: contact.name, description: `${contact.type} · ${contact.phone}`, searchText: `${contact.type} ${contact.phone}` }))} placeholder="Type a name or phone number" className="disabled:opacity-50" /></label>
                {!selectedSmsContact && <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Ugandan phone number(s)</span><textarea required rows={2} value={manualContacts} onChange={(event) => setManualContacts(event.target.value)} placeholder="256772000111, 0701234567" className="w-full resize-y border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><span className="mt-1 block text-[11px]" style={{ color: "var(--muted-foreground)" }}>Separate multiple numbers with commas or new lines. Up to 3,000 recipients.</span></label>}
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>SMS title</span><input required maxLength={100} value={smsTitle} onChange={(event) => setSmsTitle(event.target.value)} placeholder="Payment reminder" className="w-full border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><span className="mt-1 block text-[11px]" style={{ color: "var(--muted-foreground)" }}>Letters, numbers, spaces, and basic punctuation only.</span></label>
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Message</span><textarea required rows={5} maxLength={480} value={smsBody} onChange={(event) => setSmsBody(event.target.value)} className="w-full resize-y border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><span className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--muted-foreground)" }}><span>{smsBody.length <= 160 ? "1 message unit" : smsBody.length <= 320 ? "2 message units" : "3 message units"} per recipient</span><span>{smsBody.length}/480</span></span></label>
              </> : composeChannel === "Email" ? <>
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Send from</span><select aria-label="Send from mailbox" value={activeMailProvider} onChange={(event) => setActiveMailProvider(event.target.value as MailProvider)} className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>{mailboxes.map((mailbox) => <option key={mailbox.provider} value={mailbox.provider}>{mailbox.provider === "gmail" ? "Gmail" : mailbox.auth_type === "imap_smtp" ? "IMAP/SMTP" : "Outlook"} · {mailbox.email_address}</option>)}</select></label>
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>To</span><input required type="email" maxLength={320} value={mailTo} onChange={(event) => setMailTo(event.target.value)} placeholder="name@example.com" className="w-full border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Subject</span><input required maxLength={998} value={mailSubject} onChange={(event) => setMailSubject(event.target.value)} className="w-full border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Message</span><textarea required rows={7} maxLength={100000} value={mailBody} onChange={(event) => setMailBody(event.target.value)} className="w-full resize-y border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /></label>
                {!mailboxes.length && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Link a Gmail or Outlook mailbox above before sending.</p>}
              </> : <div className="border px-3 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Sending through {composeChannel} is not configured. Email and SMS are available when linked or enabled.</div>}
            </div>
            {composeChannel === "Email" ? mailError && <p role="alert" className="mt-4 text-sm text-red-400">{mailError}</p> : smsError && <p role="alert" className="mt-4 text-sm text-red-400">{smsError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowCompose(false)} disabled={sendingSms || sendingMail} className="border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={composeChannel === "Email" ? (!mailboxes.length || !mailCanSend || sendingMail || !mailTo || !mailSubject || !mailBody) : (composeChannel !== "SMS" || sendingSms || contactsLoading || smsBody.length === 0 || smsBody.length > 480 || smsTitle.length === 0)} className="px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{composeChannel === "Email" ? sendingMail ? "Sending..." : "Send email" : sendingSms ? "Sending..." : "Send SMS"}</button></div>
          </form>
        </div>
      )}

      {showTemplates && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Message Templates</h2>
              <button onClick={() => setShowTemplates(false)} aria-label="Close templates" className="flex items-center justify-center rounded p-1" style={{ color: "var(--muted-foreground)" }}><X size={16} aria-hidden="true" /></button>
            </div>
            <div className="space-y-3">
              {templates.map((t, i) => (
                <div key={i} className="rounded border p-4" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                  <div className="text-sm font-700 mb-1" style={{ color: "var(--foreground)" }}>{t.name}</div>
                  <div className="text-xs italic" style={{ color: "var(--muted-foreground)" }}>{t.body}</div>
                  <button className="mt-2 text-xs px-2 py-1 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Use Template</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
