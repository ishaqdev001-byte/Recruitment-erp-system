import { useEffect, useState, type FormEvent } from "react"

import { Eye, FilePlus2, Search, X } from "lucide-react"

import { SearchableSelect } from "./SearchableSelect"

import { matchesSearch } from "@/lib/search"

type PayableInvoiceStatus = "open" | "partially_paid" | "paid" | "overdue"

type PayableInvoiceFilter = "all" | PayableInvoiceStatus

type PayableInvoice = {
  id: string

  invoiceNumber: string

  vendorType: "contractor" | "partner"

  vendorId: string | null

  vendorName: string

  vendorInvoiceNumber: string | null

  description: string

  amount: number

  paidAmount: number

  balanceDue: number

  invoiceDate: string

  dueDate: string | null

  sourceType: "manual" | "visa"

  projectName: string | null

  candidateName: string | null
}

type PayableVendor = {
  id: string

  name: string

  vendorType: "contractor" | "partner"
}

type AccountOption = {
  id: string

  name: string

  account_type: string

  account_number: string
}

type ExpenseCategory = {
  id: string
  name: string
}

type PayableInvoiceForm = {
  vendorType: "contractor" | "partner"

  vendorId: string

  vendorInvoiceNumber: string

  description: string

  amount: string

  invoiceDate: string

  dueDate: string
}

type PayablePaymentForm = {
  accountId: string

  expenseCategoryId: string

  itemName: string

  description: string

  amount: string

  paymentMethod: string

  reference: string

  paidAt: string
}

const statusTabs: {
  value: PayableInvoiceFilter
  label: string
}[] = [
  { value: "all", label: "All" },

  { value: "open", label: "Open" },

  { value: "partially_paid", label: "Partially paid" },

  { value: "paid", label: "Paid" },

  { value: "overdue", label: "Overdue" },
]

const methods = ["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"]

const fieldStyle = {
  background: "var(--secondary)",

  borderColor: "var(--border)",

  color: "var(--foreground)",
}

const money = (amount: number) =>
  `UGX ${amount.toLocaleString("en-UG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const dateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",

    month: "short",

    year: "numeric",
  })

const localDate = () => {
  const now = new Date()

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

const newExpenseReference = () => `EXP-${Date.now().toString(36).toUpperCase()}`

const emptyPayableForm = (): PayableInvoiceForm => ({
  vendorType: "contractor",

  vendorId: "",

  vendorInvoiceNumber: "",

  description: "",

  amount: "",

  invoiceDate: localDate(),

  dueDate: "",
})

function getStatus(invoice: PayableInvoice): PayableInvoiceStatus {
  if (invoice.balanceDue <= 0) return "paid"

  if (invoice.dueDate && invoice.dueDate < localDate()) return "overdue"

  if (invoice.paidAmount > 0) return "partially_paid"

  return "open"
}

const statusLabel: Record<PayableInvoiceStatus, string> = {
  open: "Open",

  partially_paid: "Partially paid",

  paid: "Paid",

  overdue: "Overdue",
}

const statusColor: Record<PayableInvoiceStatus, string> = {
  open: "#2878a8",

  partially_paid: "#b7791f",

  paid: "#17845b",

  overdue: "#bd3d3d",
}

export default function PayableInvoicesWorkspace() {
  const [invoices, setInvoices] = useState<PayableInvoice[]>([])

  const [vendors, setVendors] = useState<PayableVendor[]>([])

  const [accounts, setAccounts] = useState<AccountOption[]>([])

  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(
    [],
  )

  const [expenseCategoriesEnabled, setExpenseCategoriesEnabled] =
    useState(false)

  const [canCreate, setCanCreate] = useState(false)

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [search, setSearch] = useState("")

  const [filter, setFilter] = useState<PayableInvoiceFilter>("all")

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  )

  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)

  const [invoiceForm, setInvoiceForm] =
    useState<PayableInvoiceForm>(emptyPayableForm)

  const [paymentForm, setPaymentForm] = useState<PayablePaymentForm>({
    accountId: "",

    expenseCategoryId: "",

    itemName: "",

    description: "",

    amount: "",

    paymentMethod: "Cash",

    reference: newExpenseReference(),

    paidAt: localDate(),
  })

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)

      setError("")

      try {
        const [invoiceResponse, accountResponse, categoryResponse] =
          await Promise.all([
            fetch("/api/payable-invoices", { cache: "no-store" }),

            fetch("/api/finance/accounts?options=1", { cache: "no-store" }),

            fetch("/api/settings/expense-categories", { cache: "no-store" }),
          ])

        const [invoicePayload, accountPayload, categoryPayload] =
          await Promise.all([
            invoiceResponse.json() as Promise<{
              payableInvoices?: PayableInvoice[]

              payableVendors?: PayableVendor[]

              permissions?: { canCreate?: boolean }

              error?: string
            }>,

            accountResponse.json() as Promise<{
              accounts?: AccountOption[]

              error?: string
            }>,

            categoryResponse.json() as Promise<{
              categories?: ExpenseCategory[]

              enabled?: boolean

              error?: string
            }>,
          ])

        if (!invoiceResponse.ok)
          throw new Error(
            invoicePayload.error ?? "Unable to load payable invoices.",
          )

        if (!accountResponse.ok)
          throw new Error(
            accountPayload.error ?? "Unable to load company accounts.",
          )

        if (!categoryResponse.ok)
          throw new Error(
            categoryPayload.error ?? "Unable to load expense categories.",
          )

        if (cancelled) return

        setInvoices(invoicePayload.payableInvoices ?? [])

        setVendors(invoicePayload.payableVendors ?? [])

        setCanCreate(Boolean(invoicePayload.permissions?.canCreate))

        setAccounts(accountPayload.accounts ?? [])

        setExpenseCategories(categoryPayload.categories ?? [])

        setExpenseCategoriesEnabled(Boolean(categoryPayload.enabled))
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load payable invoices.",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const selectedInvoice =
    invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null

  const paymentInvoice =
    invoices.find((invoice) => invoice.id === paymentInvoiceId) ?? null

  const filteredInvoices = invoices.filter((invoice) => {
    const status = getStatus(invoice)

    return (
      (filter === "all" || status === filter) &&
      matchesSearch(
        search,

        invoice.invoiceNumber,

        invoice.vendorName,

        invoice.vendorInvoiceNumber,

        invoice.candidateName,

        invoice.projectName,

        invoice.description,
      )
    )
  })

  const totalInvoiced = invoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0,
  )

  const totalPaid = invoices.reduce(
    (sum, invoice) => sum + invoice.paidAmount,
    0,
  )

  const totalOutstanding = invoices.reduce(
    (sum, invoice) => sum + invoice.balanceDue,

    0,
  )

  const overdueCount = invoices.filter(
    (invoice) => getStatus(invoice) === "overdue",
  ).length

  const openPayment = (invoice: PayableInvoice) => {
    setPaymentInvoiceId(invoice.id)

    setPaymentForm({
      accountId: "",

      expenseCategoryId: "",

      itemName: invoice.description,

      description: invoice.description,

      amount: invoice.balanceDue.toFixed(2),

      paymentMethod: "Cash",

      reference: newExpenseReference(),

      paidAt: localDate(),
    })

    setError("")
  }

  const createInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSaving(true)

    setError("")

    try {
      const response = await fetch("/api/payments", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "record-payable-invoice",

          ...invoiceForm,
        }),
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok)
        throw new Error(
          payload.error ?? "Unable to record this payable invoice.",
        )

      setShowCreate(false)

      setInvoiceForm(emptyPayableForm())

      setReloadKey((key) => key + 1)
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Unable to record this payable invoice.",
      )
    } finally {
      setSaving(false)
    }
  }

  const recordPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!paymentInvoice) return

    setSaving(true)

    setError("")

    try {
      const response = await fetch("/api/payments", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          action: "record-expense",

          ...paymentForm,

          paidTo: paymentInvoice.vendorName,

          payableInvoiceId: paymentInvoice.id,
        }),
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok)
        throw new Error(
          payload.error ?? "Unable to record this payable payment.",
        )

      setPaymentInvoiceId(null)

      setReloadKey((key) => key + 1)
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to record this payable payment.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          Visa service charges create contractor or partner payables
          automatically.
        </p>
        <button
          type="button"
          onClick={() => {
            setInvoiceForm(emptyPayableForm())

            setError("")

            setShowCreate(true)
          }}
          disabled={!canCreate || loading}
          className="inline-flex items-center gap-2 border px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          <FilePlus2 size={16} aria-hidden="true" />
          Record payable invoice
        </button>
      </header>

      <div
        className="grid grid-cols-2 border-b sm:grid-cols-4"
        style={{ borderColor: "var(--border)" }}
      >
        {[
          {
            label: "Total payable",
            value: money(totalInvoiced),
            color: "var(--foreground)",
          },

          {
            label: "Paid to providers",
            value: money(totalPaid),
            color: "#17845b",
          },

          {
            label: "Balance due",
            value: money(totalOutstanding),
            color: "#b7791f",
          },

          { label: "Overdue invoices", value: overdueCount, color: "#bd3d3d" },
        ].map((metric) => (
          <div
            key={metric.label}
            className="border-b px-5 py-4 last:border-0 sm:border-b-0 sm:border-r"
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="mono text-lg font-700"
              style={{ color: metric.color }}
            >
              {loading ? "—" : metric.value}
            </div>
            <div
              className="mt-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        <label
          className="flex w-full max-w-md items-center gap-2 border px-3"
          style={{
            background: "var(--secondary)",
            borderColor: "var(--border)",
          }}
        >
          <Search
            size={15}
            aria-hidden="true"
            style={{ color: "var(--muted-foreground)" }}
          />
          <input
            aria-label="Search payable invoices"
            placeholder="Search invoice, provider, candidate, or project"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            style={{ color: "var(--foreground)" }}
          />
        </label>
        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {filteredInvoices.length} shown
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Filter payable invoices by status"
        className="flex gap-1 overflow-x-auto border-b px-6"
        style={{ borderColor: "var(--border)", background: "var(--card)" }}
      >
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={filter === tab.value}
            onClick={() => setFilter(tab.value)}
            className="shrink-0 border-b-2 px-3 py-3 text-xs font-600"
            style={{
              borderColor:
                filter === tab.value ? "var(--primary)" : "transparent",

              color:
                filter === tab.value
                  ? "var(--primary)"
                  : "var(--muted-foreground)",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="mx-6 mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div
          className="finance-table-scroll border"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <table className="w-full min-w-275 text-sm">
            <thead>
              <tr
                className="border-b text-left"
                style={{ borderColor: "var(--border)" }}
              >
                {[
                  "Invoice number",
                  "Provider",
                  "Candidate",
                  "Project",
                  "Description",
                  "Amount",
                  "Paid",
                  "Balance",
                  "Invoice date",
                  "Due date",
                  "Status",
                  "Actions",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-3 py-3 text-xs font-700 uppercase tracking-wide"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-10 text-center text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Loading payable invoices…
                  </td>
                </tr>
              )}
              {!loading && !error && filteredInvoices.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-10 text-center text-sm"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {invoices.length
                      ? "No payable invoices match this search or status."
                      : "No payable invoices recorded yet."}
                  </td>
                </tr>
              )}
              {!loading &&
                filteredInvoices.map((invoice) => {
                  const status = getStatus(invoice)

                  return (
                    <tr
                      key={invoice.id}
                      className="border-b last:border-0"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="whitespace-nowrap px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                          className="mono text-xs font-700 underline decoration-transparent underline-offset-2 hover:decoration-current"
                          style={{ color: "var(--primary)" }}
                        >
                          {invoice.invoiceNumber}
                        </button>
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs font-600"
                        style={{ color: "var(--foreground)" }}
                      >
                        {invoice.vendorName}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {invoice.candidateName || "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {invoice.projectName || "—"}
                      </td>
                      <td
                        className="max-w-56 truncate px-3 py-3 text-xs"
                        title={invoice.description}
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {invoice.description}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 mono text-xs font-700"
                        style={{ color: "var(--foreground)" }}
                      >
                        {money(invoice.amount)}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 mono text-xs"
                        style={{ color: "#17845b" }}
                      >
                        {money(invoice.paidAmount)}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 mono text-xs font-700"
                        style={{
                          color: invoice.balanceDue > 0 ? "#bd3d3d" : "#17845b",
                        }}
                      >
                        {money(invoice.balanceDue)}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {dateLabel(invoice.invoiceDate)}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs"
                        style={{
                          color:
                            status === "overdue"
                              ? "#bd3d3d"
                              : "var(--muted-foreground)",
                        }}
                      >
                        {invoice.dueDate ? dateLabel(invoice.dueDate) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className="px-2 py-1 text-xs font-600"
                          style={{
                            color: statusColor[status],
                            background: `${statusColor[status]}1a`,
                          }}
                        >
                          {statusLabel[status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label={`View ${invoice.invoiceNumber}`}
                            title="View payable invoice"
                            onClick={() => setSelectedInvoiceId(invoice.id)}
                            className="p-2"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            <Eye size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Pay ${invoice.invoiceNumber}`}
                            title="Record payment"
                            disabled={
                              !canCreate ||
                              invoice.balanceDue <= 0 ||
                              accounts.length === 0
                            }
                            onClick={() => openPayment(invoice)}
                            className="p-2 text-xs font-700 disabled:cursor-not-allowed disabled:opacity-40"
                            style={{ color: "#17845b" }}
                          >
                            Pay
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedInvoice && (
        <aside
          className="detail-panel fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l shadow-xl"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
          aria-labelledby="payable-invoice-detail-title"
        >
          <header
            className="sticky top-0 z-10 flex items-start justify-between border-b p-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div>
              <p
                className="text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Payable invoice
              </p>
              <h2
                id="payable-invoice-detail-title"
                className="mono mt-1 text-lg font-700"
                style={{ color: "var(--primary)" }}
              >
                {selectedInvoice.invoiceNumber}
              </h2>
              <span
                className="mt-2 inline-block px-2 py-1 text-xs font-600"
                style={{
                  color: statusColor[getStatus(selectedInvoice)],
                  background: `${statusColor[getStatus(selectedInvoice)]}1a`,
                }}
              >
                {statusLabel[getStatus(selectedInvoice)]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedInvoiceId(null)}
              aria-label="Close payable invoice details"
              className="p-2"
              style={{ color: "var(--muted-foreground)" }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="space-y-5 p-5">
            <dl className="space-y-4">
              {[
                ["Provider", selectedInvoice.vendorName],

                [
                  "Provider invoice number",
                  selectedInvoice.vendorInvoiceNumber || "—",
                ],

                ["Candidate", selectedInvoice.candidateName || "—"],

                ["Project", selectedInvoice.projectName || "—"],

                ["Description", selectedInvoice.description],

                [
                  "Invoice source",
                  selectedInvoice.sourceType === "visa"
                    ? "Automatically generated from visa service charge"
                    : "Manually recorded",
                ],

                ["Invoice amount", money(selectedInvoice.amount)],

                ["Amount paid", money(selectedInvoice.paidAmount)],

                ["Balance due", money(selectedInvoice.balanceDue)],

                ["Invoice date", dateLabel(selectedInvoice.invoiceDate)],

                [
                  "Due date",
                  selectedInvoice.dueDate
                    ? dateLabel(selectedInvoice.dueDate)
                    : "—",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt
                    className="text-xs font-700 uppercase tracking-wider"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {label}
                  </dt>
                  <dd
                    className="mt-1 whitespace-pre-wrap wrap-break-word text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {canCreate && selectedInvoice.balanceDue > 0 && (
              <button
                type="button"
                disabled={accounts.length === 0}
                onClick={() => openPayment(selectedInvoice)}
                className="w-full px-3 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                Record payment
              </button>
            )}
          </div>
        </aside>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowCreate(false)
          }}
        >
          <form
            onSubmit={createInvoice}
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2
                  className="text-lg font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  Record payable invoice
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Add a contractor or partner invoice to the payables list.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Close payable invoice form"
                className="p-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Provider type
                <select
                  value={invoiceForm.vendorType}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({
                      ...current,
                      vendorType: event.target
                        .value as "contractor" | "partner",
                      vendorId: "",
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                >
                  <option value="contractor">Contractor</option>
                  <option value="partner">Partner</option>
                </select>
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Service provider
                <SearchableSelect
                  required
                  ariaLabel="Choose contractor or partner"
                  value={invoiceForm.vendorId}
                  onChange={(vendorId) =>
                    setInvoiceForm((current) => ({ ...current, vendorId }))
                  }
                  options={vendors
                    .filter(
                      (vendor) => vendor.vendorType === invoiceForm.vendorType,
                    )
                    .map((vendor) => ({
                      value: vendor.id,
                      label: vendor.name,
                    }))}
                  placeholder={`Select a ${invoiceForm.vendorType}`}
                  className="mt-1 normal-case tracking-normal"
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Provider invoice number (optional)
                <input
                  maxLength={100}
                  value={invoiceForm.vendorInvoiceNumber}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({
                      ...current,
                      vendorInvoiceNumber: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                What is the invoice for?
                <textarea
                  required
                  rows={2}
                  maxLength={500}
                  value={invoiceForm.description}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Invoice amount (UGX)
                  <input
                    required
                    min="0.01"
                    step="0.01"
                    type="number"
                    value={invoiceForm.amount}
                    onChange={(event) =>
                      setInvoiceForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  />
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Invoice date
                  <input
                    required
                    type="date"
                    value={invoiceForm.invoiceDate}
                    onChange={(event) =>
                      setInvoiceForm((current) => ({
                        ...current,
                        invoiceDate: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  />
                </label>
              </div>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Due date (optional)
                <input
                  type="date"
                  value={invoiceForm.dueDate}
                  onChange={(event) =>
                    setInvoiceForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving || !invoiceForm.vendorId}
                className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Saving…" : "Save payable invoice"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="flex-1 border py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {paymentInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaymentInvoiceId(null)
          }}
        >
          <form
            onSubmit={recordPayment}
            className="max-h-[90dvh] w-full max-w-xl overflow-y-auto border p-6"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2
                  className="text-lg font-700"
                  style={{ color: "var(--foreground)" }}
                >
                  Record payable invoice payment
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {paymentInvoice.invoiceNumber} · {paymentInvoice.vendorName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentInvoiceId(null)}
                aria-label="Close payment form"
                className="p-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4">
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                What are you paying for?
                <input
                  required
                  maxLength={500}
                  value={paymentForm.itemName}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      itemName: event.target.value,
                    }))
                  }
                  className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Description
                <textarea
                  required
                  rows={2}
                  maxLength={500}
                  value={paymentForm.description}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-1 w-full resize-y border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                  style={fieldStyle}
                />
              </label>
              {expenseCategoriesEnabled && (
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Expense category
                  <select
                    required
                    value={paymentForm.expenseCategoryId}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        expenseCategoryId: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  >
                    <option value="">Select a category</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label
                className="block text-xs font-700 uppercase tracking-wider"
                style={{ color: "var(--muted-foreground)" }}
              >
                Account to deduct from
                <SearchableSelect
                  required
                  ariaLabel="Choose account to deduct the payment from"
                  value={paymentForm.accountId}
                  onChange={(accountId) =>
                    setPaymentForm((current) => ({ ...current, accountId }))
                  }
                  options={accounts.map((account) => ({
                    value: account.id,
                    label: account.name,
                    description: account.account_type.replace(/_/g, " "),
                    searchText: account.account_number,
                  }))}
                  placeholder="Select the company account"
                  className="mt-1 normal-case tracking-normal"
                />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Amount (UGX)
                  <input
                    required
                    min="0.01"
                    max={paymentInvoice.balanceDue}
                    step="0.01"
                    type="number"
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  />
                  <span
                    className="mt-1 block text-xs normal-case tracking-normal"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    Partial payments are allowed up to the remaining balance of{" "}
                    {money(paymentInvoice.balanceDue)}.
                  </span>
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Payment method
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        paymentMethod: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  >
                    {methods.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Paid date
                  <input
                    required
                    type="date"
                    max={localDate()}
                    value={paymentForm.paidAt}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        paidAt: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  />
                </label>
                <label
                  className="block text-xs font-700 uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Reference
                  <input
                    required
                    maxLength={100}
                    value={paymentForm.reference}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        reference: event.target.value,
                      }))
                    }
                    className="mt-1 w-full border px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none"
                    style={fieldStyle}
                  />
                </label>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={
                  saving ||
                  !paymentForm.accountId ||
                  !paymentForm.amount ||
                  Number(paymentForm.amount) > paymentInvoice.balanceDue ||
                  (expenseCategoriesEnabled && !paymentForm.expenseCategoryId)
                }
                className="flex-1 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
              >
                {saving ? "Saving…" : "Record payment"}
              </button>
              <button
                type="button"
                onClick={() => setPaymentInvoiceId(null)}
                className="flex-1 border py-2 text-sm"
                style={{
                  borderColor: "var(--border)",
                  color: "var(--muted-foreground)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
