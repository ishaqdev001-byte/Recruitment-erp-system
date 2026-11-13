"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, CircleDollarSign, Loader2, Plus, X } from "lucide-react"

type ExpenseRequestStatus =
  | "pending_line_manager_review"
  | "pending_administration_officer_initiation"
  | "pending_general_manager_review"
  | "pending_finance_verification"
  | "pending_chairman_authorization"
  | "authorized_pending_cashout"
  | "paid"
  | "rejected"

type ExpenseRequestRecord = {
  id: string
  request_number: string
  expense_name: string
  requested_by_name: string
  purpose: string
  amount: number
  due_date: string
  request_comment: string
  expense_category_name: string
  line_items: { description: string; quantity: number; rate: number }[]
  status: ExpenseRequestStatus
  line_manager_user_id: string | null
  line_manager_fallback: boolean
  line_manager_comment: string | null
  requisition_number: string | null
  rejected_stage: string | null
  created_by: string
  created_at: string
  general_manager_comment: string | null
  general_manager_reviewed_at: string | null
  finance_comment: string | null
  finance_verified_at: string | null
  chairman_comment: string | null
  chairman_authorized_at: string | null
  cashout_comment: string | null
  cashed_out_at: string | null
}

type Permissions = {
  canView: boolean
  canCreate: boolean
  canReviewLineManager: boolean
  canReview: boolean
  canVerify: boolean
  canAuthorize: boolean
  canCashout: boolean
}

type AccountOption = { id: string; name: string; account_type: string }
type ExpenseCategory = { id: string; name: string }
type DraftExpenseItem = { description: string; quantity: string; rate: string }

const initialPermissions: Permissions = {
  canView: false,
  canCreate: false,
  canReviewLineManager: false,
  canReview: false,
  canVerify: false,
  canAuthorize: false,
  canCashout: false,
}

const statuses: Record<ExpenseRequestStatus, { label: string; color: string }> = {
  pending_line_manager_review: { label: "Line-manager review", color: "#f59e0b" },
  pending_administration_officer_initiation: { label: "Awaiting requisition initiation", color: "#f59e0b" },
  pending_general_manager_review: { label: "General Manager review", color: "#f59e0b" },
  pending_finance_verification: { label: "Finance verification", color: "#3b82f6" },
  pending_chairman_authorization: { label: "Chairman authorization", color: "#8b5cf6" },
  authorized_pending_cashout: { label: "Authorized - awaiting cash-out", color: "#10b981" },
  paid: { label: "Paid", color: "#059669" },
  rejected: { label: "Rejected", color: "#ef4444" },
}

const fieldStyle = {
  background: "var(--secondary)",
  borderColor: "var(--border)",
  color: "var(--foreground)",
}

function formatAmount(amount: number) {
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export default function ExpenseRequests() {
  const [requests, setRequests] = useState<ExpenseRequestRecord[]>([])
  const [currentUserId, setCurrentUserId] = useState("")
  const [permissions, setPermissions] = useState(initialPermissions)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [expenseName, setExpenseName] = useState("")
  const [purpose, setPurpose] = useState("")
  const [expenseCategoryId, setExpenseCategoryId] = useState("")
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [items, setItems] = useState<DraftExpenseItem[]>([
    { description: "", quantity: "1", rate: "" },
  ])
  const [dueDate, setDueDate] = useState("")
  const [requestComment, setRequestComment] = useState("")
  const [comments, setComments] = useState<Record<string, string>>({})
  const [cashoutTarget, setCashoutTarget] = useState<ExpenseRequestRecord | null>(null)
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountId, setAccountId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [cashoutError, setCashoutError] = useState("")

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/finance/expense-requests", {
        cache: "no-store",
      })
      const payload = (await response.json()) as {
        requests?: ExpenseRequestRecord[]
        currentUserId?: string
        permissions?: Permissions
        error?: string
      }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to load expense requests.")
      setRequests(payload.requests ?? [])
      setCurrentUserId(payload.currentUserId ?? "")
      setPermissions(payload.permissions ?? initialPermissions)
      if (payload.permissions?.canCreate) {
        const categoryResponse = await fetch("/api/settings/expense-categories", {
          cache: "no-store",
        })
        const categoryPayload = (await categoryResponse.json()) as {
          categories?: ExpenseCategory[]
          error?: string
        }
        if (!categoryResponse.ok)
          throw new Error(categoryPayload.error ?? "Unable to load expense categories.")
        setCategories(categoryPayload.categories ?? [])
      } else {
        setCategories([])
      }
    } catch (loadError) {
      console.error("Expense request list failed", loadError)
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load expense requests.",
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/finance/expense-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          expenseName,
          purpose,
          expenseCategoryId,
          items: items.map((item) => ({
            description: item.description.trim(),
            quantity: Number(item.quantity),
            rate: Number(item.rate),
          })),
          dueDate,
          comment: requestComment,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to submit the expense request.")
      setExpenseName("")
      setPurpose("")
      setExpenseCategoryId("")
      setItems([{ description: "", quantity: "1", rate: "" }])
      setDueDate("")
      setRequestComment("")
      setNotice("Expense request submitted for line-manager review.")
      await loadRequests()
    } catch (submitError) {
      console.error("Expense request submission failed", submitError)
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit the expense request.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function submitAction(
    request: ExpenseRequestRecord,
    action: string,
    comment: string,
    payment?: { accountId: string; paymentMethod: string },
  ) {
    setSaving(true)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/finance/expense-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          requestId: request.id,
          comment,
          accountId: payment?.accountId,
          paymentMethod: payment?.paymentMethod,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to update the expense request.")
      setComments((current) => ({ ...current, [request.id]: "" }))
      setCashoutTarget(null)
      setNotice(`${request.request_number} was updated successfully.`)
      await loadRequests()
    } catch (actionError) {
      console.error("Expense request action failed", actionError)
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update the expense request.",
      )
    } finally {
      setSaving(false)
    }
  }

  async function openCashout(request: ExpenseRequestRecord) {
    setCashoutError("")
    setAccountsLoading(true)
    setAccounts([])
    setAccountId("")
    setPaymentMethod("Cash")
    setCashoutTarget(request)
    try {
      const response = await fetch("/api/finance/accounts?options=1", {
        cache: "no-store",
      })
      const payload = (await response.json()) as {
        accounts?: AccountOption[]
        error?: string
      }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to load active company accounts.")
      const availableAccounts = payload.accounts ?? []
      setAccounts(availableAccounts)
      setAccountId(availableAccounts[0]?.id ?? "")
      if (availableAccounts.length === 0)
        setCashoutError("Create or activate a company account before paying this request.")
    } catch (accountError) {
      console.error("Expense request cash-out accounts failed", accountError)
      setCashoutError(
        accountError instanceof Error
          ? accountError.message
          : "Unable to load active company accounts.",
      )
    } finally {
      setAccountsLoading(false)
    }
  }

  function setComment(requestId: string, value: string) {
    setComments((current) => ({ ...current, [requestId]: value }))
  }

  function updateItem(index: number, patch: Partial<DraftExpenseItem>) {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  function renderActionArea(request: ExpenseRequestRecord) {
    const comment = comments[request.id] ?? ""
    const canReviewLineManagerRequest =
      (permissions.canReviewLineManager &&
        request.line_manager_user_id === currentUserId) ||
      permissions.canReview
    const action = (() => {
      if (
        request.status === "pending_line_manager_review" &&
        canReviewLineManagerRequest
      )
        return {
          title: request.line_manager_fallback
            ? "General Manager fallback review"
            : "Line-manager review",
          approve: "line_manager_approve",
          reject: "line_manager_reject",
          approveLabel: "Approve for requisition initiation",
        }
      if (request.status === "pending_general_manager_review" && permissions.canReview)
        return {
          title: "General Manager review",
          approve: "general_manager_approve",
          reject: "general_manager_reject",
          approveLabel: "Approve for Finance",
        }
      if (request.status === "pending_finance_verification" && permissions.canVerify)
        return {
          title: "Finance verification",
          approve: "finance_verify",
          reject: "finance_reject",
          approveLabel: "Verify for Chairman",
        }
      if (request.status === "pending_chairman_authorization" && permissions.canAuthorize)
        return {
          title: "Chairman authorization",
          approve: "chairman_authorize",
          reject: "chairman_reject",
          approveLabel: "Authorize expense",
        }
      return null
    })()

    if (request.status === "authorized_pending_cashout" && permissions.canCashout)
      return (
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
          <label className="mb-2 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            Finance Manager comment
          </label>
          <textarea
            required
            maxLength={2000}
            rows={2}
            value={comment}
            onChange={(event) => setComment(request.id, event.target.value)}
            className="w-full rounded border px-3 py-2 text-sm outline-none"
            style={fieldStyle}
            placeholder="Add the cash-out comment"
          />
          <button
            type="button"
            disabled={saving || !comment.trim()}
            onClick={() => void openCashout(request)}
            className="mt-2 inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
            style={{ background: "var(--primary)", color: "white" }}
          >
            <CircleDollarSign size={16} aria-hidden="true" />
            Cash out
          </button>
        </div>
      )

    if (!action) return null
    return (
      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        <label className="mb-2 block text-xs font-600 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          {action.title} comment
        </label>
        <textarea
          required
          maxLength={2000}
          rows={2}
          value={comment}
          onChange={(event) => setComment(request.id, event.target.value)}
          className="w-full rounded border px-3 py-2 text-sm outline-none"
          style={fieldStyle}
          placeholder="Add a comment before taking action"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || !comment.trim()}
            onClick={() => void submitAction(request, action.approve, comment)}
            className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600 disabled:opacity-50"
            style={{ background: "var(--primary)", color: "white" }}
          >
            <Check size={16} aria-hidden="true" />
            {action.approveLabel}
          </button>
          <button
            type="button"
            disabled={saving || !comment.trim()}
            onClick={() => void submitAction(request, action.reject, comment)}
            className="rounded border px-4 py-2 text-sm font-600 disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "#ef4444" }}
          >
            Reject
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-700 uppercase tracking-[0.18em]" style={{ color: "var(--primary)" }}>
            Finance
          </p>
          <h1 className="mt-1 text-2xl font-700" style={{ color: "var(--foreground)" }}>
            Expense Requests
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Staff submit requests to their line manager. Approved requests are initiated as requisitions, then proceed through General Manager review, Finance verification, Chairman authorization, and Finance Manager cash-out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRequests()}
          disabled={loading}
          className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
        >
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded border px-4 py-3 text-sm" style={{ borderColor: "#ef4444", color: "#ef4444", background: "#ef444410" }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded border px-4 py-3 text-sm" style={{ borderColor: "#10b981", color: "#10b981", background: "#10b98110" }}>
          {notice}
        </div>
      )}

      {permissions.canCreate && (
        <form onSubmit={submitRequest} className="rounded-lg border p-4 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} aria-hidden="true" style={{ color: "var(--primary)" }} />
            <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
              New expense request
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block">Expense name *</span>
              <input required maxLength={200} value={expenseName} onChange={(event) => setExpenseName(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Expense category *</span>
              <select required value={expenseCategoryId} onChange={(event) => setExpenseCategoryId(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle}>
                <option value="">Select a category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Due date *</span>
              <input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block">Purpose *</span>
              <textarea required maxLength={2000} rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <div className="space-y-3 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-600">Items *</span>
                <button
                  type="button"
                  onClick={() => setItems((current) => [...current, { description: "", quantity: "1", rate: "" }])}
                  className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-600"
                  style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                  <Plus size={14} aria-hidden="true" /> Add item
                </button>
              </div>
              {items.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_150px_auto]">
                  <input
                    required
                    maxLength={200}
                    aria-label={`Item ${index + 1} description`}
                    placeholder="Description"
                    value={item.description}
                    onChange={(event) => updateItem(index, { description: event.target.value })}
                    className="w-full rounded border px-3 py-2 outline-none"
                    style={fieldStyle}
                  />
                  <input
                    required
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    aria-label={`Item ${index + 1} quantity`}
                    placeholder="Quantity"
                    value={item.quantity}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    className="w-full rounded border px-3 py-2 outline-none"
                    style={fieldStyle}
                  />
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`Item ${index + 1} rate`}
                    placeholder="Unit rate"
                    value={item.rate}
                    onChange={(event) => updateItem(index, { rate: event.target.value })}
                    className="w-full rounded border px-3 py-2 outline-none"
                    style={fieldStyle}
                  />
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={items.length === 1}
                    onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="rounded border px-2 disabled:opacity-40"
                    style={{ borderColor: "var(--border)", color: "#ef4444" }}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="text-right text-sm font-700" style={{ color: "var(--foreground)" }}>
                Request total: {formatAmount(items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.rate || 0), 0))}
              </div>
            </div>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block">Request comment *</span>
              <textarea required maxLength={2000} rows={2} value={requestComment} onChange={(event) => setRequestComment(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
          </div>
          <button type="submit" disabled={saving || !expenseCategoryId || items.some((item) => !item.description.trim() || Number(item.quantity) <= 0 || Number(item.rate) < 0)} className="mt-4 inline-flex items-center gap-2 rounded px-4 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "white" }}>
            {saving ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            Submit for review
          </button>
        </form>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
          Requests
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <Loader2 className="animate-spin" size={18} aria-hidden="true" />
            Loading expense requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            {permissions.canCashout
              ? "No expense requests are waiting for cash-out. Requests become payable after General Manager review, Finance verification, and Chairman authorization."
              : "No expense requests yet."}
          </div>
        ) : (
          requests.map((request) => {
            const status =
              request.status === "pending_line_manager_review" &&
              request.line_manager_fallback
                ? { label: "General Manager fallback review", color: "#f59e0b" }
                : statuses[request.status]
            return (
              <article key={request.id} className="rounded-lg border p-4 sm:p-6" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-700 uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                      {request.request_number}
                    </p>
                    <h3 className="mt-1 text-lg font-700" style={{ color: "var(--foreground)" }}>
                      {request.expense_name}
                    </h3>
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-700" style={{ color: status.color, background: `${status.color}20` }}>
                    {status.label}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div><span style={{ color: "var(--muted-foreground)" }}>Amount</span><p className="font-700" style={{ color: "var(--foreground)" }}>{formatAmount(Number(request.amount))}</p></div>
                  <div><span style={{ color: "var(--muted-foreground)" }}>Requested for</span><p style={{ color: "var(--foreground)" }}>{request.requested_by_name}</p></div>
                  <div><span style={{ color: "var(--muted-foreground)" }}>Due date</span><p style={{ color: "var(--foreground)" }}>{formatDate(request.due_date)}</p></div>
                  <div><span style={{ color: "var(--muted-foreground)" }}>Submitted</span><p style={{ color: "var(--foreground)" }}>{new Date(request.created_at).toLocaleDateString()}</p></div>
                  {request.requisition_number && <div><span style={{ color: "var(--muted-foreground)" }}>Requisition</span><p className="font-700" style={{ color: "var(--primary)" }}>{request.requisition_number}</p></div>}
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm" style={{ color: "var(--foreground)" }}>{request.purpose}</p>
                <div className="mt-3 rounded border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                  <p className="font-600" style={{ color: "var(--foreground)" }}>{request.expense_category_name}</p>
                  <ul className="mt-2 space-y-1">
                    {(request.line_items ?? []).map((item, index) => (
                      <li key={`${request.id}-item-${index}`} className="flex flex-wrap justify-between gap-2" style={{ color: "var(--muted-foreground)" }}>
                        <span>{item.description} ({item.quantity} × {formatAmount(Number(item.rate))})</span>
                        <span>{formatAmount(Number(item.quantity) * Number(item.rate))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
                  <p><strong style={{ color: "var(--muted-foreground)" }}>Request:</strong> {request.request_comment}</p>
                  {request.line_manager_comment && <p><strong style={{ color: "var(--muted-foreground)" }}>{request.line_manager_fallback ? "General Manager fallback" : "Line manager"}:</strong> {request.line_manager_comment}</p>}
                  {request.general_manager_comment && <p><strong style={{ color: "var(--muted-foreground)" }}>General Manager:</strong> {request.general_manager_comment}</p>}
                  {request.finance_comment && <p><strong style={{ color: "var(--muted-foreground)" }}>Finance:</strong> {request.finance_comment}</p>}
                  {request.chairman_comment && <p><strong style={{ color: "var(--muted-foreground)" }}>Chairman:</strong> {request.chairman_comment}</p>}
                  {request.cashout_comment && <p><strong style={{ color: "var(--muted-foreground)" }}>Cash-out:</strong> {request.cashout_comment}</p>}
                  {request.rejected_stage && <p className="font-600" style={{ color: "#ef4444" }}>Rejected during {request.rejected_stage.replace(/_/g, " ")}.</p>}
                </div>
                {renderActionArea(request)}
              </article>
            )
          })
        )}
      </section>

      {cashoutTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setCashoutTarget(null)
        }}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-cashout-title"
            onSubmit={(event) => {
              event.preventDefault()
              void submitAction(cashoutTarget, "cashout", comments[cashoutTarget.id] ?? "", { accountId, paymentMethod })
            }}
            className="w-full max-w-lg space-y-4 rounded-lg border p-5 shadow-xl"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="expense-cashout-title" className="text-lg font-700" style={{ color: "var(--foreground)" }}>Cash out expense</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>{cashoutTarget.request_number} - {formatAmount(Number(cashoutTarget.amount))}</p>
              </div>
              <button type="button" aria-label="Close cash-out dialog" disabled={saving} onClick={() => setCashoutTarget(null)} className="rounded p-1" style={{ color: "var(--muted-foreground)" }}>
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block">Company account *</span>
              <select required value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={accountsLoading || accounts.length === 0} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle}>
                <option value="">                {accountsLoading ? "Loading accounts..." : "Select an active account"}</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.account_type}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">Payment method *</span>
              <select required value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle}>
                {["Cash", "Bank transfer", "Mobile money", "Cheque", "Other"].map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">Cash-out comment *</span>
              <textarea required maxLength={2000} rows={3} value={comments[cashoutTarget.id] ?? ""} onChange={(event) => setComment(cashoutTarget.id, event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            {cashoutError && <p role="alert" className="text-sm" style={{ color: "#ef4444" }}>{cashoutError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setCashoutTarget(null)} className="rounded border px-4 py-2 text-sm" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>Cancel</button>
              <button type="submit" disabled={saving || accountsLoading || !accountId || !(comments[cashoutTarget.id] ?? "").trim()} className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "white" }}>
                {saving && <Loader2 className="animate-spin" size={16} aria-hidden="true" />}
                Confirm cash-out
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
