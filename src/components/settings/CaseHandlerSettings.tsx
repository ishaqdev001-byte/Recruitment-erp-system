"use client"

import { useEffect, useState } from "react"
import AssignmentEligibilityManager from "./AssignmentEligibilityManager"

export default function CaseHandlerSettings() {
  const [enabled, setEnabled] = useState(false)

  const [canManage, setCanManage] = useState(false)

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  useEffect(() => {
    let cancelled = false

    void fetch("/api/settings/case-handlers", { cache: "no-store" })

      .then(async (response) => {
        const result = (await response.json()) as {
          enabled?: boolean

          canManage?: boolean

          error?: string
        }

        if (!response.ok)
          throw new Error(
            result.error ?? "Unable to load case-handler settings.",
          )

        if (!cancelled) {
          setEnabled(Boolean(result.enabled))

          setCanManage(Boolean(result.canManage))
        }
      })

      .catch((loadError: unknown) => {
        if (!cancelled)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load case-handler settings.",
          )
      })

      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const save = async (nextEnabled: boolean) => {
    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/settings/case-handlers", {
        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ enabled: nextEnabled }),
      })

      const result = (await response.json()) as {
        enabled?: boolean

        error?: string
      }

      if (!response.ok)
        throw new Error(
          result.error ?? "Unable to update case-handler settings.",
        )

      setEnabled(Boolean(result.enabled))

      setNotice(
        result.enabled
          ? "Case handlers are enabled for the Pipeline."
          : "Case handlers are disabled for the Pipeline.",
      )
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update case-handler settings.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      <section
        className="rounded border p-5"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <h2 className="text-lg font-700" style={{ color: "var(--foreground)" }}>
          Pipeline case handlers
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Enable the Case Handler column after Mobile. Assigned handlers receive
          a task when a candidate has had no recorded activity for 14 days.
          Candidate edits, stage changes, notes, communications, and document
          activity restart the timer.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-500">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-4 text-sm text-emerald-600">
            {notice}
          </p>
        )}

        <div
          className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t pt-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p
              className="text-sm font-600"
              style={{ color: "var(--foreground)" }}
            >
              Show case handlers in the Pipeline
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Enable Pipeline case handlers"
            disabled={loading || saving || !canManage}
            onClick={() => void save(!enabled)}
            className="rounded border px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: enabled ? "var(--primary)" : "var(--secondary)",

              borderColor: "var(--border)",

              color: enabled
                ? "var(--primary-foreground)"
                : "var(--foreground)",
            }}
          >
            {loading
              ? "Loading..."
              : saving
                ? "Saving..."
                : enabled
                  ? "Enabled"
                  : "Enable"}
          </button>
        </div>
        {!canManage && !loading && (
          <p
            className="mt-3 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            Only the Chairman can change this setting.
          </p>
        )}
      </section>
      <AssignmentEligibilityManager
        key={enabled ? "enabled" : "disabled"}
        type="case_handler"
        title="Eligible case handlers"
        description="Add active company members who should appear in the Pipeline Case Handler selector. People not on this list will not be offered for new assignments."
      />
    </div>
  )
}
