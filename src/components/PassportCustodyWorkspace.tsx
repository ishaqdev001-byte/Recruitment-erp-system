import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, Search, X } from "lucide-react";

type PassportStatus = "available" | "with_agent" | "withdrawn" | "transferred";
type PassportRecord = {
  id: string;
  candidate_id: string;
  tracking_number: number;
  passport_number: string;
  issue_date: string | null;
  expiry_date: string | null;
  passport_status: PassportStatus;
  storage_branch: string;
  storage_location: string;
  withdrawn_at: string | null;
  withdrawal_requested_by: string;
  transferred_at: string | null;
  transfer_destination: string;
  candidate_name: string;
  file_number: string;
  agent_name: string;
  company_name: string;
};
type StatusForm = {
  status: PassportStatus;
  storageBranch: string;
  storageLocation: string;
  withdrawnAt: string;
  withdrawalRequestedBy: string;
  transferredAt: string;
  transferDestination: string;
};

const statuses: { value: PassportStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "with_agent", label: "With Agent" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "transferred", label: "Transferred" },
];
const statusColor: Record<PassportStatus, string> = { available: "#168358", with_agent: "#2878a8", withdrawn: "#b7791f", transferred: "#7653a6" };
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const groupInitials = (companyName: string) => {
  const words = companyName.toLocaleUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : (words[0] ?? "ORG").slice(0, 3)) || "ORG";
};
const groupNumber = (companyName: string, trackingNumber: number) => {
  const first = Math.floor((trackingNumber - 1) / 10) * 10 + 1;
  return `${groupInitials(companyName)} ${String(first).padStart(3, "0")} - ${String(first + 9).padStart(3, "0")}`;
};
const trackNumber = (number: number) => String(number).padStart(4, "0");

export default function PassportCustodyWorkspace({ companyName, onRegisterCandidate }: { companyName: string; onRegisterCandidate: () => void }) {
  const [records, setRecords] = useState<PassportRecord[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingRecord, setEditingRecord] = useState<PassportRecord | null>(null);
  const [form, setForm] = useState<StatusForm>({ status: "available", storageBranch: "", storageLocation: "", withdrawnAt: "", withdrawalRequestedBy: "", transferredAt: "", transferDestination: "" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/passport-custody", { cache: "no-store" });
        const payload = await response.json() as { passports?: PassportRecord[]; permissions?: { canEdit?: boolean }; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load passport custody.");
        if (cancelled) return;
        setRecords(payload.passports ?? []);
        setCanEdit(Boolean(payload.permissions?.canEdit));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load passport custody.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => records.filter((record) => {
    const group = groupNumber(companyName, record.tracking_number);
    return `${group} ${trackNumber(record.tracking_number)} ${record.candidate_name} ${record.file_number} ${record.passport_number} ${record.agent_name} ${record.storage_branch} ${record.storage_location} ${record.passport_status}`
      .toLocaleLowerCase().includes(normalizedSearch);
  }), [companyName, normalizedSearch, records]);
  const counts = {
    available: records.filter((record) => record.passport_status === "available").length,
    withdrawn: records.filter((record) => record.passport_status === "withdrawn").length,
    transferred: records.filter((record) => record.passport_status === "transferred").length,
    withAgent: records.filter((record) => record.passport_status === "with_agent").length,
  };

  const openStatusEditor = (record: PassportRecord, nextStatus = record.passport_status) => {
    setEditingRecord(record);
    setForm({
      status: nextStatus,
      storageBranch: record.storage_branch,
      storageLocation: record.storage_location,
      withdrawnAt: record.withdrawn_at ?? localDate(),
      withdrawalRequestedBy: record.withdrawal_requested_by,
      transferredAt: record.transferred_at ?? localDate(),
      transferDestination: record.transfer_destination,
    });
    setError("");
  };

  const saveStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingRecord) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/passport-custody/${encodeURIComponent(editingRecord.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update passport status.");
      setEditingRecord(null);
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to update passport status.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="passport-custody-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div><h1 id="passport-custody-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Passport Custody</h1><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Tracking, storage, withdrawals, and transfers</p></div>
        <button type="button" onClick={onRegisterCandidate} className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={16} aria-hidden="true" />Register candidate</button>
      </header>

      <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Total passports in custody", value: counts.available, color: "#168358" },
          { label: "Total withdrawals", value: counts.withdrawn, color: "#b7791f" },
          { label: "Transferred passports", value: counts.transferred, color: "#7653a6" },
          { label: "Passports with agents", value: counts.withAgent, color: "#2878a8" },
        ].map((metric) => <div key={metric.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="mono text-lg font-700" style={{ color: metric.color }}>{loading ? "—" : metric.value}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-lg items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search passports" placeholder="Search group, tracking number, holder, passport, or agent" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filtered.length} passports</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-220 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Group No", "Track No", "Holder's name", "Passport number", "Agent", "Storage location", "Status"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading passport records…</td></tr>}
              {!loading && !error && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{records.length ? "No passports match this search." : "No passports registered yet. Add passport details when registering a candidate."}</td></tr>}
              {!loading && filtered.map((record) => <tr key={record.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-600" style={{ color: "var(--foreground)" }}>{groupNumber(companyName, record.tracking_number)}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: "var(--primary)" }}>{trackNumber(record.tracking_number)}</td>
                <td className="whitespace-nowrap px-3 py-3"><div className="text-xs font-600" style={{ color: "var(--foreground)" }}>{record.candidate_name}</div><div className="mono mt-0.5 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{record.file_number}</div></td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{record.passport_number}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{record.agent_name || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{record.passport_status === "available" ? `Locker - ${record.storage_branch}${record.storage_location ? ` · ${record.storage_location}` : ""}` : record.passport_status === "with_agent" ? `With ${record.agent_name || "agent"}` : record.passport_status === "withdrawn" ? `Withdrawn ${record.withdrawn_at ?? ""}` : `Transferred to ${record.transfer_destination}`}</td>
                <td className="whitespace-nowrap px-3 py-3"><div className="flex items-center gap-2"><select aria-label={`Status for ${record.candidate_name}`} disabled={!canEdit} value={record.passport_status} onChange={(event) => openStatusEditor(record, event.target.value as PassportStatus)} className="border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-70" style={fieldStyle}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>{canEdit && <button type="button" aria-label={`Edit ${record.candidate_name} passport status`} title="Edit passport status details" onClick={() => openStatusEditor(record)} className="p-1.5" style={{ color: statusColor[record.passport_status] }}><Pencil size={14} aria-hidden="true" /></button>}</div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {editingRecord && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingRecord(null); }}>
        <form onSubmit={saveStatus} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Update passport status</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{editingRecord.candidate_name} · {editingRecord.passport_number}</p></div><button type="button" onClick={() => setEditingRecord(null)} aria-label="Close status form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PassportStatus }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          {form.status === "available" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Branch<input required maxLength={200} value={form.storageBranch} onChange={(event) => setForm((current) => ({ ...current, storageBranch: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Locker / storage location<input required maxLength={200} value={form.storageLocation} onChange={(event) => setForm((current) => ({ ...current, storageLocation: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>}
          {form.status === "with_agent" && <p className="mt-4 border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Assigned agent: <strong style={{ color: "var(--foreground)" }}>{editingRecord.agent_name || "No agent assigned"}</strong></p>}
          {form.status === "withdrawn" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Withdrawal date<input required type="date" max={localDate()} value={form.withdrawnAt} onChange={(event) => setForm((current) => ({ ...current, withdrawnAt: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Withdrawal requested by<input required maxLength={200} value={form.withdrawalRequestedBy} onChange={(event) => setForm((current) => ({ ...current, withdrawalRequestedBy: event.target.value }))} placeholder="Name of requester" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>}
          {form.status === "transferred" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Transfer date<input required type="date" max={localDate()} value={form.transferredAt} onChange={(event) => setForm((current) => ({ ...current, transferredAt: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label><label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Transferred to<input required maxLength={300} value={form.transferDestination} onChange={(event) => setForm((current) => ({ ...current, transferDestination: event.target.value }))} placeholder="Person, company, or authority" className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label></div>}
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Saving…" : "Save status"}</button><button type="button" onClick={() => setEditingRecord(null)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}
    </section>
  );
}