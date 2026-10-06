"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Plus, Search, X } from "lucide-react";

type LeaveStatus = "pending" | "approved" | "rejected";
type LeaveType = "annual" | "sick" | "personal" | "parental" | "unpaid";
type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  review_note: string;
  reviewer_name: string;
  created_at: string;
};
type LeavePayload = {
  requests: LeaveRequest[];
  permissions: { canViewTeam: boolean; canCreate: boolean; canReview: boolean };
  error?: string;
};
type LeaveForm = { leaveType: LeaveType; startDate: string; endDate: string; reason: string };

const leaveLabels: Record<LeaveType, string> = { annual: "Annual", sick: "Sick", personal: "Personal", parental: "Parental", unpaid: "Unpaid" };
const statusColor: Record<LeaveStatus, string> = { pending: "#b7791f", approved: "#168358", rejected: "#b43c45" };
const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const dateLabel = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
const dayCount = (start: string, end: string) => Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

export default function LeaveManagement() {
  const [data, setData] = useState<LeavePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<LeaveStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reviewing, setReviewing] = useState<LeaveRequest | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [form, setForm] = useState<LeaveForm>({ leaveType: "annual", startDate: "", endDate: "", reason: "" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/leave", { cache: "no-store" });
        const payload = await response.json() as LeavePayload;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load leave requests.");
        if (!cancelled) setData(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load leave requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const requests = data?.requests ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => requests.filter((request) => {
    const matchesStatus = filter === "all" || request.status === filter;
    const matchesSearch = !normalizedSearch || `${request.employee_name} ${request.reason} ${leaveLabels[request.leave_type]}`.toLocaleLowerCase().includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  }), [filter, normalizedSearch, requests]);
  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const approvedDays = requests.filter((request) => request.status === "approved").reduce((total, request) => total + dayCount(request.start_date, request.end_date), 0);
  const upcomingCount = requests.filter((request) => request.status === "approved" && request.end_date >= new Date().toISOString().slice(0, 10)).length;

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to submit leave request.");
      setShowRequestForm(false);
      setForm({ leaveType: "annual", startDate: "", endDate: "", reason: "" });
      setNotice("Leave request submitted for review.");
      setReloadKey((key) => key + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit leave request.");
    } finally {
      setSaving(false);
    }
  };

  const reviewRequest = async (status: Exclude<LeaveStatus, "pending">) => {
    if (!reviewing) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "review", requestId: reviewing.id, status, note: reviewNote }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to review leave request.");
      setReviewing(null);
      setReviewNote("");
      setNotice(`Request ${status}.`);
      setReloadKey((key) => key + 1);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Unable to review leave request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="leave-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2"><CalendarDays size={18} aria-hidden="true" style={{ color: "var(--primary)" }} /><h1 id="leave-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Leave Management</h1></div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{data?.permissions.canViewTeam ? "Requests and approvals across your company" : "Your leave requests and their review status"}</p>
        </div>
        {data?.permissions.canCreate && <button type="button" onClick={() => setShowRequestForm(true)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Request leave</button>}
      </header>

      <div className="grid grid-cols-1 border-b sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
        {[
          { label: "Pending review", value: pendingCount, tone: "#b7791f", icon: Clock3 },
          { label: "Approved days", value: approvedDays, tone: "#168358", icon: Check },
          { label: "Upcoming approved", value: upcomingCount, tone: "#2878a8", icon: CalendarDays },
        ].map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className="flex items-center gap-3 border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><Icon size={17} aria-hidden="true" style={{ color: metric.tone }} /><div><div className="mono text-lg font-700" style={{ color: metric.tone }}>{loading ? "—" : metric.value}</div><div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div></div>;
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter leave requests">
          {(["all", "pending", "approved", "rejected"] as const).map((status) => <button key={status} type="button" onClick={() => setFilter(status)} className="border px-3 py-1.5 text-xs font-600 capitalize" style={{ borderColor: filter === status ? "var(--primary)" : "var(--border)", color: filter === status ? "var(--primary)" : "var(--muted-foreground)", background: filter === status ? "var(--secondary)" : "transparent" }}>{status}</button>)}
        </div>
        <label className="flex w-full max-w-sm items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search leave requests" placeholder="Search employee or reason" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-220 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Employee", "Leave type", "Dates", "Days", "Reason", "Status", ""].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading leave requests…</td></tr>}
              {!loading && !error && filtered.map((request) => <tr key={request.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{request.employee_name}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{leaveLabels[request.leave_type]}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{dateLabel(request.start_date)} – {dateLabel(request.end_date)}</td>
                <td className="px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{dayCount(request.start_date, request.end_date)}</td>
                <td className="max-w-72 px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}><span className="block truncate" title={request.reason}>{request.reason}</span></td>
                <td className="whitespace-nowrap px-3 py-3"><span className="text-xs font-600 capitalize" style={{ color: statusColor[request.status] }}>{request.status}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{data?.permissions.canReview && request.status === "pending" && <button type="button" onClick={() => { setReviewing(request); setReviewNote(""); }} className="border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Review</button>}</td>
              </tr>)}
              {!loading && !error && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{requests.length ? "No requests match these filters." : "No leave requests have been submitted."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showRequestForm && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowRequestForm(false); }}>
        <form onSubmit={submitRequest} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Request leave</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Your manager will review this request.</p></div><button type="button" onClick={() => setShowRequestForm(false)} aria-label="Close request form" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-700 uppercase tracking-wider sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Leave type<select required value={form.leaveType} onChange={(event) => setForm((current) => ({ ...current, leaveType: event.target.value as LeaveType }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{Object.entries(leaveLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Start date<input required type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>End date<input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Reason<textarea required maxLength={2000} rows={4} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} placeholder="Add the details your approver needs." /></label>
          </div>
          <div className="mt-6 flex gap-3"><button type="submit" disabled={saving} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Submitting…" : "Submit request"}</button><button type="button" onClick={() => setShowRequestForm(false)} className="flex-1 border py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button></div>
        </form>
      </div>}

      {reviewing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setReviewing(null); }}>
        <div className="w-full max-w-lg border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Review leave request</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{reviewing.employee_name} · {leaveLabels[reviewing.leave_type]} · {dayCount(reviewing.start_date, reviewing.end_date)} days</p><p className="mt-2 text-sm" style={{ color: "var(--foreground)" }}>{dateLabel(reviewing.start_date)} – {dateLabel(reviewing.end_date)}</p></div><button type="button" onClick={() => setReviewing(null)} aria-label="Close review" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button></div>
          <p className="border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>{reviewing.reason}</p>
          <label className="mt-4 block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Review note (optional)<textarea maxLength={1000} rows={3} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
          <div className="mt-6 flex gap-3"><button type="button" disabled={saving} onClick={() => void reviewRequest("approved")} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "#168358", color: "white" }}>{saving ? "Saving…" : "Approve"}</button><button type="button" disabled={saving} onClick={() => void reviewRequest("rejected")} className="flex-1 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "#b43c45", color: "white" }}>Decline</button></div>
        </div>
      </div>}
    </section>
  );
}
