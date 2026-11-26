import { useState, useEffect } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import InvoiceGeneratorModal from "./InvoiceGeneratorModal";

type Recipient = { type: "contractor" | "supplier" | "candidate"; id: string; name: string };
type Agent = { id: string; name: string; phone?: string };
type CompanyInfo = {
  name?: string;
  email?: string;
  phone?: string;
  office_address?: string;
  city?: string;
  country?: string;
  registration_number?: string;
  website?: string;
  logo?: string;
};
type PaymentInfo = {
  id: string;
  payment_method: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  swift_code: string;
  currency: string;
  payment_reference: string;
  is_default: boolean;
  is_active: boolean;
};

type Invoice = {
  id: string | number;
  ref: string;
  employer?: string;
  vendorName?: string;
  candidate?: string;
  description: string;
  amount: number;
  issued: string;
  due: string;
  paid: number;
  status: string;
  candidateFileNumber?: string;
  projectName?: string;
  vendorInvoiceNumber?: string;
};

const sampleInvoices: Invoice[] = [
  { id: 1, ref: "INV-2026-001", employer: "Gulf Manpower Ltd", candidate: "Alice Namukasa", description: "Placement Fee — Cook", amount: 3200000, issued: "Aug 10, 2026", due: "Aug 24, 2026", paid: 0, status: "Overdue" },
  { id: 2, ref: "INV-2026-002", employer: "Al Noor Enterprises", candidate: "Suzan Mirembe", description: "Recruitment + Placement Fee", amount: 2800000, issued: "Aug 15, 2026", due: "Aug 29, 2026", paid: 2800000, status: "Paid" },
  { id: 3, ref: "INV-2026-003", employer: "Gulf Manpower Ltd", candidate: "Godfrey Kamuhangire", description: "Placement Fee — Administrator", amount: 3500000, issued: "Aug 18, 2026", due: "Sep 1, 2026", paid: 1500000, status: "Partially Paid" },
  { id: 4, ref: "INV-2026-004", employer: "Kuwait Home Services", candidate: "Alice Namukasa", description: "Recruitment Fee", amount: 1200000, issued: "Aug 20, 2026", due: "Sep 3, 2026", paid: 0, status: "Sent" },
  { id: 5, ref: "INV-2026-005", employer: "Qatar Construction Co.", candidate: "James Okello", description: "Placement Fee — Driver", amount: 2500000, issued: "Aug 5, 2026", due: "Aug 19, 2026", paid: 0, status: "Draft" },
];

const payableInvoices: Invoice[] = [
  { id: "p1", ref: "PAY-2026-001", vendorName: "Global Visa Services", candidate: "Alice Namukasa", candidateFileNumber: "FLN-2026-001", description: "Visa processing fee", amount: 850000, issued: "Aug 10, 2026", due: "Aug 24, 2026", paid: 0, status: "Pending" },
  { id: "p2", ref: "PAY-2026-002", vendorName: "Emirates Recruitment Partner", candidate: "Suzan Mirembe", candidateFileNumber: "FLN-2026-002", description: "Partner placement commission", amount: 1200000, issued: "Aug 12, 2026", due: "Aug 26, 2026", paid: 1200000, status: "Paid" },
  { id: "p3", ref: "PAY-2026-003", vendorName: "Al Noor Contractors", projectName: "Gulf Manpower", description: "Contractor service charge", amount: 950000, issued: "Aug 15, 2026", due: "Aug 29, 2026", paid: 500000, status: "Partially Paid" },
];

const statusColor: Record<string, string> = {
  Draft: "#6b7280", Sent: "#3b82f6", "Partially Paid": "#8b5cf6",
  Paid: "#10b981", Overdue: "#ef4444", Cancelled: "#6b7280", Pending: "#6366f1",
};

const UGX = (n: number) => `UGX ${n.toLocaleString()}`;

type InvoiceTabType = "current" | "payable";

export default function Invoices() {
  const [activeTab, setActiveTab] = useState<InvoiceTabType>("current");
  const [selectedCurrent, setSelectedCurrent] = useState<Invoice | null>(null);
  const [selectedPayable, setSelectedPayable] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");
  const [showNew, setShowNew] = useState(false);
  const [showNewPayable, setShowNewPayable] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [company, setCompany] = useState<CompanyInfo>({});
  const [paymentMethods, setPaymentMethods] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadInvoiceData();
  }, []);

  const loadInvoiceData = async () => {
    setLoading(true);
    setError("");
    try {
      const [recipientsRes, paymentRes] = await Promise.all([
        fetch("/api/invoice-recipients", { cache: "no-store" }),
        fetch("/api/finance/payment-info", { cache: "no-store" }),
      ]);

      if (!recipientsRes.ok || !paymentRes.ok) {
        throw new Error("Failed to load invoice data.");
      }

      const recipientsData = await recipientsRes.json() as { recipients?: Recipient[]; agents?: Agent[]; company?: CompanyInfo & { logo?: string } };
      const paymentData = await paymentRes.json() as { paymentMethods?: PaymentInfo[]; company?: CompanyInfo & { logo_url?: string } };

      setRecipients(recipientsData.recipients ?? []);
      setAgents(recipientsData.agents ?? []);
      setPaymentMethods(paymentData.paymentMethods ?? []);
      
      const mergedCompany = {
        ...(recipientsData.company ?? {}),
        ...(paymentData.company ?? {}),
        logo: paymentData.company?.logo_url || recipientsData.company?.logo || "",
      };
      setCompany(mergedCompany);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invoice data.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInvoice = async (invoiceData: any) => {
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientType: invoiceData.recipientType,
          recipientId: invoiceData.recipientId,
          description: invoiceData.description,
          amount: invoiceData.amount,
          dueDate: invoiceData.dueDate,
        }),
      });

      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Failed to create invoice.");
      }

      setShowGenerator(false);
      alert("Invoice created successfully!");
    } catch (err) {
      throw err;
    }
  };

  const handleRecordPayableInvoice = async (formData: any) => {
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record-payable-invoice",
          ...formData,
        }),
      });

      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "Failed to record payable invoice.");
      }

      setShowNewPayable(false);
      alert("Payable invoice recorded successfully!");
      loadInvoiceData();
    } catch (err) {
      throw err;
    }
  };

  const getStatusFilters = (invoices: Invoice[]) => {
    const statuses = new Set(invoices.map(i => i.status));
    return ["All", ...Array.from(statuses)];
  };

  const currentInvoices = sampleInvoices;
  const filtered = currentInvoices.filter(i => statusFilter === "All" || i.status === statusFilter);
  const payableFiltered = payableInvoices.filter(i => statusFilter === "All" || i.status === statusFilter);

  const getTotals = (invoices: Invoice[]) => ({
    total: invoices.reduce((s, i) => s + i.amount, 0),
    paid: invoices.reduce((s, i) => s + i.paid, 0),
    outstanding: invoices.reduce((s, i) => s + (i.amount - i.paid), 0),
    overdue: invoices.filter(i => i.status === "Overdue" || i.status === "Pending").length,
  });

  const currentTotals = getTotals(currentInvoices);
  const payableTotals = getTotals(payableInvoices);
  const isCurrentTab = activeTab === "current";
  const displayTotals = isCurrentTab ? currentTotals : payableTotals;
  const displayFiltered = isCurrentTab ? filtered : payableFiltered;
  const statusFilters = isCurrentTab ? getStatusFilters(currentInvoices) : getStatusFilters(payableInvoices);

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Invoices</h1>
            <p className="text-sm mono mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              {isCurrentTab ? "Employer billing and invoice tracking" : "Contractor and partner invoice payments"}
            </p>
          </div>
          <button 
            onClick={() => isCurrentTab ? setShowGenerator(true) : setShowNewPayable(true)}
            className="px-4 py-1.5 text-sm font-600 rounded"
            style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
            + {isCurrentTab ? "New Invoice" : "Record Payable"}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 pb-0 flex gap-4 border-b" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => { setActiveTab("current"); setStatusFilter("All"); setSelectedCurrent(null); }}
            className="pb-3 px-2 text-sm font-600 border-b-2 transition-colors"
            style={{
              borderColor: isCurrentTab ? "var(--primary)" : "transparent",
              color: isCurrentTab ? "var(--primary)" : "var(--muted-foreground)",
            }}>
            Current Invoices
          </button>
          <button
            onClick={() => { setActiveTab("payable"); setStatusFilter("All"); setSelectedPayable(null); }}
            className="pb-3 px-2 text-sm font-600 border-b-2 transition-colors"
            style={{
              borderColor: !isCurrentTab ? "var(--primary)" : "transparent",
              color: !isCurrentTab ? "var(--primary)" : "var(--muted-foreground)",
            }}>
            Payable Invoices
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 p-6 pb-0">
          {[
            { label: "Total Invoiced", value: UGX(displayTotals.total), color: "var(--foreground)" },
            { label: isCurrentTab ? "Total Collected" : "Total Paid", value: UGX(displayTotals.paid), color: "#10b981" },
            { label: "Outstanding", value: UGX(displayTotals.outstanding), color: "#ef4444" },
            { label: isCurrentTab ? "Overdue Invoices" : "Pending", value: displayTotals.overdue, color: "#ef4444" },
          ].map((k) => (
            <div key={k.label} className="rounded border p-4" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="mono text-xl font-700" style={{ color: k.color }}>{k.value}</div>
              <div className="text-xs font-700 uppercase tracking-wider mt-1" style={{ color: "var(--muted-foreground)" }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Status Filters */}
        <div className="px-6 pt-4 pb-0 flex gap-2 overflow-auto">
          {statusFilters.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1 text-xs font-600 rounded whitespace-nowrap"
              style={{ background: statusFilter === s ? "var(--primary)" : "var(--secondary)", color: statusFilter === s ? "var(--primary-foreground)" : "var(--muted-foreground)" }}>
              {s}
            </button>
          ))}
        </div>

        {/* Invoices Table */}
        <div className="flex-1 overflow-auto p-6">
          <div className="rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="app-table-scroll"><table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                  {isCurrentTab
                    ? ["Invoice", "Employer", "Candidate", "Description", "Amount", "Paid", "Balance", "Issued", "Due", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))
                    : ["Invoice", "Vendor", "Candidate / Project", "Description", "Amount", "Paid", "Balance", "Issued", "Due", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{h}</th>
                    ))
                  }
                </tr>
              </thead>
              <tbody>
                {displayFiltered.map((inv) => {
                  const isSelected = isCurrentTab ? selectedCurrent?.id === inv.id : selectedPayable?.id === inv.id;
                  return (
                    <tr key={inv.id} className="border-b cursor-pointer"
                      style={{ borderColor: "var(--border)", background: isSelected ? "var(--secondary)" : "transparent" }}
                      onClick={() => isCurrentTab ? setSelectedCurrent(isSelected ? null : inv) : setSelectedPayable(isSelected ? null : inv)}>
                      <td className="px-4 py-3 mono text-xs font-600" style={{ color: "#6366f1" }}>{inv.ref}</td>
                    <td className="px-4 py-3 text-xs font-600" style={{ color: "var(--foreground)" }}>
                        {isCurrentTab ? (inv as any).employer : (inv as any).vendorName}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {inv.candidate || (inv as any).projectName || "—"}
                      </td>
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
                  );
                })}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>

      {/* Detail Panel - Current Invoices */}
      {isCurrentTab && selectedCurrent && (
        <div className="detail-panel w-72 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelectedCurrent(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <div className="mono text-lg font-700" style={{ color: "#6366f1" }}>{selectedCurrent.ref}</div>
            <span className="mono text-xs font-600 px-1.5 py-0.5 rounded mt-1 inline-block"
              style={{ color: statusColor[selectedCurrent.status], background: statusColor[selectedCurrent.status] + "20" }}>
              {selectedCurrent.status}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Employer", value: selectedCurrent.employer },
              { label: "Candidate", value: selectedCurrent.candidate },
              { label: "Description", value: selectedCurrent.description },
              { label: "Invoice Amount", value: UGX(selectedCurrent.amount) },
              { label: "Amount Paid", value: UGX(selectedCurrent.paid) },
              { label: "Balance Due", value: UGX(selectedCurrent.amount - selectedCurrent.paid) },
              { label: "Issued", value: selectedCurrent.issued },
              { label: "Due Date", value: selectedCurrent.due },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value}</div>
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              {selectedCurrent.status !== "Paid" && (
                <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Mark as Paid</button>
              )}
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Download PDF</button>
              {selectedCurrent.status === "Draft" && (
                <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "#3b82f6" }}>Send to Employer</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detail Panel - Payable Invoices */}
      {!isCurrentTab && selectedPayable && (
        <div className="detail-panel w-72 border-l overflow-auto shrink-0" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setSelectedPayable(null)} className="text-xs mb-3 flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}><ArrowLeft size={13} aria-hidden="true" />Close</button>
            <div className="mono text-lg font-700" style={{ color: "#6366f1" }}>{selectedPayable.ref}</div>
            <span className="mono text-xs font-600 px-1.5 py-0.5 rounded mt-1 inline-block"
              style={{ color: statusColor[selectedPayable.status], background: statusColor[selectedPayable.status] + "20" }}>
              {selectedPayable.status}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: "Vendor", value: (selectedPayable as any).vendorName },
              { label: "Candidate", value: selectedPayable.candidate },
              { label: (selectedPayable as any).projectName ? "Project" : "File Number", value: (selectedPayable as any).projectName || (selectedPayable as any).candidateFileNumber },
              { label: "Description", value: selectedPayable.description },
              { label: "Invoice Amount", value: UGX(selectedPayable.amount) },
              { label: "Amount Paid", value: UGX(selectedPayable.paid) },
              { label: "Balance Due", value: UGX(selectedPayable.amount - selectedPayable.paid) },
              { label: "Issued", value: selectedPayable.issued },
              { label: "Due Date", value: selectedPayable.due },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="text-xs font-700 uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label}</div>
                <div className="text-sm" style={{ color: "var(--foreground)" }}>{value || "—"}</div>
              </div>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              {selectedPayable.status !== "Paid" && selectedPayable.amount - selectedPayable.paid > 0 && (
                <button className="py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Record Payment</button>
              )}
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Download PDF</button>
              <button className="py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "#ef4444" }}>Mark as Disputed</button>
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

      {showNewPayable && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "#0009" }}>
          <div className="rounded border p-6 w-full max-w-md" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Record Payable Invoice</h2>
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>Contractor or partner service charge</p>
              </div>
              <button onClick={() => setShowNewPayable(false)} aria-label="Close" className="p-1" style={{ color: "var(--muted-foreground)" }}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Vendor Type", ph: "Contractor / Partner" },
                { label: "Vendor", ph: "Select vendor" },
                { label: "Candidate", ph: "Select candidate" },
                { label: "Description", ph: "e.g. Visa processing fee" },
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
              <button className="flex-1 py-2 text-sm font-600 rounded" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>Record Invoice</button>
              <button onClick={() => setShowNewPayable(false)} className="flex-1 py-2 text-sm rounded border" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <InvoiceGeneratorModal
        isOpen={showGenerator}
        onClose={() => setShowGenerator(false)}
        recipients={recipients}
        agents={agents}
        company={company}
        paymentMethods={paymentMethods}
        onGenerate={handleGenerateInvoice}
      />
    </div>
  );
}
