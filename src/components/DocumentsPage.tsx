import { useState } from "react";

const docs = [
  { id: 1, candidate: "Godfrey Kamuhangire", fileNo: "CRSL-957214073", type: "Passport", name: "passport_scan.pdf", status: "Verified", date: "Aug 10, 2026", uploadedBy: "Aisha Khan" },
  { id: 2, candidate: "Alice Namukasa", fileNo: "CRSL-283710044", type: "Medical", name: "medical_report.pdf", status: "Pending", date: "Aug 14, 2026", uploadedBy: "Director Vicent" },
  { id: 3, candidate: "Suzan Mirembe", fileNo: "CRSL-143345563", type: "CV", name: "suzan_cv.docx", status: "Verified", date: "Aug 12, 2026", uploadedBy: "Asiimwe david" },
  { id: 4, candidate: "Godfrey Kamuhangire", fileNo: "CRSL-957214073", type: "Contracts", name: "contract_sa_2026.pdf", status: "Pending", date: "Aug 15, 2026", uploadedBy: "Aisha Khan" },
  { id: 5, candidate: "Alice Namukasa", fileNo: "CRSL-283710044", type: "Visa", name: "kw_visa_approval.pdf", status: "Verified", date: "Aug 18, 2026", uploadedBy: "Aisha Khan" },
  { id: 6, candidate: "James Okello", fileNo: "CRSL-394821155", type: "ID", name: "national_id.jpg", status: "Rejected", date: "Aug 9, 2026", uploadedBy: "Asiimwe david" },
];

const catColor: Record<string, string> = {
  Passport: "#6366f1", CV: "#3b82f6", Medical: "#10b981", ID: "#f59e0b",
  Certificates: "#8b5cf6", Contracts: "#14b8a6", Visa: "#ec4899",
  "Payment Receipts": "#f97316", Photos: "#84cc16", Other: "#6b7280",
};

const statusColor: Record<string, string> = { Verified: "#10b981", Pending: "#f59e0b", Rejected: "#ef4444" };

export default function DocumentsPage() {
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = docs.filter((d) => {
    const ms = !search || d.candidate.toLowerCase().includes(search.toLowerCase()) || d.name.toLowerCase().includes(search.toLowerCase());
    const mt = typeFilter === "All" || d.type === typeFilter;
    const mst = statusFilter === "All" || d.status === statusFilter;
    return ms && mt && mst;
  });

  const counts = { total: docs.length, verified: docs.filter((d) => d.status === "Verified").length, pending: docs.filter((d) => d.status === "Pending").length, rejected: docs.filter((d) => d.status === "Rejected").length };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Documents</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>All candidate documents across the system</p>
        </div>
        <button className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
          + Upload Document
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-4 mb-5">
          {[
            { label: "Total", value: counts.total, color: "var(--foreground)" },
            { label: "Verified", value: counts.verified, color: "#10b981" },
            { label: "Pending", value: counts.pending, color: "#f59e0b" },
            { label: "Rejected", value: counts.rejected, color: "#ef4444" },
          ].map((k) => (
            <div key={k.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="mono text-2xl font-700" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs font-700 uppercase tracking-wider mt-1" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Search documents or candidates..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none flex-1"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option>All</option>
            {["Passport", "CV", "Medical", "ID", "Certificates", "Contracts", "Visa", "Payment Receipts", "Photos", "Other"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            <option>All</option>
            <option>Verified</option>
            <option>Pending</option>
            <option>Rejected</option>
          </select>
        </div>

        <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Candidate", "File No", "Type", "File Name", "Status", "Upload Date", "Uploaded By", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3 font-600 text-sm" style={{ color: "var(--foreground)" }}>{d.candidate}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{d.fileNo}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-600 px-1.5 py-0.5 rounded" style={{ color: catColor[d.type] || "#6b7280", background: (catColor[d.type] || "#6b7280") + "20" }}>
                      {d.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{d.name}</td>
                  <td className="px-4 py-3">
                    <span className="mono text-xs font-600 px-1.5 py-0.5 rounded" style={{ color: statusColor[d.status], background: statusColor[d.status] + "20" }}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{d.date}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{d.uploadedBy}</td>
                  <td className="px-4 py-3 flex gap-1.5">
                    <button className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "#3b82f6" }}>Preview</button>
                    <button className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
