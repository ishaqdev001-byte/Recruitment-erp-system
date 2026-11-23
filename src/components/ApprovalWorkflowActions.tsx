"use client"

import { useEffect, useState } from "react"

import type {
  ApprovalWorkflowKey,
  ApprovalWorkflowState,
} from "@/lib/approval-workflows"

type AccountOption = { id: string; name: string; account_type: string }

const fieldStyle = {
  background: "var(--secondary)",

  borderColor: "var(--border)",

  color: "var(--foreground)",
}

export default function ApprovalWorkflowActions({
  state,

  onComplete,
}: {
  state: ApprovalWorkflowState | null

  onComplete: () => void
}) {
  const [note, setNote] = useState("")

  const [accountId, setAccountId] = useState("")

  const [paymentMethod, setPaymentMethod] = useState("Cash")

  const [accounts, setAccounts] = useState<AccountOption[]>([])

  const [accountsLoading, setAccountsLoading] = useState(false)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const stage = state?.currentStage

  const workflowKey = state?.workflowKey as ApprovalWorkflowKey | undefined

  useEffect(() => {
    if (!stage || stage.actionType !== "cashout" || !state?.canAct) return

    let active = true

    setAccountsLoading(true)

    void fetch("/api/finance/accounts?options=1", { cache: "no-store" })

      .then(async (response) => {
        const payload = (await response.json()) as {
          accounts?: AccountOption[]

          error?: string
        }

        if (!response.ok)
          throw new Error(payload.error ?? "Unable to load active accounts.")

        if (!active) return

        const available = payload.accounts ?? []

        setAccounts(available)

        setAccountId(available[0]?.id ?? "")
      })

      .catch((loadError: unknown) => {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load active accounts.",
          )
      })

      .finally(() => {
        if (active) setAccountsLoading(false)
      })

    return () => {
      active = false
    }
  }, [stage?.actionType, state?.canAct])

  if (!state) return null

  if (!stage)
    return (
      <p className="mt-4 border-t pt-3 text-sm text-muted-foreground">
        Approval workflow {state.runStatus}.
      </p>
    )

  const actionLabel =
    stage.actionType === "initiate_requisition"
      ? "Create linked requisition"
      : stage.actionType === "cashout"
        ? "Record cash-out"
        : "Review this request"

  const operational =
    stage.actionType === "initiate_requisition" ||
    stage.actionType === "cashout"

  async function submit(decision: "approved" | "rejected" | "completed") {
    if (!state || !workflowKey || !stage) return

    setSaving(true)

    setError("")

    try {
      const response = await fetch("/api/approval-workflows/transition", {
        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({
          workflowKey,

          subjectId: state.subjectId,

          decision,

          note,

          accountId: stage.actionType === "cashout" ? accountId : undefined,

          paymentMethod:
            stage.actionType === "cashout" ? paymentMethod : undefined,
        }),
      })

      const payload = (await response.json()) as { error?: string }

      if (!response.ok)
        throw new Error(payload.error ?? "Unable to update this workflow.")

      setNote("")

      onComplete()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update this workflow.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="mt-4 space-y-3 border-t pt-4"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-sm font-700" style={{ color: "var(--foreground)" }}>
          {stage.label}
        </p>
        {stage.instructions && (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {stage.instructions}
          </p>
        )}
      </div>
      {state.canAct && (
        <>
          {stage.actionType === "cashout" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-600 text-muted-foreground">
                Active company account
                <select
                  required
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  disabled={accountsLoading || accounts.length === 0}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  style={fieldStyle}
                >
                  <option value="">
                    {accountsLoading
                      ? "Loading accounts…"
                      : "Select an account"}
                  </option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-600 text-muted-foreground">
                Payment method
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm"
                  style={fieldStyle}
                >
                  {[
                    "Cash",
                    "Bank transfer",
                    "Mobile money",
                    "Cheque",
                    "Other",
                  ].map(
                    (method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          )}
          <label className="block text-xs font-600 text-muted-foreground">
            {stage.actionType === "cashout"
              ? "Cash-out comment"
              : stage.actionType === "initiate_requisition"
                ? "Initiation comment"
                : "Stage comment"}
            {workflowKey !== "leave" && " *"}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              required={workflowKey !== "leave"}
              maxLength={2000}
              rows={2}
              className="mt-1 w-full rounded border px-3 py-2 text-sm"
              style={fieldStyle}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {operational ? (
              <button
                type="button"
                disabled={
                  saving ||
                  (workflowKey !== "leave" && !note.trim()) ||
                  (stage.actionType === "cashout" &&
                    (!accountId || accountsLoading))
                }
                onClick={() => void submit("completed")}
                className="rounded px-4 py-2 text-sm font-600 text-white disabled:opacity-50"
                style={{ background: "var(--primary)" }}
              >
                {saving ? "Saving…" : actionLabel}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving || (workflowKey !== "leave" && !note.trim())}
                  onClick={() => void submit("approved")}
                  className="rounded px-4 py-2 text-sm font-600 text-white disabled:opacity-50"
                  style={{ background: "#168358" }}
                >
                  {saving ? "Saving…" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={saving || (workflowKey !== "leave" && !note.trim())}
                  onClick={() => void submit("rejected")}
                  className="rounded px-4 py-2 text-sm font-600 text-white disabled:opacity-50"
                  style={{ background: "#b43c45" }}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
