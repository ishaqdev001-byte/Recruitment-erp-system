import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, CircleDollarSign, FileSpreadsheet, FileText, Plus, Search, Trash2, X } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";
import { matchesSearch } from "@/lib/search";

type ReceiptType = "candidate_deposit" | "other_income" | "invoice_payment" | "company_expense";
type CandidateOption = { candidate_id: string; file_number: string; candidate_name: string; account_id: string | null };
type AccountOption = { id: string; name: string; account_type: string; account_number: string };
type ProjectOption = { id: string; name: string };
type ExpenseCategoryOption = { id: string; name: string };
type PaymentTransaction = {
  id: string;
  recordId: string;
  recordType: "receipt" | "invoice_payment" | "company_expense";
  reference: string;
  entryType: ReceiptType;
  direction: "credit" | "debit";
  category: string;
  receivedFrom: string;
  candidateId: string | null;
  accountId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  projectId: string | null;
  projectName: string | null;
  amount: number;
  paymentMethod: string;
  externalReference: string;
  notes: string;
  receivedAt: string;
};
type LedgerPayload = {
  transactions?: PaymentTransaction[];
  projects?: ProjectOption[];
  candidates?: CandidateOption[];
  accounts?: AccountOption[];
  permissions?: { canRecord?: boolean; canDelete?: boolean };
  totals?: { totalReceived: number; totalCashOut: number; candidateDeposits: number; invoicePayments: number; otherIncome: number };
  error?: string;
};

const methods = ["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"];
const typeLabel: Record<ReceiptType, string> = { candidate_deposit: "Candidate deposit", other_income: "Other income", invoice_payment: "Invoice payment", company_expense: "Cash-out" };
const typeColor: Record<ReceiptType, string> = { candidate_deposit: "#2878a8", other_income: "#b7791f", invoice_payment: "#17845b", company_expense: "#c2413b" };
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const money = (amount: number) => `UGX ${amount.toLocaleString("en-UG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const newExpenseReference = () => `EXP-${Date.now().toString(36).toUpperCase()}`;

export default function Payments({ onOpenInvoices }: { onOpenInvoices: () => void }) {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [candidates, setCandidates] = useState<CandidateOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryOption[]>([]);
  const [expenseCategoriesEnabled, setExpenseCategoriesEnabled] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [totals, setTotals] = useState({ totalReceived: 0, totalCashOut: 0, candidateDeposits: 0, invoicePayments: 0, otherIncome: 0 });
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [entryType, setEntryType] = useState<"candidate_deposit" | "other_income">("candidate_deposit");
  const [candidateId, setCandidateId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [otherSource, setOtherSource] = useState("");
  const [category, setCategory] = useState("Candidate deposit");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [externalReference, setExternalReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receivedAt, setReceivedAt] = useState(localDate);
  const [expenseForm, setExpenseForm] = useState({
    accountId: "",
    expenseCategoryId: "",
    itemName: "",
    paidTo: "",
    description: "",
    amount: "",
    paymentMethod: "Cash",
    reference: newExpenseReference(),
    paidAt: localDate(),
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [response, accountsResponse, categoriesResponse] = await Promise.all([
          fetch("/api/payments", { cache: "no-store" }),
          fetch("/api/finance/accounts?options=1", { cache: "no-store" }),
          fetch("/api/settings/expense-categories", { cache: "no-store" }),
        ]);
        const [payload, accountsPayload, categoriesPayload] = await Promise.all([
          response.json() as Promise<LedgerPayload>,
          accountsResponse.json() as Promise<{ accounts?: AccountOption[]; error?: string }>,
          categoriesResponse.json() as Promise<{ categories?: ExpenseCategoryOption[]; enabled?: boolean; error?: string }>,
        ]);
        if (!response.ok) throw new Error(payload.error ?? "Unable to load receipts.");
        if (!accountsResponse.ok) throw new Error(accountsPayload.error ?? "Unable to load company accounts.");
        if (!categoriesResponse.ok) throw new Error(categoriesPayload.error ?? "Unable to load expense categories.");
        if (cancelled) return;
        setTransactions(payload.transactions ?? []);
        setProjects(payload.projects ?? []);
        setCandidates(payload.candidates ?? []);
        setAccounts(accountsPayload.accounts ?? []);
        setExpenseCategories(categoriesPayload.categories ?? []);
        setExpenseCategoriesEnabled(Boolean(categoriesPayload.enabled));
        setCanRecord(Boolean(payload.permissions?.canRecord));
        setCanDelete(Boolean(payload.permissions?.canDelete));
        setTotals(payload.totals ?? { totalReceived: 0, totalCashOut: 0, candidateDeposits: 0, invoicePayments: 0, otherIncome: 0 });
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
    return transactions.filter((transaction) =>
      (projectFilter === "all" || transaction.projectId === projectFilter)
      && matchesSearch(search, transaction.reference, transaction.receivedFrom, transaction.category, transaction.externalReference, transaction.invoiceNumber, transaction.projectName, transaction.notes));
  }, [projectFilter, search, transactions]);

  const exportPayments = async (format: "pdf" | "excel") => {
    setExporting(format);
    setError("");
    try {
      const query = new URLSearchParams({ format, projectId: projectFilter });
      const response = await fetch(`/api/payments/export?${query.toString()}`);
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        throw new Error(payload.error ?? "Unable to export payments.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `payments-${projectFilter === "all" ? "all-projects" : projects.find((project) => project.id === projectFilter)?.name.replace(/[^a-z0-9-]+/gi, "-") ?? "project"}.${format === "excel" ? "xlsx" : "pdf"}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export payments.");
    } finally {
      setExporting(null);
    }
  };

  const resetForm = () => {
    setEntryType("candidate_deposit");
    setCandidateId("");
    setAccountId("");
    setOtherSource("");
    setCategory("Candidate deposit");
    setAmount("");
    setPaymentMethod("Cash");
    setExternalReference("");
    setNotes("");
    setReceivedAt(localDate());
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      accountId: "",
      expenseCategoryId: "",
      itemName: "",
      paidTo: "",
      description: "",
      amount: "",
      paymentMethod: "Cash",
      reference: newExpenseReference(),
      paidAt: localDate(),
    });
  };

  const openExpenseForm = () => {
    resetExpenseForm();
    setError("");
    setShowExpense(true);
  };

  const recordReceipt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryType, candidateId, accountId, otherSource, category, amount, paymentMethod, externalReference, notes, receivedAt }),
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

  const recordExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record-expense", ...expenseForm }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to record this expense.");
      setShowExpense(false);
      resetExpenseForm();
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to record this expense.");
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (transaction: PaymentTransaction) => {
    const balanceEffect = transaction.direction === "debit"
      ? "This reverses the cash-out and restores the amount to its account."
      : "This removes the amount from the account it was received into.";
    if (!window.confirm(`Delete ${typeLabel[transaction.entryType].toLowerCase()} ${transaction.reference}? ${balanceEffect}`)) return;

    setDeletingId(transaction.id);
    setError("");
    try {
      const response = await fetch("/api/payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordType: transaction.recordType, recordId: transaction.recordId }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to delete this finance transaction.");
      setReloadKey((key) => key + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete this finance transaction.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="payments-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div><h1 id="payments-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Payments &amp; Deposits</h1><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Candidate deposits, other income, invoice receipts, and company cash-outs. Manage provider invoices in Invoices.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openExpenseForm} disabled={!canRecord || loading || accounts.length === 0} className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={16} aria-hidden="true" />Record expense</button>
          <button type="button" onClick={() => { resetForm(); setError(""); setShowAdd(true); }} disabled={!canRecord || loading} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Record receipt</button>
        </div>
      </header>

      <div className="grid grid-cols-2 border-b sm:grid-cols-5" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Total received", value: totals.totalReceived, color: "var(--foreground)" },
          { label: "Total cash-out", value: totals.totalCashOut, color: "#c2413b" },
          { label: "Candidate deposits", value: totals.candidateDeposits, color: "#2878a8" },
          { label: "Invoice receipts", value: totals.invoicePayments, color: "#17845b" },
          { label: "Other income", value: totals.otherIncome, color: "#b7791f" },
        ].map((metric) => <div key={metric.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="mono text-lg font-700" style={{ color: metric.color }}>{loading ? "—" : money(metric.value)}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex w-full max-w-md items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search transactions" placeholder="Search transaction, candidate, source, or invoice" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
          <label className="sr-only" htmlFor="payments-project-filter">Filter by project</label>
          <select id="payments-project-filter" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="border px-3 py-2 text-sm outline-none" style={fieldStyle}>
            <option value="all">All projects</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button type="button" onClick={() => void exportPayments("pdf")} disabled={Boolean(exporting) || loading} className="inline-flex items-center gap-2 border px-3 py-2 text-xs font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><FileText size={14} aria-hidden="true" />{exporting === "pdf" ? "Preparing PDF…" : "PDF"}</button>
          <button type="button" onClick={() => void exportPayments("excel")} disabled={Boolean(exporting) || loading} className="inline-flex items-center gap-2 border px-3 py-2 text-xs font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><FileSpreadsheet size={14} aria-hidden="true" />{exporting === "excel" ? "Preparing Excel…" : "Excel"}</button>
        </div>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filteredTransactions.length} transactions</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="finance-table-scroll border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-240 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Date", "Transaction", "Project", "Received from / Paid to", "Type", "Category", "Account", "Method", "Amount", "Reference", "Invoice", "Notes", ...(canDelete ? ["Actions"] : [])].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={canDelete ? 13 : 12} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading transaction history…</td></tr>}
              {!loading && !error && filteredTransactions.length === 0 && <tr><td colSpan={canDelete ? 13 : 12} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{transactions.length ? "No transactions match these filters." : "No payments, deposits, or cash-outs recorded yet."}</td></tr>}
              {!loading && filteredTransactions.map((transaction) => <tr key={transaction.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(transaction.receivedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: "var(--primary)" }}>{transaction.reference}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{transaction.projectName || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{transaction.receivedFrom}</td>
                <td className="whitespace-nowrap px-3 py-3"><span className="px-2 py-1 text-xs font-600" style={{ color: typeColor[transaction.entryType], background: `${typeColor[transaction.entryType]}1a` }}>{typeLabel[transaction.entryType]}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{transaction.category}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{accounts.find((account) => account.id === transaction.accountId)?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{transaction.paymentMethod}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: transaction.direction === "debit" ? "#c2413b" : "#17845b" }}>{transaction.direction === "debit" ? "-" : "+"}{money(transaction.amount)}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{transaction.externalReference || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3">{transaction.invoiceNumber ? transaction.entryType === "invoice_payment" ? <button type="button" onClick={onOpenInvoices} className="inline-flex items-center gap-1 text-xs font-600 underline underline-offset-2" style={{ color: "var(--primary)" }}>{transaction.invoiceNumber}<ArrowUpRight size={12} aria-hidden="true" /></button> : <span className="text-xs mono" style={{ color: "var(--foreground)" }}>{transaction.invoiceNumber}</span> : <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>}</td>
                <td className="max-w-56 truncate px-3 py-3 text-xs" title={transaction.notes} style={{ color: "var(--muted-foreground)" }}>{transaction.notes || "—"}</td>
                {canDelete && <td className="whitespace-nowrap px-3 py-3"><button type="button" onClick={() => void deleteTransaction(transaction)} disabled={Boolean(deletingId)} aria-label={`Delete transaction ${transaction.reference}`} className="inline-flex items-center gap-1 border px-2 py-1 text-xs font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "#c2413b" }}><Trash2 size={13} aria-hidden="true" />{deletingId === transaction.id ? "Deleting…" : "Delete"}</button></td>}
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
            {entryType === "candidate_deposit" ? <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Candidate<SearchableSelect required ariaLabel="Search registered candidate" value={candidateId} onChange={(nextCandidateId) => { setCandidateId(nextCandidateId); setAccountId(candidates.find((candidate) => candidate.candidate_id === nextCandidateId)?.account_id ?? ""); }} options={candidates.map((candidate) => ({ value: candidate.candidate_id, label: candidate.candidate_name, description: candidate.file_number, searchText: candidate.file_number }))} placeholder="Type a candidate name or file number" className="mt-1 normal-case tracking-normal" /></label> : <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Income source<input required maxLength={200} value={otherSource} onChange={(event) => setOtherSource(event.target.value)} placeholder="e.g. Training service" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>}
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Category<input required maxLength={100} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Registration fee" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Account<SearchableSelect required disabled={entryType === "candidate_deposit" && Boolean(candidates.find((candidate) => candidate.candidate_id === candidateId)?.account_id)} ariaLabel="Choose account for receipt" value={accountId} onChange={setAccountId} options={accounts.map((account) => ({ value: account.id, label: account.name, description: account.account_type.replace(/_/g, " "), searchText: account.account_number }))} placeholder="Select the account receiving this money" className="mt-1 normal-case tracking-normal" /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Amount (UGX)<input required min="0.01" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Received date<input required type="date" max={localDate()} value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>External reference<input maxLength={200} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="Optional bank or receipt reference" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Notes<textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving || !accountId || (entryType === "candidate_deposit" && !candidateId)} className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save receipt"}</button><button type="button" onClick={() => { setShowAdd(false); resetForm(); }} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
      {showExpense && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowExpense(false); resetExpenseForm(); } }}>
        <form onSubmit={recordExpense} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Record expense</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Record a cash-out and deduct it from the selected account.</p></div><button type="button" onClick={() => { setShowExpense(false); resetExpenseForm(); }} aria-label="Close expense form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="space-y-4">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>What are you paying for?<input required maxLength={500} value={expenseForm.itemName} onChange={(event) => setExpenseForm((current) => ({ ...current, itemName: event.target.value }))} placeholder="e.g. Visa service charge" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Service provider<input required maxLength={200} value={expenseForm.paidTo} onChange={(event) => setExpenseForm((current) => ({ ...current, paidTo: event.target.value }))} placeholder="Contractor or partner being paid" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Description<textarea required rows={2} maxLength={500} value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} placeholder="Add details about this payment" className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            {expenseCategoriesEnabled && <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Expense category<select required value={expenseForm.expenseCategoryId} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseCategoryId: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}><option value="">Select a category</option>{expenseCategories.filter((expenseCategory) => expenseCategory.id).map((expenseCategory) => <option key={expenseCategory.id} value={expenseCategory.id}>{expenseCategory.name}</option>)}</select></label>}
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Account to deduct from<SearchableSelect required ariaLabel="Choose account to deduct the expense from" value={expenseForm.accountId} onChange={(accountId) => setExpenseForm((current) => ({ ...current, accountId }))} options={accounts.map((account) => ({ value: account.id, label: account.name, description: account.account_type.replace(/_/g, " "), searchText: account.account_number }))} placeholder="Select the company account" className="mt-1 normal-case tracking-normal" /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Amount (UGX)<input required min="0.01" step="0.01" type="number" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment method<select value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Paid date<input required type="date" value={expenseForm.paidAt} onChange={(event) => setExpenseForm((current) => ({ ...current, paidAt: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Reference<input required maxLength={100} value={expenseForm.reference} onChange={(event) => setExpenseForm((current) => ({ ...current, reference: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving || !expenseForm.accountId || (expenseCategoriesEnabled && !expenseForm.expenseCategoryId)} className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Record expense"}</button><button type="button" onClick={() => { setShowExpense(false); resetExpenseForm(); }} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}
