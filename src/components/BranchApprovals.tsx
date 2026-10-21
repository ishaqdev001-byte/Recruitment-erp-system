"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileText,
  Loader2,
  Plus,
  Send,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react";

type ApprovalStep = {
  level: string;
  levelOrder: number;
  approverRole: string;
  decision: "pending" | "approved" | "rejected" | "skipped";
  decisionNotes: string;
  decidedAt: string | null;
};

type ApprovalRequest = {
  id: string;
  requestType: string;
  title: string;
  description: string;
  amount: number | null;
  referenceId: string | null;
  referenceType: string | null;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  currentLevel: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  branchName: string;
  branchCode: string;
  isMainBranch: boolean;
  finalDecisionAt: string | null;
  finalNotes: string;
  steps: ApprovalStep[];
};

type ApiPayload = {
  requests?: ApprovalRequest[];
  stats?: { total: number; pending: number; approved: number; rejected: number };
  canManage?: boolean;
  roleName?: string;
  isMainBranch?: boolean;
  error?: string;
};

const LEVEL_LABELS: Record<string, string> = {
  branch_manager: "Branch Manager",
  supervisor: "Supervisor",
  general_manager: "General Manager",
  ceo: "Chairman / CEO",
};

const TYPE_LABELS: Record<string, string> = {
  requisition: "Requisition",
  expense: "Expense",
  candidate_advance: "Candidate Advance",
  document_request: "Document Request",
  medical_request: "Medical Request",
  custom: "Custom Request",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  withdrawn: "#6b7280",
};
const STATUS_BG: Record<string, string> = {
  pending: "#f59e0b22",
  approved: "#10b98122",
  rejected: "#ef444422",
  withdrawn: "#6b728022",
};

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const inputClass = "mt-1 w-full border px-3 py-2 text-sm outline-none";
const labelClass = "block text-xs font-700 uppercase tracking-wider";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function StepBadge({ decision }: { decision: ApprovalStep["decision"] }) {
  if (decision === "approved") return <span className="inline-flex items-center gap-1 text-xs font-600" style={{ color: "#10b981" }}><CheckCircle2 size={12} aria-hidden="true" /> Approved</span>;
  if (decision === "rejected") return <span className="inline-flex items-center gap-1 text-xs font-600" style={{ color: "#ef4444" }}><XCircle size={12} aria-hidden="true" /> Rejected</span>;
  if (decision === "skipped") return <span className="text-xs" style={{ color: "#6b7280" }}>Skipped</span>;
  return <span className="text-xs font-600" style={{ color: "#f59e0b" }}>Awaiting…</span>;
}

export default function BranchApprovals() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [canManage, setCanManage] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [isMainBranch, setIsMainBranch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "mine" | "my-level">("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState({ requestType: "custom", title: "", description: "", amount: "" });
  const [decisionNotes, setDecisionNotes] = useState("");
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/branch-approvals?filter=${filter}`, { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load approvals.");
      setRequests(payload.requests ?? []);
      setStats(payload.stats ?? { total: 0, pending: 0, approved: 0, rejected: 0 });
      setCanManage(Boolean(payload.canManage));
      setRoleName(payload.roleName ?? "");
      setIsMainBranch(Boolean(payload.isMainBranch));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load approvals.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [filter]);

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/branch-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit-request",
          requestType: submitForm.requestType,
          title: submitForm.title,
          description: submitForm.description,
          amount: submitForm.amount ? Number(submitForm.amount) : null,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to submit request.");
      setShowSubmit(false);
      setSubmitForm({ requestType: "custom", title: "", description: "", amount: "" });
      setNotice("Request submitted. The approval chain has been notified.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit request.");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (requestId: string, decision: "approved" | "rejected") => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/branch-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision === "approved" ? "approve" : "reject", requestId, notes: decisionNotes }),
      });
      const result = await response.json() as { error?: string; result?: Record<string, unknown> };
      if (!response.ok) throw new Error(result.error ?? "Unable to process decision.");
      setDecisionNotes("");
      setActingRequestId(null);
      setNotice(decision === "approved" ? "Request approved and advanced to the next level." : "Request rejected.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to process decision.");
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (requestId: string) => {
    if (!window.confirm("Withdraw this request?")) return;
    setSaving(true);
    try {
      const response = await fetch("/api/branch-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw", requestId }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to withdraw.");
      setNotice("Request withdrawn.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to withdraw.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="approvals-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h1 id="approvals-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Approvals</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Multi-level chain: Branch Manager → Supervisor → General Manager → Chairman/CEO
          </p>
        </div>
        {canManage && (
          <button type="button" onClick={() => setShowSubmit(true)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-600" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            <Plus size={16} aria-hidden="true" /> New Request
          </button>
        )}
      </header>

      {error && <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">{notice}<button onClick={() => setNotice("")} className="ml-3 text-xs opacity-70 hover:opacity-100">×</button></div>}

      {/* Filter tabs */}
      <div className="flex gap-2 px-6 pt-4">
        {([
          ["pending", `Awaiting (${stats.pending})`],
          ["mine", "My Requests"],
          ["my-level", "My Approvals"],
          ["all", `All (${stats.total})`],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)}
            className="px-3 py-1.5 text-xs font-600 border transition-colors"
            style={{
              borderColor: filter === key ? "var(--primary)" : "var(--border)",
              background: filter === key ? "var(--primary)" : "transparent",
              color: filter === key ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >{label}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: "var(--muted-foreground)" }}>
            <Loader2 size={22} className="animate-spin mr-2" aria-hidden="true" /> <span className="text-sm">Loading…</span>
          </div>
        ) : requests.length === 0 ? (
          <p className="border px-4 py-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>No approval requests found.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => {
              const isExpanded = expandedId === r.id;
              const color = STATUS_COLORS[r.status] ?? "#6b7280";
              const bg = STATUS_BG[r.status] ?? "#6b728022";
              return (
                <article key={r.id} className="border" style={{ borderColor: r.status === "pending" ? "#f59e0b40" : "var(--border)", background: "var(--card)" }}>
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-700" style={{ background: bg, color }}>{r.branchCode}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>{r.title}</p>
                        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {TYPE_LABELS[r.requestType] ?? r.requestType} · {r.branchName} · by {r.submittedByName} · {fmt(r.submittedAt)}
                          {r.amount !== null && ` · ${Number(r.amount).toLocaleString()}`}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 rounded px-2.5 py-1 text-xs font-700 uppercase" style={{ background: bg, color }}>{r.status}</span>
                    {r.status === "pending" && (
                      <span className="shrink-0 text-xs font-600" style={{ color: "#f59e0b" }}>
                        At: {LEVEL_LABELS[r.currentLevel] ?? r.currentLevel}
                      </span>
                    )}
                    <button type="button" onClick={() => setExpandedId(isExpanded ? null : r.id)} aria-label="Toggle details" className="border p-1.5" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                      <ChevronDown size={14} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} aria-hidden="true" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
                      {r.description && <p className="text-sm" style={{ color: "var(--foreground)" }}>{r.description}</p>}
                      {r.finalNotes && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Final notes: {r.finalNotes}</p>}

                      {/* Approval chain visualization */}
                      <div>
                        <p className={`${labelClass} mb-2`} style={{ color: "var(--muted-foreground)" }}>Approval Chain</p>
                        <div className="flex items-center gap-1">
                          {r.steps.map((step, idx) => (
                            <div key={step.level} className="flex items-center">
                              <div className="flex flex-col items-center gap-1 px-3 py-2 border rounded" style={{ borderColor: step.decision === "pending" ? "var(--border)" : step.decision === "approved" ? "#10b981" : step.decision === "rejected" ? "#ef4444" : "var(--border)", minWidth: 100 }}>
                                <span className="text-[10px] font-700 uppercase" style={{ color: "var(--muted-foreground)" }}>{LEVEL_LABELS[step.level] ?? step.level}</span>
                                <StepBadge decision={step.decision} />
                                {step.decisionNotes && <span className="text-[10px] text-center" style={{ color: "var(--muted-foreground)" }}>{step.decisionNotes.slice(0, 80)}</span>}
                              </div>
                              {idx < r.steps.length - 1 && <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>→</div>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {r.status === "pending" && canManage && actingRequestId !== r.id && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setActingRequestId(r.id)} className="inline-flex items-center gap-1.5 border px-3 py-2 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
                            <FileText size={13} aria-hidden="true" /> Review
                          </button>
                        </div>
                      )}

                      {actingRequestId === r.id && r.status === "pending" && (
                        <div className="space-y-3 border p-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                          <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Decision Notes
                            <textarea rows={2} maxLength={2000} value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} className={inputClass} style={fieldStyle} placeholder="Add notes for this decision…" />
                          </label>
                          <div className="flex gap-2">
                            <button type="button" disabled={saving} onClick={() => decide(r.id, "approved")} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-600 disabled:opacity-50" style={{ background: "#10b981", color: "#fff" }}>
                              <ThumbsUp size={13} aria-hidden="true" /> Approve
                            </button>
                            <button type="button" disabled={saving} onClick={() => decide(r.id, "rejected")} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-600 disabled:opacity-50" style={{ background: "#ef4444", color: "#fff" }}>
                              <ThumbsDown size={13} aria-hidden="true" /> Reject
                            </button>
                            <button type="button" onClick={() => { setActingRequestId(null); setDecisionNotes(""); }} className="border px-4 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {r.status === "pending" && (
                        <button type="button" disabled={saving} onClick={() => withdraw(r.id)} className="text-xs font-600 disabled:opacity-50" style={{ color: "#6b7280" }}>Withdraw request</button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Submit request modal */}
      {showSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSubmit(false); }}>
          <form onSubmit={submitRequest} className="w-full max-w-md border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="mb-4 text-base font-700" style={{ color: "var(--foreground)" }}>New Approval Request</h2>
            <div className="space-y-3">
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Type
                <select value={submitForm.requestType} onChange={(e) => setSubmitForm((f) => ({ ...f, requestType: e.target.value }))} className={inputClass} style={fieldStyle}>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Title
                <input required maxLength={200} value={submitForm.title} onChange={(e) => setSubmitForm((f) => ({ ...f, title: e.target.value }))} className={inputClass} style={fieldStyle} placeholder="Brief title…" />
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Description
                <textarea rows={3} maxLength={4000} value={submitForm.description} onChange={(e) => setSubmitForm((f) => ({ ...f, description: e.target.value }))} className={`${inputClass} resize-y`} style={fieldStyle} placeholder="Details…" />
              </label>
              <label className={labelClass} style={{ color: "var(--muted-foreground)" }}>Amount (optional)
                <input type="number" step="0.01" min="0" value={submitForm.amount} onChange={(e) => setSubmitForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} style={fieldStyle} />
              </label>
            </div>
            <p className="mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
              This request will go through: Branch Manager → Supervisor → General Manager → Chairman/CEO
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" disabled={saving} onClick={() => setShowSubmit(false)} className="border px-4 py-2.5 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                {saving ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />} Submit
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
