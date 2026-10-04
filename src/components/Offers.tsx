import { useState } from "react";
import { ArrowLeft } from "lucide-react";

const offers = [
  { id: 1, candidate: "Marcus Chen", role: "Senior Engineer", dept: "Engineering", salary: "$185,000", equity: "0.08%", bonus: "$20,000", status: "Accepted", sent: "Aug 10, 2026", deadline: "Aug 17, 2026", avatar: "MC" },
  { id: 2, candidate: "Yuki Tanaka", role: "Frontend Engineer", dept: "Engineering", salary: "$160,000", equity: "0.05%", bonus: "$15,000", status: "Pending", sent: "Aug 12, 2026", deadline: "Aug 19, 2026", avatar: "YT" },
  { id: 3, candidate: "Sofia Reyes", role: "Staff Backend Engineer", dept: "Engineering", salary: "$220,000", equity: "0.12%", bonus: "$25,000", status: "Draft", sent: "—", deadline: "—", avatar: "SR" },
  { id: 4, candidate: "Tariq Hassan", role: "ML Engineer", dept: "Data", salary: "$195,000", equity: "0.09%", bonus: "$20,000", status: "Draft", sent: "—", deadline: "—", avatar: "TH" },
  { id: 5, candidate: "Amir Siddiqui", role: "Head of Design", dept: "Design", salary: "$210,000", equity: "0.11%", bonus: "$22,000", status: "Declined", sent: "Jul 28, 2026", deadline: "Aug 4, 2026", avatar: "AS" },
  { id: 6, candidate: "Lena Fischer", role: "VP of Sales", dept: "Sales", salary: "$250,000", equity: "0.15%", bonus: "$50,000", status: "Expired", sent: "Jul 15, 2026", deadline: "Jul 22, 2026", avatar: "LF" },
];

const statusColor: Record<string, string> = {
  Accepted: "#10b981",
  Pending: "#f59e0b",
  Draft: "#6b7280",
  Declined: "#ef4444",
  Expired: "#6b7280",
};

const avatarBg = ["#6366f1", "#8b5cf6", "#f59e0b", "#3b82f6", "#10b981", "#ec4899"];

export default function Offers() {
  const [selected, setSelected] = useState<typeof offers[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = offers.filter((o) => statusFilter === "All" || o.status === statusFilter);

  const stats = {
    total: offers.length,
    accepted: offers.filter((o) => o.status === "Accepted").length,
    pending: offers.filter((o) => o.status === "Pending").length,
    declined: offers.filter((o) => o.status === "Declined").length,
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-6 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>Offers</h1>
            <button className="px-4 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              + Create Offer
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: "Total", value: stats.total, color: "var(--foreground)" },
              { label: "Accepted", value: stats.accepted, color: "#10b981" },
              { label: "Pending", value: stats.pending, color: "#f59e0b" },
              { label: "Declined", value: stats.declined, color: "#ef4444" },
            ].map((s) => (
              <div key={s.label} className="rounded border p-3 text-center" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                <div className="mono text-xl font-700" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {["All", "Draft", "Pending", "Accepted", "Declined", "Expired"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-3 py-1.5 text-xs font-600 rounded transition-colors"
                style={{
                  background: statusFilter === s ? "var(--primary)" : "var(--secondary)",
                  color: statusFilter === s ? "var(--primary-foreground)" : "var(--muted-foreground)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Candidate", "Role", "Compensation", "Equity", "Status", "Sent", "Deadline"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr
                  key={o.id}
                  className="border-b cursor-pointer transition-colors"
                  style={{ borderColor: "var(--border)", background: selected?.id === o.id ? "var(--secondary)" : "transparent" }}
                  onClick={() => setSelected(selected?.id === o.id ? null : o)}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700 shrink-0"
                        style={{ background: avatarBg[i % avatarBg.length] + "30", color: avatarBg[i % avatarBg.length] }}
                      >
                        {o.avatar}
                      </div>
                      <div className="font-600" style={{ color: "var(--foreground)" }}>{o.candidate}</div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--muted-foreground)" }}>{o.role}</td>
                  <td className="px-5 py-4 mono font-600" style={{ color: "var(--foreground)" }}>{o.salary}</td>
                  <td className="px-5 py-4 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{o.equity}</td>
                  <td className="px-5 py-4">
                    <span
                      className="mono text-xs font-600 px-2 py-1 rounded"
                      style={{ color: statusColor[o.status], background: statusColor[o.status] + "20" }}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{o.sent}</td>
                  <td className="px-5 py-4 mono text-xs" style={{ color: o.status === "Pending" ? "#f59e0b" : "var(--muted-foreground)" }}>
                    {o.deadline}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="detail-panel w-80 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-6 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelected(null)} className="text-xs mb-4 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <h2 className="text-base font-700 mb-1" style={{ color: "var(--foreground)" }}>{selected.candidate}</h2>
            <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>{selected.role} · {selected.dept}</p>
            <span
              className="mono text-xs font-600 px-2 py-1 rounded"
              style={{ color: statusColor[selected.status], background: statusColor[selected.status] + "20" }}
            >
              {selected.status}
            </span>
          </div>
          <div className="p-6 space-y-5">
            <div>
              <div className="text-xs font-700 uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>Compensation Package</div>
              <div className="rounded border p-4 space-y-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}>
                {[
                  { label: "Base Salary", value: selected.salary },
                  { label: "Annual Bonus", value: selected.bonus },
                  { label: "Equity", value: selected.equity },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span>
                    <span className="mono text-sm font-700" style={{ color: "var(--foreground)" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {[
              { label: "Sent", value: selected.sent },
              { label: "Response Deadline", value: selected.deadline },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm mono" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}

            <div className="flex flex-col gap-2 pt-2">
              {selected.status === "Draft" && (
                <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                  Send Offer
                </button>
              )}
              {selected.status === "Pending" && (
                <button className="py-2 text-sm font-600 rounded" style={{ background: "#ef4444", color: "#fff" }}>
                  Rescind Offer
                </button>
              )}
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
