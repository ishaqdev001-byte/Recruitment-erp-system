"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";

type ReportSection = "overview" | "staff" | "agents" | "suppliers" | "contractors" | "growth" | "stages" | "finance";
type ReportRange = "Today" | "This Week" | "This Month" | "This Year" | "All Time" | "Custom Range";

interface StaffActivity {
  id: string;
  name: string;
  candidatesRegistered: number;
  inquiriesReceived: number;
  inquiryReminders: number;
  tasksCreated: number;
  tasksCompleted: number;
}

interface CandidateStage {
  stage: string;
  count: number;
}

interface AgentReport {
  id: string;
  name: string;
  totalCandidates: number;
  newCandidates: number;
  previousCandidates: number;
  placements: number;
}

interface EntityReport {
  id: string;
  name: string;
  registeredAt: string;
}

interface GrowthComparison {
  current: number;
  previous: number | null;
}

interface ReportsData {
  period: { start: string; end: string };
  previousPeriod: { start: string; end: string } | null;
  permissions: {
    candidates: boolean;
    inquiries: boolean;
    tasks: boolean;
    finance: boolean;
    suppliers: boolean;
    employers: boolean;
    projects: boolean;
  };
  candidates: { total: number; registered: number; previousRegistrations: number | null; stages: CandidateStage[]; agents: AgentReport[] } | null;
  inquiries: { received: number; reminders: number } | null;
  tasks: { created: number; completed: number; overdue: number } | null;
  suppliers: {
    total: number;
    active: number;
    registered: number;
    previousRegistrations: number | null;
    items: (EntityReport & { status: string })[];
  } | null;
  contractors: {
    total: number;
    registered: number;
    previousRegistrations: number | null;
    items: (EntityReport & { projects: number })[];
  } | null;
  growth: {
    candidates: GrowthComparison | null;
    inquiries: GrowthComparison | null;
    tasks: GrowthComparison | null;
    suppliers: GrowthComparison | null;
    contractors: GrowthComparison | null;
    projects: GrowthComparison | null;
  };
  staffActivity: StaffActivity[];
}

interface FinanceData {
  totals: { income: number; expenses: number; net: number; invoiceDue: number };
  incomeBreakdown: { label: string; amount: number; color: string }[];
  expenseBreakdown: { label: string; amount: number; color: string }[];
  monthlyTrend: { month: string; income: number; expenses: number }[];
}

const rangeOptions: ReportRange[] = ["Today", "This Week", "This Month", "This Year", "All Time", "Custom Range"];
const sections: { id: ReportSection; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "staff", label: "Staff" },
  { id: "agents", label: "Agents" },
  { id: "suppliers", label: "Suppliers" },
  { id: "contractors", label: "Contractors" },
  { id: "growth", label: "Growth Analytics" },
  { id: "stages", label: "Candidate Stages" },
  { id: "finance", label: "Finance" },
];
const stageColors = ["#6366f1", "#8b5cf6", "#f59e0b", "#3b82f6", "#10b981", "#ec4899"];

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function periodFor(range: ReportRange, start: string, end: string) {
  const today = new Date();
  const todayDate = dateOnly(today);
  if (range === "Custom Range") return { start, end };
  if (range === "All Time") return { start: "1900-01-01", end: todayDate };
  if (range === "Today") return { start: todayDate, end: todayDate };
  if (range === "This Year") return { start: `${today.getUTCFullYear()}-01-01`, end: todayDate };
  if (range === "This Week") {
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return { start: dateOnly(monday), end: todayDate };
  }
  return { start: `${todayDate.slice(0, 7)}-01`, end: todayDate };
}

function previousPeriodFor(start: string, end: string) {
  const duration = Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`) + 86_400_000;
  const previousEnd = new Date(Date.parse(`${start}T00:00:00.000Z`) - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - duration + 86_400_000);
  return { start: dateOnly(previousStart), end: dateOnly(previousEnd) };
}

function formatAmount(value: number) {
  return `UGX ${Math.round(value).toLocaleString()}`;
}

function growthFor(current: number, previous: number | null) {
  if (previous === null) return { label: "No comparison period", color: "#64748b", percentage: null };
  if (previous === 0 && current > 0) return { label: "New activity", color: "#059669", percentage: null };
  if (previous === 0) return { label: "No change", color: "#64748b", percentage: 0 };
  const percentage = ((current - previous) / previous) * 100;
  if (percentage > 0) return { label: "Growing", color: "#059669", percentage };
  if (percentage < 0) return { label: "Dropping", color: "#dc2626", percentage };
  return { label: "No change", color: "#64748b", percentage: 0 };
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: (string | number)[][]) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `recruitment-report-${dateOnly(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function fetchReport<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const result = await response.json() as { error?: string } & T;
  if (!response.ok) throw new Error(result.error || "Unable to load report data.");
  return result;
}

export default function Reports({ permissions }: { permissions: string[] }) {
  const [range, setRange] = useState<ReportRange>("This Month");
  const [customStart, setCustomStart] = useState(() => `${dateOnly(new Date()).slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(() => dateOnly(new Date()));
  const [entityFilter, setEntityFilter] = useState("All");
  const [activeSection, setActiveSection] = useState<ReportSection>("overview");
  const [reportData, setReportData] = useState<ReportsData | null>(null);
  const [financeData, setFinanceData] = useState<FinanceData | null>(null);
  const [previousFinanceData, setPreviousFinanceData] = useState<FinanceData | null>(null);
  const [reportError, setReportError] = useState("");
  const [financeError, setFinanceError] = useState("");
  const [financeComparisonError, setFinanceComparisonError] = useState("");
  const [loading, setLoading] = useState(true);
  const [financeLoading, setFinanceLoading] = useState(false);
  const canViewFinance = permissions.includes("finance.view");
  const period = periodFor(range, customStart, customEnd);
  const dateRangeValid = Boolean(period.start && period.end && period.start <= period.end);
  const comparisonPeriod = dateRangeValid && range !== "All Time"
    ? previousPeriodFor(period.start, period.end)
    : null;

  useEffect(() => {
    if (!dateRangeValid) {
      setReportData(null);
      setFinanceData(null);
      setPreviousFinanceData(null);
      setReportError("Choose a valid start and end date.");
      setFinanceError("");
      setFinanceComparisonError("");
      setLoading(false);
      setFinanceLoading(false);
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ start: period.start, end: period.end });
    const financeQuery = new URLSearchParams({ range, start: period.start, end: period.end });
    setLoading(true);
    setReportError("");
    setFinanceError("");
    setFinanceComparisonError("");
    setFinanceLoading(canViewFinance);

    void fetchReport<ReportsData>(`/api/reports?${query}`, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReportData(data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setReportData(null);
        setReportError(error instanceof Error ? error.message : "Reports data is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    if (!canViewFinance) {
      setFinanceData(null);
      setPreviousFinanceData(null);
      setFinanceComparisonError("");
    } else {
      void fetchReport<FinanceData>(`/api/finance/overview?${financeQuery}`, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setFinanceData(data);
            setFinanceError("");
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setFinanceData(null);
          setFinanceError(error instanceof Error ? error.message : "Finance summary is unavailable.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setFinanceLoading(false);
        });

      if (comparisonPeriod) {
        const previousQuery = new URLSearchParams({
          range: "Custom Range",
          start: comparisonPeriod.start,
          end: comparisonPeriod.end,
        });
        void fetchReport<FinanceData>(`/api/finance/overview?${previousQuery}`, controller.signal)
          .then((data) => {
            if (!controller.signal.aborted) {
              setPreviousFinanceData(data);
              setFinanceComparisonError("");
            }
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            setPreviousFinanceData(null);
            setFinanceComparisonError(error instanceof Error
              ? `Unable to compare the previous finance period: ${error.message}`
              : "Unable to compare the previous finance period.");
          });
      } else {
        setPreviousFinanceData(null);
      }
    }

    return () => controller.abort();
  }, [canViewFinance, comparisonPeriod?.end, comparisonPeriod?.start, dateRangeValid, period.end, period.start, range]);

  const entityFilterOptions = useMemo(() => {
    if (activeSection === "staff") {
      return [
        { value: "All", label: "All Staff" },
        ...(reportData?.staffActivity ?? []).map((item) => ({ value: item.id, label: item.name })),
      ];
    }
    if (activeSection === "agents") {
      return [
        { value: "All", label: "All Agents" },
        ...(reportData?.candidates?.agents ?? []).map((item) => ({ value: item.id, label: item.name })),
      ];
    }
    if (activeSection === "suppliers") {
      return [
        { value: "All", label: "All Suppliers" },
        ...(reportData?.suppliers?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
      ];
    }
    if (activeSection === "contractors") {
      return [
        { value: "All", label: "All Contractors" },
        ...(reportData?.contractors?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
      ];
    }
    return [];
  }, [activeSection, reportData]);
  const selectedStaff = entityFilter === "All"
    ? reportData?.staffActivity ?? []
    : (reportData?.staffActivity ?? []).filter((item) => item.id === entityFilter);
  const selectedAgents = entityFilter === "All"
    ? reportData?.candidates?.agents ?? []
    : (reportData?.candidates?.agents ?? []).filter((item) => item.id === entityFilter);
  const selectedSuppliers = entityFilter === "All"
    ? reportData?.suppliers?.items ?? []
    : (reportData?.suppliers?.items ?? []).filter((item) => item.id === entityFilter);
  const selectedContractors = entityFilter === "All"
    ? reportData?.contractors?.items ?? []
    : (reportData?.contractors?.items ?? []).filter((item) => item.id === entityFilter);
  const staffActivity = selectedStaff;
  const availableSections = sections.filter((section) => (
    section.id !== "staff" || Boolean(reportData?.permissions.candidates || reportData?.permissions.inquiries || reportData?.permissions.tasks)
  ) && (section.id !== "agents" || Boolean(reportData?.permissions.candidates))
    && (section.id !== "suppliers" || Boolean(reportData?.permissions.suppliers))
    && (section.id !== "contractors" || Boolean(reportData?.permissions.employers))
    && (section.id !== "growth" || Boolean(reportData?.permissions.candidates || reportData?.permissions.inquiries
      || reportData?.permissions.tasks || reportData?.permissions.suppliers || reportData?.permissions.employers || canViewFinance))
    && (section.id !== "stages" || Boolean(reportData?.permissions.candidates))
    && (section.id !== "finance" || canViewFinance));

  const exportReport = () => {
    const rows: (string | number)[][] = [
      ["Recruitment report", `${period.start} to ${period.end}`],
      ["Metric", "Value"],
    ];
    if (reportData?.candidates) {
      rows.push(["Total candidates", reportData.candidates.total], ["New registrations", reportData.candidates.registered]);
    }
    if (reportData?.inquiries) {
      rows.push(["New inquiries", reportData.inquiries.received], ["Inquiries reminded", reportData.inquiries.reminders]);
    }
    if (reportData?.tasks) {
      rows.push(["Follow-ups created", reportData.tasks.created], ["Completed tasks last updated in period", reportData.tasks.completed], ["Overdue follow-ups", reportData.tasks.overdue]);
    }
    if (financeData) {
      rows.push(["Income (UGX)", financeData.totals.income], ["Expenses (UGX)", financeData.totals.expenses], ["Net (UGX)", financeData.totals.net]);
    }
    const growthRows: [string, GrowthComparison][] = reportData ? [
      ...(reportData.growth.candidates ? [["Candidate registrations", reportData.growth.candidates] as [string, GrowthComparison]] : []),
      ...(reportData.growth.inquiries ? [["Candidate inquiries", reportData.growth.inquiries] as [string, GrowthComparison]] : []),
      ...(reportData.growth.tasks ? [["Follow-ups created", reportData.growth.tasks] as [string, GrowthComparison]] : []),
      ...(reportData.growth.suppliers ? [["Suppliers registered", reportData.growth.suppliers] as [string, GrowthComparison]] : []),
      ...(reportData.growth.contractors ? [["Contractors registered", reportData.growth.contractors] as [string, GrowthComparison]] : []),
      ...(reportData.growth.projects ? [["Projects created", reportData.growth.projects] as [string, GrowthComparison]] : []),
    ] : [];
    if (financeData && previousFinanceData) {
      growthRows.push(["Business income", {
        current: financeData.totals.income,
        previous: previousFinanceData.totals.income,
      }]);
    }
    if (growthRows.length) {
      rows.push([], ["Growth metric", "Current period", "Previous period", "Change", "Direction"]);
      for (const [label, comparison] of growthRows) {
        const growth = growthFor(comparison.current, comparison.previous);
        rows.push([
          label,
          comparison.current,
          comparison.previous ?? "Not available",
          growth.percentage === null ? growth.label : `${growth.percentage.toFixed(1)}%`,
          growth.label,
        ]);
      }
    }
    if (reportData?.candidates?.stages.length) {
      rows.push([], ["Candidate stage", "Candidates"]);
      for (const stage of reportData.candidates.stages) rows.push([stage.stage, stage.count]);
    }
    if (staffActivity.length) {
      rows.push([], ["Staff member", "New candidates", "Inquiries", "Inquiries reminded", "Follow-ups created", "Completed tasks updated"]);
      for (const item of staffActivity) {
        rows.push([item.name, item.candidatesRegistered, item.inquiriesReceived, item.inquiryReminders, item.tasksCreated, item.tasksCompleted]);
      }
    }
    if (reportData?.candidates?.agents.length) {
      rows.push([], ["Agent", "Total candidates", "New candidates", "Previous period candidates", "Travelled candidates"]);
      for (const item of selectedAgents) rows.push([item.name, item.totalCandidates, item.newCandidates, item.previousCandidates, item.placements]);
    }
    if (reportData?.suppliers) {
      rows.push([], ["Supplier", "Status", "Registered"]);
      for (const item of selectedSuppliers) rows.push([item.name, item.status, item.registeredAt]);
    }
    if (reportData?.contractors) {
      rows.push([], ["Contractor", "Projects", "Registered"]);
      for (const item of selectedContractors) rows.push([item.name, item.projects, item.registeredAt]);
    }
    downloadCsv(rows);
  };

  useEffect(() => {
    if (!availableSections.some((section) => section.id === activeSection)) setActiveSection("overview");
  }, [activeSection, availableSections]);

  const metricCards = [
    ...(reportData?.candidates ? [
      { label: "New Candidates", value: reportData.candidates.registered.toLocaleString(), detail: `${reportData.candidates.total.toLocaleString()} total on record`, color: "#6366f1" },
    ] : []),
    ...(reportData?.inquiries ? [
      { label: "New Inquiries", value: reportData.inquiries.received.toLocaleString(), detail: `${reportData.inquiries.reminders.toLocaleString()} inquiries had a reminder in this period`, color: "#8b5cf6" },
    ] : []),
    ...(reportData?.tasks ? [
      { label: "Follow-ups Created", value: reportData.tasks.created.toLocaleString(), detail: "Tasks recorded in this period", color: "#3b82f6" },
      { label: "Follow-ups Completed", value: reportData.tasks.completed.toLocaleString(), detail: `Completed tasks last updated in this period · ${reportData.tasks.overdue.toLocaleString()} currently overdue`, color: "#10b981" },
    ] : []),
    ...(financeData ? [
      { label: "Income", value: formatAmount(financeData.totals.income), detail: "Receipts and invoice payments", color: "#059669" },
      { label: "Expenses", value: formatAmount(financeData.totals.expenses), detail: "Expenses, payroll and requisitions", color: "#ef4444" },
      { label: "Net", value: formatAmount(financeData.totals.net), detail: "Income minus expenses", color: financeData.totals.net >= 0 ? "#2563eb" : "#dc2626" },
      { label: "Outstanding Invoices", value: formatAmount(financeData.totals.invoiceDue), detail: "Remaining invoice balances", color: "#d97706" },
    ] : []),
  ];
  const growthMetrics: { label: string; comparison: GrowthComparison; format: (value: number) => string }[] = [
    ...(reportData?.growth.candidates ? [{
      label: "Candidate registrations",
      comparison: reportData.growth.candidates,
      format: (value: number) => value.toLocaleString(),
    }] : []),
    ...(reportData?.growth.inquiries ? [{
      label: "Candidate inquiries",
      comparison: reportData.growth.inquiries,
      format: (value: number) => value.toLocaleString(),
    }] : []),
    ...(reportData?.growth.tasks ? [{
      label: "Follow-ups created",
      comparison: reportData.growth.tasks,
      format: (value: number) => value.toLocaleString(),
    }] : []),
    ...(reportData?.growth.suppliers ? [{
      label: "Suppliers registered",
      comparison: reportData.growth.suppliers,
      format: (value: number) => value.toLocaleString(),
    }] : []),
    ...(reportData?.growth.contractors ? [{
      label: "Contractors registered",
      comparison: reportData.growth.contractors,
      format: (value: number) => value.toLocaleString(),
    }] : []),
    ...(reportData?.growth.projects ? [{
      label: "Projects created",
      comparison: reportData.growth.projects,
      format: (value: number) => value.toLocaleString(),
    }] : []),
    ...(financeData && previousFinanceData ? [{
      label: "Business income",
      comparison: { current: financeData.totals.income, previous: previousFinanceData.totals.income },
      format: formatAmount,
    }] : []),
  ];

  useEffect(() => {
    if (!entityFilterOptions.some((option) => option.value === entityFilter)) setEntityFilter("All");
  }, [entityFilter, entityFilterOptions]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <h1 className="text-xl font-700" style={{ color: "var(--foreground)" }}>Reports & Analytics</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Recruitment, staff, supplier, contractor, and finance reports · {period.start} to {period.end}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="reports-date-range">Report date range</label>
          <select id="reports-date-range" value={range} onChange={(event) => setRange(event.target.value as ReportRange)}
            className="rounded border px-3 py-2 text-sm outline-none"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            {rangeOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          {range === "Custom Range" && (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="reports-start-date">Start date</label>
              <input id="reports-start-date" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)}
                className="rounded border px-2 py-2 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              <label className="sr-only" htmlFor="reports-end-date">End date</label>
              <input id="reports-end-date" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)}
                className="rounded border px-2 py-2 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </div>
          )}
          {entityFilterOptions.length > 1 && (
            <>
              <label className="sr-only" htmlFor="reports-entity-filter">Filter report records</label>
              <select id="reports-entity-filter" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}
                className="max-w-52 rounded border px-3 py-2 text-sm outline-none"
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--foreground)" }}>
                {entityFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </>
          )}
          <button onClick={exportReport} disabled={loading || (!reportData && !financeData)}
            className="flex items-center gap-2 rounded border px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--secondary)" }}>
            <Download size={15} aria-hidden="true" /> Export CSV
          </button>
        </div>
      </header>

      <nav className="flex shrink-0 overflow-x-auto border-b" style={{ borderColor: "var(--border)", background: "var(--card)" }} aria-label="Report sections">
        {availableSections.map((section) => (
          <button key={section.id} onClick={() => setActiveSection(section.id)}
            className="shrink-0 border-b-2 px-5 py-3 text-sm font-600"
            style={{
              color: activeSection === section.id ? "var(--primary)" : "var(--muted-foreground)",
              borderBottomColor: activeSection === section.id ? "var(--primary)" : "transparent",
            }}>
            {section.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-auto p-6">
        {(reportError || financeError || financeComparisonError) && (
          <div className="mb-5 space-y-2" role="alert">
            {reportError && <p className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-600">{reportError}</p>}
            {financeError && <p className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">{financeError}</p>}
            {financeComparisonError && <p className="rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">{financeComparisonError}</p>}
          </div>
        )}
        {loading && (
          <div className="mb-5 flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }} aria-live="polite">
            <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> Loading reports…
          </div>
        )}
        {!loading && !reportError && !metricCards.length && !financeError && (
          <div className="rounded border p-6 text-sm" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)", background: "var(--card)" }}>
            No reportable data is available for this period. Check your module permissions and date range.
          </div>
        )}

        {activeSection === "overview" && (
          <div className="space-y-6">
            {financeLoading && (
              <p className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }} aria-live="polite">
                <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> Loading finance summary…
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((metric) => (
                <article key={metric.label} className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <h2 className="mb-2 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{metric.label}</h2>
                  <p className="mono text-xl font-700" style={{ color: metric.color }}>{metric.value}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>{metric.detail}</p>
                </article>
              ))}
            </div>
            {financeData && (
              <div className="grid gap-4 lg:grid-cols-2">
                <BreakdownCard title="Income Breakdown" items={financeData.incomeBreakdown} />
                <BreakdownCard title="Expense Breakdown" items={financeData.expenseBreakdown} />
              </div>
            )}
            {reportData?.candidates && <StageCard stages={reportData.candidates.stages} />}
          </div>
        )}

        {activeSection === "staff" && (
          <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  {[
                    "Staff member",
                    ...(reportData?.permissions.candidates ? ["New candidates"] : []),
                    ...(reportData?.permissions.inquiries ? ["Inquiries", "Inquiries reminded"] : []),
                    ...(reportData?.permissions.tasks ? ["Follow-ups created", "Assigned tasks completed"] : []),
                  ].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-700 uppercase tracking-wide">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {staffActivity.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{item.name}</td>
                    {reportData?.permissions.candidates && <td className="px-4 py-3 mono">{item.candidatesRegistered}</td>}
                    {reportData?.permissions.inquiries && <>
                      <td className="px-4 py-3 mono">{item.inquiriesReceived}</td>
                      <td className="px-4 py-3 mono">{item.inquiryReminders}</td>
                    </>}
                    {reportData?.permissions.tasks && <>
                      <td className="px-4 py-3 mono">{item.tasksCreated}</td>
                      <td className="px-4 py-3 mono">{item.tasksCompleted}</td>
                    </>}
                  </tr>
                ))}
                {!staffActivity.length && <EmptyRow colSpan={6} text="No team activity in this period." />}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === "agents" && reportData?.candidates && (
          <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  {["Agent", "New candidates", "Previous period", "Total candidates", "Travelled candidates"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-700 uppercase tracking-wide">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedAgents.map((agent) => (
                  <tr key={agent.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{agent.name}</td>
                    <td className="px-4 py-3 mono">{agent.newCandidates}</td>
                    <td className="px-4 py-3 mono">{agent.previousCandidates}</td>
                    <td className="px-4 py-3 mono">{agent.totalCandidates}</td>
                    <td className="px-4 py-3 mono">{agent.placements}</td>
                  </tr>
                ))}
                {!selectedAgents.length && <EmptyRow colSpan={5} text="No agent candidate activity is available." />}
              </tbody>
            </table>
          </div>
        )}

        {activeSection === "suppliers" && reportData?.suppliers && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <CountMetric label="Total suppliers" value={reportData.suppliers.total} color="#2563eb" />
              <CountMetric label="Active suppliers" value={reportData.suppliers.active} color="#059669" />
              <CountMetric label="New this period" value={reportData.suppliers.registered} color="#7c3aed" />
            </div>
            <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  {["Supplier", "Status", "Registered"].map((heading) => <th key={heading} className="px-4 py-3 text-xs font-700 uppercase tracking-wide">{heading}</th>)}
                </tr></thead>
                <tbody>
                  {selectedSuppliers.map((supplier) => (
                    <tr key={supplier.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{supplier.name}</td>
                      <td className="px-4 py-3 capitalize">{supplier.status}</td>
                      <td className="px-4 py-3">{new Date(supplier.registeredAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!selectedSuppliers.length && <EmptyRow colSpan={3} text="No suppliers are registered." />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === "contractors" && reportData?.contractors && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CountMetric label="Total contractors" value={reportData.contractors.total} color="#2563eb" />
              <CountMetric label="New this period" value={reportData.contractors.registered} color="#7c3aed" />
            </div>
            <div className="overflow-x-auto rounded border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                  {["Contractor", ...(reportData.permissions.projects ? ["Projects"] : []), "Registered"].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-700 uppercase tracking-wide">{heading}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {selectedContractors.map((contractor) => (
                    <tr key={contractor.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
                      <td className="px-4 py-3 font-600" style={{ color: "var(--foreground)" }}>{contractor.name}</td>
                      {reportData.permissions.projects && <td className="px-4 py-3 mono">{contractor.projects}</td>}
                      <td className="px-4 py-3">{new Date(contractor.registeredAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!selectedContractors.length && <EmptyRow colSpan={reportData.permissions.projects ? 3 : 2} text="No contractors are registered." />}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === "growth" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {reportData?.previousPeriod
                ? `Compared with the previous equal-length period (${reportData.previousPeriod.start} to ${reportData.previousPeriod.end}). Percent change is calculated from recorded activity and income.`
                : "Growth percentages require a previous comparison period. Select a finite date range to compare activity."}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {growthMetrics.map((metric) => (
                <GrowthCard
                  key={metric.label}
                  label={metric.label}
                  current={metric.comparison.current}
                  previous={metric.comparison.previous}
                  format={metric.format}
                />
              ))}
            </div>
            {!growthMetrics.length && (
              <div className="rounded border p-6 text-sm" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)", background: "var(--card)" }}>
                No growth metrics are available for this account or date range.
              </div>
            )}
          </div>
        )}

        {activeSection === "stages" && reportData?.candidates && <StageCard stages={reportData.candidates.stages} />}

        {activeSection === "finance" && canViewFinance && (
          <div className="space-y-6">
            {financeLoading && (
              <p className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }} aria-live="polite">
                <RefreshCw size={15} className="animate-spin" aria-hidden="true" /> Loading finance summary…
              </p>
            )}
            {financeData && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FinanceMetric label="Income" value={financeData.totals.income} color="#059669" />
                  <FinanceMetric label="Expenses" value={financeData.totals.expenses} color="#dc2626" />
                  <FinanceMetric label="Net" value={financeData.totals.net} color={financeData.totals.net >= 0 ? "#2563eb" : "#dc2626"} />
                </div>
                <div className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <h2 className="mb-5 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Recent Monthly Finance Trend</h2>
                  <div className="space-y-4">
                    {financeData.monthlyTrend.map((month) => {
                      const maximum = Math.max(month.income, month.expenses, 1);
                      return (
                        <div key={month.month} className="grid grid-cols-[52px_1fr] items-center gap-3">
                          <span className="text-xs font-600" style={{ color: "var(--muted-foreground)" }}>{month.month}</span>
                          <div className="space-y-1">
                            <TrendBar label="Income" value={month.income} max={maximum} color="#10b981" />
                            <TrendBar label="Expenses" value={month.expenses} max={maximum} color="#ef4444" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function BreakdownCard({ title, items }: { title: string; items: FinanceData["incomeBreakdown"] }) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return (
    <section className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h2 className="mb-4 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{title}</h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span style={{ color: "var(--foreground)" }}>{item.label}</span>
              <span className="mono font-600" style={{ color: item.color }}>{formatAmount(item.amount)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded" style={{ background: "var(--secondary)" }}>
              <div className="h-full rounded" style={{ width: `${total ? Math.min(100, item.amount / total * 100) : 0}%`, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StageCard({ stages }: { stages: CandidateStage[] }) {
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  return (
    <section className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h2 className="mb-5 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>Candidates by Current Stage</h2>
      <div className="space-y-4">
        {stages.map((stage, index) => {
          const color = stageColors[index % stageColors.length];
          const percentage = total ? stage.count / total * 100 : 0;
          return (
            <div key={stage.stage}>
              <div className="mb-1.5 flex justify-between gap-3 text-sm">
                <span className="font-600" style={{ color: "var(--foreground)" }}>{stage.stage}</span>
                <span className="mono" style={{ color: "var(--muted-foreground)" }}>{stage.count.toLocaleString()} · {percentage.toFixed(1)}%</span>
              </div>
              <div className="h-2.5 rounded" style={{ background: "var(--secondary)" }}>
                <div className="h-2.5 rounded" style={{ width: `${percentage}%`, background: color }} />
              </div>
            </div>
          );
        })}
        {!stages.length && <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>No candidate stage data is available.</p>}
      </div>
    </section>
  );
}

function FinanceMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <article className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h2 className="mb-2 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{label}</h2>
      <p className="mono text-xl font-700" style={{ color }}>{formatAmount(value)}</p>
    </article>
  );
}

function CountMetric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <article className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h2 className="mb-2 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{label}</h2>
      <p className="mono text-xl font-700" style={{ color }}>{value.toLocaleString()}</p>
    </article>
  );
}

function GrowthCard({
  label,
  current,
  previous,
  format,
}: {
  label: string;
  current: number;
  previous: number | null;
  format: (value: number) => string;
}) {
  const growth = growthFor(current, previous);
  const percentageLabel = growth.percentage === null
    ? growth.label
    : `${growth.percentage > 0 ? "+" : ""}${growth.percentage.toFixed(1)}%`;
  return (
    <article className="rounded border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <h2 className="mb-3 text-xs font-700 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>{label}</h2>
      <p className="mono text-2xl font-700" style={{ color: "var(--foreground)" }}>{format(current)}</p>
      <p className="mt-2 text-sm font-700" style={{ color: growth.color }}>
        {growth.label}{growth.percentage !== null ? ` · ${percentageLabel}` : ""}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        Previous period: {previous === null ? "Not available" : format(previous)}
      </p>
    </article>
  );
}

function TrendBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded" style={{ background: "var(--secondary)" }}>
        <div className="h-full rounded" style={{ width: `${Math.min(100, value / max * 100)}%`, background: color }} />
      </div>
      <span className="w-28 shrink-0 text-right text-xs mono" style={{ color: "var(--foreground)" }}>{formatAmount(value)}</span>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>{text}</td>
    </tr>
  );
}
