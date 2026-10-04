import { useState } from "react";

const kpis = [
  { label: "Total Candidates", value: "2,274", color: "#6366f1", change: "+28 this month" },
  { label: "Successful Placements", value: "847", color: "#10b981", change: "+12 this month" },
  { label: "Total Revenue", value: "UGX 87.4M", color: "#f59e0b", change: "+18% vs last year" },
  { label: "Total Expenses", value: "UGX 34.2M", color: "#ef4444", change: "+7% vs last year" },
  { label: "Net Profit", value: "UGX 53.2M", color: "#3b82f6", change: "+24% vs last year" },
  { label: "Outstanding Payments", value: "UGX 12.8M", color: "#8b5cf6", change: "43 candidates" },
  { label: "Candidate Deposits", value: "UGX 18.1M", color: "#14b8a6", change: "This year" },
  { label: "Profit Margin", value: "60.9%", color: "#ec4899", change: "+3.2pp vs last year" },
  { label: "Company Growth", value: "+24%", color: "#f97316", change: "Year over year" },
];

const agentPerf = [
  { agent: "Director Vicent", candidates: 87, placements: 42, revenue: "UGX 28.4M", passports: 8, pct: 94 },
  { agent: "Asiimwe David", candidates: 54, placements: 31, revenue: "UGX 18.2M", passports: 5, pct: 88 },
  { agent: "Fatuma Nakirya", candidates: 32, placements: 18, revenue: "UGX 11.9M", passports: 3, pct: 81 },
  { agent: "Aisha Tendo", candidates: 28, placements: 12, revenue: "UGX 7.8M", passports: 2, pct: 72 },
  { agent: "Peter Mukasa", candidates: 19, placements: 8, revenue: "UGX 5.2M", passports: 1, pct: 65 },
];

const stageReport = [
  { stage: "Registration", count: 312, pct: 100 },
  { stage: "Visa Under Process", count: 198, pct: 63 },
  { stage: "Visa Received", count: 87, pct: 28 },
  { stage: "Offered", count: 24, pct: 8 },
  { stage: "Travelled", count: 847, pct: 0 },
];

const stageColors = ["#6366f1", "#8b5cf6", "#f59e0b", "#3b82f6", "#10b981", "#ec4899"];

export default function Reports() {
  const [dateFilter, setDateFilter] = useState("This Year");
  const [agentFilter, setAgentFilter] = useState("All Agents");
  const [activeSection, setActiveSection] = useState<"overview" | "agents" | "stages">("overview");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Reports & Analytics</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Management-level analytics and performance reports</p>
        </div>
        <div className="flex gap-2">
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            {["Today", "This Week", "This Month", "This Year", "Custom Range"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option>All Agents</option>
            {["Director Vicent", "Asiimwe David", "Fatuma Nakirya"].map((a) => <option key={a}>{a}</option>)}
          </select>
          <button className="px-4 py-1.5 text-sm font-600 rounded border" style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--secondary)" }}>
            Export Report
          </button>
        </div>
      </div>

      <div className="flex border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {(["overview", "agents", "stages"] as const).map((s) => (
          <button key={s} onClick={() => setActiveSection(s)}
            className="px-5 py-3 text-sm font-600"
            style={{ color: activeSection === s ? "var(--primary)" : "var(--muted-foreground)", borderBottom: activeSection === s ? "2px solid var(--primary)" : "2px solid transparent" }}>
            {s === "overview" ? "Overview" : s === "agents" ? "Agent Performance" : "Stage Analysis"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeSection === "overview" && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {kpis.map((k) => (
                <div key={k.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-700 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
                  <div className="mono text-2xl font-700 mb-1" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-xs" style={{ color: "#10b981" }}>{k.change}</div>
                </div>
              ))}
            </div>
            <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>Passport Custody Statistics</h3>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "In Custody", value: "23", color: "#6366f1" },
                  { label: "Returned", value: "412", color: "#10b981" },
                  { label: "With Authority", value: "8", color: "#f59e0b" },
                  { label: "Issues", value: "3", color: "#ef4444" },
                ].map((s) => (
                  <div key={s.label} className="rounded border p-4 text-center" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                    <div className="mono text-2xl font-700" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-xs mt-1 font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeSection === "agents" && (
          <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Agent → Candidates → Passports → Revenue</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Agent", "Candidates", "Placements", "Revenue", "Passports in Custody", "Performance"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentPerf.map((a, i) => (
                  <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
                          style={{ background: "#6366f130", color: "#6366f1" }}>
                          {a.agent.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <span className="font-600" style={{ color: "var(--foreground)" }}>{a.agent}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 mono font-700" style={{ color: "var(--foreground)" }}>{a.candidates}</td>
                    <td className="px-4 py-4 mono font-700" style={{ color: "#10b981" }}>{a.placements}</td>
                    <td className="px-4 py-4 mono text-sm font-700" style={{ color: "#f59e0b" }}>{a.revenue}</td>
                    <td className="px-4 py-4 mono font-700" style={{ color: "#6366f1" }}>{a.passports}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full" style={{ background: "var(--secondary)", maxWidth: "100px" }}>
                          <div className="h-2 rounded-full" style={{
                            width: `${a.pct}%`,
                            background: a.pct >= 90 ? "#10b981" : a.pct >= 75 ? "#f59e0b" : "#ef4444",
                          }} />
                        </div>
                        <span className="mono text-xs font-700" style={{ color: "var(--foreground)" }}>{a.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === "stages" && (
          <div className="space-y-4">
            <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="text-xs font-700 uppercase tracking-widest mb-5" style={{ color: "var(--muted-foreground)" }}>Candidates by Stage</h3>
              {stageReport.map((s, i) => (
                <div key={s.stage} className="mb-4">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm font-600" style={{ color: "var(--foreground)" }}>{s.stage}</span>
                    <div className="flex gap-3">
                      <span className="mono text-sm font-700" style={{ color: stageColors[i] }}>{s.count}</span>
                      {s.pct > 0 && <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{s.pct}% conversion</span>}
                    </div>
                  </div>
                  {s.pct > 0 && (
                    <div className="h-2.5 rounded-full" style={{ background: "var(--secondary)" }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${s.pct}%`, background: stageColors[i] }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Cost per Placement", value: "UGX 4,040,000", color: "#ef4444" },
                { label: "Revenue per Placement", value: "UGX 10,320,000", color: "#10b981" },
                { label: "Profit per Placement", value: "UGX 6,280,000", color: "#f59e0b" },
              ].map((m) => (
                <div key={m.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-700 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>{m.label}</div>
                  <div className="mono text-xl font-700" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
