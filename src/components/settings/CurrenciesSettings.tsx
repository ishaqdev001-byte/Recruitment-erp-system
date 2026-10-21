"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CircleDollarSign, Edit2, Plus, Star, ToggleLeft, ToggleRight, X } from "lucide-react";

type Currency = {
  id: string;
  code: string;
  name: string;
  symbol: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
};

type CurrencyForm = { code: string; name: string; symbol: string; isDefault: boolean };
const emptyForm = (): CurrencyForm => ({ code: "", name: "", symbol: "", isDefault: false });
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

export default function CurrenciesSettings() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Currency | null>(null);
  const [form, setForm] = useState<CurrencyForm>(emptyForm());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/currencies", { cache: "no-store" });
      const payload = await res.json() as { currencies?: Currency[]; canManage?: boolean; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load currencies.");
      setCurrencies(payload.currencies ?? []);
      setCanManage(payload.canManage ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load currencies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setError(""); setNotice(""); setShowForm(true); };
  const openEdit = (c: Currency) => {
    setEditing(c);
    setForm({ code: c.code, name: c.name, symbol: c.symbol, isDefault: c.is_default });
    setError(""); setNotice(""); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm()); setError(""); };

  const submitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = { code: form.code.trim(), name: form.name.trim(), symbol: form.symbol.trim(), isDefault: form.isDefault };
      const res = await fetch("/api/settings/currencies", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const result = await res.json() as { currency?: Currency; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to save currency.");
      if (result.currency) {
        setCurrencies((prev) => {
          let updated = prev.some((c) => c.id === result.currency!.id)
            ? prev.map((c) => c.id === result.currency!.id ? result.currency! : c)
            : [...prev, result.currency!];
          // Clear default from others if new default set
          if (result.currency!.is_default) {
            updated = updated.map((c) => c.id === result.currency!.id ? c : { ...c, is_default: false });
          }
          return updated.sort((a, b) => a.code.localeCompare(b.code));
        });
      }
      setNotice(editing ? "Currency updated." : "Currency added.");
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save currency.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Currency) => {
    setError(""); setNotice("");
    try {
      const res = await fetch("/api/settings/currencies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, isActive: !c.is_active }),
      });
      const result = await res.json() as { currency?: Currency; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to update currency.");
      if (result.currency) {
        setCurrencies((prev) => prev.map((item) => item.id === result.currency!.id ? result.currency! : item));
        setNotice(`${c.code} ${!c.is_active ? "activated" : "deactivated"}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update currency.");
    }
  };

  const active = currencies.filter((c) => c.is_active);
  const inactive = currencies.filter((c) => !c.is_active);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h2 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Currencies</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {canManage ? "Manage currencies used across requisitions and finance." : "Currencies available for requisitions."}
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={openAdd}
            className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            <Plus size={16} aria-hidden="true" />
            Add currency
          </button>
        )}
      </div>

      {error && !showForm && <div role="alert" className="mx-6 mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}

      <div className="min-h-0 flex-1 overflow-auto p-6 space-y-6">
        {loading && <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading currencies…</p>}

        {!loading && currencies.length === 0 && (
          <div className="py-16 text-center">
            <CircleDollarSign size={36} className="mx-auto mb-3 opacity-30" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No currencies configured yet.</p>
            {canManage && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Click "Add currency" to get started.</p>}
          </div>
        )}

        {!loading && active.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Active ({active.length})</h3>
            <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Code", "Name", "Symbol", "Default", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((c) => (
                    <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#10b981" }} />
                          <span className="mono font-700" style={{ color: "var(--foreground)" }}>{c.code}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--foreground)" }}>{c.name}</td>
                      <td className="px-4 py-3 mono text-sm" style={{ color: "var(--muted-foreground)" }}>{c.symbol || "—"}</td>
                      <td className="px-4 py-3">
                        {c.is_default && (
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-600" style={{ background: "#6366f120", color: "#6366f1" }}>
                            <Star size={10} aria-hidden="true" /> Default
                          </span>
                        )}
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => openEdit(c)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                              <Edit2 size={12} aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => void toggleActive(c)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "#b7791f" }}>
                              <ToggleRight size={13} aria-hidden="true" /> Deactivate
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!loading && inactive.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Inactive ({inactive.length})</h3>
            <div className="overflow-x-auto rounded border opacity-60" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Code", "Name", "Symbol", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactive.map((c) => (
                    <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--muted-foreground)" }} />
                          <span className="mono font-700" style={{ color: "var(--muted-foreground)" }}>{c.code}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: "var(--muted-foreground)" }}>{c.name}</td>
                      <td className="px-4 py-3 mono text-sm" style={{ color: "var(--muted-foreground)" }}>{c.symbol || "—"}</td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => openEdit(c)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                              <Edit2 size={12} aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => void toggleActive(c)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "#168358" }}>
                              <ToggleLeft size={13} aria-hidden="true" /> Activate
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
          <form onSubmit={submitForm} className="w-full max-w-md rounded border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-start justify-between">
              <h3 className="text-base font-700" style={{ color: "var(--foreground)" }}>
                {editing ? "Edit Currency" : "Add Currency"}
              </h3>
              <button type="button" onClick={closeForm} className="rounded p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {error && <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Code <span className="text-red-400">*</span>
                  </label>
                  <input type="text" required maxLength={10} value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className="w-full rounded border px-3 py-2.5 text-sm mono outline-none"
                    style={fieldStyle} placeholder="UGX" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Symbol</label>
                  <input type="text" maxLength={10} value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                    className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                    style={fieldStyle} placeholder="USh" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  Name <span className="text-red-400">*</span>
                </label>
                <input type="text" required maxLength={100} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle} placeholder="Uganda Shilling" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="h-4 w-4 rounded" />
                <span className="text-sm" style={{ color: "var(--foreground)" }}>Set as default currency</span>
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Currency"}
              </button>
              <button type="button" onClick={closeForm}
                className="rounded border px-4 py-2.5 text-sm font-600"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
