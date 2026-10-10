import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CircleCheck, Mail, MessageSquare, MessagesSquare, Phone, StickyNote, X, type LucideIcon } from "lucide-react";

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
  status: "Sent" | "Received" | "Failed" | "Logged" | "Sending" | "Unknown";
  smsLog?: boolean;
}

type TaskReminder = { id: string; title: string; body: string; sent_at: string; read_at: string | null; sms_status?: string; sms_error?: string };
type SmsContact = { id: string; type: ContactType; name: string; phone: string };
type SmsHistoryItem = { id: string; title: string; message: string; contacts: string[]; contact_name: string; contact_type: ContactType; provider_status: string; provider_error: string; provider_token: string | null; recipients: number | null; cost: number | null; balance: number | null; created_at: string };

const messages: Message[] = [
  { id: 2, contact: "Gulf Manpower Ltd", contactType: "Employer", channel: "Email", direction: "Outbound", subject: "Invoice INV-2026-003", body: "Please find attached invoice INV-2026-003 for placement of Mr. Godfrey Kamuhangire.", date: "Aug 25, 2026 14:30", by: "Aisha Khan", status: "Sent" },
  { id: 3, contact: "Suzan Mirembe", contactType: "Candidate", channel: "Phone", direction: "Outbound", subject: "Medical certificate follow-up", body: "Called to follow up on medical certificate. Candidate confirmed she will collect it from the clinic on Aug 27.", date: "Aug 25, 2026 11:15", by: "Director Vicent", status: "Logged" },
  { id: 4, contact: "Alice Namukasa", contactType: "Candidate", channel: "WhatsApp", direction: "Inbound", subject: "Passport query", body: "Alice asked about the status of her passport and visa. Replied that visa is being processed and will be ready by Sep 2.", date: "Aug 24, 2026 16:45", by: "Director Vicent", status: "Received" },
  { id: 5, contact: "Kuwait Home Services", contactType: "Employer", channel: "Email", direction: "Inbound", subject: "RE: Candidate profiles", body: "Thank you for the candidate profiles. We are interested in CRSL-283710044. Please proceed with the visa application.", date: "Aug 24, 2026 10:20", by: "Aisha Khan", status: "Received" },
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

export default function Communications({ onOpenTasks }: { onOpenTasks?: () => void }) {
  const [msgs, setMsgs] = useState<Message[]>(messages);
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [reminderError, setReminderError] = useState("");
  const [channelFilter, setChannelFilter] = useState<Channel | "All">("All");
  const [contactFilter, setContactFilter] = useState<ContactType | "All">("All");
  const [selected, setSelected] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [contacts, setContacts] = useState<SmsContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [smsConfigured, setSmsConfigured] = useState<boolean | null>(null);
  const [smsChannel, setSmsChannel] = useState<Channel>("SMS");
  const [smsRecipientId, setSmsRecipientId] = useState("");
  const [manualContacts, setManualContacts] = useState("");
  const [smsTitle, setSmsTitle] = useState("");
  const [smsBody, setSmsBody] = useState("");
  const [smsRequestId, setSmsRequestId] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState("");

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

  const openCompose = async () => {
    setShowCompose(true);
    setSmsChannel("SMS");
    setSmsRecipientId("");
    setManualContacts("");
    setSmsTitle("");
    setSmsBody("");
    setSmsRequestId(crypto.randomUUID());
    setSmsError("");
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
    if (smsChannel !== "SMS" || sendingSms) return;
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

  useEffect(() => {
    let cancelled = false;
    const loadReminders = async () => {
      try {
        const response = await fetch("/api/tasks/reminders", { cache: "no-store" });
        const payload = await response.json() as { reminders?: TaskReminder[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load task reminders.");
        if (!cancelled) {
          setReminders(payload.reminders ?? []);
          setReminderError("");
        }
      } catch (error) {
        if (!cancelled) setReminderError(error instanceof Error ? error.message : "Unable to load task reminders.");
      }
    };
    const refreshReminders = () => { void loadReminders(); };
    void loadReminders();
    const interval = window.setInterval(() => { void loadReminders(); }, 60000);
    window.addEventListener("task-reminders-changed", refreshReminders);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("task-reminders-changed", refreshReminders);
    };
  }, []);

  const markReminderRead = async (id?: string) => {
    const response = await fetch("/api/tasks/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      setReminderError(payload.error ?? "Unable to update reminders.");
      return;
    }
    const readAt = new Date().toISOString();
    setReminders((current) => current.map((reminder) => !id || reminder.id === id ? { ...reminder, read_at: readAt } : reminder));
  };

  const filtered = msgs.filter((m) => {
    const mc = channelFilter === "All" || m.channel === channelFilter;
    const mct = contactFilter === "All" || m.contactType === contactFilter;
    return mc && mct;
  });

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

        <section className="shrink-0 border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }} aria-labelledby="task-reminders-title">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div><h2 id="task-reminders-title" className="text-sm font-700" style={{ color: "var(--foreground)" }}>Task reminders</h2><p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>Scheduled reminders delivered to your workspace</p></div>
            <div className="flex items-center gap-3"><button type="button" onClick={onOpenTasks} className="text-xs font-600" style={{ color: "var(--primary)" }}>Open Tasks</button>{reminders.some((reminder) => !reminder.read_at) && <button type="button" onClick={() => void markReminderRead()} className="text-xs" style={{ color: "var(--muted-foreground)" }}>Mark all read</button>}</div>
          </div>
          {reminderError && <p role="alert" className="px-6 pb-2 text-xs text-red-400">{reminderError}</p>}
          {reminders.length === 0 ? <p className="px-6 pb-4 text-xs" style={{ color: "var(--muted-foreground)" }}>No task reminders delivered yet.</p> : <div className="flex max-h-40 flex-col divide-y overflow-auto" style={{ borderColor: "var(--border)" }}>
            {reminders.slice(0, 20).map((reminder) => <div key={reminder.id} className="flex items-start justify-between gap-3 px-6 py-2.5" style={{ background: reminder.read_at ? "transparent" : "color-mix(in srgb, var(--primary) 6%, transparent)" }}>
              <div className="min-w-0"><div className="text-xs font-600" style={{ color: "var(--foreground)" }}>{reminder.title}</div><div className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>{reminder.body}</div><div className="mono mt-1 text-[10px]" style={{ color: reminder.sms_status === "sent" ? "#17845b" : reminder.sms_status === "failed" || reminder.sms_status === "unknown" ? "#bd3d3d" : "var(--muted-foreground)" }}>{new Date(reminder.sent_at).toLocaleString()}{reminder.sms_status === "sent" ? " · SMS sent" : reminder.sms_status === "failed" ? ` · SMS failed${reminder.sms_error ? `: ${reminder.sms_error}` : ""}` : reminder.sms_status === "unknown" ? " · SMS status unknown; check SMSUG Sent Messages" : ""}</div></div>
              {!reminder.read_at && <button type="button" aria-label={`Mark ${reminder.title} as read`} title="Mark as read" onClick={() => void markReminderRead(reminder.id)} className="shrink-0 p-1" style={{ color: "var(--primary)" }}><CircleCheck size={15} aria-hidden="true" /></button>}
            </div>)}
          </div>}
        </section>

        <div className="min-h-0 flex-1 overflow-auto divide-y" style={{ borderColor: "var(--border)" }}>
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
            <button className="w-full py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              Reply
            </button>
          </div>
        </div>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6">
          <form onSubmit={(event) => void sendSms(event)} className="my-auto max-h-[94dvh] w-full max-w-lg overflow-y-auto border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>New communication</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>SMS sends immediately through SMSUG.</p></div><button type="button" aria-label="Close compose" onClick={() => setShowCompose(false)} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Channel</span><select value={smsChannel} onChange={(event) => setSmsChannel(event.target.value as Channel)} className="w-full border px-3 py-2.5 text-sm" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}><option>SMS</option><option>Email</option><option>Phone</option><option>WhatsApp</option><option>Note</option></select></label>
              {smsChannel === "SMS" ? <>
                {smsConfigured === false && <div role="status" className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs" style={{ color: "var(--foreground)" }}>SMSUG is not configured. A server administrator must set SMSUG_API_KEY privately and enable API access in SMSUG Settings.</div>}
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Contact</span><select value={smsRecipientId} onChange={(event) => setSmsRecipientId(event.target.value)} disabled={contactsLoading} className="w-full border px-3 py-2.5 text-sm disabled:opacity-50" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}><option value="">Enter phone number(s)</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.type} · {contact.name} · {contact.phone}</option>)}</select></label>
                {!selectedSmsContact && <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Ugandan phone number(s)</span><textarea required rows={2} value={manualContacts} onChange={(event) => setManualContacts(event.target.value)} placeholder="256772000111, 0701234567" className="w-full resize-y border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><span className="mt-1 block text-[11px]" style={{ color: "var(--muted-foreground)" }}>Separate multiple numbers with commas or new lines. Up to 3,000 recipients.</span></label>}
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>SMS title</span><input required maxLength={100} value={smsTitle} onChange={(event) => setSmsTitle(event.target.value)} placeholder="Payment reminder" className="w-full border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><span className="mt-1 block text-[11px]" style={{ color: "var(--muted-foreground)" }}>Letters, numbers, spaces, and basic punctuation only.</span></label>
                <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>Message</span><textarea required rows={5} maxLength={480} value={smsBody} onChange={(event) => setSmsBody(event.target.value)} className="w-full resize-y border px-3 py-2.5 text-sm outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} /><span className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--muted-foreground)" }}><span>{smsBody.length <= 160 ? "1 message unit" : smsBody.length <= 320 ? "2 message units" : "3 message units"} per recipient</span><span>{smsBody.length}/480</span></span></label>
              </> : <div className="border px-3 py-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Sending through {smsChannel} is not configured. SMS is the only live delivery channel.</div>}
            </div>
            {smsError && <p role="alert" className="mt-4 text-sm text-red-400">{smsError}</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setShowCompose(false)} disabled={sendingSms} className="border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={smsChannel !== "SMS" || sendingSms || contactsLoading || smsBody.length === 0 || smsBody.length > 480 || smsTitle.length === 0} className="px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{sendingSms ? "Sending..." : "Send SMS"}</button></div>
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
