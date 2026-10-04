import { useState } from "react";

const payments = [
  { id: 1, candidate: "Godfrey Kamuhangire", fileNo: "CRSL-957214073", required: 5000000, deposited: 1500000, paid: 1500000, outstanding: 3500000, status: "Partially Paid", lastDate: "Aug 20, 2026" },
  { id: 2, candidate: "Alice Namukasa", fileNo: "CRSL-283710044", required: 4800000, deposited: 4800000, paid: 4800000, outstanding: 0, status: "Fully Paid", lastDate: "Aug 19, 2026" },
  { id: 3, candidate: "Suzan Mirembe", fileNo: "CRSL-143345563", required: 4200000, deposited: 800000, paid: 800000, outstanding: 3400000, status: "Deposit Received", lastDate: "Aug 18, 2026" },
  { id: 4, candidate: "James Okello", fileNo: "CRSL-394821155", required: 4500000, deposited: 0, paid: 0, outstanding: 4500000, status: "Payment Pending", lastDate: "—" },
];

const history = [
  { date: "Aug 20, 2026", candidate: "Godfrey Kamuhangire", type: "Deposit", method: "Mobile Money", amount: 1500000, ref: "DEP-001", recordedBy: "Aisha Khan", receipt: "RCT-001", status: "Deposit Received" },
  { date: "Aug 19, 2026", candidate: "Alice Namukasa", type: "Final Payment", method: "Bank Transfer", amount: 3200000, ref: "PAY-003", recordedBy: "Aisha Khan", receipt: "RCT-003", status: "Fully Paid" },
  { date: "Aug 18, 2026", candidate: "Suzan Mirembe", type: "Deposit", method: "Cash", amount: 800000, ref: "DEP-002", recordedBy: "Director Vicent", receipt: "RCT-002", status: "Deposit Received" },
  { date: "Aug 17, 2026", candidate: "Alice Namukasa", type: "Installment", method: "Mobile Money", amount: 1600000, ref: "PAY-002", recordedBy: "Asiimwe david", receipt: "RCT-004", status: "Partially Paid" },
];

const UGX = (n: number) => `UGX ${n.toLocaleString()}`;

const statusColor: Record<string, string> = {
  "Fully Paid": "#10b981",
  "Partially Paid": "#3b82f6",
  "Deposit Received": "#8b5cf6",
  "Payment Pending": "#f59e0b",
  Overdue: "#ef4444",
};

export default function Payments() {
  const [selected, setSelected] = useState<typeof payments[0] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const totalRequired = payments.reduce((s, p) => s + p.required, 0);
  const totalPaid = payments.reduce((s, p) => s + p.paid, 0);
  const totalOutstanding = payments.reduce((s, p) => s + p.outstanding, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Payments & Deposits</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Candidate payment tracking</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
          + Record Payment
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Required", value: UGX(totalRequired), color: "var(--foreground)" },
            { label: "Total Paid", value: UGX(totalPaid), color: "#10b981" },
            { label: "Outstanding Balance", value: UGX(totalOutstanding), color: "#ef4444" },
          ].map((k) => (
            <div key={k.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="text-xs font-700 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
              <div className="mono text-xl font-700" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded border mb-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Candidate Payment Status</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Candidate", "File No", "Required", "Deposited", "Paid", "Outstanding", "Status", "Last Payment"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b cursor-pointer"
                  style={{ borderColor: "var(--border)", background: selected?.id === p.id ? "var(--secondary)" : "transparent" }}
                  onClick={() => setSelected(selected?.id === p.id ? null : p)}>
                  <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{p.candidate}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.fileNo}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{UGX(p.required)}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "#8b5cf6" }}>{UGX(p.deposited)}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "#10b981" }}>{UGX(p.paid)}</td>
                  <td className="px-4 py-3 mono text-xs font-700" style={{ color: p.outstanding > 0 ? "#ef4444" : "#10b981" }}>{UGX(p.outstanding)}</td>
                  <td className="px-4 py-3">
                    <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                      style={{ color: statusColor[p.status], background: statusColor[p.status] + "20" }}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{p.lastDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Payment History</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                {["Date", "Candidate", "Type", "Method", "Amount", "Ref", "Recorded By", "Receipt", "Status"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.date}</td>
                  <td className="px-4 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>{r.candidate}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.type}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.method}</td>
                  <td className="px-4 py-3 mono font-700" style={{ color: "#10b981" }}>+{UGX(r.amount)}</td>
                  <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.ref}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.recordedBy}</td>
                  <td className="px-4 py-3">
                    <button className="text-xs px-2 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "#3b82f6" }}>
                      {r.receipt}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                      style={{ color: statusColor[r.status], background: statusColor[r.status] + "20" }}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>Record Payment</h2>
            <div className="space-y-3">
              {[
                { label: "Candidate", placeholder: "Select candidate..." },
                { label: "Amount (UGX)", placeholder: "0" },
                { label: "Reference", placeholder: "e.g. DEP-2026-001" },
              ].map(({ label, placeholder }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1.5 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={placeholder} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1.5 block" style={{ color: "var(--muted-foreground)" }}>Payment Type</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <option>Deposit</option><option>Installment</option><option>Final Payment</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-700 uppercase tracking-wider mb-1.5 block" style={{ color: "var(--muted-foreground)" }}>Payment Method</label>
                <select className="w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  <option>Mobile Money</option><option>Bank Transfer</option><option>Cash</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Save Payment</button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
