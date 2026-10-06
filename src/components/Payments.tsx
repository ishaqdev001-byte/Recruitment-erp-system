import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, CircleDollarSign, Plus, Search, X } from "lucide-react";

type ReceiptType = "candidate_deposit" | "other_income" | "invoice_payment";
type CandidateOption = { candidate_id: string; file_number: string; candidate_name: string };
type PaymentTransaction = {
  id: string;
  recordType: "receipt" | "invoice_payment";
  reference: string;
  entryType: ReceiptType;
  category: string;
  receivedFrom: string;
  candidateId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  paymentMethod: string;
  externalReference: string;
  notes: string;
  receivedAt: string;
};
type LedgerPayload = {
  transactions?: PaymentTransaction[];
  candidates?: CandidateOption[];
  permissions?: { canRecord?: boolean };
  totals?: { totalReceived: number; candidateDeposits: number; invoicePayments: number; otherIncome: number };
  error?: string;
};

const methods = ["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"];
const typeLabel: Record<ReceiptType, string> = { candidate_deposit: "Candidate deposit", other_income: "Other income", invoice_payment: "Invoice payment" };
const typeColor: Record<ReceiptType, string> = { candidate_deposit: "#2878a8", other_income: "#b7791f", invoice_payment: "#17845b" };
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const money = (amount: number) => `UGX ${amount.toLocaleString("en-UG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function Payments({ onOpenInvoices }: { onOpenInvoices: () => void }) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [canRecord, setCanRecord] = useState(false);
  const [totals, setTotals] = useState({ totalReceived: 0, candidateDeposits: 0, invoicePayments: 0, otherIncome: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [entryType, setEntryType] = useState<"candidate_deposit" | "other_income">("candidate_deposit");
  const [candidateId, setCandidateId] = useState("");
  const [otherSource, setOtherSource] = useState("");
  const [category, setCategory] = useState("Candidate deposit");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedAt, setReceivedAt] = useState(localDate);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/payments", { cache: "no-store" });
        const payload = await response.json() as LedgerPayload;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load receipts.");
        if (cancelled) return;
        setTransactions(payload.transactions ?? []);
        setCandidates(payload.candidates ?? []);
        setCanRecord(Boolean(payload.permissions?.canRecord));
        setTotals(payload.totals ?? { totalReceived: 0, candidateDeposits: 0, invoicePayments: 0, otherIncome: 0 });
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load receipts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return transactions;
    return transactions.filter((transaction) => `${transaction.reference} ${transaction.receivedFrom} ${transaction.category} ${transaction.externalReference} ${transaction.invoiceNumber ?? ""} ${transaction.notes}`.toLocaleLowerCase().includes(query));
  }, [search, transactions]);

  const resetForm = () => {
    setEntryType("candidate_deposit");
    setCandidateId("");
    setOtherSource("");
    setCategory("Candidate deposit");
    setAmount("");
    setPaymentMethod("Cash");
    setExternalReference("");
    setNotes("");
    setReceivedAt(localDate());
  };

  const recordReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryType, candidateId, otherSource, category, amount, paymentMethod, externalReference, notes, receivedAt }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to record this receipt.");
      setShowAdd(false);
      resetForm();
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to record this receipt.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="payments-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div><h1 id="payments-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Payments &amp; Deposits</h1><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Candidate deposits, other income, and invoice receipts</p></div>
        <button type="button" onClick={() => { resetForm(); setError(""); setShowAdd(true); }} disabled={!canRecord || loading} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Record receipt</button>
      </header>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Total received", value: totals.totalReceived, color: "var(--foreground)" },
          { label: "Candidate deposits", value: totals.candidateDeposits, color: "#2878a8" },
          { label: "Invoice receipts", value: totals.invoicePayments, color: "#17845b" },
          { label: "Other income", value: totals.otherIncome, color: "#b7791f" },
        ].map((metric) => <div key={metric.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="mono text-lg font-700" style={{ color: metric.color }}>{loading ? "—" : money(metric.value)}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search receipts" placeholder="Search receipt, candidate, source, or invoice" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filteredTransactions.length} receipts</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-240 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Received", "Receipt", "Received from", "Type", "Category", "Method", "Amount", "Reference", "Invoice", "Notes"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading receipt history…</td></tr>}
              {!loading && !error && filteredTransactions.length === 0 && <tr><td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{transactions.length ? "No receipts match this search." : "No receipts recorded yet."}</td></tr>}
              {!loading && filteredTransactions.map((transaction) => <tr key={transaction.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(transaction.receivedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: "var(--primary)" }}>{transaction.reference}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{transaction.receivedFrom}</td>
                <td className="whitespace-nowrap px-3 py-3"><span className="px-2 py-1 text-xs font-600" style={{ color: typeColor[transaction.entryType], background: `${typeColor[transaction.entryType]}1a` }}>{typeLabel[transaction.entryType]}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{transaction.category}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{transaction.paymentMethod}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: "#17845b" }}>{money(transaction.amount)}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{transaction.externalReference || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{transaction.invoiceNumber ? <button type="button" onClick={onOpenInvoices} className="inline-flex items-center gap-1 text-xs font-600 underline underline-offset-2" style={{ color: "var(--primary)" }}>{transaction.invoiceNumber}<ArrowUpRight size={12} aria-hidden="true" /></button> : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>}</td>
                <td className="max-w-56 truncate px-3 py-3 text-xs" title={transaction.notes} style={{ color: "var(--muted-foreground)" }}>{transaction.notes || "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowAdd(false); resetForm(); } }}>
        <form onSubmit={recordReceipt} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Record receipt</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Invoice payments are recorded from Invoices.</p></div><button type="button" onClick={() => { setShowAdd(false); resetForm(); }} aria-label="Close receipt form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="space-y-4">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Receipt type<select value={entryType} onChange={(event) => { const nextType = event.target.value as "candidate_deposit" | "other_income"; setEntryType(nextType); setCategory(nextType === "candidate_deposit" ? "Candidate deposit" : "Other income"); }} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option value="candidate_deposit">Candidate deposit</option><option value="other_income">Other income</option></select></label>
            {entryType === "candidate_deposit" ? <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Candidate<select required value={candidateId} onChange={(event) => setCandidateId(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option value="">Select registered candidate</option>{candidates.map((candidate) => <option key={candidate.candidate_id} value={candidate.candidate_id}>{candidate.candidate_name} · {candidate.file_number}</option>)}</select></label> : <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Income source<input required maxLength={200} value={otherSource} onChange={(event) => setOtherSource(event.target.value)} placeholder="e.g. Training service" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>}
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Category<input required maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Registration fee" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Amount (UGX)<input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Received date<input required type="date" max={localDate()} value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>External reference<input maxLength={200} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Optional bank or receipt reference" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Notes<textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving || (entryType === "candidate_deposit" && !candidateId)} className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save receipt"}</button><button type="button" onClick={() => { setShowAdd(false); resetForm(); }} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}
