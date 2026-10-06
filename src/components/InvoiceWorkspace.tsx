import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowLeft, Eye, FilePlus2, Search, X } from "lucide-react";

type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "overdue";
type RecipientType = "contractor" | "supplier" | "candidate";
type InvoicePayment = { id: string; amount: number; paid_at: string };
type InvoiceRecord = {
  id: string;
  invoice_number: string;
  recipient_type: RecipientType;
  recipient_id: string;
  recipient_name: string;
  description: string;
  amount: number;
  paid_amount: number;
  balance_due: number;
  due_date: string;
  issued_at: string;
  display_status: InvoiceStatus;
  payments: InvoicePayment[];
};
type Recipient = { recipient_type: RecipientType; recipient_id: string; recipient_name: string };
type InvoiceFilter = "all" | InvoiceStatus;
type InvoicePayload = { invoices?: InvoiceRecord[]; permissions?: { canCreate?: boolean }; error?: string };

const filterTabs: { value: InvoiceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "sent", label: "Sent" },
  { value: "draft", label: "Draft" },
];
const statusLabel: Record<InvoiceStatus, string> = { draft: "Draft", sent: "Sent", partially_paid: "Partially paid", paid: "Paid", overdue: "Overdue" };
const statusColor: Record<InvoiceStatus, string> = { draft: "#737b85", sent: "#2878a8", partially_paid: "#b7791f", paid: "#17845b", overdue: "#bd3d3d" };
const recipientLabel: Record<RecipientType, string> = { contractor: "Employer / contractor", supplier: "Supplier", candidate: "Candidate" };
const inputStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const money = (amount: number) => `UGX ${amount.toLocaleString("en-UG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default function InvoiceWorkspace() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [recipientType, setRecipientType] = useState<RecipientType>("contractor");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recipientMenuOpen, setRecipientMenuOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [invoiceResponse, recipientResponse] = await Promise.all([
          fetch("/api/invoices", { cache: "no-store" }),
          fetch("/api/invoice-recipients", { cache: "no-store" }),
        ]);
        const [invoicePayload, recipientPayload] = await Promise.all([
          invoiceResponse.json() as Promise<InvoicePayload>,
          recipientResponse.json() as Promise<{ recipients?: Recipient[]; error?: string }>,
        ]);
        if (!invoiceResponse.ok) throw new Error(invoicePayload.error ?? "Unable to load invoices.");
        if (!recipientResponse.ok) throw new Error(recipientPayload.error ?? "Unable to load invoice recipients.");
        if (cancelled) return;
        setInvoices(invoicePayload.invoices ?? []);
        setCanCreate(Boolean(invoicePayload.permissions?.canCreate));
        setRecipients(recipientPayload.recipients ?? []);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load invoices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const paymentInvoice = invoices.find((invoice) => invoice.id === paymentInvoiceId) ?? null;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredInvoices = invoices.filter((invoice) => {
    const matchesFilter = filter === "all" || invoice.display_status === filter;
    const searchable = `${invoice.invoice_number} ${invoice.recipient_name} ${invoice.description}`.toLocaleLowerCase();
    return matchesFilter && searchable.includes(normalizedSearch);
  });
  const totalInvoiced = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalCollected = invoices.reduce((sum, invoice) => sum + invoice.paid_amount, 0);
  const outstanding = invoices.reduce((sum, invoice) => sum + invoice.balance_due, 0);
  const overdueCount = invoices.filter((invoice) => invoice.display_status === "overdue").length;
  const filteredRecipients = recipients.filter((recipient) => recipient.recipient_type === recipientType
    && recipient.recipient_name.toLocaleLowerCase().includes(recipientQuery.trim().toLocaleLowerCase()));
  const afterPaymentBalance = Math.max(0, (paymentInvoice?.balance_due ?? 0) - (Number(paymentAmount) || 0));

  const resetCreateForm = () => {
    setRecipientType("contractor");
    setRecipientQuery("");
    setRecipientId("");
    setDescription("");
    setAmount("");
    setDueDate("");
    setRecipientMenuOpen(false);
  };

  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientType, recipientId, description, amount, dueDate }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to create invoice.");
      setShowCreate(false);
      resetCreateForm();
      setReloadKey((key) => key + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create invoice.");
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (invoice: InvoiceRecord, payInFull = false) => {
    setPaymentInvoiceId(invoice.id);
    setPaymentAmount(payInFull ? String(invoice.balance_due) : "");
    setShowPayment(true);
    setError("");
  };

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentInvoice) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(paymentInvoice.id)}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: paymentAmount }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to record payment.");
      setShowPayment(false);
      setPaymentInvoiceId(null);
      setPaymentAmount("");
      setReloadKey((key) => key + 1);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  };

  const downloadInvoice = async (invoice: InvoiceRecord) => {
    setError("");
    try {
      const response = await fetch(`/api/invoices/${encodeURIComponent(invoice.id)}/pdf`);
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to download invoice PDF.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${invoice.invoice_number}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download invoice PDF.");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="invoices-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div><h1 id="invoices-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Invoices</h1><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Employer billing and invoice tracking</p></div>
        <button type="button" onClick={() => { resetCreateForm(); setError(""); setShowCreate(true); }} disabled={!canCreate || loading} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><FilePlus2 size={16} aria-hidden="true" />Create invoice</button>
      </header>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Total invoiced", value: money(totalInvoiced), color: "var(--foreground)" },
          { label: "Total collected", value: money(totalCollected), color: "#17845b" },
          { label: "Outstanding", value: money(outstanding), color: "#b7791f" },
          { label: "Overdue invoices", value: overdueCount, color: "#bd3d3d" },
        ].map((metric) => <div key={metric.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="mono text-lg font-700" style={{ color: metric.color }}>{loading ? "—" : metric.value}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search invoices" placeholder="Search invoice, description, employer, or candidate" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filteredInvoices.length} shown</span>
      </div>
      <div role="tablist" aria-label="Filter invoices by status" className="flex gap-1 overflow-x-auto border-b px-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {filterTabs.map((tab) => <button key={tab.value} type="button" role="tab" aria-selected={filter === tab.value} onClick={() => setFilter(tab.value)} className="shrink-0 border-b-2 px-3 py-3 text-xs font-600" style={{ borderColor: filter === tab.value ? "var(--primary)" : "transparent", color: filter === tab.value ? "var(--primary)" : "var(--muted-foreground)" }}>{tab.label}</button>)}
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-275 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Invoice number", "Employer / supplier", "Candidate", "Description", "Amount", "Paid", "Balance", "Issued", "Due date", "Status", "Actions"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading invoices…</td></tr>}
              {!loading && !error && filteredInvoices.length === 0 && <tr><td colSpan={11} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{invoices.length ? "No invoices match this search or status." : "No invoices created yet."}</td></tr>}
              {!loading && filteredInvoices.map((invoice) => <tr key={invoice.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3"><button type="button" onClick={() => setSelectedInvoiceId(invoice.id)} className="mono text-xs font-700 underline decoration-transparent underline-offset-2 hover:decoration-current" style={{ color: "var(--primary)" }}>{invoice.invoice_number}</button></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{invoice.recipient_type === "candidate" ? "—" : invoice.recipient_name}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{invoice.recipient_type === "candidate" ? invoice.recipient_name : "—"}</td>
                <td className="max-w-52 truncate px-3 py-3 text-xs" title={invoice.description} style={{ color: "var(--muted-foreground)" }}>{invoice.description}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: "var(--foreground)" }}>{money(invoice.amount)}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "#17845b" }}>{money(invoice.paid_amount)}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: invoice.balance_due > 0 ? "#bd3d3d" : "#17845b" }}>{money(invoice.balance_due)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{dateLabel(invoice.issued_at)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: invoice.display_status === "overdue" ? "#bd3d3d" : "var(--muted-foreground)" }}>{dateLabel(invoice.due_date)}</td>
                <td className="whitespace-nowrap px-3 py-3"><span className="px-2 py-1 text-xs font-600" style={{ color: statusColor[invoice.display_status], background: `${statusColor[invoice.display_status]}1a` }}>{statusLabel[invoice.display_status]}</span></td>
                <td className="whitespace-nowrap px-3 py-3"><div className="flex items-center gap-1"><button type="button" aria-label={`View ${invoice.invoice_number}`} title="View invoice" onClick={() => setSelectedInvoiceId(invoice.id)} className="p-2" style={{ color: "var(--muted-foreground)" }}><Eye size={15} aria-hidden="true" /></button><button type="button" aria-label={`Download ${invoice.invoice_number}`} title="Download PDF" onClick={() => void downloadInvoice(invoice)} className="p-2" style={{ color: "var(--muted-foreground)" }}><ArrowDownToLine size={15} aria-hidden="true" /></button><button type="button" aria-label={`Pay ${invoice.invoice_number}`} title="Record payment" disabled={!canCreate || invoice.balance_due <= 0 || invoice.display_status === "draft"} onClick={() => openPayment(invoice)} className="p-2 disabled:cursor-not-allowed disabled:opacity-40" style={{ color: "#17845b" }}><span className="mono text-xs font-700">Pay</span></button></div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {selectedInvoice && <aside className="detail-panel fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l shadow-xl" style={{ borderColor: "var(--border)", background: "var(--card)" }} aria-labelledby="invoice-detail-title">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div><p className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Invoice</p><h2 id="invoice-detail-title" className="mono mt-1 text-lg font-700" style={{ color: "var(--primary)" }}>{selectedInvoice.invoice_number}</h2><span className="mt-2 inline-block px-2 py-1 text-xs font-600" style={{ color: statusColor[selectedInvoice.display_status], background: `${statusColor[selectedInvoice.display_status]}1a` }}>{statusLabel[selectedInvoice.display_status]}</span></div><button type="button" onClick={() => setSelectedInvoiceId(null)} aria-label="Close invoice details" className="p-2" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></header>
        <div className="space-y-5 p-5">
          <dl className="space-y-4">{[
            [recipientLabel[selectedInvoice.recipient_type], selectedInvoice.recipient_name],
            ["Description", selectedInvoice.description],
            ["Invoice amount", money(selectedInvoice.amount)],
            ["Paid so far", money(selectedInvoice.paid_amount)],
            ["Balance due", money(selectedInvoice.balance_due)],
            ["Issue date", dateLabel(selectedInvoice.issued_at)],
            ["Due date", dateLabel(selectedInvoice.due_date)],
          ].map(([label, value]) => <div key={label}><dt className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{label}</dt><dd className="mt-1 whitespace-pre-wrap wrap-break-word text-sm" style={{ color: "var(--foreground)" }}>{value}</dd></div>)}</dl>
          <section className="border-t pt-4" style={{ borderColor: "var(--border)" }}><h3 className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment instalments</h3>{selectedInvoice.payments.length ? <div className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>{selectedInvoice.payments.map((payment) => <div key={payment.id} className="flex justify-between gap-4 py-2 text-sm"><span style={{ color: "var(--muted-foreground)" }}>{new Date(payment.paid_at).toLocaleString()}</span><span className="mono font-600" style={{ color: "#17845b" }}>{money(payment.amount)}</span></div>)}</div> : <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>No payments recorded yet.</p>}</section>
          <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: "var(--border)" }}><button type="button" onClick={() => void downloadInvoice(selectedInvoice)} className="inline-flex flex-1 items-center justify-center gap-2 border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowDownToLine size={15} aria-hidden="true" />Download PDF</button>{canCreate && selectedInvoice.balance_due > 0 && selectedInvoice.display_status !== "draft" && <button type="button" onClick={() => openPayment(selectedInvoice, true)} className="flex-1 px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Mark as paid</button>}</div>
        </div>
      </aside>}

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowCreate(false); resetCreateForm(); } }}>
        <form onSubmit={createInvoice} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Create invoice</h2><button type="button" onClick={() => { setShowCreate(false); resetCreateForm(); }} aria-label="Close invoice form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="space-y-4">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Recipient type<select value={recipientType} onChange={(event) => { setRecipientType(event.target.value as RecipientType); setRecipientId(""); setRecipientQuery(""); }} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={inputStyle}><option value="contractor">Employer / contractor</option><option value="supplier">Supplier</option><option value="candidate">Candidate</option></select></label>
            <div className="relative"><label htmlFor="invoice-recipient" className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Invoice to</label><input id="invoice-recipient" required autoComplete="off" value={recipientQuery} onFocus={() => setRecipientMenuOpen(true)} onChange={(event) => { setRecipientQuery(event.target.value); setRecipientId(""); setRecipientMenuOpen(true); }} placeholder={`Search ${recipientLabel[recipientType].toLocaleLowerCase()}`} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={inputStyle} />{recipientMenuOpen && <div role="listbox" aria-label="Invoice recipients" className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>{filteredRecipients.slice(0, 30).map((recipient) => <button key={`${recipient.recipient_type}-${recipient.recipient_id}`} type="button" role="option" aria-selected={recipientId === recipient.recipient_id} onClick={() => { setRecipientId(recipient.recipient_id); setRecipientQuery(recipient.recipient_name); setRecipientMenuOpen(false); }} className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-black/5"><span className="text-sm" style={{ color: "var(--foreground)" }}>{recipient.recipient_name}</span><span className="shrink-0 text-xs capitalize" style={{ color: "var(--muted-foreground)" }}>{recipient.recipient_type}</span></button>)}{filteredRecipients.length === 0 && <p className="px-3 py-3 text-sm" style={{ color: "var(--muted-foreground)" }}>No matching records found.</p>}</div>}</div>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Description<textarea required maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the invoice charge" className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={inputStyle} /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Amount (UGX)<input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={inputStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Due date<input required type="date" min={new Date().toISOString().slice(0, 10)} value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={inputStyle} /></label></div>
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving || !recipientId} className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Creating…" : "Create invoice"}</button><button type="button" onClick={() => { setShowCreate(false); resetCreateForm(); }} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {showPayment && paymentInvoice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowPayment(false); setPaymentInvoiceId(null); } }}>
        <form onSubmit={recordPayment} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Record payment</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{paymentInvoice.invoice_number}</p></div><button type="button" onClick={() => { setShowPayment(false); setPaymentInvoiceId(null); }} aria-label="Close payment form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="mb-4 border p-3" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}><div className="flex justify-between gap-4 text-sm"><span style={{ color: "var(--muted-foreground)" }}>Amount due</span><strong className="mono" style={{ color: "var(--foreground)" }}>{money(paymentInvoice.balance_due)}</strong></div><label className="mt-4 block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Amount received<input required min="0.01" max={paymentInvoice.balance_due} step="0.01" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={inputStyle} /></label><div className="mt-4 flex justify-between gap-4 border-t pt-3 text-sm" style={{ borderColor: "var(--border)" }}><span style={{ color: "var(--muted-foreground)" }}>{afterPaymentBalance === 0 ? "Balance after payment" : "Balance still required"}</span><strong className="mono" style={{ color: afterPaymentBalance === 0 ? "#17845b" : "#bd3d3d" }}>{money(afterPaymentBalance)}</strong></div></div>
          <div className="flex gap-3"><button type="submit" disabled={saving || !paymentAmount || Number(paymentAmount) > paymentInvoice.balance_due} className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save payment"}</button><button type="button" onClick={() => { setShowPayment(false); setPaymentInvoiceId(null); }} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}