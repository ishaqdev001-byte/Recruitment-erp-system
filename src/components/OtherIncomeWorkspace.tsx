"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";
import { SearchableSelect } from "./SearchableSelect";

type IncomeKind = "medical" | "other";
type IncomeAccount = { id: string; name: string; status: string };
type IncomeType = {
  id: string;
  name: string;
  income_kind: IncomeKind;
  fee: number;
  account_id: string;
  account_name: string;
  is_default: boolean;
  is_active: boolean;
};
type IncomePayload = {
  incomeTypes?: IncomeType[];
  accounts?: IncomeAccount[];
  permissions?: { canManageTypes?: boolean };
  error?: string;
};
type Section = "accounts" | "other-income";

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const inputClass = "mt-1 w-full border px-3 py-2 text-sm outline-none";
const money = (amount: number) => `UGX ${Number(amount || 0).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function OtherIncomeWorkspace({ onNavigate }: { onNavigate: (section: Section) => void }) {
  const [incomeTypes, setIncomeTypes] = useState<IncomeType[]>([]);
  const [accounts, setAccounts] = useState<IncomeAccount[]>([]);
  const [canManageTypes, setCanManageTypes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingType, setEditingType] = useState<IncomeType | null>(null);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [typeForm, setTypeForm] = useState({ name: "", incomeKind: "medical" as IncomeKind, fee: "", accountId: "" });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/finance/other-income", { cache: "no-store" });
      const result = await response.json() as IncomePayload;
      if (!response.ok) throw new Error(result.error ?? "Unable to load income sources.");
      setIncomeTypes(result.incomeTypes ?? []);
      setAccounts(result.accounts ?? []);
      setCanManageTypes(Boolean(result.permissions?.canManageTypes));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load income sources.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const activeAccounts = accounts.filter((account) => account.status === "active");
  const accountOptions = activeAccounts.map((account) => ({ value: account.id, label: account.name }));

  const openTypeForm = (incomeType?: IncomeType) => {
    setEditingType(incomeType ?? null);
    setTypeForm(incomeType
      ? { name: incomeType.name, incomeKind: incomeType.income_kind, fee: String(incomeType.fee), accountId: incomeType.account_id }
      : { name: "", incomeKind: "medical", fee: "", accountId: "" });
    setError("");
    setShowTypeForm(true);
  };

  const saveType = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/finance/other-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: editingType ? "update-income-type" : "create-income-type",
          ...(editingType ? { incomeTypeId: editingType.id } : {}),
          ...typeForm,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save this income source.");
      setShowTypeForm(false);
      setNotice("Income source saved.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this income source.");
    } finally {
      setSaving(false);
    }
  };

  const labelClass = "block text-xs font-700 uppercase tracking-wider";

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="other-income-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 id="other-income-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Accounts &amp; Other Income</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Manage non-candidate income sources and their receiving accounts</p>
        </div>
        <nav className="inline-flex border" aria-label="Finance pages" style={{ borderColor: "var(--border)" }}>
          <button type="button" onClick={() => onNavigate("accounts")} className="px-3 py-2 text-xs font-600" style={{ background: "var(--card)", color: "var(--muted-foreground)" }}>Accounts</button>
          <button type="button" aria-current="page" className="px-3 py-2 text-xs font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Other Income</button>
        </nav>
      </header>

      {error && <p role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>}
      {notice && <p role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-700" style={{ color: "var(--foreground)" }}>Income sources</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Each source has a candidate fee and a receiving account.</p>
          </div>
          <button
            type="button"
            disabled={!canManageTypes || !activeAccounts.length}
            onClick={() => openTypeForm()}
            className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-600 disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            <Plus size={15} aria-hidden="true" />
            Add income source
          </button>
        </div>
        {!activeAccounts.length && !loading && (
          <p className="mb-3 border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            Create an active account before configuring income sources.
          </p>
        )}
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-180 text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                {["Income source", "Category", "Candidate fee", "Receiving account", "Status", ""].map((heading) => (
                  <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading income sources…</td></tr>}
              {!loading && incomeTypes.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No income sources configured.</td></tr>}
              {!loading && incomeTypes.map((type) => (
                <tr key={type.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-3 font-600" style={{ color: "var(--foreground)" }}>
                    {type.name}
                    {type.is_default && <span className="ml-2 text-[10px] font-500" style={{ color: "var(--muted-foreground)" }}>Default</span>}
                  </td>
                  <td className="px-3 py-3 capitalize" style={{ color: "var(--foreground)" }}>{type.income_kind}</td>
                  <td className="px-3 py-3 mono" style={{ color: type.fee > 0 ? "var(--foreground)" : "#b7791f" }}>{type.fee > 0 ? money(type.fee) : "Set fee"}</td>
                  <td className="px-3 py-3" style={{ color: "var(--foreground)" }}>{type.account_name}</td>
                  <td className="px-3 py-3 text-xs" style={{ color: type.is_active ? "#17845b" : "var(--muted-foreground)" }}>{type.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      disabled={!canManageTypes}
                      onClick={() => openTypeForm(type)}
                      aria-label={`Configure ${type.name}`}
                      className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50"
                      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                    >
                      <Pencil size={13} aria-hidden="true" />
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showTypeForm && (
        <IncomeTypeModal
          title={editingType ? "Configure income source" : "Add income source"}
          saving={saving}
          labelClass={labelClass}
          form={typeForm}
          accounts={accountOptions}
          onChange={setTypeForm}
          onCancel={() => setShowTypeForm(false)}
          onSubmit={saveType}
        />
      )}
    </section>
  );
}

function IncomeTypeModal({ title, saving, labelClass, form, accounts, onChange, onCancel, onSubmit }: {
  title: string;
  saving: boolean;
  labelClass: string;
  form: { name: string; incomeKind: IncomeKind; fee: string; accountId: string };
  accounts: { value: string; label: string }[];
  onChange: (value: typeof form) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
          Income source name
          <input required maxLength={160} value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} className={inputClass} style={fieldStyle} />
        </label>
        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
          Category
          <select value={form.incomeKind} onChange={(e) => onChange({ ...form, incomeKind: e.target.value as IncomeKind })} className={inputClass} style={fieldStyle}>
            <option value="medical">Medical</option>
            <option value="other">Other income</option>
          </select>
        </label>
        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
          Fee chargeable to candidate
          <input required min="0" step="0.01" type="number" value={form.fee} onChange={(e) => onChange({ ...form, fee: e.target.value })} className={inputClass} style={fieldStyle} />
          <span className="mt-1 block font-400 normal-case tracking-normal" style={{ color: "var(--muted-foreground)" }}>Set a positive fee before booking an appointment for a medical service.</span>
        </label>
        <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>
          Receiving account
          <SearchableSelect required ariaLabel="Choose income account" value={form.accountId} onChange={(accountId) => onChange({ ...form, accountId })} options={accounts} placeholder="Search active accounts" className="mt-1 normal-case tracking-normal" />
        </label>
        <FormActions saving={saving} onCancel={onCancel} label="Save income source" />
      </form>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="mb-5 text-lg font-700" style={{ color: "var(--foreground)" }}>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function FormActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" disabled={saving} onClick={onCancel} className="border px-4 py-2.5 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
      <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : label}</button>
    </div>
  );
}
