"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Search, WalletCards } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";
import OtherIncomeWorkspace from "./OtherIncomeWorkspace";

type AccountType = "cash" | "bank" | "mobile_money" | "project" | "other";
type Account = { id: string; name: string; account_type: AccountType; account_number: string; description: string; status: string; balance: number };
type AccountTransaction = { id: string; account_id: string; account_name: string; transaction_type: string; direction: "credit" | "debit"; amount: number; transaction_date: string; payment_method: string; reference: string; description: string };
type Expense = { id: string; account_id: string; account_name: string; expense_type: string; description: string; paid_to: string; amount: number; payment_method: string; reference: string; paid_at: string };
type AccountsPayload = { accounts?: Account[]; transactions?: AccountTransaction[]; expenses?: Expense[]; totals?: { accountCount: number; totalBalance: number }; permissions?: { canCreate: boolean; canManageAccounts: boolean; canAdministerAccounts: boolean }; error?: string };
type AccountAction = "deposit" | "withdrawal" | "expense" | null;
type AccountsSection = "accounts" | "other-income" | "payment-info";

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const methods = ["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"];
const accountTypeLabel: Record<AccountType, string> = { cash: "Cash", bank: "Bank", mobile_money: "Mobile money", project: "Project", other: "Other" };
const today = () => new Date().toISOString().slice(0, 10);
const money = (amount: number) => `UGX ${Number(amount || 0).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const newReference = (kind: string) => `${kind}-${Date.now().toString(36).toUpperCase()}`;

export default function AccountsWorkspace() {
  const [activeSection, setActiveSection] = useState<AccountsSection>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canManageAccounts, setCanManageAccounts] = useState(false);
  const [canAdministerAccounts, setCanAdministerAccounts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountAction, setAccountAction] = useState<AccountAction>(null);
  const [accountForm, setAccountForm] = useState({ name: "", accountType: "cash" as AccountType, accountNumber: "", description: "", openingBalance: "0", openingDate: today() });
  const [movementForm, setMovementForm] = useState({ accountId: "", amount: "", paymentMethod: "Cash", reference: "", description: "", transactionDate: today() });
  const [expenseForm, setExpenseForm] = useState({ accountId: "", expenseType: "Operating", description: "", paidTo: "", amount: "", paymentMethod: "Cash", reference: "", paidAt: today() });
  const [renameAccount, setRenameAccount] = useState<{ id: string; name: string } | null>(null);

  const loadAccounts = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/finance/accounts", { cache: "no-store" });
      const result = await response.json() as AccountsPayload;
      if (!response.ok) throw new Error(result.error ?? "Unable to load accounts.");
      setAccounts(result.accounts ?? []);
      setTransactions(result.transactions ?? []);
      setExpenses(result.expenses ?? []);
      setCanCreate(Boolean(result.permissions?.canCreate));
      setCanManageAccounts(Boolean(result.permissions?.canManageAccounts));
      setCanAdministerAccounts(Boolean(result.permissions?.canAdministerAccounts));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAccounts(); }, []);

  const activeAccounts = accounts.filter((account) => account.status === "active");
  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return transactions;
    return transactions.filter((item) => `${item.account_name} ${item.transaction_type} ${item.reference} ${item.description} ${item.payment_method}`.toLocaleLowerCase().includes(query));
  }, [search, transactions]);
  const accountOptions = activeAccounts.map((account) => ({ value: account.id, label: account.name, description: `${accountTypeLabel[account.account_type]} · ${money(account.balance)}`, searchText: account.account_number }));

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-account", ...accountForm }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to create account.");
      setShowAccountForm(false);
      setAccountForm({ name: "", accountType: "cash", accountNumber: "", description: "", openingBalance: "0", openingDate: today() });
      setNotice("Account created.");
      await loadAccounts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to create account.");
    } finally {
      setSaving(false);
    }
  };

  const openMovement = (type: "deposit" | "withdrawal") => {
    setMovementForm({ accountId: "", amount: "", paymentMethod: type === "deposit" ? "Cash" : "Bank transfer", reference: newReference(type === "deposit" ? "DEP" : "WDR"), description: "", transactionDate: today() });
    setAccountAction(type);
    setError("");
  };

  const openExpense = () => {
    setExpenseForm({ accountId: "", expenseType: "Operating", description: "", paidTo: "", amount: "", paymentMethod: "Cash", reference: newReference("EXP"), paidAt: today() });
    setAccountAction("expense");
    setError("");
  };

  const saveAccountAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountAction) return;
    setSaving(true);
    setError("");
    try {
      const isExpense = accountAction === "expense";
      const body = isExpense
        ? { action: "record-expense", ...expenseForm }
        : { action: "record-movement", movementType: accountAction, ...movementForm };
      const response = await fetch("/api/finance/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save this transaction.");
      setAccountAction(null);
      setNotice(isExpense ? "Expense recorded against the selected account." : `${accountAction === "deposit" ? "Deposit" : "Withdrawal"} recorded.`);
      await loadAccounts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this transaction.");
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameAccount) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-account", accountId: renameAccount.id, name: renameAccount.name }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to rename account.");
      setRenameAccount(null);
      setNotice("Account renamed.");
      await loadAccounts();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Unable to rename account.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (accountId: string) => {
    if (!window.confirm("Delete this account? It must have a zero balance and no recorded activity.")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-account", accountId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to delete account.");
      setNotice("Account deleted.");
      await loadAccounts();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete account.");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none";
  const labelClass = "block text-xs font-700 uppercase tracking-wider";

  if (activeSection === "other-income") {
    return <OtherIncomeWorkspace onNavigate={setActiveSection} />;
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="accounts-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div><h1 id="accounts-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Accounts &amp; Other Income</h1><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Company books, balances, deposits, withdrawals, and expenses</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="inline-flex border" aria-label="Finance pages" style={{ borderColor: "var(--border)" }}><button type="button" aria-current="page" className="px-3 py-2 text-xs font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Accounts</button><button type="button" onClick={() => setActiveSection("other-income")} className="px-3 py-2 text-xs font-600" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>Other Income</button></nav>
          <button type="button" disabled={!canManageAccounts} onClick={() => { setError(""); setShowAccountForm(true); }} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={15} aria-hidden="true" />New account</button>
          <button type="button" disabled={!canCreate || !activeAccounts.length} onClick={() => openMovement("deposit")} className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "#17845b", color: "white" }}><ArrowDownLeft size={15} aria-hidden="true" />Deposit</button>
          <button type="button" disabled={!canCreate || !activeAccounts.length} onClick={() => openMovement("withdrawal")} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><ArrowUpRight size={15} aria-hidden="true" />Withdraw</button>
          <button type="button" disabled={!canCreate || !activeAccounts.length} onClick={openExpense} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={15} aria-hidden="true" />Record expense</button>
        </div>
      </header>

      <div className="grid grid-cols-1 border-b sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
        {[{ label: "Active accounts", value: String(activeAccounts.length), color: "var(--primary)" }, { label: "Total account balance", value: money(accounts.reduce((sum, account) => sum + account.balance, 0)), color: "#17845b" }, { label: "Recorded expenses", value: String(expenses.length), color: "#c2413a" }].map((item) => <div key={item.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="mono text-lg font-700" style={{ color: item.color }}>{loading ? "—" : item.value}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{item.label}</div></div>)}
      </div>

      {error && <div role="alert" className="mx-6 mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}</div>}
      <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>Company accounts</h2><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{accounts.length} total</span></div>
          {!accounts.length && !loading ? <div className="border px-4 py-10 text-center" style={{ borderColor: "var(--border)", background: "var(--card)" }}><WalletCards size={22} className="mx-auto" style={{ color: "var(--muted-foreground)" }} /><p className="mt-3 text-sm font-600" style={{ color: "var(--foreground)" }}>No accounts configured</p><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>An owner, CEO, General Manager, or Finance Manager can create the company’s first account.</p></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => <article key={account.id} className="border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{account.name}</h3><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{accountTypeLabel[account.account_type]}{account.account_number ? ` · ${account.account_number}` : ""}</p></div><span className="text-[10px] font-700 uppercase" style={{ color: account.status === "active" ? "#17845b" : "var(--muted-foreground)" }}>{account.status}</span></div><div className="mt-5 mono text-xl font-700" style={{ color: account.balance < 0 ? "#c2413a" : "var(--primary)" }}>{money(account.balance)}</div>{account.description && <p className="mt-2 line-clamp-2 text-xs" style={{ color: "var(--muted-foreground)" }}>{account.description}</p>}{canAdministerAccounts && <div className="mt-4 flex gap-2"><button type="button" onClick={() => setRenameAccount({ id: account.id, name: account.name })} className="rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Rename</button><button type="button" onClick={() => void handleDelete(account.id)} className="rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "#c2413a" }}>Delete</button></div>}</article>)}</div>}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>Account ledger</h2><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Credits increase balances; debits reduce them.</p></div><label className="flex w-full max-w-sm items-center gap-2 rounded border px-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}><Search size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search account transactions" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search account, reference, description" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label></div>
          <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}><table className="w-full min-w-225 text-sm"><thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Date", "Account", "Entry", "Description", "Method", "Reference", "Amount"].map((header) => <th key={header} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{header}</th>)}</tr></thead><tbody>
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading account ledger…</td></tr>}
            {!loading && !visibleTransactions.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{transactions.length ? "No transactions match the search." : "No account transactions recorded yet."}</td></tr>}
            {!loading && visibleTransactions.map((entry) => <tr key={entry.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}><td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(`${entry.transaction_date}T00:00:00`).toLocaleDateString("en-GB")}</td><td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{entry.account_name}</td><td className="whitespace-nowrap px-3 py-3 text-xs capitalize" style={{ color: entry.direction === "credit" ? "#17845b" : "#c2413a" }}>{entry.transaction_type.replace(/_/g, " ")}</td><td className="px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{entry.description}</td><td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.payment_method}</td><td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{entry.reference}</td><td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: entry.direction === "credit" ? "#17845b" : "#c2413a" }}>{entry.direction === "credit" ? "+" : "-"}{money(entry.amount)}</td></tr>)}
          </tbody></table></div>
        </section>
      </div>

      {showAccountForm && <Modal title="Create company account" onClose={() => !saving && setShowAccountForm(false)}>
        <form onSubmit={saveAccount} className="space-y-4">
          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Account name<input required maxLength={120} value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} className={inputClass} style={fieldStyle} placeholder="e.g. Main bank account" /></label>
          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Account type<select value={accountForm.accountType} onChange={(event) => setAccountForm((current) => ({ ...current, accountType: event.target.value as AccountType }))} className={inputClass} style={fieldStyle}>{Object.entries(accountTypeLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Account number (optional)<input maxLength={100} value={accountForm.accountNumber} onChange={(event) => setAccountForm((current) => ({ ...current, accountNumber: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Opening balance<input required min="0" step="0.01" type="number" value={accountForm.openingBalance} onChange={(event) => setAccountForm((current) => ({ ...current, openingBalance: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
          {Number(accountForm.openingBalance) > 0 && <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Opening balance date<input required type="date" value={accountForm.openingDate} onChange={(event) => setAccountForm((current) => ({ ...current, openingDate: event.target.value }))} className={inputClass} style={fieldStyle} /></label>}
          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Description<textarea maxLength={500} rows={2} value={accountForm.description} onChange={(event) => setAccountForm((current) => ({ ...current, description: event.target.value }))} className={`${inputClass} resize-y`} style={fieldStyle} /></label>
          <FormActions saving={saving} onCancel={() => setShowAccountForm(false)} label="Create account" />
        </form>
      </Modal>}

      {renameAccount && <Modal title="Rename account" onClose={() => !saving && setRenameAccount(null)}>
        <form onSubmit={handleRename} className="space-y-4">
          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Account name<input required maxLength={120} value={renameAccount.name} onChange={(event) => setRenameAccount((current) => current ? { ...current, name: event.target.value } : current)} className={inputClass} style={fieldStyle} /></label>
          <FormActions saving={saving} onCancel={() => setRenameAccount(null)} label="Save name" />
        </form>
      </Modal>}

      {accountAction && <Modal title={accountAction === "expense" ? "Record expense" : accountAction === "deposit" ? "Record deposit" : "Record withdrawal"} onClose={() => !saving && setAccountAction(null)}>
        <form onSubmit={saveAccountAction} className="space-y-4">
          {accountAction === "expense" ? <>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Expense type<input required maxLength={100} value={expenseForm.expenseType} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseType: event.target.value }))} className={inputClass} style={fieldStyle} placeholder="e.g. Rent, transport, supplies" /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Description<input required maxLength={500} value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Paid to (optional)<input maxLength={200} value={expenseForm.paidTo} onChange={(event) => setExpenseForm((current) => ({ ...current, paidTo: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Account<SearchableSelect required ariaLabel="Choose expense account" value={expenseForm.accountId} onChange={(accountId) => setExpenseForm((current) => ({ ...current, accountId }))} options={accountOptions} placeholder="Type an account name" className="mt-1 normal-case tracking-normal" /></label>
            <div className="grid grid-cols-2 gap-3"><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Amount<input required min="0.01" step="0.01" type="number" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} className={inputClass} style={fieldStyle} /></label><label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Date paid<input required type="date" max={today()} value={expenseForm.paidAt} onChange={(event) => setExpenseForm((current) => ({ ...current, paidAt: event.target.value }))} className={inputClass} style={fieldStyle} /></label></div>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Payment method<select value={expenseForm.paymentMethod} onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))} className={inputClass} style={fieldStyle}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Reference<input required maxLength={100} value={expenseForm.reference} onChange={(event) => setExpenseForm((current) => ({ ...current, reference: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
          </> : <>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Account<SearchableSelect required ariaLabel="Choose account" value={movementForm.accountId} onChange={(accountId) => setMovementForm((current) => ({ ...current, accountId }))} options={accountOptions} placeholder="Type an account name" className="mt-1 normal-case tracking-normal" /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Amount<input required min="0.01" step="0.01" type="number" value={movementForm.amount} onChange={(event) => setMovementForm((current) => ({ ...current, amount: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Payment method<select value={movementForm.paymentMethod} onChange={(event) => setMovementForm((current) => ({ ...current, paymentMethod: event.target.value }))} className={inputClass} style={fieldStyle}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Reference<input required maxLength={100} value={movementForm.reference} onChange={(event) => setMovementForm((current) => ({ ...current, reference: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Description<input required maxLength={500} value={movementForm.description} onChange={(event) => setMovementForm((current) => ({ ...current, description: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
            <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Date<input required type="date" max={today()} value={movementForm.transactionDate} onChange={(event) => setMovementForm((current) => ({ ...current, transactionDate: event.target.value }))} className={inputClass} style={fieldStyle} /></label>
          </>}
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <FormActions saving={saving} onCancel={() => setAccountAction(null)} label={accountAction === "expense" ? "Save expense" : accountAction === "deposit" ? "Save deposit" : "Save withdrawal"} />
        </form>
      </Modal>}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}><h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>{title}</h2>{children}</section></div>;
}

function FormActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return <div className="flex justify-end gap-3 pt-2"><button type="button" disabled={saving} onClick={onCancel} className="rounded border px-4 py-2.5 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={saving} className="rounded px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : label}</button></div>;
}