import { useState } from "react";
import { ArrowLeft, Mail, MessageSquare, MessagesSquare, Phone, StickyNote, X, type LucideIcon } from "lucide-react";

type Channel = "Email" | "SMS" | "Phone" | "WhatsApp" | "Note";
type ContactType = "Candidate" | "Employer" | "Agent" | "Staff";

interface Message {
  id: number;
  contact: string;
  contactType: ContactType;
  channel: Channel;
  direction: "Inbound" | "Outbound";
  subject: string;
  body: string;
  date: string;
  by: string;
  status: "Sent" | "Received" | "Failed" | "Logged";
}

const messages: Message[] = [
  { id: 1, contact: "Godfrey Kamuhangire", contactType: "Candidate", channel: "SMS", direction: "Outbound", subject: "Payment Reminder", body: "Dear Godfrey, your second instalment of UGX 1,500,000 is due Aug 30. Please contact us to arrange payment.", date: "Aug 26, 2026 09:00", by: "Aisha Khan", status: "Sent" },
  { id: 2, contact: "Gulf Manpower Ltd", contactType: "Employer", channel: "Email", direction: "Outbound", subject: "Invoice INV-2026-003", body: "Please find attached invoice INV-2026-003 for placement of Mr. Godfrey Kamuhangire.", date: "Aug 25, 2026 14:30", by: "Aisha Khan", status: "Sent" },
  { id: 3, contact: "Suzan Mirembe", contactType: "Candidate", channel: "Phone", direction: "Outbound", subject: "Medical certificate follow-up", body: "Called to follow up on medical certificate. Candidate confirmed she will collect it from the clinic on Aug 27.", date: "Aug 25, 2026 11:15", by: "Director Vicent", status: "Logged" },
  { id: 4, contact: "Alice Namukasa", contactType: "Candidate", channel: "WhatsApp", direction: "Inbound", subject: "Passport query", body: "Alice asked about the status of her passport and visa. Replied that visa is being processed and will be ready by Sep 2.", date: "Aug 24, 2026 16:45", by: "Director Vicent", status: "Received" },
  { id: 5, contact: "Kuwait Home Services", contactType: "Employer", channel: "Email", direction: "Inbound", subject: "RE: Candidate profiles", body: "Thank you for the candidate profiles. We are interested in CRSL-283710044. Please proceed with the visa application.", date: "Aug 24, 2026 10:20", by: "Aisha Khan", status: "Received" },
  { id: 6, contact: "James Okello", contactType: "Candidate", channel: "SMS", direction: "Outbound", subject: "Passport renewal urgent", body: "Dear James, your passport expired. Please renew immediately and contact us with the new passport details.", date: "Aug 23, 2026 09:30", by: "Asiimwe david", status: "Sent" },
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
const contactColor: Record<ContactType, string> = { Candidate: "#6366f1", Employer: "#f59e0b", Agent: "#3b82f6", Staff: "#8b5cf6" };

export default function Communications() {
  const [msgs] = useState<Message[]>(messages);
  const [channelFilter, setChannelFilter] = useState<Channel | "All">("All");
  const [contactFilter, setContactFilter] = useState<ContactType | "All">("All");
  const [selected, setSelected] = useState<Message | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

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
            <button onClick={() => setShowCompose(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
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
            {(["All", "Candidate", "Employer", "Agent", "Staff"] as const).map((ct) => (
              <button key={ct} onClick={() => setContactFilter(ct as ContactType | "All")}
                className="px-2.5 py-1 text-xs font-600 rounded"
                style={{ background: contactFilter === ct ? "var(--secondary)" : "transparent", color: ct === "All" ? "var(--muted-foreground)" : contactColor[ct as ContactType] || "var(--muted-foreground)", border: `1px solid ${ct === "All" ? "var(--border)" : (contactColor[ct as ContactType] || "#6b7280") + "44"}` }}>
                {ct}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto divide-y" style={{ borderColor: "var(--border)" }}>
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
                style={{ color: m.status === "Sent" || m.status === "Received" ? "#10b981" : m.status === "Failed" ? "#ef4444" : "#6b7280", background: m.status === "Sent" || m.status === "Received" ? "#10b98120" : m.status === "Failed" ? "#ef444420" : "#6b728020" }}>
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
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-4" style={{ color: "var(--foreground)" }}>New Communication</h2>
            <div className="space-y-3">
              {[{ label: "To (Candidate/Employer)", ph: "Search..." }, { label: "Subject", ph: "Subject line" }].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Channel</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <option>Email</option><option>SMS</option><option>Phone</option><option>WhatsApp</option><option>Note</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Message</label>
                <textarea rows={4} className="w-full px-3 py-2 text-sm rounded border outline-none resize-none"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Send</button>
              <button onClick={() => setShowCompose(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
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
