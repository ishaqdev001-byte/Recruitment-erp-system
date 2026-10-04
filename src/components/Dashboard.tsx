import { useMemo, useState } from "react";
import { FileCheck2, Plane, TriangleAlert, UserRound, UserRoundX, UsersRound } from "lucide-react";
import type { View, WorkspaceRole } from "../App";

// SVG donut chart
function DonutChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const r = 60;
  const cx = 80;
  const cy = 80;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((seg) => {
    const dash = (seg.value / total) * circumference;
    const gap = circumference - dash;
    const arc = { dash, gap, offset, ...seg };
    offset += dash;
    return arc;
  });
  return (
    <svg viewBox="0 0 160 160" className="w-36 h-36">
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth="22"
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset + circumference / 4}
          style={{ transition: "stroke-dasharray 0.5s" }}
        />
      ))}
      <circle cx={cx} cy={cy} r={49} fill="var(--card)" />
    </svg>
  );
}

const topKpis = [
  { label: "AGENTS", value: "145", color: "#6366f1", icon: UsersRound },
  { label: "CANDIDATES", value: "2,274", color: "#3b82f6", icon: UserRound },
  { label: "TRAVELLED", value: "847", color: "#10b981", icon: Plane },
  { label: "VISAS", value: "845", color: "#f59e0b", icon: FileCheck2 },
  { label: "WITHDRAWN", value: "132", color: "#ef4444", icon: UserRoundX },
  { label: "RUNAWAY", value: "0", color: "#1f2937", icon: TriangleAlert },
];

const statusSegments = [
  { label: "Travelled", value: 847, color: "#3b82f6" },
  { label: "Visa Received", value: 198, color: "#ec4899" },
  { label: "Withdrawn", value: 132, color: "#f59e0b" },
  { label: "Runaway", value: 0, color: "#10b981" },
];

const kpis = [
  { label: "Open Positions", value: "47", delta: "+3", up: true, mono: true },
  { label: "Active Candidates", value: "312", delta: "+28", up: true, mono: true },
  { label: "Interviews This Week", value: "24", delta: "-2", up: false, mono: true },
  { label: "Offers Extended", value: "9", delta: "+4", up: true, mono: true },
  { label: "Time-to-Hire (avg)", value: "18d", delta: "-2d", up: true, mono: true },
  { label: "Acceptance Rate", value: "82%", delta: "+5%", up: true, mono: true },
];

const recentActivity = [
  { time: "09:14", type: "offer", text: "Offer accepted — Marcus Chen, Senior Engineer", dept: "Engineering" },
  { time: "09:02", type: "interview", text: "Interview scheduled — Priya Nair, Product Designer", dept: "Design" },
  { time: "08:51", text: "Application received — James Okafor, DevOps Lead", type: "application", dept: "Infrastructure" },
  { time: "08:33", text: "Stage moved — Sofia Reyes → Technical Assessment", type: "stage", dept: "Engineering" },
  { time: "Yesterday", text: "Job posted — Head of Data Science", type: "job", dept: "Data" },
  { time: "Yesterday", text: "Offer declined — Tariq Hassan, ML Engineer", type: "offer_declined", dept: "Data" },
  { time: "Yesterday", text: "Interview completed — Yuki Tanaka, Frontend Engineer", type: "interview", dept: "Engineering" },
];

const urgentJobs = [
  { title: "Staff Backend Engineer", dept: "Engineering", days: 47, candidates: 12, stage: "Final Round" },
  { title: "Head of Design", dept: "Design", days: 62, candidates: 4, stage: "Offer" },
  { title: "VP of Sales", dept: "Sales", days: 88, candidates: 2, stage: "Assessment" },
  { title: "Data Scientist III", dept: "Data", days: 34, candidates: 8, stage: "Screening" },
];

const typeColor: Record<string, string> = {
  offer: "#10b981",
  offer_declined: "#ef4444",
  interview: "#f59e0b",
  application: "#6366f1",
  stage: "#8b5cf6",
  job: "#3b82f6",
};

const typeLabel: Record<string, string> = {
  offer: "OFFER",
  offer_declined: "DECLINED",
  interview: "INTERVIEW",
  application: "APPLIED",
  stage: "STAGE",
  job: "JOB",
};

const roleAlerts: Record<WorkspaceRole, { label: string; value: string; detail: string; view: View }[]> = {
  "Company Owner / Primary Administrator": [
    { label: "Company onboarding still needs final review", value: "Priority", detail: "Open settings and verify the workspace", view: "settings" },
    { label: "3 team members pending invite response", value: "Action", detail: "Review user access setup", view: "users" },
    { label: "System health is stable", value: "Stable", detail: "Audit the latest operational events", view: "auditlog" },
  ],
  "Recruitment Manager": [
    { label: "Recruitment funnel slowing", value: "Watch", detail: "Check conversion in analytics", view: "analytics" },
    { label: "4 vacancies need agent coverage", value: "Action", detail: "Review open roles", view: "jobs" },
    { label: "Two teams at capacity", value: "Forecast", detail: "Balance staffing load", view: "reports" },
  ],
  "Recruitment Agent": [
    { label: "7 candidates missing documents", value: "Urgent", detail: "Review and assign follow-ups", view: "documents" },
    { label: "3 passport renewals due", value: "This week", detail: "Open passport custody", view: "passport" },
    { label: "4 tasks due today", value: "Action", detail: "Follow up on assigned work", view: "tasks" },
  ],
  "Finance Manager": [
    { label: "5 payments awaiting approval", value: "Urgent", detail: "Review payout queue", view: "payments" },
    { label: "3 overdue invoices", value: "Priority", detail: "Open invoice list", view: "invoices" },
    { label: "UGX 18.5M pending transfers", value: "This week", detail: "Review finance overview", view: "finance" },
  ],
  "Finance Officer": [
    { label: "Review expense claims", value: "Today", detail: "Open finance overview", view: "finance" },
    { label: "2 invoice approvals pending", value: "Action", detail: "Review invoice approvals", view: "invoices" },
    { label: "Cash flow forecast updated", value: "Stable", detail: "Monitor balance and transfers", view: "payments" },
  ],
  "Document Officer": [
    { label: "Medical records require review", value: "Urgent", detail: "Open document approvals", view: "documents" },
    { label: "2 passports awaiting action", value: "This week", detail: "Open passport custody", view: "passport" },
    { label: "Compliance checklist due", value: "Action", detail: "Review document checkpoint", view: "documents" },
  ],
  "Medical Officer": [
    { label: "3 candidate medicals pending", value: "Action", detail: "Review appointment queue", view: "documents" },
    { label: "Follow-up required on labs", value: "Today", detail: "Open medical review list", view: "documents" },
    { label: "Medical clearance reports ready", value: "Ready", detail: "Check candidate status update", view: "candidates" },
  ],
  Viewer: [
    { label: "No direct actions required", value: "Review", detail: "Monitor team performance", view: "reports" },
    { label: "Weekly KPI summary ready", value: "Ready", detail: "Open analytics dashboard", view: "analytics" },
    { label: "Compliance snapshot fresh", value: "Stable", detail: "Review latest activity log", view: "auditlog" },
  ],
  Manager: [
    { label: "Recruitment funnel slowing", value: "Watch", detail: "Check conversion in analytics", view: "analytics" },
    { label: "4 vacancies need agent coverage", value: "Action", detail: "Review open roles", view: "jobs" },
    { label: "Two teams at capacity", value: "Forecast", detail: "Balance staffing load", view: "reports" },
  ],
  Administrator: [
    { label: "System health normal", value: "Stable", detail: "No blocking alerts", view: "auditlog" },
    { label: "2 security exceptions need review", value: "Review", detail: "Check audit log", view: "auditlog" },
    { label: "User permissions changed", value: "Today", detail: "Open users and roles", view: "users" },
  ],
  "Finance User": [
    { label: "5 payments awaiting approval", value: "Urgent", detail: "Review payout queue", view: "payments" },
    { label: "3 overdue invoices", value: "Priority", detail: "Open invoice list", view: "invoices" },
    { label: "UGX 18.5M pending transfers", value: "This week", detail: "Review finance overview", view: "finance" },
  ],
};

export default function Dashboard({ role, onNavigate }: { role: WorkspaceRole; onNavigate: (v: View) => void }) {
  const [tab, setTab] = useState<"activity" | "urgent">("activity");

  const attentionItems = useMemo(() => roleAlerts[role], [role]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-700 uppercase tracking-widest" style={{ borderColor: "var(--border)", background: "var(--secondary)", color: "var(--primary)" }}>
              {role} workspace
            </div>
            <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>
              What needs attention?
            </h1>
            <p className="text-sm mt-1 mono" style={{ color: "var(--muted-foreground)" }}>
              Focused actions for the next working cycle
            </p>
          </div>
          <button
            className="px-4 py-2 text-sm font-600 rounded transition-colors"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            + Quick action
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {attentionItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onNavigate(item.view)}
            className="rounded border p-4 text-left transition-transform hover:-translate-y-0.5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{item.value}</span>
              <span className="text-xs mono" style={{ color: "var(--primary)" }}>Open</span>
            </div>
            <div className="text-base font-700" style={{ color: "var(--foreground)" }}>{item.label}</div>
            <div className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>{item.detail}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-6 gap-3 mb-6">
        {topKpis.map((k) => (
          <div
            key={k.label}
            className="rounded border p-4 flex items-center gap-3"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            {(() => {
              const Icon = k.icon;
              return (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
              style={{ background: k.color + "22", color: k.color }}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
            </div>
              );
            })()}
            <div>
              <div className="mono text-xl font-700" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded border p-5 mb-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Today / This week</h3>
          <span className="text-xs mono" style={{ color: "var(--primary)" }}>Updated 5m ago</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Tasks due", value: "14", tone: "#f59e0b" },
            { label: "Interviews", value: "26", tone: "#6366f1" },
            { label: "Payments", value: "UGX 12.4M", tone: "#10b981" },
            { label: "Documents", value: "17 pending", tone: "#ec4899" },
          ].map((item) => (
            <div key={item.label} className="rounded p-3 border" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
              <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{item.label}</div>
              <div className="mt-2 text-2xl font-700 mono" style={{ color: item.tone }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border p-6 mb-6 flex items-start gap-8" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div>
          <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>Candidate Status</h3>
          <DonutChart segments={statusSegments} />
        </div>
        <div className="pt-8 space-y-3">
          {statusSegments.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="text-sm" style={{ color: "var(--foreground)" }}>{s.label}</span>
              <span className="mono text-sm font-700 ml-2" style={{ color: s.color }}>{s.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded p-5 border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="text-xs mb-3 uppercase tracking-widest font-600" style={{ color: "var(--muted-foreground)" }}>
              {k.label}
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-700 mono" style={{ color: "var(--foreground)" }}>{k.value}</span>
              <span
                className="text-xs font-600 mono px-1.5 py-0.5 rounded"
                style={{
                  color: k.up ? "#10b981" : "#ef4444",
                  background: k.up ? "#10b98120" : "#ef444420",
                }}
              >
                {k.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-content-grid grid gap-6">
        <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
            {(["activity", "urgent"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-5 py-3.5 text-sm font-600 uppercase tracking-wider transition-colors"
                style={{
                  color: tab === t ? "var(--primary)" : "var(--muted-foreground)",
                  borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
                }}
              >
                {t === "activity" ? "Recent Activity" : "Urgent Roles"}
              </button>
            ))}
          </div>

          {tab === "activity" ? (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-4 px-5 py-3.5 hover:bg-opacity-50 transition-colors"
                  style={{ ["--tw-bg-opacity" as string]: 0.5 }}>
                  <span className="mono text-xs pt-0.5 w-16 shrink-0" style={{ color: "var(--muted-foreground)" }}>{a.time}</span>
                  <span
                    className="mono text-xs font-600 px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: typeColor[a.type], background: typeColor[a.type] + "20" }}
                  >
                    {typeLabel[a.type]}
                  </span>
                  <div>
                    <p className="text-sm" style={{ color: "var(--foreground)" }}>{a.text}</p>
                    <p className="text-xs mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{a.dept}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {urgentJobs.map((j, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1">
                    <p className="text-sm font-600" style={{ color: "var(--foreground)" }}>{j.title}</p>
                    <p className="text-xs mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{j.dept} · {j.candidates} candidates</p>
                  </div>
                  <div className="text-right">
                    <span
                      className="mono text-xs font-700 px-2 py-1 rounded block mb-1"
                      style={{
                        color: j.days > 60 ? "#ef4444" : j.days > 30 ? "#f59e0b" : "#10b981",
                        background: j.days > 60 ? "#ef444420" : j.days > 30 ? "#f59e0b20" : "#10b98120",
                      }}
                    >
                      {j.days}d open
                    </span>
                    <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{j.stage}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>
              Pipeline Funnel
            </h3>
            {[
              { label: "Applications", count: 312, pct: 100, color: "#6366f1" },
              { label: "Screened", count: 198, pct: 63, color: "#8b5cf6" },
              { label: "Interviewed", count: 87, pct: 28, color: "#f59e0b" },
              { label: "Assessment", count: 42, pct: 13, color: "#3b82f6" },
              { label: "Final Round", count: 24, pct: 8, color: "#10b981" },
              { label: "Offered", count: 9, pct: 3, color: "#ec4899" },
            ].map((s) => (
              <div key={s.label} className="mb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-xs" style={{ color: "var(--foreground)" }}>{s.label}</span>
                  <span className="mono text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{s.count}</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--secondary)" }}>
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${s.pct}%`, background: s.color }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>
              By Department
            </h3>
            {[
              { dept: "Engineering", open: 18, filled: 4 },
              { dept: "Design", open: 6, filled: 2 },
              { dept: "Sales", open: 11, filled: 1 },
              { dept: "Data", open: 8, filled: 1 },
              { dept: "Operations", open: 4, filled: 0 },
            ].map((d) => (
              <div key={d.dept} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--foreground)" }}>{d.dept}</span>
                <div className="flex gap-3 mono text-xs">
                  <span style={{ color: "var(--primary)" }}>{d.open} open</span>
                  <span style={{ color: "var(--muted-foreground)" }}>{d.filled} filled</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
