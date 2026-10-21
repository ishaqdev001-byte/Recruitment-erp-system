"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Edit2, Plus, Tag, ToggleLeft, ToggleRight, X } from "lucide-react";

type LeaveType = {
  id: string;
  name: string;
  days_per_year: number;
  description: string;
  is_active: boolean;
  created_at: string;
};

type LeaveTypesPayload = {
  leaveTypes: LeaveType[];
  canManageTypes: boolean;
};

type LeaveTypeForm = { name: string; daysPerYear: string; description: string };
const emptyForm = (): LeaveTypeForm => ({ name: "", daysPerYear: "", description: "" });
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

export default function LeaveTypes() {
  const [data, setData] = useState<LeaveTypesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeaveType | null>(null);
  const [form, setForm] = useState<LeaveTypeForm>(emptyForm());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/leave/types", { cache: "no-store" });
      const payload = await response.json() as LeaveTypesPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load leave types.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leave types.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setNotice("");
    setShowForm(true);
  };

  const openEdit = (lt: LeaveType) => {
    setEditing(lt);
    setForm({ name: lt.name, daysPerYear: String(lt.days_per_year), description: lt.description });
    setError("");
    setNotice("");
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setError("");
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        name: form.name.trim(),
        daysPerYear: parseInt(form.daysPerYear, 10),
        description: form.description.trim(),
      };
      let response: Response;
      if (editing) {
        response = await fetch("/api/leave/types", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
      } else {
        response = await fetch("/api/leave/types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const result = await response.json() as { leaveType?: LeaveType; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save leave type.");

      if (result.leaveType) {
        setData((current) => {
          if (!current) return current;
          const exists = current.leaveTypes.some((lt) => lt.id === result.leaveType!.id);
          const updated = exists
            ? current.leaveTypes.map((lt) => lt.id === result.leaveType!.id ? result.leaveType! : lt)
            : [...current.leaveTypes, result.leaveType!];
          return { ...current, leaveTypes: updated.sort((a, b) => a.name.localeCompare(b.name)) };
        });
      }
      setNotice(editing ? "Leave type updated." : "Leave type added.");
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save leave type.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (lt: LeaveType) => {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leave/types", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lt.id, isActive: !lt.is_active }),
      });
      const result = await response.json() as { leaveType?: LeaveType; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to update leave type.");
      if (result.leaveType) {
        setData((current) => current ? {
          ...current,
          leaveTypes: current.leaveTypes.map((item) => item.id === result.leaveType!.id ? result.leaveType! : item),
        } : current);
        setNotice(`${lt.name} ${!lt.is_active ? "activated" : "deactivated"}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update leave type.");
    }
  };

  const canManage = data?.canManageTypes ?? false;
  const leaveTypes = data?.leaveTypes ?? [];
  const active = leaveTypes.filter((lt) => lt.is_active);
  const inactive = leaveTypes.filter((lt) => !lt.is_active);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Tag size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h2 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Leave Types</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {canManage ? "Define leave categories and annual entitlements for staff." : "Annual leave entitlements for each leave category."}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus size={16} aria-hidden="true" />
            Add leave type
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && !showForm && (
        <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {notice && (
        <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>
      )}

      <div className="min-h-0 flex-1 overflow-auto p-6 space-y-6">
        {loading && (
          <p className="py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading leave types…</p>
        )}

        {!loading && leaveTypes.length === 0 && (
          <div className="py-16 text-center">
            <Tag size={36} className="mx-auto mb-3 opacity-30" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No leave types configured yet.</p>
            {canManage && <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>Click "Add leave type" to get started.</p>}
          </div>
        )}

        {!loading && active.length > 0 && (
          <section aria-label="Active leave types">
            <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Active ({active.length})</h3>
            <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full min-w-160 text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Leave type", "Days per year", "Description", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {active.map((lt) => (
                    <tr key={lt.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#10b981" }} />
                          {lt.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 mono font-600" style={{ color: "var(--primary)" }}>
                        {lt.days_per_year} <span className="text-xs font-400" style={{ color: "var(--muted-foreground)" }}>days / year</span>
                      </td>
                      <td className="max-w-80 px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <span className="block truncate" title={lt.description}>{lt.description || "—"}</span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(lt)}
                              title="Edit leave type"
                              className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                            >
                              <Edit2 size={12} aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(lt)}
                              title="Deactivate leave type"
                              className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "#b7791f" }}
                            >
                              <ToggleRight size={13} aria-hidden="true" />
                              Deactivate
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
          <section aria-label="Inactive leave types">
            <h3 className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Inactive ({inactive.length})</h3>
            <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full min-w-160 text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Leave type", "Days per year", "Description", canManage ? "Actions" : ""].filter(Boolean).map((h) => (
                      <th key={h} className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inactive.map((lt) => (
                    <tr key={lt.id} className="border-b last:border-0 opacity-60" style={{ borderColor: "var(--border)" }}>
                      <td className="whitespace-nowrap px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--muted-foreground)" }} />
                          {lt.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 mono font-600" style={{ color: "var(--muted-foreground)" }}>
                        {lt.days_per_year} <span className="text-xs font-400">days / year</span>
                      </td>
                      <td className="max-w-80 px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        <span className="block truncate" title={lt.description}>{lt.description || "—"}</span>
                      </td>
                      {canManage && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(lt)}
                              className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                            >
                              <Edit2 size={12} aria-hidden="true" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleActive(lt)}
                              title="Activate leave type"
                              className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600"
                              style={{ borderColor: "var(--border)", color: "#168358" }}
                            >
                              <ToggleLeft size={13} aria-hidden="true" />
                              Activate
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

      {/* Add / Edit modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}
        >
          <form
            onSubmit={submitForm}
            className="w-full max-w-md border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
                  {editing ? "Edit leave type" : "Add leave type"}
                </h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {editing ? "Update the name, days, or description." : "Define a new leave category for your company."}
                </p>
              </div>
              <button type="button" onClick={closeForm} aria-label="Close" className="p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
            )}

            <div className="space-y-4">
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Leave type name
                <input
                  required
                  type="text"
                  maxLength={100}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Annual Leave"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>

              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Days allocated per year
                <input
                  required
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={form.daysPerYear}
                  onChange={(e) => setForm((f) => ({ ...f, daysPerYear: e.target.value }))}
                  placeholder="e.g. 21"
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
                <span className="mt-1 block text-xs font-400 normal-case tracking-normal" style={{ color: "var(--muted-foreground)" }}>
                  This is the total number of days each staff member gets per calendar year for this leave type.
                </span>
              </label>

              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Description <span className="font-400 normal-case">(optional)</span>
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Brief description of when this leave type applies."
                  className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add leave type"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 border py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
