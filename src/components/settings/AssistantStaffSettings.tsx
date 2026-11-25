"use client"

import { useEffect, useState } from "react"

export default function AssistantStaffSettings() {
  const [enabled, setEnabled] = useState(false)

  const [canManage, setCanManage] = useState(false)

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  useEffect(() => {
    let cancelled = false

    void fetch("/api/settings/assistant-staff", { cache: "no-store" })

      .then(async (response) => {
        const result = (await response.json()) as {
          enabled?: boolean

          canManage?: boolean

          error?: string
        }

        if (!response.ok) {
          throw new Error(
            result.error ?? "Unable to load Assistant Staff settings.",
          )
        }

        if (!cancelled) {
          setEnabled(Boolean(result.enabled))

          setCanManage(Boolean(result.canManage))
        }
      })

      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load Assistant Staff settings.",
          )
        }
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
      const response = await fetch("/api/settings/assistant-staff", {
        method: "PATCH",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ enabled: nextEnabled }),
      })

      const result = (await response.json()) as {
        enabled?: boolean

        error?: string
      }

      if (!response.ok) {
        throw new Error(
          result.error ?? "Unable to update Assistant Staff settings.",
        )
      }

      setEnabled(Boolean(result.enabled))

      setNotice(
        result.enabled
          ? "Assistant Staff assignments are enabled in Projects."
          : "Assistant Staff assignments are hidden in Projects.",
      )
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update Assistant Staff settings.",
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
          Project Assistant Staff
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Enable the Assistant Staff column and project assignment control in
          Projects. Disabling it hides the control without removing existing
          assignments.
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
              Show Assistant Staff in Projects
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
            aria-label="Enable Assistant Staff in Projects"
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
      </section>
    </div>
  )
}
