import { useState } from "react";
import { ArrowLeft, CircleAlert, CircleCheck, Landmark, LockKeyhole, UserRound, type LucideIcon } from "lucide-react";

const custodyRecords = [
  { id: 1, candidate: "Godfrey Kamuhangire", fileNo: "CRSL-957214073", passportNo: "A00846507", expiry: "Sep 22, 2032", status: "In Company Custody", dateReceived: "Aug 10, 2026", timeReceived: "09:14 AM", receivedBy: "Aisha Khan", agent: "Director Vicent", location: "Safe Box A-3", dateReturned: "—", returnedBy: "—", notes: "Original passport collected for visa processing" },
  { id: 2, candidate: "Alice Namukasa", fileNo: "CRSL-283710044", passportNo: "C00567234", expiry: "Jan 14, 2033", status: "In Company Custody", dateReceived: "Aug 14, 2026", timeReceived: "02:30 PM", receivedBy: "Director Vicent", agent: "Director Vicent", location: "Safe Box A-5", dateReturned: "—", returnedBy: "—", notes: "Held for embassy submission" },
  { id: 3, candidate: "Suzan Mirembe", fileNo: "CRSL-143345563", passportNo: "B00234891", expiry: "Jun 9, 2031", status: "Returned to Candidate", dateReceived: "Aug 5, 2026", timeReceived: "10:00 AM", receivedBy: "Asiimwe david", agent: "Asiimwe david", location: "—", dateReturned: "Aug 21, 2026", returnedBy: "Aisha Khan", notes: "" },
  { id: 4, candidate: "James Okello", fileNo: "CRSL-394821155", passportNo: "D00789012", expiry: "May 19, 2025", status: "Expired", dateReceived: "—", timeReceived: "—", receivedBy: "—", agent: "Asiimwe david", location: "—", dateReturned: "—", returnedBy: "—", notes: "Passport expired — needs renewal" },
];

const statusColor: Record<string, string> = {
  "In Company Custody": "#6366f1",
  "Returned to Candidate": "#10b981",
  "Candidate Has Passport": "#3b82f6",
  "With External Authority": "#f59e0b",
  Expired: "#ef4444",
  "Issue/Problem": "#ef4444",
};

const statusIcon: Record<string, LucideIcon> = {
  "In Company Custody": LockKeyhole,
  "Returned to Candidate": CircleCheck,
  "Candidate Has Passport": UserRound,
  "With External Authority": Landmark,
  Expired: CircleAlert,
  "Issue/Problem": CircleAlert,
};

export default function PassportCustody() {
  const [records, setRecords] = useState(custodyRecords);
  const [selected, setSelected] = useState<typeof custodyRecords[0] | null>(null);
  const [agentFilter, setAgentFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = records.filter((r) => {
    const ms = !search || r.candidate.toLowerCase().includes(search.toLowerCase()) || r.passportNo.toLowerCase().includes(search.toLowerCase());
    const ma = agentFilter === "All" || r.agent === agentFilter;
    const mst = statusFilter === "All" || r.status === statusFilter;
    return ms && ma && mst;
  });

  const inCustody = records.filter((r) => r.status === "In Company Custody").length;
  const returned = records.filter((r) => r.status === "Returned to Candidate").length;
  const issues = records.filter((r) => r.status === "Expired" || r.status === "Issue/Problem").length;

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Passport Custody Tracker</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Track all passports in company custody</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            + Add Record
          </button>
        </div>

        {/* KPIs */}
        <div className="px-6 py-4 border-b grid grid-cols-4 gap-3 shrink-0" style={{ borderColor: "var(--border)" }}>
          {[
            { label: "In Company Custody", value: inCustody, color: "#6366f1" },
            { label: "Returned", value: returned, color: "#10b981" },
            { label: "Issues / Expired", value: issues, color: "#ef4444" },
            { label: "Total Records", value: records.length, color: "var(--foreground)" },
          ].map((k) => (
            <div key={k.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="mono text-2xl font-700" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs font-700 uppercase tracking-wider mt-1" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b flex gap-3 items-center shrink-0" style={{ borderColor: "var(--border)" }}>
          <input type="text" placeholder="Search candidate or passport..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none flex-1 max-w-64"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option>All</option>
            {["Director Vicent", "Asiimwe david", "Aisha Khan", "Aisha Tendo"].map((a) => <option key={a}>{a}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option>All</option>
            {["In Company Custody", "Returned to Candidate", "Candidate Has Passport", "With External Authority", "Expired", "Issue/Problem"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0" style={{ background: "var(--card)" }}>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Candidate", "Passport No", "Expiry", "Status", "Date Received", "Received By", "Agent", "Location", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}
                  className="border-b cursor-pointer"
                  style={{ borderColor: "var(--border)", background: selected?.id === r.id ? "var(--secondary)" : "transparent" }}
                  onClick={() => setSelected(selected?.id === r.id ? null : r)}>
                  <td className="px-4 py-3">
                    <div className="font-600 text-sm" style={{ color: "var(--foreground)" }}>{r.candidate}</div>
                    <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.fileNo}</div>
                  </td>
                  <td className="px-4 py-3 mono text-xs font-600" style={{ color: "var(--foreground)" }}>{r.passportNo}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: r.status === "Expired" ? "#ef4444" : "var(--muted-foreground)" }}>{r.expiry}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-700 flex items-center gap-1">
                      {(() => {
                        const Icon = statusIcon[r.status];
                        return <Icon size={14} strokeWidth={1.8} aria-hidden="true" style={{ color: statusColor[r.status] }} />;
                      })()}
                      <span style={{ color: statusColor[r.status] }}>{r.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.dateReceived}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{r.receivedBy}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "#6366f1" }}>{r.agent}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.location}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="detail-panel w-72 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelected(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            {selected.status === "In Company Custody" && (
              <div className="rounded p-3 mb-3 text-center font-700 text-sm flex items-center justify-center gap-2"
                style={{ background: "#6366f120", border: "1px solid #6366f140", color: "#6366f1" }}>
                <LockKeyhole size={15} strokeWidth={1.8} aria-hidden="true" />
                PASSPORT IN COMPANY CUSTODY
              </div>
            )}
            <div className="font-700 text-sm mb-0.5" style={{ color: "var(--foreground)" }}>{selected.candidate}</div>
            <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{selected.fileNo}</div>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Passport No", value: selected.passportNo },
              { label: "Expiry Date", value: selected.expiry },
              { label: "Date Received", value: selected.dateReceived },
              { label: "Time Received", value: selected.timeReceived },
              { label: "Received By", value: selected.receivedBy },
              { label: "Assigned Agent", value: selected.agent },
              { label: "Storage Location", value: selected.location },
              { label: "Date Returned", value: selected.dateReturned },
              { label: "Returned By", value: selected.returnedBy },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: value === "—" ? "var(--muted-foreground)" : "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            {selected.notes && (
              <div>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>Notes</div>
                <div className="text-xs italic" style={{ color: "var(--muted-foreground)" }}>{selected.notes}</div>
              </div>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Update Status</button>
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Change Agent</button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>Add Passport Custody Record</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Candidate", ph: "Select candidate" },
                { label: "Passport No", ph: "e.g. A00846507" },
                { label: "Date Received", ph: "" },
                { label: "Received By", ph: "Staff member name" },
                { label: "Assigned Agent", ph: "Select agent" },
                { label: "Storage Location", ph: "e.g. Safe Box A-3" },
              ].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
              <div className="col-span-2">
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Status</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  {["In Company Custody", "Candidate Has Passport", "With External Authority", "Returned to Candidate"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>Notes</label>
                <textarea rows={2} className="w-full px-3 py-2 text-sm rounded border outline-none resize-none"
                  style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Save Record</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
