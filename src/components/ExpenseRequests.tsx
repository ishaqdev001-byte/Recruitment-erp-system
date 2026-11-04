"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { Check, CircleDollarSign, Loader2, Plus, X } from "lucide-react"

type ExpenseRequestStatus =
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
  status: ExpenseRequestStatus
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
  canReview: boolean
  canVerify: boolean
  canAuthorize: boolean
  canCashout: boolean
}

type AccountOption = { id: string; name: string; account_type: string }

const initialPermissions: Permissions = {
  canView: false,
  canCreate: false,
  canReview: false,
  canVerify: false,
  canAuthorize: false,
  canCashout: false,
}

const statuses: Record<ExpenseRequestStatus, { label: string; color: string }> = {
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
  const [permissions, setPermissions] = useState(initialPermissions)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [expenseName, setExpenseName] = useState("")
  const [requestedBy, setRequestedBy] = useState("")
  const [purpose, setPurpose] = useState("")
  const [amount, setAmount] = useState("")
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
        permissions?: Permissions
        error?: string
      }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to load expense requests.")
      setRequests(payload.requests ?? [])
      setPermissions(payload.permissions ?? initialPermissions)
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
          requestedBy,
          purpose,
          amount: Number(amount),
          dueDate,
          comment: requestComment,
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok)
        throw new Error(payload.error ?? "Unable to submit the expense request.")
      setExpenseName("")
      setRequestedBy("")
      setPurpose("")
      setAmount("")
      setDueDate("")
      setRequestComment("")
      setNotice("Expense request submitted for General Manager review.")
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

  function renderActionArea(request: ExpenseRequestRecord) {
    const comment = comments[request.id] ?? ""
    const action = (() => {
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
            Requests move through General Manager review, Finance verification, Chairman authorization, and Finance Manager cash-out.
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
              <span className="mb-1 block">Requested for / person *</span>
              <input required maxLength={200} value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Amount *</span>
              <input required type="number" min="0.01" max="999999999999.99" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block">Due date *</span>
              <input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block">Purpose *</span>
              <textarea required maxLength={2000} rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block">Request comment *</span>
              <textarea required maxLength={2000} rows={2} value={requestComment} onChange={(event) => setRequestComment(event.target.value)} className="w-full rounded border px-3 py-2.5 outline-none" style={fieldStyle} />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded px-4 py-2.5 text-sm font-600 disabled:opacity-50" style={{ background: "var(--primary)", color: "white" }}>
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
            const status = statuses[request.status]
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
                </div>
                <p className="mt-4 whitespace-pre-wrap text-sm" style={{ color: "var(--foreground)" }}>{request.purpose}</p>
                <div className="mt-4 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--border)" }}>
                  <p><strong style={{ color: "var(--muted-foreground)" }}>Request:</strong> {request.request_comment}</p>
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
