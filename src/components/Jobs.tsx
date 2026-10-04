import { useState } from "react";
import { ArrowLeft } from "lucide-react";

const jobs = [
  { id: 1, title: "Staff Backend Engineer", dept: "Engineering", location: "San Francisco / Remote", type: "Full-time", status: "Active", posted: "Jun 28, 2026", daysOpen: 47, candidates: 34, target: 1 },
  { id: 2, title: "Head of Design", dept: "Design", location: "New York", type: "Full-time", status: "Active", posted: "Jun 13, 2026", daysOpen: 62, candidates: 12, target: 1 },
  { id: 3, title: "VP of Sales", dept: "Sales", location: "Any US", type: "Full-time", status: "Active", posted: "May 27, 2026", daysOpen: 88, candidates: 6, target: 1 },
  { id: 4, title: "Data Scientist III", dept: "Data", location: "Remote", type: "Full-time", status: "Active", posted: "Jul 16, 2026", daysOpen: 34, candidates: 22, target: 2 },
  { id: 5, title: "Senior Product Manager", dept: "Product", location: "Austin", type: "Full-time", status: "Active", posted: "Jul 22, 2026", daysOpen: 28, candidates: 18, target: 1 },
  { id: 6, title: "DevOps Engineer II", dept: "Infrastructure", location: "Remote", type: "Full-time", status: "Active", posted: "Aug 1, 2026", daysOpen: 18, candidates: 9, target: 2 },
  { id: 7, title: "Frontend Engineer", dept: "Engineering", location: "SF / NYC / Remote", type: "Full-time", status: "Active", posted: "Aug 3, 2026", daysOpen: 16, candidates: 41, target: 3 },
  { id: 8, title: "Sales Development Rep", dept: "Sales", location: "Chicago", type: "Full-time", status: "Paused", posted: "Jul 10, 2026", daysOpen: 40, candidates: 8, target: 4 },
  { id: 9, title: "UX Researcher", dept: "Design", location: "Remote", type: "Contract", status: "Active", posted: "Aug 8, 2026", daysOpen: 11, candidates: 5, target: 1 },
  { id: 10, title: "ML Platform Engineer", dept: "Data", location: "Remote", type: "Full-time", status: "Draft", posted: "—", daysOpen: 0, candidates: 0, target: 1 },
];

const statusColor: Record<string, string> = {
  Active: "#10b981",
  Paused: "#f59e0b",
  Draft: "#6b7280",
  Closed: "#ef4444",
};

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selected, setSelected] = useState<typeof jobs[0] | null>(null);
  const [showNew, setShowNew] = useState(false);

  const filtered = jobs.filter((j) => {
    const ms = j.title.toLowerCase().includes(search.toLowerCase());
    const md = deptFilter === "All" || j.dept === deptFilter;
    const mst = statusFilter === "All" || j.status === statusFilter;
    return ms && md && mst;
  });

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-8 py-6 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>Job Postings</h1>
            <button
              onClick={() => setShowNew(true)}
              className="px-4 py-2 text-sm font-600 rounded"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              + New Job
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 text-sm rounded border outline-none flex-1"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded border outline-none"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              <option>All</option>
              {["Engineering", "Design", "Data", "Sales", "Product", "Infrastructure"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded border outline-none"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
            >
              <option>All</option>
              <option>Active</option>
              <option>Paused</option>
              <option>Draft</option>
            </select>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Role", "Department", "Location", "Status", "Days Open", "Candidates", "Posted"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr
                  key={j.id}
                  className="border-b cursor-pointer transition-colors"
                  style={{
                    borderColor: "var(--border)",
                    background: selected?.id === j.id ? "var(--secondary)" : "transparent",
                  }}
                  onClick={() => setSelected(selected?.id === j.id ? null : j)}
                >
                  <td className="px-5 py-4">
                    <div className="font-600" style={{ color: "var(--foreground)" }}>{j.title}</div>
                    <div className="text-xs mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{j.type} · {j.target} hire{j.target !== 1 ? "s" : ""}</div>
                  </td>
                  <td className="px-5 py-4 text-sm" style={{ color: "var(--foreground)" }}>{j.dept}</td>
                  <td className="px-5 py-4 text-xs" style={{ color: "var(--muted-foreground)" }}>{j.location}</td>
                  <td className="px-5 py-4">
                    <span
                      className="mono text-xs font-600 px-2 py-1 rounded"
                      style={{ color: statusColor[j.status], background: statusColor[j.status] + "20" }}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 mono text-sm" style={{ color: j.daysOpen > 60 ? "#ef4444" : j.daysOpen > 30 ? "#f59e0b" : "var(--foreground)" }}>
                    {j.daysOpen > 0 ? `${j.daysOpen}d` : "—"}
                  </td>
                  <td className="px-5 py-4 mono text-sm" style={{ color: "var(--foreground)" }}>{j.candidates}</td>
                  <td className="px-5 py-4 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{j.posted}</td>
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
            <h2 className="text-base font-700 mb-1" style={{ color: "var(--foreground)" }}>{selected.title}</h2>
            <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>{selected.dept} · {selected.location}</p>
            <span
              className="mono text-xs font-600 px-2 py-1 rounded"
              style={{ color: statusColor[selected.status], background: statusColor[selected.status] + "20" }}
            >
              {selected.status}
            </span>
          </div>
          <div className="p-6 space-y-4">
            {[
              { label: "Type", value: selected.type },
              { label: "Target Hires", value: selected.target.toString() },
              { label: "Posted", value: selected.posted },
              { label: "Days Open", value: selected.daysOpen > 0 ? `${selected.daysOpen} days` : "Not posted" },
              { label: "Candidates", value: selected.candidates.toString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                View Candidates
              </button>
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                Edit Job
              </button>
              {selected.status === "Active" && (
                <button className="py-2 text-sm rounded border" style={{ borderColor: "#ef444440", color: "#ef4444" }}>
                  Pause Posting
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0008" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>New Job Posting</h2>
            <div className="space-y-4">
              {[
                { label: "Job Title", placeholder: "e.g. Senior Frontend Engineer" },
                { label: "Department", placeholder: "e.g. Engineering" },
                { label: "Location", placeholder: "e.g. Remote / San Francisco" },
              ].map(({ label, placeholder }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1.5 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1.5 block" style={{ color: "var(--muted-foreground)" }}>Employment Type</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <option>Full-time</option>
                  <option>Part-time</option>
                  <option>Contract</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                Create Job
              </button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
