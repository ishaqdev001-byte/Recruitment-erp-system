"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileText,
  Loader2,
  Paperclip,
  Upload,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import AttachmentDrawer from "./AttachmentDrawer";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExamResult = "pending" | "fit" | "unfit";

type MedicalAppointment = {
  id: string;
  candidateId: string | null;
  candidateFileNumber: string | null;
  candidateStage: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  age: number;
  passportNumber: string;
  phone: string;
  appointmentAt: string;
  feeAmount: number;
  serviceName: string;
  status: "booked" | "completed" | "cancelled";
  examResult: ExamResult;
  examNotes: string;
  examinedAt: string | null;
  paymentReference: string;
  createdAt: string;
};

type MedicalStats = {
  total: number;
  examined: number;
  fit: number;
  unfit: number;
  pending: number;
};

type ApiPayload = {
  appointments?: MedicalAppointment[];
  stats?: MedicalStats;
  canUpdate?: boolean;
  error?: string;
};

type DrawerCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  fileNumber: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const inputClass = "mt-1 w-full border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-700 uppercase tracking-wider";

const RESULT_LABELS: Record<ExamResult, string> = { pending: "Pending", fit: "Fit", unfit: "Unfit" };
const RESULT_COLORS: Record<ExamResult, string> = { pending: "#f59e0b", fit: "#10b981", unfit: "#ef4444" };
const RESULT_BG: Record<ExamResult, string> = { pending: "#f59e0b22", fit: "#10b98122", unfit: "#ef444422" };

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-4 border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `${color}22` }}>
        <Icon size={20} aria-hidden="true" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-700 leading-none" style={{ color }}>{value}</p>
        <p className="mt-1 text-xs font-600 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{label}</p>
      </div>
    </div>
  );
}

// ─── Exam Result Form modal ───────────────────────────────────────────────────

function ExamResultModal({
  appointment,
  onClose,
  onSaved,
}: {
  appointment: MedicalAppointment;
  onClose: () => void;
  onSaved: (updated: Partial<MedicalAppointment>) => void;
}) {
  const [result, setResult] = useState<"fit" | "unfit">(appointment.examResult === "unfit" ? "unfit" : "fit");
  const [notes, setNotes] = useState(appointment.examNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/medical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-exam-result",
          appointmentId: appointment.id,
          examResult: result,
          examNotes: notes,
        }),
      });
      const payload = await response.json() as { error?: string; updated?: Partial<MedicalAppointment> };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save examination result.");
      onSaved({ examResult: result, examNotes: notes, status: "completed", examinedAt: new Date().toISOString() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save result.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={save}
        className="w-full max-w-md border p-6"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <h2 className="mb-1 text-base font-700" style={{ color: "var(--foreground)" }}>
          Record Examination Result
        </h2>
        <p className="mb-5 text-xs" style={{ color: "var(--muted-foreground)" }}>
          {appointment.firstName} {appointment.lastName} · {appointment.passportNumber}
        </p>

        {error && (
          <div role="alert" className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
        )}

        <div className="mb-4">
          <p className={`${labelClass} mb-2`} style={{ color: "var(--muted-foreground)" }}>Examination Result</p>
          <div className="flex gap-3">
            {(["fit", "unfit"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResult(r)}
                className="flex flex-1 items-center justify-center gap-2 border py-2.5 text-sm font-600 transition-colors"
                style={{
                  borderColor: result === r ? RESULT_COLORS[r] : "var(--border)",
                  background: result === r ? RESULT_BG[r] : "transparent",
                  color: result === r ? RESULT_COLORS[r] : "var(--muted-foreground)",
                }}
              >
                {r === "fit" ? <UserCheck size={15} aria-hidden="true" /> : <UserX size={15} aria-hidden="true" />}
                {r === "fit" ? "Medically Fit" : "Medically Unfit"}
              </button>
            ))}
          </div>
        </div>

        {result === "unfit" && (
          <div className="mb-4 border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs" style={{ color: "#ef4444" }}>
            <AlertTriangle size={13} className="mr-1 inline" aria-hidden="true" />
            An urgent alert email will be sent to the Supervisor, General Manager, and CEO.
          </div>
        )}

        <label className={`${labelClass} mb-1`} style={{ color: "var(--muted-foreground)" }}>
          Doctor&apos;s Notes
          <textarea
            rows={4}
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Findings, conditions observed, recommendations…"
            className="mt-1 w-full border px-3 py-2 text-sm outline-none resize-y"
            style={fieldStyle}
          />
        </label>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="border px-4 py-2.5 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 text-sm font-600 disabled:opacity-50"
            style={{ background: result === "unfit" ? "#ef4444" : "var(--primary)", color: "#fff" }}
          >
            {saving ? "Saving…" : "Save Result"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Upload Report Button ─────────────────────────────────────────────────────

function UploadReportButton({ appointment, onUploaded }: { appointment: MedicalAppointment; onUploaded: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("documentType", "medical");
      formData.set("notes", `Medical report — ${appointment.serviceName} · ${new Date(appointment.appointmentAt).toLocaleDateString()}`);

      const response = await fetch(`/api/candidates/${encodeURIComponent(appointment.candidateId!)}/documents`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
        aria-label={`Upload medical report for ${appointment.firstName} ${appointment.lastName}`}
      />
      <button
        type="button"
        disabled={uploading || !appointment.candidateId}
        title={!appointment.candidateId ? "Link the candidate to the appointment first" : "Upload a medical report (PDF, image)"}
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600 disabled:opacity-50"
        style={{ borderColor: "var(--border)", color: "var(--primary)" }}
      >
        {uploading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Upload size={13} aria-hidden="true" />}
        {uploading ? "Uploading…" : "Upload Report"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedicalManagement() {
  const [appointments, setAppointments] = useState<MedicalAppointment[]>([]);
  const [stats, setStats] = useState<MedicalStats>({ total: 0, examined: 0, fit: 0, unfit: 0, pending: 0 });
  const [canUpdate, setCanUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterResult, setFilterResult] = useState<ExamResult | "all">("all");
  const [examTarget, setExamTarget] = useState<MedicalAppointment | null>(null);
  const [drawerCandidate, setDrawerCandidate] = useState<DrawerCandidate | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadRefreshKey, setUploadRefreshKey] = useState(0);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/medical", { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(payload.error ?? "Unable to load medical data.");
      setAppointments(payload.appointments ?? []);
      setStats(payload.stats ?? { total: 0, examined: 0, fit: 0, unfit: 0, pending: 0 });
      setCanUpdate(Boolean(payload.canUpdate));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load medical data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [uploadRefreshKey]);

  const filtered = filterResult === "all"
    ? appointments
    : appointments.filter((a) => a.examResult === filterResult);

  const handleExamSaved = (id: string, updates: Partial<MedicalAppointment>) => {
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, ...updates }
          : a
      )
    );
    const updated = appointments.find((a) => a.id === id);
    if (updated && updates.examResult) {
      const newResult = updates.examResult as ExamResult;
      setStats((s) => {
        const wasUnexamined = updated.examResult === "pending";
        return {
          ...s,
          examined: wasUnexamined ? s.examined + 1 : s.examined,
          pending: wasUnexamined ? s.pending - 1 : s.pending,
          fit: newResult === "fit" ? s.fit + (updated.examResult !== "fit" ? 1 : 0) : s.fit - (updated.examResult === "fit" ? 1 : 0),
          unfit: newResult === "unfit" ? s.unfit + (updated.examResult !== "unfit" ? 1 : 0) : s.unfit - (updated.examResult === "unfit" ? 1 : 0),
        };
      });
    }
    if (updates.examResult === "unfit") {
      setNotice("Examination result saved. Urgent alert sent to Supervisor, GM, and CEO.");
    } else {
      setNotice("Examination result saved successfully.");
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="med-mgmt-title">

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h1 id="med-mgmt-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Medical Examinations</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            View booked candidates, record examination results, and upload medical reports.
          </p>
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <div role="alert" className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
      )}
      {notice && (
        <div role="status" className="mx-6 mt-4 border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
          {notice}
          <button type="button" onClick={() => setNotice("")} className="ml-3 text-xs opacity-70 hover:opacity-100">×</button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5 space-y-6">

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <StatCard label="Total Booked" value={stats.total} color="var(--primary)" icon={CalendarDays} />
          <StatCard label="Examined" value={stats.examined} color="#3b82f6" icon={ClipboardList} />
          <StatCard label="Medically Fit" value={stats.fit} color="#10b981" icon={UserCheck} />
          <StatCard label="Medically Unfit" value={stats.unfit} color="#ef4444" icon={UserX} />
          <StatCard label="Awaiting Exam" value={stats.pending} color="#f59e0b" icon={Activity} />
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Filter:</span>
          {(["all", "pending", "fit", "unfit"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterResult(f)}
              className="px-3 py-1.5 text-xs font-600 border transition-colors"
              style={{
                borderColor: filterResult === f ? (f === "all" ? "var(--primary)" : RESULT_COLORS[f as ExamResult]) : "var(--border)",
                background: filterResult === f ? (f === "all" ? "var(--primary)" : RESULT_BG[f as ExamResult]) : "transparent",
                color: filterResult === f ? (f === "all" ? "var(--primary-foreground)" : RESULT_COLORS[f as ExamResult]) : "var(--muted-foreground)",
              }}
            >
              {f === "all" ? `All (${stats.total})` : f === "pending" ? `Awaiting (${stats.pending})` : f === "fit" ? `Fit (${stats.fit})` : `Unfit (${stats.unfit})`}
            </button>
          ))}
        </div>

        {/* Appointments table */}
        {loading ? (
          <div className="flex items-center justify-center py-16" style={{ color: "var(--muted-foreground)" }}>
            <Loader2 size={22} className="animate-spin mr-2" aria-hidden="true" />
            <span className="text-sm">Loading appointments…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="border px-6 py-12 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            No appointments found{filterResult !== "all" ? ` for the "${filterResult}" filter` : ""}.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((appt) => {
              const isExpanded = expandedId === appt.id;
              const resultColor = RESULT_COLORS[appt.examResult];
              const resultBg = RESULT_BG[appt.examResult];

              return (
                <article
                  key={appt.id}
                  className="border"
                  style={{ borderColor: appt.examResult === "unfit" ? "#ef444440" : "var(--border)", background: "var(--card)" }}
                >
                  {/* Row header - responsive grid layout instead of flex-wrap */}
                  <div className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns: "auto 1fr auto auto auto", alignItems: "center" }}>
                    {/* Column 1: Avatar + Name/ID */}
                    <div className="flex min-w-0 items-center gap-3" style={{ gridColumn: "1 / -1" }}>
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-700"
                        style={{ background: resultBg, color: resultColor }}
                        aria-hidden="true"
                      >
                        {appt.firstName[0]}{appt.lastName[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-700" style={{ color: "var(--foreground)" }}>
                          {appt.firstName} {appt.lastName}
                        </p>
                        <p className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {appt.candidateFileNumber ? `#${appt.candidateFileNumber}` : appt.passportNumber}
                          {appt.candidateStage ? ` · ${appt.candidateStage}` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Column 2: Appointment date (hidden on mobile) */}
                    <div className="hidden sm:flex text-xs shrink-0 items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                      <CalendarDays size={12} aria-hidden="true" />
                      <span className="truncate">{fmt(appt.appointmentAt)}</span>
                    </div>

                    {/* Column 3: Service (hidden on tablet and below) */}
                    <div className="hidden md:block text-xs shrink-0 truncate" style={{ color: "var(--muted-foreground)" }}>
                      {appt.serviceName}
                    </div>

                    {/* Column 4: Result badge */}
                    <span
                      className="shrink-0 rounded px-2.5 py-1 text-xs font-700 uppercase text-center"
                      style={{ background: resultBg, color: resultColor }}
                    >
                      {RESULT_LABELS[appt.examResult]}
                    </span>

                    {/* Column 5: Actions - flex container on its own line */}
                    <div className="flex shrink-0 items-center gap-2 justify-end" style={{ gridColumn: "1 / -1" }}>
                      {canUpdate && appt.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => setExamTarget(appt)}
                          className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600 whitespace-nowrap"
                          style={{
                            borderColor: appt.examResult === "pending" ? "var(--primary)" : "var(--border)",
                            color: appt.examResult === "pending" ? "var(--primary)" : "var(--muted-foreground)",
                          }}
                        >
                          <FileText size={12} aria-hidden="true" />
                          <span className="hidden xs:inline">{appt.examResult === "pending" ? "Record Result" : "Update Result"}</span>
                          <span className="inline xs:hidden">{appt.examResult === "pending" ? "Record" : "Update"}</span>
                        </button>
                      )}
                      {canUpdate && appt.candidateId && (
                        <UploadReportButton
                          appointment={appt}
                          onUploaded={() => {
                            setNotice("Medical report uploaded to candidate documents.");
                            setUploadRefreshKey((k) => k + 1);
                          }}
                        />
                      )}
                      {appt.candidateId && (
                        <button
                          type="button"
                          title="View candidate document drawer"
                          onClick={() =>
                            setDrawerCandidate({
                              id: appt.candidateId!,
                              firstName: appt.firstName,
                              lastName: appt.lastName,
                              fileNumber: appt.candidateFileNumber ?? "—",
                            })
                          }
                          className="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-600"
                          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                        >
                          <Paperclip size={12} aria-hidden="true" />
                          <span className="hidden xs:inline">Docs</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : appt.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse details" : "Expand details"}
                        className="flex items-center justify-center border p-1.5 shrink-0"
                        style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                      >
                        <ChevronDown
                          size={14}
                          aria-hidden="true"
                          style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms" }}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div
                      className="grid grid-cols-2 gap-x-8 gap-y-2 border-t px-4 py-4 text-xs sm:grid-cols-3 lg:grid-cols-4"
                      style={{ borderColor: "var(--border)", background: "var(--secondary)" }}
                    >
                      <div>
                        <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Date of Birth</p>
                        <p style={{ color: "var(--foreground)" }}>{appt.dateOfBirth || "—"} ({appt.age}y)</p>
                      </div>
                      <div>
                        <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Phone</p>
                        <p style={{ color: "var(--foreground)" }}>{appt.phone}</p>
                      </div>
                      <div>
                        <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Appointment</p>
                        <p style={{ color: "var(--foreground)" }}>{fmt(appt.appointmentAt)}</p>
                      </div>
                      <div>
                        <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Service</p>
                        <p style={{ color: "var(--foreground)" }}>{appt.serviceName}</p>
                      </div>
                      <div>
                        <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Booking Status</p>
                        <p className="capitalize" style={{ color: "var(--foreground)" }}>{appt.status}</p>
                      </div>
                      <div>
                        <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Reference</p>
                        <p className="font-mono" style={{ color: "var(--foreground)" }}>{appt.paymentReference || "—"}</p>
                      </div>
                      {appt.examinedAt && (
                        <div>
                          <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Examined At</p>
                          <p style={{ color: "var(--foreground)" }}>{fmt(appt.examinedAt)}</p>
                        </div>
                      )}
                      {appt.examNotes && (
                        <div className="col-span-2 lg:col-span-4">
                          <p className="font-700 uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>Doctor&apos;s Notes</p>
                          <p className="whitespace-pre-line" style={{ color: "var(--foreground)" }}>{appt.examNotes}</p>
                        </div>
                      )}
                      {appt.examResult === "unfit" && (
                        <div className="col-span-2 lg:col-span-4 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">
                          <XCircle size={14} style={{ color: "#ef4444" }} aria-hidden="true" />
                          <span className="text-xs font-700" style={{ color: "#ef4444" }}>
                            Declared Medically Unfit — Alert sent to Supervisor, GM, and CEO
                          </span>
                        </div>
                      )}
                      {appt.examResult === "fit" && (
                        <div className="col-span-2 lg:col-span-4 flex items-center gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                          <CheckCircle2 size={14} style={{ color: "#10b981" }} aria-hidden="true" />
                          <span className="text-xs font-700" style={{ color: "#10b981" }}>Declared Medically Fit</span>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Exam result modal */}
      {examTarget && (
        <ExamResultModal
          appointment={examTarget}
          onClose={() => setExamTarget(null)}
          onSaved={(updates) => {
            handleExamSaved(examTarget.id, updates);
            setExamTarget(null);
          }}
        />
      )}

      {/* Candidate document drawer — shows only medical documents */}
      {drawerCandidate && (
        <AttachmentDrawer
          candidate={drawerCandidate}
          onClose={() => setDrawerCandidate(null)}
          onUpload={() => setNotice("Document uploaded to candidate file.")}
        />
      )}
    </section>
  );
}
