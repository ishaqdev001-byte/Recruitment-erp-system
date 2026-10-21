"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Loader2, MapPin, Plus, Settings2, UserCog, Users } from "lucide-react";

type Branch = {
  id: string;
  name: string;
  code: string;
  isMainBranch: boolean;
  address: string;
  phone: string;
  managerUserId: string | null;
  managerName: string | null;
  memberCount: number;
  status: string;
};

type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  branch: string;
};

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const inputClass = "mt-1 w-full border px-3 py-2 text-sm outline-none";
const labelClass = "block text-xs font-700 uppercase tracking-wider";

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [isMainBranchUser, setIsMainBranchUser] = useState(false);
  const [myBranchId, setMyBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", managerUserId: "" });
  const [assignUserId, setAssignUserId] = useState("");
  const [assignBranchId, setAssignBranchId] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [branchRes, usersRes] = await Promise.all([
        fetch("/api/branches", { cache: "no-store" }),
        fetch("/api/workspace/users", { cache: "no-store" }),
      ]);
      const branchData = await branchRes.json() as { branches?: Branch[]; canManage?: boolean; isMainBranchUser?: boolean; myBranchId?: string | null; error?: string };
      const usersData = await usersRes.json() as { users?: WorkspaceUser[]; error?: string };
      if (!branchRes.ok) throw new Error(branchData.error ?? "Unable to load branches.");
      setBranches(branchData.branches ?? []);
      setCanManage(Boolean(branchData.canManage));
      setIsMainBranchUser(Boolean(branchData.isMainBranchUser));
      setMyBranchId(branchData.myBranchId ?? null);
      if (usersRes.ok) setUsers(usersData.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load branches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditingBranch(null);
    setForm({ name: "", code: "", address: "", phone: "", managerUserId: "" });
    setShowForm(true);
  };

  const openEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      code: branch.code,
      address: branch.address,
      phone: branch.phone,
      managerUserId: branch.managerUserId ?? "",
    });
    setShowForm(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        action: editingBranch ? "update-branch" : "create-branch",
        ...(editingBranch ? { branchId: editingBranch.id } : {}),
        name: form.name,
        code: form.code,
        address: form.address,
        phone: form.phone,
        managerUserId: form.managerUserId || null,
      };
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save branch.");
      setShowForm(false);
      setNotice(editingBranch ? "Branch updated." : "Branch created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save branch.");
    } finally {
      setSaving(false);
    }
  };

  const assignMember = async () => {
    if (!assignUserId || !assignBranchId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-member-branch", userId: assignUserId, branchId: assignBranchId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to assign branch.");
      setNotice("Member assigned to branch.");
      setAssignUserId("");
      setAssignBranchId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign branch.");
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (branch: Branch) => {
    if (!window.confirm(`Deactivate "${branch.name}"? All members will be reassigned to the Main Branch.`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deactivate-branch", branchId: branch.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to deactivate branch.");
      setNotice(`"${branch.name}" deactivated.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to deactivate branch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="branches-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h1 id="branches-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Branches</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Manage company branches. The Main Branch oversees all other branches.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus size={16} aria-hidden="true" /> New Branch
          </button>
        )}
      </header>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}<button onClick={() => setNotice("")} className="ml-3 text-xs opacity-70 hover:opacity-100">×</button></div>}

      <div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: "var(--muted-foreground)" }}>
            <Loader2 size={22} className="animate-spin mr-2" aria-hidden="true" /> <span className="text-sm">Loading branches…</span>
          </div>
        ) : branches.length === 0 ? (
          <p className="border px-4 py-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>No branches configured.</p>
        ) : (
          <>
            {/* Branch cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((b) => (
                <div key={b.id} className="border p-4" style={{ borderColor: b.isMainBranch ? "var(--primary)" : "var(--border)", background: "var(--card)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-700" style={{ background: b.isMainBranch ? "var(--primary)" : "var(--secondary)", color: b.isMainBranch ? "var(--primary-foreground)" : "var(--primary)" }}>
                        {b.code}
                      </div>
                      <div>
                        <h3 className="text-sm font-700" style={{ color: "var(--foreground)" }}>{b.name}</h3>
                        {b.isMainBranch && <span className="text-[10px] font-700 uppercase" style={{ color: "var(--primary)" }}>Main Branch</span>}
                      </div>
                    </div>
                    <span className="rounded px-2 py-0.5 text-[10px] font-700 uppercase" style={{ background: b.status === "active" ? "#10b98122" : "#ef444422", color: b.status === "active" ? "#10b981" : "#ef4444" }}>{b.status}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                    <p className="flex items-center gap-1.5"><Users size={12} aria-hidden="true" /> {b.memberCount} member{b.memberCount === 1 ? "" : "s"}</p>
                    {b.managerName && <p className="flex items-center gap-1.5"><UserCog size={12} aria-hidden="true" /> Manager: {b.managerName}</p>}
                    {b.address && <p className="flex items-center gap-1.5"><MapPin size={12} aria-hidden="true" /> {b.address}</p>}
                    {b.phone && <p>{b.phone}</p>}
                  </div>
                  {canManage && !b.isMainBranch && b.status === "active" && (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => openEdit(b)} className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                        <Settings2 size={12} aria-hidden="true" /> Edit
                      </button>
                      <button type="button" onClick={() => deactivate(b)} disabled={saving} className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50" style={{ borderColor: "#ef444440", color: "#ef4444" }}>
                        Deactivate
                      </button>
                    </div>
                  )}
                  {canManage && b.isMainBranch && (
                    <div className="mt-3">
                      <button type="button" onClick={() => openEdit(b)} className="inline-flex items-center gap-1 border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                        <Settings2 size={12} aria-hidden="true" /> Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Member assignment */}
            {canManage && users.length > 0 && (
              <div className="border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <h3 className="text-sm font-700 mb-3" style={{ color: "var(--foreground)" }}>Assign Member to Branch</h3>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex-1 min-w-40" style={{ color: "var(--muted-foreground)" }}>
                    <span className={labelClass}>Member</span>
                    <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} className={inputClass} style={fieldStyle}>
                      <option value="">Select member…</option>
                      {users.filter((u) => u.role !== "Chairman").map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex-1 min-w-40" style={{ color: "var(--muted-foreground)" }}>
                    <span className={labelClass}>Branch</span>
                    <select value={assignBranchId} onChange={(e) => setAssignBranchId(e.target.value)} className={inputClass} style={fieldStyle}>
                      <option value="">Select branch…</option>
                      {branches.filter((b) => b.status === "active").map((b) => (
                        <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" disabled={saving || !assignUserId || !assignBranchId} onClick={assignMember} className="px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                    {saving ? "Assigning…" : "Assign"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <form onSubmit={submit} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="mb-4 text-base font-700" style={{ color: "var(--foreground)" }}>{editingBranch ? "Edit Branch" : "New Branch"}</h2>
            <div className="space-y-3">
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Name
                <input required maxLength={120} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} style={fieldStyle} placeholder="e.g. Kampala Branch" />
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Code
                <input required maxLength={20} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className={inputClass} style={fieldStyle} placeholder="e.g. KLA" disabled={editingBranch?.isMainBranch} />
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Address
                <input maxLength={500} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={inputClass} style={fieldStyle} />
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Phone
                <input maxLength={60} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputClass} style={fieldStyle} />
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Branch Manager
                <select value={form.managerUserId} onChange={(e) => setForm((f) => ({ ...f, managerUserId: e.target.value }))} className={inputClass} style={fieldStyle}>
                  <option value="">No manager assigned</option>
                  {users.map((u) => (<option key={u.id} value={u.id}>{u.name} ({u.role})</option>))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={saving} onClick={() => setShowForm(false)} className="border px-4 py-2.5 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
