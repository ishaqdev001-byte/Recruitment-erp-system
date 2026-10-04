import { useState } from "react";
import { ArrowLeft } from "lucide-react";

const employers = [
  { id: 1, company: "Gulf Manpower Ltd", contact: "Ahmed Al-Rashid", phone: "+966 50 123 4567", email: "ahmed@gulfmanpower.sa", country: "Saudi Arabia", industry: "Hospitality", vacancies: 8, requested: 24, placed: 18, outstanding: 3200000, status: "Active" },
  { id: 2, company: "Al Noor Enterprises", contact: "Fatima Al-Sayed", phone: "+971 55 987 6543", email: "fatima@alnoor.ae", country: "UAE", industry: "Domestic", vacancies: 5, requested: 15, placed: 12, outstanding: 0, status: "Active" },
  { id: 3, company: "Kuwait Home Services", contact: "Youssef Al-Ahmad", phone: "+965 9876 5432", email: "youssef@khs.kw", country: "Kuwait", industry: "Domestic", vacancies: 3, requested: 10, placed: 7, outstanding: 1800000, status: "Active" },
  { id: 4, company: "Qatar Construction Co.", contact: "Mohammed Hassan", phone: "+974 4444 5555", email: "m.hassan@qcc.qa", country: "Qatar", industry: "Construction", vacancies: 12, requested: 40, placed: 28, outstanding: 0, status: "Active" },
  { id: 5, company: "Oman Services Group", contact: "Khalid Al-Balushi", phone: "+968 9888 7777", email: "khalid@osg.om", country: "Oman", industry: "Cleaning", vacancies: 0, requested: 6, placed: 6, outstanding: 0, status: "Inactive" },
];

const UGX = (n: number) => n > 0 ? `UGX ${n.toLocaleString()}` : "—";

export default function Employers() {
  const [selected, setSelected] = useState<typeof employers[0] | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);

  const filtered = employers.filter((e) =>
    !search || e.company.toLowerCase().includes(search.toLowerCase()) || e.country.toLowerCase().includes(search.toLowerCase())
  );

  const totals = { vacancies: employers.reduce((s, e) => s + e.vacancies, 0), placed: employers.reduce((s, e) => s + e.placed, 0), outstanding: employers.reduce((s, e) => s + e.outstanding, 0) };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Employers / Clients</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>{employers.filter(e => e.status === "Active").length} active employers</p>
          </div>
          <div className="flex gap-3">
            <input type="text" placeholder="Search employers…" value={search} onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 text-sm rounded border outline-none w-52"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            <button onClick={() => setShowNew(true)} className="px-4 py-1.5 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
              + New Employer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 p-6 pb-0">
          {[
            { label: "Active Employers", value: employers.filter(e => e.status === "Active").length, color: "#10b981" },
            { label: "Open Vacancies", value: totals.vacancies, color: "#6366f1" },
            { label: "Total Placed", value: totals.placed, color: "#f59e0b" },
            { label: "Outstanding Balances", value: UGX(totals.outstanding), color: "#ef4444" },
          ].map((k) => (
            <div key={k.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="mono text-2xl font-700" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs font-700 uppercase tracking-wider mt-1" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {["Company", "Contact", "Country", "Industry", "Vacancies", "Requested", "Placed", "Outstanding", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b cursor-pointer"
                    style={{ borderColor: "var(--border)", background: selected?.id === e.id ? "var(--secondary)" : "transparent" }}
                    onClick={() => setSelected(selected?.id === e.id ? null : e)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-700 shrink-0"
                          style={{ background: "#6366f130", color: "#6366f1" }}>
                          {e.company.split(" ").map(w => w[0]).join("").slice(0,2)}
                        </div>
                        <span className="font-600" style={{ color: "var(--foreground)" }}>{e.company}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-600" style={{ color: "var(--foreground)" }}>{e.contact}</div>
                      <div className="mono text-xs" style={{ color: "var(--muted-foreground)" }}>{e.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--foreground)" }}>{e.country}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{e.industry}</td>
                    <td className="px-4 py-3 mono font-700" style={{ color: "#6366f1" }}>{e.vacancies}</td>
                    <td className="px-4 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{e.requested}</td>
                    <td className="px-4 py-3 mono font-700" style={{ color: "#10b981" }}>{e.placed}</td>
                    <td className="px-4 py-3 mono text-xs font-700" style={{ color: e.outstanding > 0 ? "#ef4444" : "var(--muted-foreground)" }}>{UGX(e.outstanding)}</td>
                    <td className="px-4 py-3">
                      <span className="mono text-xs font-600 px-1.5 py-0.5 rounded"
                        style={{ color: e.status === "Active" ? "#10b981" : "#ef4444", background: e.status === "Active" ? "#10b98120" : "#ef444420" }}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-xs px-2 py-1 rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>View</button>
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
            <div className="w-12 h-12 rounded flex items-center justify-center text-base font-700 mb-3"
              style={{ background: "#6366f130", color: "#6366f1" }}>
              {selected.company.split(" ").map(w => w[0]).join("").slice(0,2)}
            </div>
            <h2 className="font-700" style={{ color: "var(--foreground)" }}>{selected.company}</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{selected.industry} · {selected.country}</p>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Contact Person", value: selected.contact },
              { label: "Phone", value: selected.phone },
              { label: "Email", value: selected.email },
              { label: "Country", value: selected.country },
              { label: "Active Vacancies", value: String(selected.vacancies) },
              { label: "Candidates Placed", value: String(selected.placed) },
              { label: "Outstanding Balance", value: UGX(selected.outstanding) },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>View Vacancies</button>
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Create Invoice</button>
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Send Message</button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h2 className="text-lg font-700 mb-5" style={{ color: "var(--foreground)" }}>New Employer</h2>
            <div className="space-y-3">
              {[
                { label: "Company Name", ph: "e.g. Gulf Manpower Ltd" },
                { label: "Contact Person", ph: "Full name" },
                { label: "Phone", ph: "+XXX XX XXX XXXX" },
                { label: "Email", ph: "contact@company.com" },
                { label: "Country", ph: "e.g. Saudi Arabia" },
              ].map(({ label, ph }) => (
                <div key={label}>
                  <label className="text-xs font-700 uppercase tracking-wider mb-1 block" style={{ color: "var(--muted-foreground)" }}>{label}</label>
                  <input type="text" placeholder={ph} className="w-full px-3 py-2 text-sm rounded border outline-none"
                    style={{ background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Save</button>
              <button onClick={() => setShowNew(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
