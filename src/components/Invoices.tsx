import { useState } from "react";
import { ArrowLeft } from "lucide-react";

const invoices = [
  { id: 1, ref: "INV-2026-001", employer: "Gulf Manpower Ltd", candidate: "Alice Namukasa", description: "Placement Fee — Cook", amount: 3200000, issued: "Aug 10, 2026", due: "Aug 24, 2026", paid: 0, status: "Overdue" },
  { id: 2, ref: "INV-2026-002", employer: "Al Noor Enterprises", candidate: "Suzan Mirembe", description: "Recruitment + Placement Fee", amount: 2800000, issued: "Aug 15, 2026", due: "Aug 29, 2026", paid: 2800000, status: "Paid" },
  { id: 3, ref: "INV-2026-003", employer: "Gulf Manpower Ltd", candidate: "Godfrey Kamuhangire", description: "Placement Fee — Administrator", amount: 3500000, issued: "Aug 18, 2026", due: "Sep 1, 2026", paid: 1500000, status: "Partially Paid" },
  { id: 4, ref: "INV-2026-004", employer: "Kuwait Home Services", candidate: "Alice Namukasa", description: "Recruitment Fee", amount: 1200000, issued: "Aug 20, 2026", due: "Sep 3, 2026", paid: 0, status: "Sent" },
  { id: 5, ref: "INV-2026-005", employer: "Qatar Construction Co.", candidate: "James Okello", description: "Placement Fee — Driver", amount: 2500000, issued: "Aug 5, 2026", due: "Aug 19, 2026", paid: 0, status: "Draft" },
];

const statusColor: Record<string, string> = {
  Draft: "#6b7280", Sent: "#3b82f6", "Partially Paid": "#8b5cf6",
  Paid: "#10b981", Overdue: "#ef4444", Cancelled: "#6b7280",
};

const UGX = (n: number) => `UGX ${n.toLocaleString()}`;

export default function Invoices() {
  const [selected, setSelected] = useState<typeof invoices[0] | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);

  const filtered = invoices.filter(i => statusFilter === "All" || i.status === statusFilter);

  const totals = {
    total: invoices.reduce((s, i) => s + i.amount, 0),
    paid: invoices.reduce((s, i) => s + i.paid, 0),
    outstanding: invoices.reduce((s, i) => s + (i.amount - i.paid), 0),
    overdue: invoices.filter(i => i.status === "Overdue").length,
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Invoices</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Employer billing and invoice tracking</p>
          </div>
          <button onClick={() => setShowNew(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            + New Invoice
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4 p-6 pb-0">
          {[
            { label: "Total Invoiced", value: UGX(totals.total), color: "var(--foreground)" },
            { label: "Total Collected", value: UGX(totals.paid), color: "#10b981" },
            { label: "Outstanding", value: UGX(totals.outstanding), color: "#ef4444" },
            { label: "Overdue Invoices", value: totals.overdue, color: "#ef4444" },
          ].map((k) => (
            <div key={k.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="mono text-xl font-700" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs font-700 uppercase tracking-wider mt-1" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div className="px-6 pt-4 pb-0 flex gap-2">
          {["All", "Draft", "Sent", "Partially Paid", "Paid", "Overdue"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1 text-xs font-600 rounded"
              style={{ background: statusFilter === s ? "var(--primary)" : "var(--secondary)", color: statusFilter === s ? "var(--primary-foreground)" : "var(--muted-foreground)" }}>
              {s}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Invoice", "Employer", "Candidate", "Description", "Amount", "Paid", "Balance", "Issued", "Due", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b cursor-pointer"
                    style={{ borderColor: "var(--border)", background: selected?.id === inv.id ? "var(--secondary)" : "transparent" }}
                    onClick={() => setSelected(selected?.id === inv.id ? null : inv)}>
                    <td className="px-4 py-3 mono text-xs font-600" style={{ color: "#6366f1" }}>{inv.ref}</td>
                    <td className="px-4 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{inv.employer}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{inv.candidate}</td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate" style={{ color: "var(--muted-foreground)" }}>{inv.description}</td>
                    <td className="px-4 py-3 mono text-xs font-700" style={{ color: "var(--foreground)" }}>{UGX(inv.amount)}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "#10b981" }}>{inv.paid > 0 ? UGX(inv.paid) : "—"}</td>
                    <td className="px-4 py-3 mono text-xs font-700" style={{ color: inv.amount - inv.paid > 0 ? "#ef4444" : "#10b981" }}>
                      {UGX(inv.amount - inv.paid)}
                    </td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{inv.issued}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: inv.status === "Overdue" ? "#ef4444" : "var(--muted-foreground)" }}>{inv.due}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                        style={{ color: statusColor[inv.status], background: statusColor[inv.status] + "20" }}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 flex gap-1.5">
                      <button className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Download</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="detail-panel w-72 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelected(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <div className="mono text-lg font-700" style={{ color: "#6366f1" }}>{selected.ref}</div>
            <span className="mono text-xs font-600 px-1.5 py-0.5 rounded mt-1 inline-block"
              style={{ color: statusColor[selected.status], background: statusColor[selected.status] + "20" }}>
              {selected.status}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Employer", value: selected.employer },
              { label: "Candidate", value: selected.candidate },
              { label: "Description", value: selected.description },
              { label: "Invoice Amount", value: UGX(selected.amount) },
              { label: "Amount Paid", value: UGX(selected.paid) },
              { label: "Balance Due", value: UGX(selected.amount - selected.paid) },
              { label: "Issued", value: selected.issued },
              { label: "Due Date", value: selected.due },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              {selected.status !== "Paid" && (
                <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Mark as Paid</button>
              )}
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Download PDF</button>
              {selected.status === "Draft" && (
                <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "#3b82f6" }}>Send to Employer</button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>New Invoice</h2>
            <div className="space-y-3">
              {[
                { label: "Employer", ph: "Select employer" },
                { label: "Candidate", ph: "Select candidate" },
                { label: "Description", ph: "e.g. Placement Fee — Cook" },
                { label: "Amount (UGX)", ph: "0" },
                { label: "Due Date", ph: "" },
              ].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Create Invoice</button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
