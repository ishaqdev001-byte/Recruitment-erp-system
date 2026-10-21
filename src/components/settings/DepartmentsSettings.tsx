"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, Edit2, Plus, ToggleLeft, ToggleRight, X } from "lucide-react";

type Department = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
};

type DeptForm = { name: string; description: string };
const emptyForm = (): DeptForm => ({ name: "", description: "" });
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

export default function DepartmentsSettings() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DeptForm>(emptyForm());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/departments", { cache: "no-store" });
      const payload = await res.json() as { departments?: Department[]; canManage?: boolean; error?: string };
      if (!res.ok) throw new Error(payload.error ?? "Unable to load departments.");
      setDepartments(payload.departments ?? []);
      setCanManage(payload.canManage ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load departments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openAdd = () => { setEditing(null); setForm(emptyForm()); setError(""); setNotice(""); setShowForm(true); };
  const openEdit = (d: Department) => { setEditing(d); setForm({ name: d.name, description: d.description }); setError(""); setNotice(""); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm()); setError(""); };

  const submitForm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = { name: form.name.trim(), description: form.description.trim() };
      const res = await fetch("/api/settings/departments", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      const result = await res.json() as { department?: Department; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to save department.");
      if (result.department) {
        setDepartments((prev) => {
          const exists = prev.some((d) => d.id === result.department!.id);
          const updated = exists
            ? prev.map((d) => d.id === result.department!.id ? result.department! : d)
            : [...prev, result.department!];
          return updated.sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      setNotice(editing ? "Department updated." : "Department added.");
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save department.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d: Department) => {
    setError(""); setNotice("");
    try {
      const res = await fetch("/api/settings/departments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, isActive: !d.is_active }),
      });
      const result = await res.json() as { department?: Department; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Unable to update department.");
      if (result.department) {
        setDepartments((prev) => prev.map((item) => item.id === result.department!.id ? result.department! : item));
        setNotice(`${d.name} ${!d.is_active ? "activated" : "deactivated"}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update department.");
    }
  };

  const active = departments.filter((d) => d.is_active);
  const inactive = departments.filter((d) => !d.is_active);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h2 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Departments</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {canManage ? "Manage company departments used in purchase requisitions." : "Company departments available for requisitions."}
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={openAdd}
            className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            <Plus size={16} aria-hidden="true" />
            Add department
          </button>
        )}
      </div>

      {error && !showForm && <div role="alert" className="mx-6 mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}

      <div className="min-h-0 flex-1 overflow-auto p-6 space-y-6">
        {loading && <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading departments…</p>}

        {!loading && departments.length === 0 && (
          <div className="py-16 text-center">
            <Building2 size={36} className="mx-auto mb-3 opacity-30" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No departments configured yet.</p>
            {canManage && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Click "Add department" to get started.</p>}
          </div>
        )}

        {!loading && active.length > 0 && (
          <section>
            <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Active ({active.length})</h3>
            <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Department", "Description", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((d) => (
                    <tr key={d.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#10b981" }} />
                          {d.name}
                        </span>
                      </td>
                      <td className="max-w-sm px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <span className="block truncate" title={d.description}>{d.description || "—"}</span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => openEdit(d)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                              <Edit2 size={12} aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => void toggleActive(d)}
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
                    {["Department", "Description", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactive.map((d) => (
                    <tr key={d.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--muted-foreground)" }} />
                          {d.name}
                        </span>
                      </td>
                      <td className="max-w-sm px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <span className="block truncate">{d.description || "—"}</span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button type="button" onClick={() => openEdit(d)}
                              className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                              <Edit2 size={12} aria-hidden="true" /> Edit
                            </button>
                            <button type="button" onClick={() => void toggleActive(d)}
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
                {editing ? "Edit Department" : "Add Department"}
              </h3>
              <button type="button" onClick={closeForm} className="rounded p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {error && <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                  Department name <span className="text-red-400">*</span>
                </label>
                <input type="text" required maxLength={100} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none"
                  style={fieldStyle} placeholder="e.g. Finance, Operations, HR" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Description</label>
                <textarea rows={3} maxLength={500} value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full rounded border px-3 py-2.5 text-sm outline-none resize-none"
                  style={fieldStyle} placeholder="Optional description" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="submit" disabled={saving}
                className="flex-1 rounded py-2.5 text-sm font-600 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                {saving ? "Saving…" : editing ? "Save Changes" : "Add Department"}
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
