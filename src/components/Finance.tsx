import { useState, type FormEvent } from "react";

type FinanceTab = "overview" | "income" | "input" | "expenses" | "payroll";

const incomeRows = [
  { date: "Aug 20, 2026", description: "Candidate Deposit – Godfrey Kamuhangire", type: "Candidate Deposit", method: "Mobile Money", amount: 1500000, ref: "DEP-20260820-001", recordedBy: "Aisha Khan", status: "Confirmed" },
  { date: "Aug 19, 2026", description: "Placement Fee – Alice Namukasa (Kuwait)", type: "Placement Fee", method: "Bank Transfer", amount: 3200000, ref: "PL-20260819-003", recordedBy: "Aisha Khan", status: "Confirmed" },
  { date: "Aug 18, 2026", description: "Recruitment Fee – Suzan Mirembe", type: "Recruitment Fee", method: "Cash", amount: 800000, ref: "RF-20260818-007", recordedBy: "Director Vicent", status: "Confirmed" },
  { date: "Aug 17, 2026", description: "Final Payment – James Okello", type: "Candidate Payment", method: "Mobile Money", amount: 2100000, ref: "PAY-20260817-011", recordedBy: "Asiimwe david", status: "Confirmed" },
  { date: "Aug 16, 2026", description: "Client Company Payment – Gulf Manpower Ltd", type: "Client Payment", method: "Bank Transfer", amount: 5000000, ref: "CL-20260816-001", recordedBy: "Aisha Khan", status: "Confirmed" },
  { date: "Aug 15, 2026", description: "Agent Commission – Referral Fee", type: "Other Income", method: "Cash", amount: 350000, ref: "OTH-20260815-002", recordedBy: "Aisha Khan", status: "Pending" },
];

const expenseRows = [
  { date: "Aug 21, 2026", description: "Medical Exam – 8 Candidates", type: "Medical", method: "Cash", amount: 960000, ref: "EXP-20260821-001", recordedBy: "Aisha Khan", status: "Approved" },
  { date: "Aug 20, 2026", description: "Visa Processing – Saudi Arabia x4", type: "Visa", method: "Bank Transfer", amount: 1200000, ref: "EXP-20260820-002", recordedBy: "Director Vicent", status: "Approved" },
  { date: "Aug 19, 2026", description: "Office Rent – August 2026", type: "Office", method: "Bank Transfer", amount: 1800000, ref: "EXP-20260819-003", recordedBy: "Aisha Khan", status: "Approved" },
  { date: "Aug 18, 2026", description: "Transport – Airport Transfers x3", type: "Transport", method: "Cash", amount: 210000, ref: "EXP-20260818-004", recordedBy: "Asiimwe david", status: "Approved" },
  { date: "Aug 17, 2026", description: "Passport Processing Fees x6", type: "Passport", method: "Cash", amount: 480000, ref: "EXP-20260817-005", recordedBy: "Director Vicent", status: "Approved" },
  { date: "Aug 16, 2026", description: "Internet & Utilities", type: "Office", method: "Mobile Money", amount: 150000, ref: "EXP-20260816-006", recordedBy: "Aisha Khan", status: "Approved" },
];

const payrollRows = [
  { employee: "Aisha Khan", role: "Head of TA", amount: 3500000, date: "Aug 25, 2026", method: "Bank Transfer", ref: "PAY-AUG-001", status: "Paid" },
  { employee: "Director Vicent", role: "Recruitment Director", amount: 4200000, date: "Aug 25, 2026", method: "Bank Transfer", ref: "PAY-AUG-002", status: "Paid" },
  { employee: "Asiimwe David", role: "Agent", amount: 1800000, date: "Aug 25, 2026", method: "Mobile Money", ref: "PAY-AUG-003", status: "Pending" },
  { employee: "Fatuma Nakirya", role: "Agent", amount: 1600000, date: "Aug 25, 2026", method: "Mobile Money", ref: "PAY-AUG-004", status: "Processing" },
  { employee: "Peter Mukasa", role: "Agent – Gulu", amount: 1400000, date: "Aug 25, 2026", method: "Bank Transfer", ref: "PAY-AUG-005", status: "Pending" },
  { employee: "Grace Acen", role: "Admin Officer", amount: 1200000, date: "Aug 25, 2026", method: "Mobile Money", ref: "PAY-AUG-006", status: "Paid" },
];

const payrollStatusColor: Record<string, string> = {
  Paid: "#10b981", Pending: "#f59e0b", Processing: "#6366f1", Failed: "#ef4444"
};

const incomeTypeColor: Record<string, string> = {
  "Candidate Deposit": "#6366f1", "Placement Fee": "#10b981", "Recruitment Fee": "#3b82f6",
  "Candidate Payment": "#8b5cf6", "Client Payment": "#f59e0b", "Other Income": "#6b7280",
};
const expenseTypeColor: Record<string, string> = {
  Medical: "#10b981", Visa: "#6366f1", Office: "#3b82f6", Transport: "#f59e0b",
  Passport: "#8b5cf6", Documentation: "#14b8a6", Staff: "#ec4899", Other: "#6b7280",
};

const UGX = (n: number) => `UGX ${n.toLocaleString()}`;

const kpiData = [
  { label: "Total Income", value: "UGX 12,950,000", sub: "Aug 2026", color: "#10b981" },
  { label: "Total Expenses", value: "UGX 4,800,000", sub: "Aug 2026", color: "#ef4444" },
  { label: "Net Profit", value: "UGX 8,150,000", sub: "Aug 2026", color: "#f59e0b" },
  { label: "Outstanding", value: "UGX 3,400,000", sub: "Unpaid balances", color: "#6366f1" },
  { label: "Deposits", value: "UGX 1,500,000", sub: "This month", color: "#8b5cf6" },
  { label: "Monthly Revenue", value: "UGX 12,950,000", sub: "+18% vs July", color: "#3b82f6" },
];

const monthlyChart = [
  { month: "Feb", income: 8.2, expenses: 3.1 },
  { month: "Mar", income: 9.5, expenses: 3.8 },
  { month: "Apr", income: 7.8, expenses: 3.4 },
  { month: "May", income: 11.2, expenses: 4.2 },
  { month: "Jun", income: 13.4, expenses: 5.1 },
  { month: "Jul", income: 10.9, expenses: 4.5 },
  { month: "Aug", income: 12.95, expenses: 4.8 },
];
const maxVal = Math.max(...monthlyChart.map((m) => m.income));

export default function Finance() {
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [dateRange, setDateRange] = useState("This Month");
  const [incomeEntries, setIncomeEntries] = useState(incomeRows);

  const recordCandidateServiceCharge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const candidate = String(formData.get("candidate")).trim();
    const amount = Number(formData.get("amount"));
    const date = String(formData.get("date"));

    setIncomeEntries((entries) => [{
      date: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      description: `Candidate Service Charge – ${candidate}`,
      type: "Candidate Service Charge",
      method: String(formData.get("method")),
      amount,
      ref: String(formData.get("reference")).trim() || `INC-${Date.now()}`,
      recordedBy: "Finance team",
      status: "Confirmed",
    }, ...entries]);

    form.reset();
    setTab("income");
  };

  const tabs: { id: FinanceTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "income", label: "Income" },
    { id: "input", label: "Input" },
    { id: "expenses", label: "Expenses" },
    { id: "payroll", label: "Payroll" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Finance</h1>
          <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>Recruitment company financial management</p>
        </div>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            {["Today", "This Week", "This Month", "This Year", "Custom Range"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <button onClick={() => setTab("input")} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            + Record Transaction
          </button>
        </div>
      </div>

      <div className="flex border-b shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-5 py-3 text-sm font-600 transition-colors"
            style={{
              color: tab === t.id ? "var(--primary)" : "var(--muted-foreground)",
              borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === "overview" && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {kpiData.map((k) => (
                <div key={k.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="text-xs font-700 uppercase tracking-widest mb-2" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
                  <div className="mono text-xl font-700 mb-1" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div className="rounded border p-6 mb-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="text-xs font-700 uppercase tracking-widest mb-6" style={{ color: "var(--muted-foreground)" }}>Income vs Expenses (UGX millions)</h3>
              <div className="flex items-end gap-4 h-40">
                {monthlyChart.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex gap-1 items-end" style={{ height: "120px" }}>
                      <div className="flex-1 rounded-t" style={{ height: `${(m.income / maxVal) * 120}px`, background: "#10b981" }} />
                      <div className="flex-1 rounded-t" style={{ height: `${(m.expenses / maxVal) * 120}px`, background: "#ef4444" }} />
                    </div>
                    <span className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{m.month}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-3">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: "#10b981" }} /><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Income</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: "#ef4444" }} /><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Expenses</span></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>Recent Income</h3>
                {incomeEntries.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <div className="text-xs font-600 mb-0.5" style={{ color: "var(--foreground)" }}>{r.description}</div>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: incomeTypeColor[r.type] || "#6b7280", background: (incomeTypeColor[r.type] || "#6b7280") + "20" }}>{r.type}</span>
                    </div>
                    <span className="mono text-sm font-700" style={{ color: "#10b981" }}>+{UGX(r.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h3 className="text-xs font-700 uppercase tracking-widest mb-4" style={{ color: "var(--muted-foreground)" }}>Recent Expenses</h3>
                {expenseRows.slice(0, 4).map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
                    <div>
                      <div className="text-xs font-600 mb-0.5" style={{ color: "var(--foreground)" }}>{r.description}</div>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: expenseTypeColor[r.type] || "#6b7280", background: (expenseTypeColor[r.type] || "#6b7280") + "20" }}>{r.type}</span>
                    </div>
                    <span className="mono text-sm font-700" style={{ color: "#ef4444" }}>-{UGX(r.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "income" && (
          <>
            <div className="flex justify-end mb-4">
              <button onClick={() => setTab("input")} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                + Record Income
              </button>
            </div>
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    {["Date", "Description", "Type", "Method", "Amount", "Ref", "Recorded By", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {incomeEntries.map((r, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.date}</td>
                      <td className="px-4 py-3 text-sm font-600 max-w-xs" style={{ color: "var(--foreground)" }}>{r.description}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: incomeTypeColor[r.type] || "#6b7280", background: (incomeTypeColor[r.type] || "#6b7280") + "20" }}>{r.type}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.method}</td>
                      <td className="px-4 py-3 mono font-700" style={{ color: "#10b981" }}>+{UGX(r.amount)}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.ref}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.recordedBy}</td>
                      <td className="px-4 py-3">
                        <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                          style={{ color: r.status === "Confirmed" ? "#10b981" : "#f59e0b", background: r.status === "Confirmed" ? "#10b98120" : "#f59e0b20" }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "input" && (
          <div className="max-w-3xl mx-auto">
            <div className="mb-5">
              <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Candidate Service Charge</h2>
              <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>Record a candidate service charge as company income.</p>
            </div>
            <form onSubmit={recordCandidateServiceCharge} className="rounded border p-6 grid grid-cols-2 gap-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <label className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                Income category
                <input value="Candidate Service Charge" readOnly className="mt-1.5 w-full px-3 py-2 text-sm rounded border" style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--muted-foreground)" }} />
              </label>
              <label className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                Candidate name
                <input name="candidate" required className="mt-1.5 w-full px-3 py-2 text-sm rounded border outline-none" placeholder="Enter candidate name" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </label>
              <label className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                Amount (UGX)
                <input name="amount" type="number" min="1" step="1" required className="mt-1.5 w-full px-3 py-2 text-sm rounded border outline-none" placeholder="0" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </label>
              <label className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                Payment date
                <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1.5 w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </label>
              <label className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                Payment method
                <select name="method" required defaultValue="Mobile Money" className="mt-1.5 w-full px-3 py-2 text-sm rounded border outline-none" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                  {["Cash", "Bank Transfer", "Mobile Money"].map((method) => <option key={method}>{method}</option>)}
                </select>
              </label>
              <label className="text-sm font-600" style={{ color: "var(--foreground)" }}>
                Reference number <span className="font-400" style={{ color: "var(--muted-foreground)" }}>(optional)</span>
                <input name="reference" className="mt-1.5 w-full px-3 py-2 text-sm rounded border outline-none" placeholder="Generated if left blank" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </label>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setTab("income")} className="px-4 py-2 text-sm font-600 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Save income</button>
              </div>
            </form>
          </div>
        )}

        {tab === "expenses" && (
          <>
            <div className="flex justify-end mb-4">
              <button className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                + Record Expense
              </button>
            </div>
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    {["Date", "Description", "Type", "Method", "Amount", "Ref", "Recorded By", "Status"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenseRows.map((r, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.date}</td>
                      <td className="px-4 py-3 text-sm font-600 max-w-xs" style={{ color: "var(--foreground)" }}>{r.description}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: expenseTypeColor[r.type] || "#6b7280", background: (expenseTypeColor[r.type] || "#6b7280") + "20" }}>{r.type}</span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.method}</td>
                      <td className="px-4 py-3 mono font-700" style={{ color: "#ef4444" }}>-{UGX(r.amount)}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.ref}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.recordedBy}</td>
                      <td className="px-4 py-3">
                        <span className="mono text-xs font-600 px-1.5 py-0.5 rounded" style={{ color: "#10b981", background: "#10b98120" }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "payroll" && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-5">
              {[
                { label: "Total Payroll (Aug)", value: "UGX 13,700,000", color: "#6366f1" },
                { label: "Paid", value: "UGX 8,900,000", color: "#10b981" },
                { label: "Pending", value: "UGX 4,800,000", color: "#f59e0b" },
              ].map((k) => (
                <div key={k.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <div className="mono text-xl font-700 mb-1" style={{ color: k.color }}>{k.value}</div>
                  <div className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mb-4">
              <button className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                + Record Paycheck
              </button>
            </div>
            <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                    {["Employee", "Role", "Amount", "Pay Date", "Method", "Ref", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payrollRows.map((r, i) => (
                    <tr key={i} className="border-b" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{r.employee}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.role}</td>
                      <td className="px-4 py-3 mono font-700" style={{ color: "var(--foreground)" }}>{UGX(r.amount)}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.date}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{r.method}</td>
                      <td className="px-4 py-3 mono text-xs" style={{ color: "var(--muted-foreground)" }}>{r.ref}</td>
                      <td className="px-4 py-3">
                        <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                          style={{ color: payrollStatusColor[r.status], background: payrollStatusColor[r.status] + "20" }}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Payslip</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
