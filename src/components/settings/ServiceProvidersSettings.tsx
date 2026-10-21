"use client";

import { useEffect, useState, useRef, type FormEvent } from "react";
import { Edit2, Plus, Truck, ToggleLeft, ToggleRight, X } from "lucide-react";

type ServiceProvider = {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
  created_at: string;
};

type ProviderForm = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};
const emptyForm = (): ProviderForm => ({ name: "", contactName: "", phone: "", email: "", address: "", notes: "" });
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

export default function ServiceProvidersSettings() {
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceProvider | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm());
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async (q = "") => {
    setLoading(true);
    setError("");
    try {
      const url = q ? `/api/settings/service-providers?q=${encodeURIComponent(q)}` : "/api/settings/service-providers";
      const res = await fetch(url, { cache: "no-store" });
      const payload = await res.json() as { serviceProviders?: ServiceProvider[]; canManage?: boolean; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load service providers.");
      setProviders(payload.serviceProviders ?? []);
      setCanManage(payload.canManage ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load service providers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(value), 300);
  };

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setError(""); setNotice(""); setShowForm(true); };
  const openEdit = (p: ServiceProvider) => {
    setEditing(p);
    setForm({ name: p.name, contactName: p.contact_name, phone: p.phone, email: p.email, address: p.address, notes: p.notes });
    setError(""); setNotice(""); setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm()); setError(""); };

  const submitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name: form.name.trim(),
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        notes: form.notes.trim(),
      };
      const res = await fetch("/api/settings/service-providers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const result = await res.json() as { serviceProvider?: ServiceProvider; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to save service provider.");
      if (result.serviceProvider) {
        setProviders((prev) => {
          const exists = prev.some((p) => p.id === result.serviceProvider!.id);
          const updated = exists
            ? prev.map((p) => p.id === result.serviceProvider!.id ? result.serviceProvider! : p)
            : [...prev, result.serviceProvider!];
          return updated.sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      setNotice(editing ? "Service provider updated." : "Service provider added.");
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save service provider.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: ServiceProvider) => {
    setError(""); setNotice("");
    try {
      const res = await fetch("/api/settings/service-providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, isActive: !p.is_active }),
      });
      const result = await res.json() as { serviceProvider?: ServiceProvider; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to update service provider.");
      if (result.serviceProvider) {
        setProviders((prev) => prev.map((item) => item.id === result.serviceProvider!.id ? result.serviceProvider! : item));
        setNotice(`${p.name} ${!p.is_active ? "activated" : "deactivated"}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update service provider.");
    }
  };

  const active = providers.filter((p) => p.is_active);
  const inactive = providers.filter((p) => !p.is_active);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Truck size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h2 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Service Providers</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {canManage ? "Manage vendors and service providers for purchase requisitions." : "Vendors and service providers available for requisitions."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input type="search" value={search} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search providers…"
            className="rounded border px-3 py-2 text-sm outline-none w-52"
            style={fieldStyle} />
          {canManage && (
            <button type="button" onClick={openAdd}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              <Plus size={16} aria-hidden="true" />
              Add provider
            </button>
          )}
        </div>
      </div>

      {error && !showForm && <div role="alert" className="mx-6 mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}

      <div className="min-h-0 flex-1 overflow-auto p-6 space-y-6">
        {loading && <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading service providers…</p>}

        {!loading && providers.length === 0 && (
          <div className="py-16 text-center">
            <Truck size={36} className="mx-auto mb-3 opacity-30" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {search ? "No service providers match your search." : "No service providers configured yet."}
            </p>
            {canManage && !search && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Click "Add provider" to get started.</p>}
          </div>
        )}

        {!loading && active.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Active ({active.length})</h3>
            <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Provider", "Contact", "Phone", "Email", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((p) => (
                    <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#10b981" }} />
                          {p.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.contact_name || "—"}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.email || "—"}</td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => openEdit(p)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                              <Edit2 size={12} aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => void toggleActive(p)}
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
                    {["Provider", "Contact", "Phone", "Email", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactive.map((p) => (
                    <tr key={p.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3 font-600" style={{ color: "var(--muted-foreground)" }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--muted-foreground)" }} />
                          {p.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.contact_name || "—"}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{p.email || "—"}</td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => openEdit(p)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                              <Edit2 size={12} aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => void toggleActive(p)}
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
          <form onSubmit={submitForm} className="w-full max-w-lg rounded border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-5 flex items-start justify-between">
              <h3 className="text-base font-700" style={{ color: "var(--foreground)" }}>
                {editing ? "Edit Service Provider" : "Add Service Provider"}
              </h3>
              <button type="button" onClick={closeForm} className="rounded p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {error && <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  Provider name <span className="text-red-400">*</span>
                </label>
                <input type="text" required maxLength={150} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle} placeholder="e.g. Kampala Medical Centre" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Contact person</label>
                  <input type="text" maxLength={150} value={form.contactName}
                    onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                    className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                    style={fieldStyle} placeholder="Full name" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Phone</label>
                  <input type="tel" maxLength={50} value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                    style={fieldStyle} placeholder="+256 700 000000" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Email</label>
                <input type="email" maxLength={254} value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle} placeholder="contact@provider.com" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Address</label>
                <input type="text" maxLength={500} value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle} placeholder="Physical address" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                <textarea rows={2} maxLength={1000} value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none resize-none"
                  style={fieldStyle} placeholder="Optional notes" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Provider"}
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
