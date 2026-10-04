import { TrendingDown, TrendingUp } from "lucide-react";

const monthlyHires = [
  { month: "Feb", value: 4 },
  { month: "Mar", value: 7 },
  { month: "Apr", value: 5 },
  { month: "May", value: 9 },
  { month: "Jun", value: 12 },
  { month: "Jul", value: 8 },
  { month: "Aug", value: 6 },
];

const sourceData = [
  { source: "LinkedIn", count: 142, pct: 46 },
  { source: "Referral", count: 68, pct: 22 },
  { source: "GitHub", count: 37, pct: 12 },
  { source: "Indeed", count: 29, pct: 9 },
  { source: "Other", count: 36, pct: 11 },
];

const sourceColors = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#6b7280"];

const deptMetrics = [
  { dept: "Engineering", tth: 21, ttf: 38, acceptance: 84, positions: 18 },
  { dept: "Design", tth: 17, ttf: 29, acceptance: 91, positions: 6 },
  { dept: "Data", tth: 25, ttf: 42, acceptance: 78, positions: 8 },
  { dept: "Sales", tth: 14, ttf: 23, acceptance: 88, positions: 11 },
  { dept: "Product", tth: 19, ttf: 35, acceptance: 82, positions: 4 },
  { dept: "Infrastructure", tth: 23, ttf: 41, acceptance: 75, positions: 5 },
];

const maxHires = Math.max(...monthlyHires.map((m) => m.value));

export default function Analytics() {
  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>Analytics</h1>
        <p className="text-sm mono mt-1" style={{ color: "var(--muted-foreground)" }}>
          YTD 2026 · Aggregated recruitment performance
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Applications", value: "1,847", sub: "+24% vs last year" },
          { label: "Hires Completed", value: "51", sub: "of 98 target" },
          { label: "Avg Time-to-Hire", value: "18d", sub: "-3d vs Q1" },
          { label: "Offer Acceptance", value: "82%", sub: "+5pp vs last year" },
        ].map((k) => (
          <div key={k.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-xs uppercase tracking-widest font-700 mb-2" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            <div className="mono text-3xl font-700 mb-1" style={{ color: "var(--foreground)" }}>{k.value}</div>
            <div className="text-xs" style={{ color: "#10b981" }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="analytics-content-grid grid gap-6 mb-6">
        <div className="rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-xs font-700 uppercase tracking-widest mb-6" style={{ color: "var(--muted-foreground)" }}>Monthly Hires</h2>
          <div className="flex items-end gap-3 h-40">
            {monthlyHires.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="mono text-xs font-600" style={{ color: "var(--foreground)" }}>{m.value}</span>
                <div className="w-full rounded-t relative overflow-hidden" style={{ height: `${(m.value / maxHires) * 120}px` }}>
                  <div
                    className="absolute inset-0 rounded-t"
                    style={{
                      background: "linear-gradient(to top, var(--primary), var(--primary)88)",
                    }}
                  />
                </div>
                <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{m.month}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h2 className="text-xs font-700 uppercase tracking-widest mb-5" style={{ color: "var(--muted-foreground)" }}>Candidate Sources</h2>
          <div className="space-y-3">
            {sourceData.map((s, i) => (
              <div key={s.source}>
                <div className="flex justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: sourceColors[i] }} />
                    <span className="text-sm" style={{ color: "var(--foreground)" }}>{s.source}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{s.count}</span>
                    <span className="mono text-xs font-600" style={{ color: "var(--foreground)" }}>{s.pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--secondary)" }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${s.pct}%`, background: sourceColors[i] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
            Department Performance
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              {["Department", "Open Positions", "Avg Time-to-Hire", "Avg Time-to-Fill", "Acceptance Rate"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deptMetrics.map((d) => (
              <tr key={d.dept} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="px-5 py-4 font-600" style={{ color: "var(--foreground)" }}>{d.dept}</td>
                <td className="px-5 py-4 mono text-center" style={{ color: "var(--foreground)" }}>{d.positions}</td>
                <td className="px-5 py-4">
                  <span
                    className="mono text-sm font-700"
                    style={{ color: d.tth > 20 ? "#ef4444" : d.tth > 15 ? "#f59e0b" : "#10b981" }}
                  >
                    {d.tth}d
                  </span>
                </td>
                <td className="px-5 py-4 mono text-sm" style={{ color: "var(--muted-foreground)" }}>{d.ttf}d</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 rounded-full" style={{ background: "var(--secondary)" }}>
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${d.acceptance}%`,
                          background: d.acceptance >= 85 ? "#10b981" : d.acceptance >= 75 ? "#f59e0b" : "#ef4444",
                        }}
                      />
                    </div>
                    <span className="mono text-xs font-700" style={{ color: "var(--foreground)" }}>{d.acceptance}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-6">
        {[
          { label: "Pipeline Conversion", value: "2.8%", detail: "Applications to hire", trend: "0.4pp", improving: true },
          { label: "Avg Interviews / Hire", value: "4.2", detail: "Interview rounds", trend: "0.3", improving: true },
          { label: "Cost per Hire", value: "$8,400", detail: "Avg across all depts", trend: "$320", improving: true },
        ].map((m) => (
          <div key={m.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="text-xs uppercase tracking-widest font-700 mb-2" style={{ color: "var(--muted-foreground)" }}>{m.label}</div>
            <div className="mono text-2xl font-700 mb-1" style={{ color: "var(--foreground)" }}>{m.value}</div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{m.detail}</span>
              <span className="mono text-xs font-600 flex items-center gap-1" style={{ color: "#10b981" }}>
                {m.improving ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                {m.trend}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
