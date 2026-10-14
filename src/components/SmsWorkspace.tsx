import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, BarChart3, ContactRound, FileSpreadsheet, FileText, LayoutDashboard, MessageSquare, Plus, Search, Send, Trash2, Upload, Users, Wallet, X } from "lucide-react";
import { SearchableMultiSelect } from "./SearchableSelect";

type View = "dashboard" | "sent" | "contacts";
type Contact = { id: string; type: string; name: string; phone: string };
type GroupMember = { id?: string; candidate_id?: string | null; display_name: string; phone: string; contact_type: string };
type ContactGroup = { id: string; name: string; created_at: string; members: GroupMember[] };
type SmsLog = { id: string; title: string; message: string; contacts: string[]; contact_name: string; contact_type: string; provider_status: string; provider_error: string; provider_token: string | null; recipients: number | null; cost: number | null; balance: number | null; created_at: string };
type SmsUsage = { month: string; months: { month: string; label: string }[]; dailyCounts: number[] };
type UploadKind = "csv" | "excel";

const pageLabels: Record<View, string> = { dashboard: "Dashboard", sent: "Sent", contacts: "Contacts" };

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export default function SmsWorkspace({ userName, companyName, userEmail, onExit }: { userName: string; companyName: string; userEmail: string; onExit: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [usage, setUsage] = useState<SmsUsage | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [contactTab, setContactTab] = useState<"candidates" | "groups">("candidates");
  const [showSend, setShowSend] = useState(false);
  const [sendTitle, setSendTitle] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [manualNumbers, setManualNumbers] = useState("");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [sending, setSending] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupCandidateIds, setGroupCandidateIds] = useState<string[]>([]);
  const [savingGroup, setSavingGroup] = useState(false);
  const [uploadKind, setUploadKind] = useState<UploadKind | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadGroupName, setUploadGroupName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const loadWorkspace = async (month = selectedMonth) => {
    setLoading(true);
    setError("");
    try {
      const [contactsResponse, groupsResponse, logsResponse] = await Promise.all([
        fetch("/api/communications/contacts?includeAll=true", { cache: "no-store" }),
        fetch("/api/communications/sms/groups", { cache: "no-store" }),
        fetch(`/api/communications/sms?month=${encodeURIComponent(month)}`, { cache: "no-store" }),
      ]);
      const [contactsPayload, groupsPayload, logsPayload] = await Promise.all([
        contactsResponse.json(), groupsResponse.json(), logsResponse.json(),
      ]) as [{ contacts?: Contact[]; error?: string }, { groups?: ContactGroup[]; error?: string }, { messages?: SmsLog[]; configured?: boolean; usage?: SmsUsage | null; error?: string }];
      if (!contactsResponse.ok) throw new Error(contactsPayload.error ?? "Unable to load company contacts.");
      setContacts((contactsPayload.contacts ?? []).filter((contact) => contact.type === "Candidate"));
      setGroups(groupsResponse.ok ? groupsPayload.groups ?? [] : []);
      setLogs(logsResponse.ok ? logsPayload.messages ?? [] : []);
      if (logsResponse.ok) {
        setConfigured(Boolean(logsPayload.configured));
        setUsage(logsPayload.usage ?? null);
      }
      const unavailable = [!groupsResponse.ok && "contact groups", !logsResponse.ok && "sent history"].filter(Boolean);
      setError(unavailable.length
        ? `${unavailable.join(" and ")} could not be loaded. Apply the pending SMS Supabase migrations, then refresh.`
        : "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "SMS workspace is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadWorkspace(selectedMonth); }, [selectedMonth]);

  const filteredContacts = contacts.filter((contact) => `${contact.name} ${contact.phone}`.toLowerCase().includes(search.toLowerCase()));
  const sendRecipients = [
    ...contacts.filter((contact) => selectedCandidateIds.includes(contact.id) && contact.phone).map((contact) => contact.phone),
    ...(selectedGroupId ? groups.find((group) => group.id === selectedGroupId)?.members.map((member) => member.phone) ?? [] : []),
    ...manualNumbers.split(/[\n,;]+/).map((phone) => phone.trim()).filter(Boolean),
  ];
  const uniqueRecipients = [...new Set(sendRecipients)];

  const openSend = (candidate?: Contact, group?: ContactGroup) => {
    setSendTitle("");
    setSendBody("");
    setManualNumbers("");
    setSelectedCandidateIds(candidate ? [candidate.id] : []);
    setSelectedGroupId(group?.id ?? "");
    setError("");
    setShowSend(true);
  };

  const sendSms = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uniqueRecipients.length || sending) return;
    setSending(true);
    setError("");
    try {
      const selectedContacts = contacts.filter((contact) => selectedCandidateIds.includes(contact.id));
      const group = groups.find((item) => item.id === selectedGroupId);
      const contactName = group?.name ?? (selectedContacts.map((contact) => contact.name).join(", ").slice(0, 180) || "SMS contacts");
      const response = await fetch("/api/communications/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          title: sendTitle,
          message: sendBody,
          contacts: uniqueRecipients,
          contactName,
          contactType: group || selectedContacts.some((contact) => contact.type !== "Candidate") ? "Other" : "Candidate",
        }),
      });
      const payload = await response.json() as { error?: string; message?: SmsLog };
      if (!response.ok) throw new Error(payload.error ?? "SMSUG could not send this message.");
      setShowSend(false);
      setNotice(`SMS sent to ${payload.message?.recipients ?? uniqueRecipients.length} recipient${(payload.message?.recipients ?? uniqueRecipients.length) === 1 ? "" : "s"}.`);
      setView("sent");
      await loadWorkspace();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "SMSUG could not send this message.");
    } finally {
      setSending(false);
    }
  };

  const createGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const members = contacts.filter((contact) => groupCandidateIds.includes(contact.id) && contact.phone).map((contact) => ({
      candidateId: contact.id,
      name: contact.name,
      phone: contact.phone,
      contactType: "Candidate",
    }));
    if (!members.length) { setError("Select at least one candidate with a phone number."); return; }
    setSavingGroup(true);
    setError("");
    try {
      const response = await fetch("/api/communications/sms/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: groupName, contacts: members }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create this group.");
      setShowGroupForm(false);
      setGroupName("");
      setGroupCandidateIds([]);
      setNotice("Contact group created.");
      await loadWorkspace();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create this group.");
    } finally {
      setSavingGroup(false);
    }
  };

  const importContacts = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!uploadFile || uploading) return;
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      if (uploadGroupName.trim()) form.set("groupName", uploadGroupName.trim());
      const response = await fetch("/api/communications/sms/groups/import", { method: "POST", body: form });
      const payload = await response.json() as { error?: string; imported?: number; group?: { name?: string } };
      if (!response.ok) throw new Error(payload.error ?? "Unable to import contacts.");
      setUploadKind(null);
      setUploadFile(null);
      setUploadGroupName("");
      setNotice(`${payload.imported ?? 0} contacts imported to ${payload.group?.name ?? "a new group"}.`);
      setContactTab("groups");
      await loadWorkspace();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to import contacts.");
    } finally {
      setUploading(false);
    }
  };

  const deleteGroup = async (group: ContactGroup) => {
    if (!window.confirm(`Delete the ${group.name} contact group?`)) return;
    const response = await fetch(`/api/communications/sms/groups?id=${encodeURIComponent(group.id)}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) { setError(payload.error ?? "Unable to delete this group."); return; }
    await loadWorkspace();
  };

  const thisMonth = new Date();
  const monthLogs = logs.filter((item) => {
    const date = new Date(item.created_at);
    return date.getFullYear() === thisMonth.getFullYear() && date.getMonth() === thisMonth.getMonth();
  });
  const balance = logs.find((item) => item.balance !== null)?.balance ?? 0;
  const dailyCounts = usage?.dailyCounts ?? [];
  const dailyMaximum = Math.max(1, ...dailyCounts);
  const selectedMonthLabel = usage?.months.find((item) => item.month === selectedMonth)?.label
    ?? new Date(`${selectedMonth}-02T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return <div className="flex h-full min-h-0 overflow-hidden" style={{ background: "var(--background)" }}>
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><button type="button" onClick={onExit} aria-label="Back to communications" title="Back to communications" className="shrink-0 p-1" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={16} /></button><div className="min-w-0"><h1 className="truncate text-lg font-700" style={{ color: "var(--foreground)" }}>{pageLabels[view]}</h1><p className="hidden truncate text-xs sm:block" style={{ color: "var(--muted-foreground)" }}>{view === "dashboard" ? "Your company SMS activity" : view === "sent" ? "SMS delivery history" : "Company candidates and contact groups"}</p></div></div>
          <div className="flex shrink-0 items-center gap-2">{view !== "dashboard" && <button type="button" onClick={() => void loadWorkspace()} className="border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Refresh</button>}<button type="button" onClick={() => openSend()} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={15} />Send SMS</button></div>
        </div>
        <nav role="tablist" aria-label="SMS sections" className="mt-3 flex gap-1 overflow-x-auto border-t pt-2" style={{ borderColor: "var(--border)" }}>{(["dashboard", "sent", "contacts"] as const).map((item) => {
          const Icon = item === "dashboard" ? LayoutDashboard : item === "sent" ? Send : ContactRound;
          return <button key={item} type="button" role="tab" onClick={() => { setView(item); setError(""); }} aria-selected={view === item} className="inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm" style={{ borderColor: view === item ? "var(--primary)" : "transparent", color: view === item ? "var(--primary)" : "var(--muted-foreground)" }}><Icon size={15} />{pageLabels[item]}</button>;
        })}</nav>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        {error && <div role="alert" className="mb-4 flex items-start justify-between gap-3 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={15} /></button></div>}
        {notice && <div role="status" className="mb-4 flex items-start justify-between gap-3 border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={15} /></button></div>}
        {configured === false && <div role="status" className="mb-4 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm" style={{ color: "var(--foreground)" }}>SMS sending is not configured. Ask an administrator to configure SMSUG API access.</div>}
        {loading ? <div className="py-16 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading SMS workspace...</div> : view === "dashboard" ? <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Wallet} label="Balance" value={`UGX ${Number(balance).toLocaleString()}`} />
            <StatCard icon={Send} label="Sent this month" value={`${monthLogs.filter((item) => item.provider_status === "sent").length}`} />
            <StatCard icon={Users} label="Contacts" value={`${contacts.length}`} />
            <StatCard icon={MessageSquare} label="SMS cost" value="MTN UGX 30  ·  Airtel UGX 30" />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <ActionButton onClick={() => openSend()} icon={Send} label="Send SMS" />
            <ActionButton onClick={() => setView("sent")} icon={FileText} label="Sent messages" />
            <ActionButton onClick={() => { setView("contacts"); setContactTab("candidates"); }} icon={ContactRound} label="Contacts" />
          </div>
          <section className="mt-6 border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-sm font-700" style={{ color: "var(--foreground)" }}><BarChart3 size={15} style={{ color: "var(--primary)" }} />SMS sent in {selectedMonthLabel}</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Daily SMS requests across this company</p></div>{(usage?.months.length ?? 0) > 1 ? <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}><span>Usage month</span><select aria-label="Usage month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="border px-2.5 py-1.5 text-xs" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>{usage?.months.map((month) => <option key={month.month} value={month.month}>{month.label}</option>)}</select></label> : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedMonthLabel}</span>}</div>
            <div className="mt-8 flex h-40 items-end gap-1 overflow-x-auto border-b px-1" style={{ borderColor: "var(--border)" }}>{dailyCounts.map((count, index) => <div key={index} className="flex min-w-4 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px]" style={{ color: "var(--muted-foreground)" }}>{count || ""}</span><div className="w-full min-w-2" style={{ height: `${Math.max(count ? 8 : 2, (count / dailyMaximum) * 100)}px`, background: count ? "var(--primary)" : "var(--border)" }} title={`${index + 1}: ${count} SMS`} /><span className="pb-1 text-[9px]" style={{ color: "var(--muted-foreground)" }}>{index + 1}</span></div>)}</div>
          </section>
        </> : view === "sent" ? <>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-700" style={{ color: "var(--foreground)" }}>Sent SMS</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{logs.length} recorded messages</p></div></div>
          {logs.length ? <div className="overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div className="hidden grid-cols-[minmax(10rem,1fr)_minmax(12rem,2fr)_8rem_7rem_10rem] gap-4 border-b px-4 py-3 text-xs font-700 sm:grid" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)" }}><span>Title</span><span>Message / recipients</span><span>Status</span><span>Cost</span><span>Sent</span></div>{logs.map((item) => <article key={item.id} className="grid gap-2 border-b px-4 py-3 last:border-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(12rem,2fr)_8rem_7rem_10rem] sm:items-center sm:gap-4" style={{ borderColor: "var(--border)" }}><div className="min-w-0"><div className="truncate text-sm font-600" style={{ color: "var(--foreground)" }}>{item.title}</div><div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{item.contact_name || "Manual numbers"}</div></div><div className="min-w-0"><div className="line-clamp-2 text-xs" style={{ color: "var(--foreground)" }}>{item.message}</div><div className="mt-1 truncate text-[11px]" style={{ color: "var(--muted-foreground)" }}>{item.recipients ?? item.contacts.length} recipients · {item.contacts.slice(0, 3).join(", ")}{item.contacts.length > 3 ? "..." : ""}</div>{item.provider_error && <div className="mt-1 text-[11px] text-red-400">{item.provider_error}</div>}</div><Status value={item.provider_status} /><span className="text-xs" style={{ color: "var(--foreground)" }}>{item.cost === null ? "-" : `UGX ${Number(item.cost).toLocaleString()}`}</span><time className="text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(item.created_at).toLocaleString()}</time></article>)}</div> : <Empty icon={Send} title="No messages sent yet" detail="Sent SMS records will appear here." />}
        </> : <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-700" style={{ color: "var(--foreground)" }}>Contacts</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Registered candidates and saved SMS groups</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setGroupName(""); setGroupCandidateIds([]); setShowGroupForm(true); }} className="inline-flex items-center gap-1.5 border px-3 py-2 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Users size={14} />Add Group</button><button type="button" onClick={() => setUploadKind("csv")} className="inline-flex items-center gap-1.5 border px-3 py-2 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Upload size={14} />Upload CSV</button><button type="button" onClick={() => setUploadKind("excel")} className="inline-flex items-center gap-1.5 border px-3 py-2 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><FileSpreadsheet size={14} />Upload Excel</button></div></div>
          <div className="mb-3 flex gap-1 border-b" style={{ borderColor: "var(--border)" }}><button type="button" onClick={() => setContactTab("candidates")} className="px-3 py-2 text-xs font-600" style={{ borderBottom: contactTab === "candidates" ? "2px solid var(--primary)" : "2px solid transparent", color: contactTab === "candidates" ? "var(--primary)" : "var(--muted-foreground)" }}>Candidates ({contacts.length})</button><button type="button" onClick={() => setContactTab("groups")} className="px-3 py-2 text-xs font-600" style={{ borderBottom: contactTab === "groups" ? "2px solid var(--primary)" : "2px solid transparent", color: contactTab === "groups" ? "var(--primary)" : "var(--muted-foreground)" }}>Groups ({groups.length})</button></div>
          <label className="mb-3 flex items-center gap-2 border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--card)" }}><Search size={16} style={{ color: "var(--muted-foreground)" }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={contactTab === "candidates" ? "Search candidates..." : "Search groups..."} className="min-w-0 flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
          {contactTab === "candidates" ? filteredContacts.length ? <div className="overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div className="hidden grid-cols-[minmax(12rem,1fr)_minmax(9rem,1fr)_8rem] gap-4 border-b px-4 py-3 text-xs font-700 sm:grid" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)" }}><span>Name</span><span>Phone</span><span>Action</span></div>{filteredContacts.map((contact) => <div key={contact.id} className="grid gap-2 border-b px-4 py-3 last:border-0 sm:grid-cols-[minmax(12rem,1fr)_minmax(9rem,1fr)_8rem] sm:items-center sm:gap-4" style={{ borderColor: "var(--border)" }}><span className="text-sm font-600" style={{ color: "var(--foreground)" }}>{contact.name}</span><span className="text-xs" style={{ color: contact.phone ? "var(--muted-foreground)" : "#b7791f" }}>{contact.phone || "No phone number"}</span><button type="button" disabled={!contact.phone} onClick={() => openSend(contact)} className="inline-flex items-center justify-center gap-1 border px-2.5 py-1.5 text-xs disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><MessageSquare size={13} />Send SMS</button></div>)}</div> : <Empty icon={Users} title="No candidates found" detail={search ? "Try a different search." : "Company candidates will appear here."} /> : groups.filter((group) => group.name.toLowerCase().includes(search.toLowerCase())).length ? <div className="overflow-hidden border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>{groups.filter((group) => group.name.toLowerCase().includes(search.toLowerCase())).map((group) => <div key={group.id} className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-0" style={{ borderColor: "var(--border)" }}><div><div className="text-sm font-600" style={{ color: "var(--foreground)" }}>{group.name}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{group.members.length} contacts · {new Date(group.created_at).toLocaleDateString()}</div></div><div className="flex gap-2"><button type="button" onClick={() => openSend(undefined, group)} className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Send size={13} />Send SMS</button><button type="button" onClick={() => void deleteGroup(group)} aria-label={`Delete ${group.name}`} className="border p-1.5" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}><Trash2 size={14} /></button></div></div>)}</div> : <Empty icon={Users} title="No contact groups" detail="Create a group or import a CSV/XLSX file." />}
        </>}
      </div>
    </main>

    {showSend && <Modal title="Send SMS" onClose={() => setShowSend(false)}>
      <form onSubmit={(event) => void sendSms(event)} className="space-y-3">
        <Field label="Title"><input required maxLength={100} value={sendTitle} onChange={(event) => setSendTitle(event.target.value)} placeholder="Message title" className={inputClass} /></Field>
        <Field label="Phonebook group"><select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} className={inputClass}><option value="">Select a group (optional)</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.members.length} contacts</option>)}</select></Field>
        <Field label={`Candidates${selectedCandidateIds.length ? ` · ${selectedCandidateIds.length} selected` : ""}`}><SearchableMultiSelect values={selectedCandidateIds} onChange={setSelectedCandidateIds} options={contacts.filter((contact) => contact.phone).slice(0, 500).map((contact) => ({ value: contact.id, label: contact.name, description: contact.phone, searchText: contact.phone }))} placeholder="Type a candidate name or phone number" /></Field>
        <Field label="Other phone numbers"><textarea rows={2} value={manualNumbers} onChange={(event) => setManualNumbers(event.target.value)} placeholder="Paste numbers, separated by commas or new lines" className={`${inputClass} resize-y`} /></Field>
        <Field label="Message"><textarea required rows={4} maxLength={480} value={sendBody} onChange={(event) => setSendBody(event.target.value)} placeholder="Type your message" className={`${inputClass} resize-y`} /><div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--muted-foreground)" }}><span>{uniqueRecipients.length} recipient{uniqueRecipients.length === 1 ? "" : "s"}</span><span>{sendBody.length}/480</span></div></Field>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={sending || !uniqueRecipients.length || !sendTitle || !sendBody || configured === false} className="w-full px-4 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{sending ? "Sending..." : "Send"}</button>
      </form>
    </Modal>}

    {showGroupForm && <Modal title="Add contact group" onClose={() => setShowGroupForm(false)}><form onSubmit={(event) => void createGroup(event)} className="space-y-3"><Field label="Group name"><input required maxLength={120} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" className={inputClass} /></Field><Field label={`Candidates · ${groupCandidateIds.length} selected`}><SearchableMultiSelect values={groupCandidateIds} onChange={setGroupCandidateIds} options={contacts.filter((contact) => contact.phone).map((contact) => ({ value: contact.id, label: contact.name, description: contact.phone, searchText: contact.phone }))} placeholder="Type a candidate name or phone number" /></Field>{error && <p role="alert" className="text-sm text-red-400">{error}</p>}<button type="submit" disabled={savingGroup || !groupName.trim() || !groupCandidateIds.length} className="w-full px-4 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{savingGroup ? "Saving..." : "Create group"}</button></form></Modal>}

    {uploadKind && <Modal title={`Upload ${uploadKind === "csv" ? "CSV" : "Excel"} contacts`} onClose={() => { setUploadKind(null); setUploadFile(null); }}><form onSubmit={(event) => void importContacts(event)} className="space-y-3"><Field label="Group name (optional)"><input maxLength={120} value={uploadGroupName} onChange={(event) => setUploadGroupName(event.target.value)} placeholder="Use file name if left blank" className={inputClass} /></Field><Field label={uploadKind === "csv" ? "CSV file" : "Excel file"}><input required type="file" accept={uploadKind === "csv" ? ".csv,text/csv" : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"} onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} className="w-full border p-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--foreground)" }} /></Field><p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Up to 5 MB. Reads Ugandan phone numbers from the first worksheet, one number per row.</p>{error && <p role="alert" className="text-sm text-red-400">{error}</p>}<button type="submit" disabled={uploading || !uploadFile} className="w-full px-4 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{uploading ? "Importing..." : "Upload"}</button></form></Modal>}
  </div>;
}

const inputClass = "w-full border px-3 py-2.5 text-sm outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-700" style={{ color: "var(--muted-foreground)" }}>{label}</span>{children}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-label={title} className="my-auto max-h-[94dvh] w-full max-w-lg overflow-y-auto border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>{title}</h2><button type="button" onClick={onClose} aria-label={`Close ${title}`} className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} /></button></div>{children}</section></div>;
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return <article className="min-h-24 border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div className="flex items-center justify-between"><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span><Icon size={17} style={{ color: "var(--primary)" }} /></div><div className="mt-3 text-base font-700" style={{ color: "var(--foreground)" }}>{value}</div></article>;
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Send; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center justify-center gap-2 border px-4 py-3 text-sm font-600" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }}><Icon size={16} style={{ color: "var(--primary)" }} />{label}</button>;
}

function Empty({ icon: Icon, title, detail }: { icon: typeof Send; title: string; detail: string }) {
  return <div className="border px-4 py-14 text-center" style={{ borderColor: "var(--border)", background: "var(--card)" }}><Icon size={28} className="mx-auto" style={{ color: "var(--muted-foreground)" }} /><h3 className="mt-3 text-sm font-700" style={{ color: "var(--foreground)" }}>{title}</h3><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{detail}</p></div>;
}

function Status({ value }: { value: string }) {
  const good = value === "sent";
  const pending = value === "sending" || value === "unknown";
  return <span className="w-fit border px-2 py-1 text-[11px] font-600" style={{ borderColor: good ? "#19875455" : pending ? "#b7791f55" : "#b4231855", color: good ? "#198754" : pending ? "#b7791f" : "#b42318" }}>{value[0]?.toUpperCase()}{value.slice(1)}</span>;
}