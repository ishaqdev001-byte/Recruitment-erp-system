import { useState } from "react";

const agents = [
  { id: 1, name: "Director Vicent", phone: "0772001234", email: "vicent@agency.ug", branch: "Kampala", candidates: 87, status: "Active" },
  { id: 2, name: "Asiimwe David", phone: "0701234567", email: "david@agency.ug", branch: "Masaka", candidates: 54, status: "Active" },
  { id: 3, name: "Aisha Tendo", phone: "0789123456", email: "aisha@agency.ug", branch: "Kampala", candidates: 31, status: "Active" },
  { id: 4, name: "Peter Mukasa", phone: "0756789012", email: "peter@agency.ug", branch: "Gulu", candidates: 18, status: "Inactive" },
  { id: 5, name: "Fatuma Nakirya", phone: "0712345678", email: "fatuma@agency.ug", branch: "Mbarara", candidates: 22, status: "Active" },
  { id: 6, name: "Robert Ssekandi", phone: "0782001122", email: "robert@agency.ug", branch: "Entebbe", candidates: 9, status: "Active" },
];

export default function Agents() {
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const filtered = agents.filter(
    (a) => !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.branch.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-700" style={{ color: "var(--foreground)" }}>Agents</h1>
          <p className="text-sm mono mt-1" style={{ color: "var(--muted-foreground)" }}>
            {agents.filter((a) => a.status === "Active").length} active · {agents.length} total
          </p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm rounded border outline-none w-48"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          />
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 text-sm font-600 rounded"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            + New Agent
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Agents", value: agents.length, color: "#6366f1" },
          { label: "Active", value: agents.filter((a) => a.status === "Active").length, color: "#10b981" },
          { label: "Inactive", value: agents.filter((a) => a.status === "Inactive").length, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="mono text-3xl font-700" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs uppercase tracking-widest font-700 mt-1" style={{ color: "var(--muted-foreground)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              {["Name", "Phone", "Email", "Branch", "Candidates", "Status"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-700"
                      style={{ background: "#6366f130", color: "#6366f1" }}>
                      {a.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className="font-600" style={{ color: "var(--foreground)" }}>{a.name}</span>
                  </div>
                </td>
                <td className="px-5 py-4 mono text-xs" style={{ color: "var(--foreground)" }}>{a.phone}</td>
                <td className="px-5 py-4 text-xs" style={{ color: "var(--muted-foreground)" }}>{a.email}</td>
                <td className="px-5 py-4 text-xs" style={{ color: "var(--foreground)" }}>{a.branch}</td>
                <td className="px-5 py-4 mono text-sm font-600" style={{ color: "var(--primary)" }}>{a.candidates}</td>
                <td className="px-5 py-4">
                  <span
                    className="mono text-xs font-600 px-2 py-1 rounded"
                    style={{ color: a.status === "Active" ? "#10b981" : "#ef4444", background: a.status === "Active" ? "#10b98120" : "#ef444420" }}
                  >
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>New Agent</h2>
            <div className="space-y-4">
              {[
                { label: "Full Name", ph: "Agent full name" },
                { label: "Phone", ph: "07XXXXXXXX" },
                { label: "Email", ph: "agent@agency.ug" },
                { label: "Branch", ph: "e.g. Kampala" },
              ].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1.5 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                Add Agent
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
