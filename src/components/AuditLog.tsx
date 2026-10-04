import { useState } from "react";
import { LockKeyhole } from "lucide-react";

const logs = [
  { id: 1, user: "Aisha Khan", action: "Updated passport status", module: "Passport Custody", candidate: "Godfrey Kamuhangire", prev: "Candidate Has Passport", next: "In Company Custody", date: "Aug 26, 2026", time: "09:14 AM", sensitive: true },
  { id: 2, user: "Aisha Khan", action: "Recorded payment", module: "Finance", candidate: "Godfrey Kamuhangire", prev: "UGX 0", next: "UGX 1,500,000", date: "Aug 26, 2026", time: "09:02 AM", sensitive: true },
  { id: 3, user: "Director Vicent", action: "Moved candidate stage", module: "Pipeline", candidate: "Alice Namukasa", prev: "Screening", next: "Visa Processing", date: "Aug 25, 2026", time: "03:45 PM", sensitive: false },
  { id: 4, user: "Aisha Khan", action: "Created user account", module: "Users", candidate: "—", prev: "—", next: "Sarah Nakigozi (Document Officer)", date: "Aug 25, 2026", time: "11:30 AM", sensitive: true },
  { id: 5, user: "Asiimwe david", action: "Deleted attachment", module: "Documents", candidate: "James Okello", prev: "id_card_old.jpg", next: "—", date: "Aug 25, 2026", time: "10:15 AM", sensitive: true },
  { id: 6, user: "Director Vicent", action: "Updated candidate information", module: "Candidates", candidate: "Suzan Mirembe", prev: "Phone: 0703192268", next: "Phone: 0703192299", date: "Aug 24, 2026", time: "02:20 PM", sensitive: false },
  { id: 7, user: "Aisha Khan", action: "Changed role permissions", module: "Users & Roles", candidate: "—", prev: "Finance Officer: View only", next: "Finance Officer: View + Create", date: "Aug 24, 2026", time: "09:50 AM", sensitive: true },
  { id: 8, user: "Aisha Khan", action: "Created invoice", module: "Invoices", candidate: "Godfrey Kamuhangire", prev: "—", next: "INV-2026-003 (UGX 3,500,000)", date: "Aug 23, 2026", time: "04:00 PM", sensitive: false },
  { id: 9, user: "Director Vicent", action: "Assigned passport to agent", module: "Passport Custody", candidate: "Alice Namukasa", prev: "Unassigned", next: "Director Vicent", date: "Aug 22, 2026", time: "11:00 AM", sensitive: true },
  { id: 10, user: "Asiimwe david", action: "Logged communication", module: "Communications", candidate: "Suzan Mirembe", prev: "—", next: "Phone call — medical certificate follow-up", date: "Aug 22, 2026", time: "10:05 AM", sensitive: false },
];

const moduleColor: Record<string, string> = {
  "Passport Custody": "#6366f1", Finance: "#10b981", Pipeline: "#f59e0b", Users: "#ef4444",
  Documents: "#3b82f6", Candidates: "#8b5cf6", "Users & Roles": "#ef4444", Invoices: "#14b8a6", Communications: "#f97316",
};

export default function AuditLog() {
  const [moduleFilter, setModuleFilter] = useState("All");
  const [userFilter, setUserFilter] = useState("All");
  const [sensitiveOnly, setSensitiveOnly] = useState(false);
  const [search, setSearch] = useState("");

  const modules = ["All", ...Array.from(new Set(logs.map((l) => l.module)))];
  const users = ["All", ...Array.from(new Set(logs.map((l) => l.user)))];

  const filtered = logs.filter((l) => {
    const mm = moduleFilter === "All" || l.module === moduleFilter;
    const mu = userFilter === "All" || l.user === userFilter;
    const ms = !sensitiveOnly || l.sensitive;
    const mq = !search || l.action.toLowerCase().includes(search.toLowerCase()) || l.candidate.toLowerCase().includes(search.toLowerCase()) || l.user.toLowerCase().includes(search.toLowerCase());
    return mm && mu && ms && mq;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Audit Log</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Complete trail of all system actions</p>
        </div>
        <button className="px-4 py-1.5 text-sm font-600 rounded border" style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--secondary)" }}>
          Export Log
        </button>
      </div>

      <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap shrink-0" style={{ borderColor: "var(--border)" }}>
        <input type="text" placeholder="Search actions, users, candidates…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border outline-none w-56"
          style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border outline-none"
          style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
          {modules.map((m) => <option key={m}>{m}</option>)}
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded border outline-none"
          style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
          {users.map((u) => <option key={u}>{u}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={sensitiveOnly} onChange={(e) => setSensitiveOnly(e.target.checked)}
            style={{ accentColor: "#ef4444" }} />
          <span className="text-xs font-600" style={{ color: sensitiveOnly ? "#ef4444" : "var(--muted-foreground)" }}>Sensitive actions only</span>
        </label>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: "var(--card)" }}>
            <tr className="border-b" style={{ borderColor: "var(--border)" }}>
              {["Date / Time", "User", "Action", "Module", "Candidate/Record", "Previous", "New Value"].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-b" style={{ borderColor: "var(--border)", background: l.sensitive ? "var(--card)" : "transparent" }}>
                <td className="px-4 py-3">
                  <div className="mono text-xs font-600" style={{ color: "var(--foreground)" }}>{l.date}</div>
                  <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{l.time}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {l.sensitive && <LockKeyhole size={13} strokeWidth={1.9} aria-label="Sensitive action" style={{ color: "#ef4444" }} />}
                    <span className="text-xs font-600" style={{ color: "var(--foreground)" }}>{l.user}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{l.action}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-600 px-1.5 py-0.5 rounded"
                    style={{ color: moduleColor[l.module] || "#6b7280", background: (moduleColor[l.module] || "#6b7280") + "20" }}>
                    {l.module}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{l.candidate}</td>
                <td className="px-4 py-3 text-xs max-w-xs">
                  {l.prev !== "—" ? (
                    <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#ef444420", color: "#ef4444" }}>{l.prev}</span>
                  ) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                </td>
                <td className="px-4 py-3 text-xs max-w-xs">
                  {l.next !== "—" ? (
                    <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "#10b98120", color: "#10b981" }}>{l.next}</span>
                  ) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
