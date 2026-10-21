"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, Info,
  Plus, Search, Tag, X, XCircle,
} from "lucide-react";
import LeaveTypes from "./LeaveTypes";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaveStatus =
  | "pending"
  | "supervisor_pending"
  | "manager_pending"
  | "final_pending"
  | "approved"
  | "rejected";

type LeaveRequest = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  leave_type_id: string | null;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string;
  status: LeaveStatus;
  // Stage 1 – Supervisor
  supervisor_status: "pending" | "approved" | "rejected";
  supervisor_note: string;
  supervisor_name: string;
  supervisor_reviewed_at: string | null;
  // Stage 2 – Manager
  manager_status: "pending" | "approved" | "rejected";
  manager_note: string;
  manager_name: string;
  manager_reviewed_at: string | null;
  // Stage 3 – Final
  final_status: "pending" | "approved" | "rejected";
  final_note: string;
  final_reviewer_name: string;
  final_reviewed_at: string | null;
  // Legacy single reviewer
  review_note: string;
  reviewer_name: string;
  reviewed_at: string | null;
  created_at: string;
};

type LeaveBalance = {
  leave_type_id: string;
  year: number;
  days_allocated: number;
  days_used: number;
};

type CompanyLeaveType = { id: string; name: string };

type LeavePayload = {
  requests: LeaveRequest[];
  balances: LeaveBalance[];
  leaveTypes: CompanyLeaveType[];
  permissions: {
    canViewTeam: boolean;
    canCreate: boolean;
    canManage: boolean;
    canFinalize: boolean;
  };
  error?: string;
};

type Tab = "tracker" | "types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );

const dayCount = (start: string, end: string) =>
  Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;

const timeAgo = (value: string) => {
  const diff = Date.now() - Date.parse(value);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// Status display metadata
const statusMeta: Record<LeaveStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending supervisor", color: "#b7791f", bg: "#78350f18" },
  supervisor_pending: { label: "Pending supervisor", color: "#b7791f", bg: "#78350f18" },
  manager_pending: { label: "Pending GM review", color: "#2878a8", bg: "#1e3a5f18" },
  final_pending: { label: "Pending final approval", color: "#7c3aed", bg: "#4c1d9518" },
  approved: { label: "Fully approved", color: "#168358", bg: "#05231918" },
  rejected: { label: "Declined", color: "#b43c45", bg: "#44111418" },
};

// Determine which stage this user can action on a given request
function getActionableStage(
  req: LeaveRequest,
  canManage: boolean,
  canFinalize: boolean,
  currentUserId: string,
): "supervisor" | "manager" | "final" | null {
  if (req.employee_id === currentUserId) return null; // can't approve own
  if (req.status === "pending" && canManage) return "supervisor";
  if (req.status === "manager_pending" && canManage) return "manager";
  if (req.status === "final_pending" && canFinalize) return "final";
  return null;
}

// ─── Approval progress stepper ────────────────────────────────────────────────

function ApprovalStepper({ req }: { req: LeaveRequest }) {
  const steps = [
    {
      label: "Supervisor",
      status: req.supervisor_status,
      reviewer: req.supervisor_name,
      note: req.supervisor_note,
      at: req.supervisor_reviewed_at,
    },
    {
      label: "General Manager",
      status: req.manager_status,
      reviewer: req.manager_name,
      note: req.manager_note,
      at: req.manager_reviewed_at,
    },
    {
      label: "Director / CEO",
      status: req.final_status,
      reviewer: req.final_reviewer_name,
      note: req.final_note,
      at: req.final_reviewed_at,
    },
  ];

  // For legacy single-stage records (old pending/approved/rejected)
  const isLegacy = req.supervisor_status === "pending" && req.manager_status === "pending" && req.final_status === "pending" && (req.status === "approved" || req.status === "rejected");
  if (isLegacy) {
    return (
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 border" style={{ borderColor: statusMeta[req.status].color, color: statusMeta[req.status].color }}>
          {statusMeta[req.status].label}
          {req.reviewer_name ? ` · ${req.reviewer_name}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-start gap-0" role="list" aria-label="Approval stages">
      {steps.map((step, index) => {
        const isApproved = step.status === "approved";
        const isRejected = step.status === "rejected";
        const isDone = isApproved || isRejected;
        const isActive =
          (index === 0 && (req.status === "pending" || req.status === "supervisor_pending")) ||
          (index === 1 && req.status === "manager_pending") ||
          (index === 2 && req.status === "final_pending");
        const color = isRejected ? "#b43c45" : isApproved ? "#168358" : isActive ? "#2878a8" : "var(--muted-foreground)";

        return (
          <div key={step.label} role="listitem" className="flex items-center">
            <div className="flex flex-col items-center" style={{ minWidth: "72px" }}>
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-700"
                title={isDone ? `${isApproved ? "Approved" : "Declined"} by ${step.reviewer}${step.at ? " · " + timeAgo(step.at) : ""}${step.note ? " — " + step.note : ""}` : step.label}
                style={{
                  borderColor: color,
                  color,
                  background: isDone ? `${color}18` : "var(--secondary)",
                }}
              >
                {isRejected ? <XCircle size={13} /> : isApproved ? <CheckCircle2 size={13} /> : isActive ? <Clock3 size={11} /> : <span className="opacity-40">{index + 1}</span>}
              </div>
              <span className="mt-0.5 text-center text-[10px] leading-tight" style={{ color, maxWidth: "66px" }}>{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <ChevronRight
                size={14}
                className="mx-0.5 mb-4 shrink-0"
                style={{ color: isApproved ? "#168358" : "var(--border)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Balance cards ────────────────────────────────────────────────────────────

function BalanceCards({ balances, leaveTypes }: { balances: LeaveBalance[]; leaveTypes: CompanyLeaveType[] }) {
  if (!balances.length) return null;
  const nameMap = new Map(leaveTypes.map((lt) => [lt.id, lt.name]));
  const year = new Date().getFullYear();
  const current = balances.filter((b) => b.year === year);
  if (!current.length) return null;

  return (
    <div className="border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
      <p className="mb-3 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
        Your {year} leave balance
      </p>
      <div className="flex flex-wrap gap-3">
        {current.map((b) => {
          const remaining = b.days_allocated - b.days_used;
          const pct = b.days_allocated > 0 ? Math.round((b.days_used / b.days_allocated) * 100) : 0;
          const isLow = remaining <= 3;
          return (
            <div
              key={b.leave_type_id}
              className="min-w-36 border px-4 py-3"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <p className="text-xs font-600" style={{ color: "var(--foreground)" }}>{nameMap.get(b.leave_type_id) ?? "Leave"}</p>
              <p className="mt-1 text-xl font-700 mono" style={{ color: isLow ? "#b43c45" : "var(--primary)" }}>
                {remaining}
                <span className="text-xs font-400 ml-1" style={{ color: "var(--muted-foreground)" }}>/ {b.days_allocated} days left</span>
              </p>
              {/* Progress bar */}
              <div className="mt-2 h-1 w-full rounded-full overflow-hidden" style={{ background: "var(--secondary)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: isLow ? "#b43c45" : pct > 60 ? "#f59e0b" : "#10b981" }}
                />
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{b.days_used} used</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const [activeTab, setActiveTab] = useState<Tab>("tracker");
  const [data, setData] = useState<LeavePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<LeaveStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reviewing, setReviewing] = useState<{ request: LeaveRequest; stage: "supervisor" | "manager" | "final" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });

  // We store the current user ID from the first load so we can gate self-approval
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/leave", { cache: "no-store" });
        const payload = await response.json() as LeavePayload;
        if (!response.ok) throw new Error(payload.error ?? "Unable to load leave requests.");
        if (!cancelled) {
          setData(payload);
          // Heuristic: employee_id of the first request where employee_name === "You"
          const mine = payload.requests.find((r) => r.employee_name === "You");
          if (mine) setCurrentUserId(mine.employee_id);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load leave requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const requests = data?.requests ?? [];
  const balances = data?.balances ?? [];
  const leaveTypes = data?.leaveTypes ?? [];
  const perms = data?.permissions ?? { canViewTeam: false, canCreate: false, canManage: false, canFinalize: false };

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = useMemo(() => requests.filter((r) => {
    const matchesStatus = filter === "all" || r.status === filter;
    const matchesSearch = !normalizedSearch || `${r.employee_name} ${r.reason} ${r.leave_type_name}`.toLocaleLowerCase().includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  }), [filter, normalizedSearch, requests]);

  const pendingCount = requests.filter((r) => ["pending", "supervisor_pending", "manager_pending", "final_pending"].includes(r.status)).length;
  const approvedDays = requests.filter((r) => r.status === "approved").reduce((t, r) => t + (r.days_count ?? dayCount(r.start_date, r.end_date)), 0);
  const myPending = requests.filter((r) => r.employee_id === currentUserId && r.status !== "approved" && r.status !== "rejected").length;

  // How many requests need THIS user's review right now
  const awaitingMyAction = requests.filter((r) =>
    getActionableStage(r, perms.canManage, perms.canFinalize, currentUserId) !== null,
  ).length;

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
      setForm({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
      setNotice("Leave request submitted. Your supervisor will be notified.");
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit leave request.");
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async (decision: "approved" | "rejected") => {
    if (!reviewing) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/leave", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaveId: reviewing.request.id, stage: reviewing.stage, decision, note: reviewNote }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to process decision.");
      setReviewing(null);
      setReviewNote("");
      const stageLabel = reviewing.stage === "supervisor" ? "Supervisor" : reviewing.stage === "manager" ? "General Manager" : "Final";
      setNotice(`${stageLabel} decision recorded — employee has been notified.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process decision.");
    } finally {
      setSaving(false);
    }
  };

  const stageLabel = { supervisor: "Supervisor Review", manager: "General Manager Review", final: "Final Approval (Director / CEO)" };

  // Pick the default leave type when form opens
  const firstActiveLeaveType = leaveTypes[0]?.id ?? "";

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="leave-title">

      {/* ── Page header ── */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h1 id="leave-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Leave Management</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            {perms.canViewTeam ? "Leave requests, approvals, and entitlements across your company." : "Your leave requests, balances, and approval progress."}
          </p>
        </div>
        {activeTab === "tracker" && perms.canCreate && (
          <button
            type="button"
            onClick={() => { setShowRequestForm(true); setForm((f) => ({ ...f, leaveTypeId: firstActiveLeaveType })); setError(""); setNotice(""); }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            <Plus size={16} aria-hidden="true" />
            Request leave
          </button>
        )}
      </header>

      {/* ── Tabs ── */}
      <div className="flex border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }} role="tablist" aria-label="Leave management sections">
        {([
          { key: "tracker" as Tab, label: "Leave Tracker", icon: CalendarDays },
          { key: "types" as Tab, label: "Leave Types", icon: Tag },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`leave-panel-${key}`}
            onClick={() => { setActiveTab(key); setError(""); setNotice(""); }}
            className="flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-600 transition-colors"
            style={{
              borderBottomColor: activeTab === key ? "var(--primary)" : "transparent",
              color: activeTab === key ? "var(--primary)" : "var(--muted-foreground)",
            }}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
            {key === "tracker" && awaitingMyAction > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-700" style={{ background: "#b43c45", color: "white" }}>
                {awaitingMyAction}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Leave Types panel ── */}
      {activeTab === "types" && (
        <div id="leave-panel-types" role="tabpanel" className="min-h-0 flex-1 overflow-auto">
          <LeaveTypes />
        </div>
      )}

      {/* ── Leave Tracker panel ── */}
      {activeTab === "tracker" && (
        <div id="leave-panel-tracker" role="tabpanel" className="flex min-h-0 flex-1 flex-col overflow-hidden">

          {/* Summary metrics */}
          <div className="grid grid-cols-2 border-b sm:grid-cols-4" style={{ borderColor: "var(--border)" }}>
            {[
              { label: perms.canViewTeam ? "Pending review" : "My active requests", value: perms.canViewTeam ? pendingCount : myPending, tone: "#b7791f", icon: Clock3 },
              { label: "Awaiting my action", value: awaitingMyAction, tone: awaitingMyAction > 0 ? "#b43c45" : "var(--muted-foreground)", icon: Check },
              { label: "Approved days (all)", value: approvedDays, tone: "#168358", icon: CheckCircle2 },
              { label: "Total requests", value: requests.length, tone: "var(--muted-foreground)", icon: CalendarDays },
            ].map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.label} className="flex items-center gap-3 border-b border-r px-4 py-3 last:border-r-0 sm:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <Icon size={16} aria-hidden="true" style={{ color: metric.tone }} />
                  <div>
                    <div className="mono text-lg font-700" style={{ color: metric.tone }}>{loading ? "—" : metric.value}</div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leave balance cards (own employee, non-team-view) */}
          {!perms.canViewTeam && balances.length > 0 && (
            <BalanceCards balances={balances} leaveTypes={leaveTypes} />
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
              {([
                ["all", "All"],
                ["pending", "Pending supervisor"],
                ["manager_pending", "Pending GM"],
                ["final_pending", "Pending final"],
                ["approved", "Approved"],
                ["rejected", "Declined"],
              ] as [LeaveStatus | "all", string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className="border px-2.5 py-1.5 text-xs font-600"
                  style={{
                    borderColor: filter === value ? "var(--primary)" : "var(--border)",
                    color: filter === value ? "var(--primary)" : "var(--muted-foreground)",
                    background: filter === value ? "var(--secondary)" : "transparent",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex w-full max-w-sm items-center gap-2 border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
              <Search size={14} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} />
              <input
                aria-label="Search leave requests"
                placeholder="Search employee or reason…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
                style={{ color: "var(--foreground)" }}
              />
            </label>
          </div>

          {/* Feedback */}
          {error && !showRequestForm && !reviewing && (
            <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}
          {notice && (
            <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>
          )}

          {/* Table */}
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <div className="overflow-x-auto border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <table className="w-full min-w-220 text-sm">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
                    {["Employee", "Leave type", "Dates", "Days", "Status", "Progress", ""].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading leave requests…</td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{requests.length ? "No requests match these filters." : "No leave requests yet."}</td></tr>
                  )}
                  {!loading && filtered.map((req) => {
                    const meta = statusMeta[req.status] ?? statusMeta.pending;
                    const actionStage = getActionableStage(req, perms.canManage, perms.canFinalize, currentUserId);
                    const isExpanded = expandedRow === req.id;

                    return (
                      <>
                        <tr
                          key={req.id}
                          className="border-b last:border-0 cursor-pointer hover:bg-white/[0.02]"
                          style={{ borderColor: "var(--border)" }}
                          onClick={() => setExpandedRow(isExpanded ? null : req.id)}
                        >
                          <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{req.employee_name}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{req.leave_type_name || req.leave_type}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{dateLabel(req.start_date)} – {dateLabel(req.end_date)}</td>
                          <td className="px-3 py-3 mono text-xs font-600" style={{ color: "var(--foreground)" }}>{req.days_count ?? dayCount(req.start_date, req.end_date)}</td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <span className="inline-block border px-2 py-0.5 text-xs font-600" style={{ borderColor: meta.color, color: meta.color, background: meta.bg }}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <ApprovalStepper req={req} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">
                            {actionStage && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setReviewing({ request: req, stage: actionStage }); setReviewNote(""); setError(""); setNotice(""); }}
                                className="border px-2.5 py-1.5 text-xs font-600"
                                style={{ borderColor: "#2878a8", color: "#2878a8" }}
                              >
                                Review
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr key={`${req.id}-detail`} style={{ borderColor: "var(--border)" }} className="border-b">
                            <td colSpan={7} className="px-6 pb-5 pt-2" style={{ background: "var(--secondary)" }}>
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div>
                                  <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Reason</p>
                                  <p className="text-sm" style={{ color: "var(--foreground)" }}>{req.reason}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Submitted</p>
                                  <p className="text-sm" style={{ color: "var(--foreground)" }}>{dateLabel(req.created_at.slice(0, 10))}</p>
                                </div>
                                {req.supervisor_status !== "pending" && (
                                  <div>
                                    <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Supervisor ({req.supervisor_status})</p>
                                    <p className="text-sm" style={{ color: "var(--foreground)" }}>{req.supervisor_name || "—"}{req.supervisor_note ? ` · "${req.supervisor_note}"` : ""}</p>
                                  </div>
                                )}
                                {req.manager_status !== "pending" && (
                                  <div>
                                    <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>General Manager ({req.manager_status})</p>
                                    <p className="text-sm" style={{ color: "var(--foreground)" }}>{req.manager_name || "—"}{req.manager_note ? ` · "${req.manager_note}"` : ""}</p>
                                  </div>
                                )}
                                {req.final_status !== "pending" && (
                                  <div>
                                    <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Director / CEO ({req.final_status})</p>
                                    <p className="text-sm" style={{ color: "var(--foreground)" }}>{req.final_reviewer_name || "—"}{req.final_note ? ` · "${req.final_note}"` : ""}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Request leave modal ── */}
      {showRequestForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowRequestForm(false); setError(""); } }}
        >
          <form
            onSubmit={submitRequest}
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Request leave</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Your request will go to your supervisor first, then the General Manager, then the Director / CEO.
                </p>
              </div>
              <button type="button" onClick={() => { setShowRequestForm(false); setError(""); }} aria-label="Close" className="p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {error && <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            {/* Approval flow note */}
            <div className="mb-4 flex items-start gap-2 border px-3 py-2.5" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
              <Info size={14} className="mt-0.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                Approval chain: <strong style={{ color: "var(--foreground)" }}>Supervisor</strong> → <strong style={{ color: "var(--foreground)" }}>General Manager</strong> → <strong style={{ color: "var(--foreground)" }}>Director / CEO</strong>. You will receive a notification at each stage.
              </p>
            </div>

            {/* Balance reminder */}
            {balances.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {balances.filter((b) => b.year === new Date().getFullYear()).map((b) => {
                  const lt = leaveTypes.find((t) => t.id === b.leave_type_id);
                  const remaining = b.days_allocated - b.days_used;
                  if (!lt) return null;
                  return (
                    <span key={b.leave_type_id} className="border px-2 py-0.5 text-xs" style={{ borderColor: "var(--border)", color: remaining <= 3 ? "#b43c45" : "var(--muted-foreground)" }}>
                      {lt.name}: <strong style={{ color: remaining <= 3 ? "#b43c45" : "var(--foreground)" }}>{remaining} days left</strong>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-700 uppercase tracking-wider sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>
                Leave type
                <select
                  required
                  value={form.leaveTypeId}
                  onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                >
                  <option value="">Choose a leave type…</option>
                  {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                Start date
                <input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                End date
                <input
                  required
                  type="date"
                  min={form.startDate || undefined}
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              {form.startDate && form.endDate && form.endDate >= form.startDate && (
                <p className="text-xs sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>
                  That is <strong style={{ color: "var(--foreground)" }}>{dayCount(form.startDate, form.endDate)} day{dayCount(form.startDate, form.endDate) !== 1 ? "s" : ""}</strong>.
                </p>
              )}
              <label className="block text-xs font-700 uppercase tracking-wider sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>
                Reason
                <textarea
                  required
                  maxLength={2000}
                  rows={4}
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Explain why you need this leave."
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
                {saving ? "Submitting…" : "Submit request"}
              </button>
              <button
                type="button"
                onClick={() => { setShowRequestForm(false); setError(""); }}
                className="flex-1 border py-2 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Review modal ── */}
      {reviewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setReviewing(null); }}
        >
          <div className="w-full max-w-lg border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
                  {stageLabel[reviewing.stage]}
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {reviewing.request.employee_name} · {reviewing.request.leave_type_name || reviewing.request.leave_type} · {reviewing.request.days_count ?? dayCount(reviewing.request.start_date, reviewing.request.end_date)} days
                </p>
                <p className="mt-0.5 text-sm" style={{ color: "var(--foreground)" }}>
                  {dateLabel(reviewing.request.start_date)} – {dateLabel(reviewing.request.end_date)}
                </p>
              </div>
              <button type="button" onClick={() => setReviewing(null)} aria-label="Close review" className="p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            {error && <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}

            {/* Approval chain progress so far */}
            <div className="mb-4 border p-3" style={{ borderColor: "var(--border)" }}>
              <p className="mb-2 text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Approval progress</p>
              <ApprovalStepper req={reviewing.request} />
            </div>

            <div className="border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              <p className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Reason</p>
              {reviewing.request.reason}
            </div>

            <label className="mt-4 block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              Review note <span className="font-400 normal-case">(optional)</span>
              <textarea
                maxLength={1000}
                rows={3}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Add context for the next approver or the employee."
                className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                style={fieldStyle}
              />
            </label>

            {reviewing.stage !== "final" && (
              <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                <Info size={11} className="mr-1 inline" />
                {reviewing.stage === "supervisor"
                  ? "Approving will forward this request to the General Manager."
                  : "Approving will forward this request to the Director / CEO for final approval."}
              </p>
            )}
            {reviewing.stage === "final" && (
              <p className="mt-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
                <Info size={11} className="mr-1 inline" />
                Final approval will mark the request as fully approved and deduct days from the employee's leave balance.
              </p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitReview("approved")}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{ background: "#168358", color: "white" }}
              >
                {saving ? "Saving…" : reviewing.stage === "final" ? "Final approve" : "Approve & forward"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void submitReview("rejected")}
                className="flex-1 py-2 text-sm font-600 disabled:opacity-50"
                style={{ background: "#b43c45", color: "white" }}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
