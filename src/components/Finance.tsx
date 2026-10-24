import { useEffect, useState } from "react"

type FinanceTab = "overview" | "paycheck"

const UGX = (n: number) => `UGX ${n.toLocaleString()}`

type FinancePeriod = {
  start: string | null
  end: string
}

type FinanceBreakdown = {
  label: string
  amount: number
  color: string
}

type FinanceCurrencyAmount = {
  currency: string
  amount: number
}

type FinanceAccount = {
  id: string
  name: string
  type: string
  status: string
  balance: number
}

type FinanceActivity = {
  id: string
  date: string
  description: string
  type: string
  amount: number
  direction: "in" | "out"
  reference: string
}

type PaycheckEmployee = {
  name: string
  staff_id: string
  position: string
}

type FinanceTabOption = {
  id: FinanceTab
  label: string
}

type FinanceOverview = {
  range: string
  period: FinancePeriod
  totals: {
    income: number
    expenses: number
    net: number
    accountBalance: number
    invoiceDue: number
    candidateDeposits: number
    invoicePayments: number
    otherIncome: number
    paychecks: number
    contractorDue: number
  }
  accounts: {
    id: string
    name: string
    type: string
    status: string
    balance: number
  }[]
  requisitionDueByCurrency: FinanceCurrencyAmount[]
  incomeBreakdown: FinanceBreakdown[]
  expenseBreakdown: FinanceBreakdown[]
  monthlyTrend: {
    month: string
    income: number
    expenses: number
  }[]
  recentActivity: FinanceActivity[]
}

type PaycheckRecord = {
  id: string
  pay_period: string
  gross_amount: number
  benefits_total: number
  deductions_total: number
  net_amount: number
  payment_date: string
  payment_method: string
  payment_reference: string
  employee: PaycheckEmployee
  payslipUrl: string
}

type PaycheckPayload = {
  paychecks?: PaycheckRecord[]
  error?: string
}

function donutGradient(items: FinanceBreakdown[]) {
  const total = items.reduce((sum, item) => sum + item.amount, 0)
  if (!total) return "conic-gradient(var(--border) 0deg 360deg)"
  let offset = 0
  const stops = items
    .filter((item) => item.amount > 0)
    .map((item) => {
      const start = offset
      offset += (item.amount / total) * 360
      return `${item.color} ${start}deg ${offset}deg`
    })
  return `conic-gradient(${stops.join(", ")})`
}

export default function Finance() {
  const [tab, setTab] = useState<FinanceTab>("overview")
  const [dateRange, setDateRange] = useState("This Month")
  const [overview, setOverview] = useState<FinanceOverview | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState("")
  const [paychecks, setPaychecks] = useState<PaycheckRecord[]>([])
  const [paychecksLoading, setPaychecksLoading] = useState(false)
  const [paychecksError, setPaychecksError] = useState("")

  useEffect(() => {
    let cancelled = false
    const loadOverview = async () => {
      setOverviewLoading(true)
      setOverviewError("")
      try {
        const response = await fetch(
          `/api/finance/overview?range=${encodeURIComponent(dateRange)}`,
          { cache: "no-store" },
        )
        const result = (await response.json()) as FinanceOverview & {
          error?: string
        }
        if (!response.ok)
          throw new Error(
            result.error ?? "Unable to load the company finance summary.",
          )
        if (!cancelled) setOverview(result)
      } catch (error) {
        if (!cancelled)
          setOverviewError(
            error instanceof Error
              ? error.message
              : "Unable to load the company finance summary.",
          )
      } finally {
        if (!cancelled) setOverviewLoading(false)
      }
    }
    void loadOverview()
    return () => {
      cancelled = true
    }
  }, [dateRange])

  useEffect(() => {
    if (tab !== "paycheck") return
    let cancelled = false
    const loadPaychecks = async () => {
      setPaychecksLoading(true)
      setPaychecksError("")
      try {
        const response = await fetch("/api/paychecks", { cache: "no-store" })
        const result = (await response.json()) as PaycheckPayload
        if (!response.ok)
          throw new Error(result.error ?? "Unable to load company paychecks.")
        if (!cancelled) setPaychecks(result.paychecks ?? [])
      } catch (error) {
        if (!cancelled)
          setPaychecksError(
            error instanceof Error
              ? error.message
              : "Unable to load company paychecks.",
          )
      } finally {
        if (!cancelled) setPaychecksLoading(false)
      }
    }
    void loadPaychecks()
    return () => {
      cancelled = true
    }
  }, [tab])

  const tabs: FinanceTabOption[] = [
    { id: "overview", label: "Overview" },
    { id: "paycheck", label: "Paycheck" },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="px-6 py-4 border-b flex items-center justify-between shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <h1
            className="text-xl font-700"
            style={{ color: "var(--foreground)" }}
          >
            Finance
          </h1>
          <p
            className="text-sm mono mt-0.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            Recruitment company financial management
          </p>
        </div>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-1.5 text-sm rounded border outline-none"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          >
            {["Today", "This Week", "This Month", "This Year", "All Time"].map(
              (r) => (
                <option key={r}>{r}</option>
              ),
            )}
          </select>
        </div>
      </div>

      <div
        className="flex border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-5 py-3 text-sm font-600 transition-colors"
            style={{
              color:
                tab === t.id ? "var(--primary)" : "var(--muted-foreground)",
              borderBottom:
                tab === t.id
                  ? "2px solid var(--primary)"
                  : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === "overview" &&
          (overviewLoading ? (
            <p
              className="py-12 text-center text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Loading company finance summary…
            </p>
          ) : overviewError ? (
            <div
              className="rounded border p-5 text-sm"
              role="alert"
              style={{ borderColor: "#ef4444", color: "#ef4444" }}
            >
              {overviewError}
            </div>
          ) : overview ? (
            <>
              <div
                className="mb-4 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Company financial activity ·{" "}
                {overview.period.start ? `${overview.period.start} – ` : ""}
                {overview.period.end}
              </div>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {[
                  {
                    label: "Money received",
                    value: overview.totals.income,
                    color: "#10b981",
                  },
                  {
                    label: "Money spent",
                    value: overview.totals.expenses,
                    color: "#ef4444",
                  },
                  {
                    label: "Net cash flow",
                    value: overview.totals.net,
                    color: overview.totals.net >= 0 ? "#10b981" : "#ef4444",
                  },
                  {
                    label: "Current account balance",
                    value: overview.totals.accountBalance,
                    color: "#6366f1",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded border p-5"
                    style={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div
                      className="text-xs font-700 uppercase tracking-widest mb-2"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {card.label}
                    </div>
                    <div
                      className="mono text-lg font-700"
                      style={{ color: card.color }}
                    >
                      {UGX(card.value)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                {[
                  {
                    label: "Unpaid invoices receivable",
                    value: UGX(overview.totals.invoiceDue),
                    detail:
                      "Outstanding candidate, contractor, and supplier invoices",
                    color: "#f59e0b",
                  },
                  {
                    label: "Candidate deposits",
                    value: UGX(overview.totals.candidateDeposits),
                    detail: "Received in selected period",
                    color: "#6366f1",
                  },
                  {
                    label: "Contractor charges due",
                    value: UGX(overview.totals.contractorDue),
                    detail: "Accrued project contractor charges",
                    color: "#ec4899",
                  },
                  {
                    label: "Approved requisitions due",
                    value: overview.requisitionDueByCurrency.length
                      ? overview.requisitionDueByCurrency
                          .map(
                            (item) =>
                              `${item.currency} ${item.amount.toLocaleString()}`,
                          )
                          .join(" · ")
                      : UGX(0),
                    detail: "Outstanding approved amounts",
                    color: "#f97316",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded border p-4"
                    style={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div
                      className="text-xs font-700 uppercase tracking-widest mb-2"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {card.label}
                    </div>
                    <div
                      className="mono text-base font-700"
                      style={{ color: card.color }}
                    >
                      {card.value}
                    </div>
                    <div
                      className="text-xs mt-1"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {card.detail}
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="rounded border p-5 mb-6"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h3
                  className="text-xs font-700 uppercase tracking-widest mb-5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Income vs expenses · Last 6 months
                </h3>
                <div className="flex items-end gap-3 h-48">
                  {overview.monthlyTrend.map((month) => {
                    const maximum = Math.max(
                      1,
                      ...overview.monthlyTrend.flatMap((item) => [
                        item.income,
                        item.expenses,
                      ]),
                    )
                    return (
                      <div
                        key={month.month}
                        className="flex-1 flex flex-col items-center gap-2 min-w-0"
                      >
                        <div className="w-full max-w-16 flex gap-1 items-end justify-center h-36">
                          <div
                            title={`Income ${UGX(month.income)}`}
                            className="w-1/2 rounded-t"
                            style={{
                              height: `${Math.max(month.income > 0 ? 3 : 0, (month.income / maximum) * 132)}px`,
                              background: "#10b981",
                            }}
                          />
                          <div
                            title={`Expenses ${UGX(month.expenses)}`}
                            className="w-1/2 rounded-t"
                            style={{
                              height: `${Math.max(month.expenses > 0 ? 3 : 0, (month.expenses / maximum) * 132)}px`,
                              background: "#ef4444",
                            }}
                          />
                        </div>
                        <span
                          className="mono text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {month.month}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-4 mt-3">
                  {[
                    ["#10b981", "Income"],
                    ["#ef4444", "Expenses"],
                  ].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ background: color }}
                      />
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
                {[
                  {
                    title: "Income sources",
                    entries: overview.incomeBreakdown,
                  },
                  {
                    title: "Spending breakdown",
                    entries: overview.expenseBreakdown,
                  },
                ].map((chart) => (
                  <div
                    key={chart.title}
                    className="rounded border p-5"
                    style={{
                      background: "var(--card)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <h3
                      className="text-xs font-700 uppercase tracking-widest mb-4"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {chart.title}
                    </h3>
                    <div className="flex items-center gap-5">
                      <div
                        className="w-28 h-28 rounded-full shrink-0 grid place-items-center"
                        style={{ background: donutGradient(chart.entries) }}
                      >
                        <div
                          className="w-16 h-16 rounded-full grid place-items-center text-[10px] font-700"
                          style={{
                            background: "var(--card)",
                            color: "var(--muted-foreground)",
                          }}
                        >
                          UGX
                        </div>
                      </div>
                      <div className="space-y-2 min-w-0">
                        {chart.entries.map((entry) => (
                          <div
                            key={entry.label}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ background: entry.color }}
                            />
                            <span
                              className="truncate"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {entry.label}
                            </span>
                            <span
                              className="mono ml-auto font-600"
                              style={{ color: "var(--foreground)" }}
                            >
                              {UGX(entry.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <div
                  className="rounded border p-5"
                  style={{
                    background: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                >
                  <h3
                    className="text-xs font-700 uppercase tracking-widest mb-4"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Account balances
                  </h3>
                  {overview.accounts.filter(
                    (account) => account.status === "active",
                  ).length ? (
                    <div className="space-y-3">
                      {overview.accounts
                        .filter((account) => account.status === "active")
                        .slice(0, 5)
                        .map((account) => {
                          const maxBalance = Math.max(
                            1,
                            ...overview.accounts
                              .filter((item) => item.status === "active")
                              .map((item) => Math.abs(item.balance)),
                          )
                          return (
                            <div key={account.id}>
                              <div className="flex justify-between gap-2 text-xs mb-1">
                                <span
                                  className="truncate"
                                  style={{ color: "var(--muted-foreground)" }}
                                >
                                  {account.name}
                                </span>
                                <span
                                  className="mono font-600 shrink-0"
                                  style={{ color: "var(--foreground)" }}
                                >
                                  {UGX(account.balance)}
                                </span>
                              </div>
                              <div
                                className="h-1.5 rounded-full overflow-hidden"
                                style={{ background: "var(--secondary)" }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${(Math.abs(account.balance) / maxBalance) * 100}%`,
                                    background: "#6366f1",
                                  }}
                                />
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      No company accounts yet.
                    </p>
                  )}
                  <p
                    className="text-[11px] mt-3"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {
                      overview.accounts.filter(
                        (account) => account.status === "active",
                      ).length
                    }{" "}
                    active accounts
                  </p>
                </div>
              </div>

              <div
                className="rounded border p-5"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                }}
              >
                <h3
                  className="text-xs font-700 uppercase tracking-widest mb-4"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Recent company transactions
                </h3>
                {overview.recentActivity.length ? (
                  overview.recentActivity.map((item) => (
                    <div
                      key={`${item.type}-${item.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 border-b last:border-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="min-w-0">
                        <div
                          className="text-sm font-600 truncate"
                          style={{ color: "var(--foreground)" }}
                        >
                          {item.description || item.type}
                        </div>
                        <div
                          className="text-xs mt-0.5"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {item.type} ·{" "}
                          {new Date(item.date).toLocaleDateString()}{" "}
                          {item.reference ? `· ${item.reference}` : ""}
                        </div>
                      </div>
                      <span
                        className="mono text-sm font-700 shrink-0"
                        style={{
                          color:
                            item.direction === "in" ? "#10b981" : "#ef4444",
                        }}
                      >
                        {item.direction === "in" ? "+" : "−"}
                        {UGX(item.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p
                    className="text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    No transactions in this period.
                  </p>
                )}
              </div>
            </>
          ) : null)}

        {tab === "paycheck" && (
          <section aria-label="Company paychecks">
            <h2
              className="mb-4 text-lg font-700"
              style={{ color: "var(--foreground)" }}
            >
              Company paychecks
            </h2>
            {paychecksLoading ? (
              <p
                className="py-10 text-center text-sm"
                style={{ color: "var(--muted-foreground)" }}
              >
                Loading paychecks…
              </p>
            ) : paychecksError ? (
              <div
                role="alert"
                className="rounded border p-4 text-sm"
                style={{ borderColor: "#ef4444", color: "#ef4444" }}
              >
                {paychecksError}
              </div>
            ) : (
              <div
                className="overflow-x-auto rounded border"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--card)",
                }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="border-b text-left"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {[
                        "Pay period",
                        "Employee",
                        "Gross pay",
                        "Benefits",
                        "Deductions",
                        "Net paid",
                        "Payment date",
                        "Payslip",
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="whitespace-nowrap px-4 py-3 text-xs font-700 uppercase tracking-wide"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!paychecks.length && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-10 text-center text-sm"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          No paychecks have been recorded.
                        </td>
                      </tr>
                    )}
                    {paychecks.map((paycheck) => (
                      <tr
                        key={paycheck.id}
                        className="border-b last:border-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <td
                          className="whitespace-nowrap px-4 py-3"
                          style={{ color: "var(--foreground)" }}
                        >
                          {new Date(
                            `${paycheck.pay_period}T00:00:00`,
                          ).toLocaleDateString("en-GB", {
                            month: "long",
                            year: "numeric",
                          })}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className="block font-600"
                            style={{ color: "var(--foreground)" }}
                          >
                            {paycheck.employee.name}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {paycheck.employee.staff_id} ·{" "}
                            {paycheck.employee.position}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 mono">
                          {UGX(Number(paycheck.gross_amount))}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 mono"
                          style={{ color: "#10b981" }}
                        >
                          {UGX(Number(paycheck.benefits_total))}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 mono"
                          style={{ color: "#ef4444" }}
                        >
                          {UGX(Number(paycheck.deductions_total))}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 mono font-700"
                          style={{ color: "var(--primary)" }}
                        >
                          {UGX(Number(paycheck.net_amount))}
                        </td>
                        <td
                          className="whitespace-nowrap px-4 py-3 text-xs"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {new Date(
                            `${paycheck.payment_date}T00:00:00`,
                          ).toLocaleDateString("en-GB")}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <a
                            href={paycheck.payslipUrl}
                            className="text-xs font-600 underline"
                            style={{ color: "var(--primary)" }}
                          >
                            View payslip
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
