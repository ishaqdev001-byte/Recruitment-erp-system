"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Plus, Search } from "lucide-react";
import { SearchableMultiSelect, SearchableSelect } from "./SearchableSelect";

type StaffOption = { id: string; staff_id: string; name: string; position: string };
type AccountOption = { id: string; name: string; account_type: string; account_number: string };
type PaycheckRecord = {
  id: string;
  staff_member_id: string;
  pay_period: string;
  base_salary: number;
  earnings: { description: string; amount: number }[];
  benefits: { description: string; amount: number }[];
  deductions: { description: string; amount: number }[];
  gross_amount: number;
  benefits_total: number;
  deductions_total: number;
  net_amount: number;
  payment_date: string;
  payment_method: string;
  payment_reference: string;
  employee: StaffOption;
  payslipUrl: string;
};
type PayrollAdjustment = {
  id: string;
  staff_member_id: string;
  pay_period: string;
  adjustment_type: "benefit" | "deduction";
  amount: number;
  payment_method: string;
  payment_reference: string;
  description: string;
  paycheck_id: string | null;
  employee: StaffOption;
};
type PayrollPayload = { paychecks?: PaycheckRecord[]; staff?: StaffOption[]; accounts?: AccountOption[]; company?: { name: string; logo_url: string | null }; permissions?: { canRecord?: boolean }; error?: string };
type AdjustmentsPayload = { adjustments?: PayrollAdjustment[]; referencePreview?: string; error?: string };

const fieldStyle = { background: "var(--secondary)", borderColor: "var(--border)", color: "var(--foreground)" };
const payMethods = ["Bank transfer", "Mobile money", "Cash", "Cheque", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => `${today().slice(0, 7)}-01`;
const formatMoney = (amount: number) => `UGX ${Number(amount || 0).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Paychecks() {
  const [paychecks, setPaychecks] = useState<PaycheckRecord[]>([]);
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [referencePreview, setReferencePreview] = useState("");
  const [canRecord, setCanRecord] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<"benefit" | "deduction" | null>(null);
  const [search, setSearch] = useState("");
  const [staffMemberId, setStaffMemberId] = useState("");
  const [payPeriod, setPayPeriod] = useState(currentMonth);
  const [paymentDate, setPaymentDate] = useState(today);
  const [baseSalary, setBaseSalary] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [accountId, setAccountId] = useState("");
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [adjustmentPayPeriod, setAdjustmentPayPeriod] = useState(currentMonth);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentPaymentMethod, setAdjustmentPaymentMethod] = useState("Bank transfer");
  const [adjustmentDescription, setAdjustmentDescription] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [response, adjustmentResponse] = await Promise.all([
          fetch("/api/paychecks", { cache: "no-store" }),
          fetch("/api/paychecks/adjustments", { cache: "no-store" }),
        ]);
        const [payload, adjustmentPayload] = await Promise.all([
          response.json() as Promise<PayrollPayload>,
          adjustmentResponse.json() as Promise<AdjustmentsPayload>,
        ]);
        if (!response.ok) throw new Error(payload.error ?? "Unable to load payroll.");
        if (!adjustmentResponse.ok) throw new Error(adjustmentPayload.error ?? "Unable to load benefits and deductions.");
        if (!cancelled) {
          setPaychecks(payload.paychecks ?? []);
          setStaff(payload.staff ?? []);
          setAccounts(payload.accounts ?? []);
          setCanRecord(Boolean(payload.permissions?.canRecord));
          setAdjustments(adjustmentPayload.adjustments ?? []);
          setReferencePreview(adjustmentPayload.referencePreview ?? "");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load payroll.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const filteredPaychecks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return paychecks;
    return paychecks.filter((paycheck) => `${paycheck.employee.name} ${paycheck.employee.staff_id} ${paycheck.employee.position} ${paycheck.pay_period} ${paycheck.payment_reference}`.toLocaleLowerCase().includes(query));
  }, [paychecks, search]);
  const staffOptions = staff.map((member) => ({ value: member.id, label: member.name, description: `${member.staff_id} · ${member.position}`, searchText: `${member.staff_id} ${member.position}` }));

  const monthToDate = paychecks.filter((paycheck) => paycheck.pay_period === currentMonth());
  const monthPaid = monthToDate.reduce((sum, paycheck) => sum + Number(paycheck.net_amount), 0);
  const selectedAdjustments = adjustments.filter((adjustment) => adjustment.staff_member_id === staffMemberId && adjustment.pay_period === payPeriod && !adjustment.paycheck_id);
  const monthBenefits = selectedAdjustments.filter((adjustment) => adjustment.adjustment_type === "benefit").reduce((sum, item) => sum + Number(item.amount), 0);
  const monthDeductions = selectedAdjustments.filter((adjustment) => adjustment.adjustment_type === "deduction").reduce((sum, item) => sum + Number(item.amount), 0);
  const netEstimate = (Number(baseSalary) || 0) + monthBenefits - monthDeductions;

  const resetPayment = () => {
    setStaffMemberId("");
    setPayPeriod(currentMonth());
    setPaymentDate(today());
    setBaseSalary("");
    setPaymentMethod("Bank transfer");
    setAccountId("");
  };

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/paychecks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffMemberId, payPeriod, paymentDate, baseSalary, paymentMethod, accountId }),
      });
      const payload = await response.json() as { paycheck?: PaycheckRecord; error?: string };
      if (!response.ok || !payload.paycheck) throw new Error(payload.error ?? "Unable to record this payment.");
      setShowPayment(false);
      setNotice(`Monthly payment saved for ${payload.paycheck.employee.name} with reference ${payload.paycheck.payment_reference}; payslip generated.`);
      const download = document.createElement("a");
      download.href = payload.paycheck.payslipUrl;
      download.download = "payslip.pdf";
      document.body.append(download);
      download.click();
      download.remove();
      resetPayment();
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to record this payment.");
    } finally {
      setSaving(false);
    }
  };

  const openAdjustment = (type: "benefit" | "deduction") => {
    setAdjustmentType(type);
    setSelectedStaffIds([]);
    setAdjustmentPayPeriod(currentMonth());
    setAdjustmentAmount("");
    setAdjustmentPaymentMethod("Bank transfer");
    setAdjustmentDescription("");
    setError("");
    setNotice("");
  };

  const recordAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adjustmentType) return;
    setAdjustmentSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/paychecks/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffMemberIds: selectedStaffIds, payPeriod: adjustmentPayPeriod, adjustmentType, amount: adjustmentAmount, paymentMethod: adjustmentPaymentMethod, description: adjustmentDescription }),
      });
      const result = await response.json() as { reference?: string; count?: number; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to save this payroll adjustment.");
      setAdjustmentType(null);
      setNotice(`${adjustmentType === "benefit" ? "Benefit" : "Deduction"} recorded for ${result.count} staff member${result.count === 1 ? "" : "s"}. Reference ${result.reference}.`);
      setReloadKey((key) => key + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this payroll adjustment.");
    } finally {
      setAdjustmentSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-labelledby="paychecks-title">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div><h1 id="paychecks-title" className="text-xl font-700" style={{ color: "var(--foreground)" }}>Paychecks</h1><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Monthly payroll payments and payslips</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!canRecord || loading || !staff.length} onClick={() => openAdjustment("benefit")} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={15} aria-hidden="true" />Record other benefits</button>
          <button type="button" disabled={!canRecord || loading || !staff.length} onClick={() => openAdjustment("deduction")} className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Plus size={15} aria-hidden="true" />Record deductions</button>
          <button type="button" disabled={!canRecord || loading || !staff.length} onClick={() => { setError(""); setNotice(""); resetPayment(); setShowPayment(true); }} className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}><Plus size={16} aria-hidden="true" />Record monthly payment</button>
        </div>
      </header>

      <div className="grid grid-cols-1 border-b sm:grid-cols-3" style={{ borderColor: "var(--border)" }}>
        {[{ label: "Paid this month", value: formatMoney(monthPaid), color: "#17845b" }, { label: "Payslips this month", value: String(monthToDate.length), color: "var(--foreground)" }, { label: "Employees on payroll", value: String(staff.length), color: "var(--primary)" }].map((metric) => <div key={metric.label} className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r" style={{ borderColor: "var(--border)" }}><div className="mono text-lg font-700" style={{ color: metric.color }}>{loading ? "—" : metric.value}</div><div className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.label}</div></div>)}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
        <label className="flex w-full max-w-md items-center gap-2 rounded border px-3" style={{ background: "var(--secondary)", borderColor: "var(--border)" }}><Search size={15} aria-hidden="true" style={{ color: "var(--muted-foreground)" }} /><input aria-label="Search paychecks" placeholder="Search staff member, ID, period, or reference" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" style={{ color: "var(--foreground)" }} /></label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filteredPaychecks.length} payslips</span>
      </div>

      {error && <div role="alert" className="mx-6 mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
      {notice && <div role="status" className="mx-6 mt-4 rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">{notice}</div>}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <table className="w-full min-w-225 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Pay period", "Staff member", "Gross pay", "Benefits", "Deductions", "Net paid", "Payment date", "Payslip"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Loading payroll…</td></tr>}
              {!loading && !filteredPaychecks.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{paychecks.length ? "No payments match this search." : "No monthly payments recorded."}</td></tr>}
              {!loading && filteredPaychecks.map((paycheck) => <tr key={paycheck.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 font-600" style={{ color: "var(--foreground)" }}>{new Date(`${paycheck.pay_period}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td>
                <td className="whitespace-nowrap px-3 py-3"><span className="block font-600" style={{ color: "var(--foreground)" }}>{paycheck.employee.name}</span><span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{paycheck.employee.staff_id} · {paycheck.employee.position}</span></td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{formatMoney(Number(paycheck.gross_amount))}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "#17845b" }}>{formatMoney(Number(paycheck.benefits_total))}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "#c2413a" }}>{formatMoney(Number(paycheck.deductions_total))}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs font-700" style={{ color: "var(--primary)" }}>{formatMoney(Number(paycheck.net_amount))}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(`${paycheck.payment_date}T00:00:00`).toLocaleDateString("en-GB")}</td>
                <td className="px-3 py-3"><a href={paycheck.payslipUrl} className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-600" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><Download size={13} aria-hidden="true" />PDF</a></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="mt-6 overflow-x-auto rounded border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="border-b px-4 py-3 text-sm font-700" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Recorded benefits and deductions</div>
          <table className="w-full min-w-225 text-sm">
            <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>{["Pay month", "Staff member", "Type", "Description", "Amount", "Method", "Reference", "Payslip"].map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>{heading}</th>)}</tr></thead>
            <tbody>
              {!adjustments.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>No benefits or deductions recorded.</td></tr>}
              {adjustments.map((adjustment) => <tr key={adjustment.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{new Date(`${adjustment.pay_period}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--foreground)" }}>{adjustment.employee.name} · {adjustment.employee.staff_id}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs font-600" style={{ color: adjustment.adjustment_type === "benefit" ? "#17845b" : "#c2413a" }}>{adjustment.adjustment_type === "benefit" ? "Benefit" : "Deduction"}</td>
                <td className="px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{adjustment.description}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--foreground)" }}>{formatMoney(Number(adjustment.amount))}</td>
                <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{adjustment.payment_method}</td>
                <td className="whitespace-nowrap px-3 py-3 mono text-xs" style={{ color: "var(--primary)" }}>{adjustment.payment_reference}</td>
                <td className="px-3 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{adjustment.paycheck_id ? "Included" : "Pending monthly payslip"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {showPayment && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowPayment(false); }}>
        <form onSubmit={recordPayment} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>Record monthly payment</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>Saving the payment immediately generates its company-branded payslip.</p></div><button type="button" disabled={saving} onClick={() => setShowPayment(false)} aria-label="Close payment form" className="px-2 text-lg" style={{ color: "var(--muted-foreground)" }}>×</button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Employee<SearchableSelect required ariaLabel="Search employee" value={staffMemberId} onChange={setStaffMemberId} options={staffOptions} placeholder="Type a name or staff ID" className="mt-1 normal-case tracking-normal" /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Pay month<input required type="month" value={payPeriod.slice(0, 7)} onChange={(event) => setPayPeriod(`${event.target.value}-01`)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Base salary (UGX)<input required type="number" min="0" step="0.01" value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment date<input required type="date" max={today()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{payMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Pay from account<SearchableSelect required ariaLabel="Choose payroll account" value={accountId} onChange={setAccountId} options={accounts.map((account) => ({ value: account.id, label: account.name, description: account.account_type.replace(/_/g, " "), searchText: account.account_number }))} placeholder="Select the account funding payroll" className="mt-1 normal-case tracking-normal" /></label>
          </div>
          <div className="mt-4 rounded border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--secondary)" }}>
            <div className="flex flex-wrap justify-between gap-2"><span style={{ color: "var(--muted-foreground)" }}>Recorded benefits</span><span style={{ color: "#17845b" }}>{formatMoney(monthBenefits)}</span></div>
            <div className="mt-1 flex flex-wrap justify-between gap-2"><span style={{ color: "var(--muted-foreground)" }}>Recorded deductions</span><span style={{ color: "#c2413a" }}>{formatMoney(monthDeductions)}</span></div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 border-t pt-2 font-700" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}><span>Estimated net pay</span><span>{formatMoney(netEstimate)}</span></div>
          </div>
          {error && <div role="alert" className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={() => setShowPayment(false)} className="rounded border px-4 py-2.5 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={saving || !staff.length || !accountId} className="rounded px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{saving ? "Recording payment…" : "Save payment and generate payslip"}</button></div>
        </form>
      </div>}

      {adjustmentType && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !adjustmentSaving) setAdjustmentType(null); }}>
        <form onSubmit={recordAdjustment} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded border p-5 sm:p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>{adjustmentType === "benefit" ? "Record other benefits / income" : "Record deductions"}</h2><p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>One amount and payment reference will be recorded for each selected staff member.</p></div><button type="button" disabled={adjustmentSaving} onClick={() => setAdjustmentType(null)} aria-label="Close adjustment form" className="px-2 text-lg" style={{ color: "var(--muted-foreground)" }}>×</button></div>
          <fieldset>
            <div className="mb-2 flex items-center justify-between gap-3"><legend className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Staff members</legend><div className="flex gap-2"><button type="button" onClick={() => setSelectedStaffIds(staff.map((member) => member.id))} className="text-xs font-600" style={{ color: "var(--primary)" }}>Select all</button><button type="button" onClick={() => setSelectedStaffIds([])} className="text-xs" style={{ color: "var(--muted-foreground)" }}>Clear</button></div></div>
            <SearchableMultiSelect ariaLabel="Search staff members" values={selectedStaffIds} onChange={setSelectedStaffIds} options={staffOptions} placeholder="Type a name or staff ID" className="w-full" />
            <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{selectedStaffIds.length} selected</p>
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment month<input required type="month" value={adjustmentPayPeriod.slice(0, 7)} onChange={(event) => setAdjustmentPayPeriod(`${event.target.value}-01`)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Amount per staff member (UGX)<input required type="number" min="0.01" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment method<select value={adjustmentPaymentMethod} onChange={(event) => setAdjustmentPaymentMethod(event.target.value)} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle}>{payMethods.map((method) => <option key={method}>{method}</option>)}</select></label>
            <label className="block text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Payment reference<input readOnly value={referencePreview || "Generated on save"} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none opacity-80" style={fieldStyle} /></label>
            <label className="block text-xs font-700 uppercase tracking-wider sm:col-span-2" style={{ color: "var(--muted-foreground)" }}>Description<input required maxLength={200} value={adjustmentDescription} onChange={(event) => setAdjustmentDescription(event.target.value)} placeholder={adjustmentType === "benefit" ? "e.g. Transport allowance" : "e.g. Salary advance recovery"} className="mt-1 w-full rounded border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none" style={fieldStyle} /></label>
          </div>
          <p className="mt-3 text-xs" style={{ color: "var(--muted-foreground)" }}>This adjustment must be recorded before the monthly payment so it can appear on the employee’s payslip.</p>
          {error && <div role="alert" className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={adjustmentSaving} onClick={() => setAdjustmentType(null)} className="rounded border px-4 py-2.5 text-sm disabled:opacity-50" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Cancel</button><button type="submit" disabled={adjustmentSaving || !selectedStaffIds.length} className="rounded px-5 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>{adjustmentSaving ? "Saving…" : "Save adjustment"}</button></div>
        </form>
      </div>}
    </section>
  );
}