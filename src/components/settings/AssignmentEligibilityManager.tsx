"use client"

import { useEffect, useState } from "react"

type EligiblePerson = {
  key: string

  name: string

  detail: string
}

export default function AssignmentEligibilityManager({
  type,

  title,

  description,
}: {
  type: "case_handler" | "assistant_staff"

  title: string

  description: string
}) {
  const [enabled, setEnabled] = useState(false)

  const [canManage, setCanManage] = useState(false)

  const [eligible, setEligible] = useState<EligiblePerson[]>([])

  const [available, setAvailable] = useState<EligiblePerson[]>([])

  const [selected, setSelected] = useState("")

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")

  const [notice, setNotice] = useState("")

  const load = async () => {
    setLoading(true)

    setError("")

    try {
      const response = await fetch(
        `/api/settings/assignment-eligibility?type=${type}`,

        { cache: "no-store" },
      )

      const result = (await response.json()) as {
        enabled?: boolean

        canManage?: boolean

        eligible?: EligiblePerson[]

        available?: EligiblePerson[]

        error?: string
      }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to load assignment roster.")

      setEnabled(Boolean(result.enabled))

      setCanManage(Boolean(result.canManage))

      setEligible(result.eligible ?? [])

      setAvailable(result.available ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load assignment roster.",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [type])

  const update = async (method: "POST" | "DELETE", target: string) => {
    setSaving(true)

    setError("")

    setNotice("")

    try {
      const response = await fetch("/api/settings/assignment-eligibility", {
        method,

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({ type, target }),
      })

      const result = (await response.json()) as { error?: string }

      if (!response.ok)
        throw new Error(result.error ?? "Unable to update assignment roster.")

      setSelected("")

      setNotice(
        method === "POST"
          ? "Person added to the assignment list."
          : "Person removed from the assignment list.",
      )

      await load()
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update assignment roster.",
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="mt-5 rounded border p-5"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <h3 className="text-base font-700" style={{ color: "var(--foreground)" }}>
        {title}
      </h3>
      <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
        {description}
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

      {!loading && canManage && enabled && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <select
            aria-label={`Choose a person for ${title}`}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={saving || available.length === 0}
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{
              background: "var(--secondary)",

              borderColor: "var(--border)",

              color: "var(--foreground)",
            }}
          >
            <option value="">
              {available.length
                ? "Select an active member or staff"
                : "No additional active people available"}
            </option>
            {available.map((person) => (
              <option key={person.key} value={person.key}>
                {person.name} — {person.detail}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() => void update("POST", selected)}
            className="rounded px-4 py-2 text-sm font-600 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--primary)",

              color: "var(--primary-foreground)",
            }}
          >
            {saving ? "Saving..." : "Add to list"}
          </button>
        </div>
      )}

      {!loading && !canManage && (
        <p
          className="mt-4 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          The Chairman or a user with the relevant assignment permission can
          manage this list.
        </p>
      )}
      {!loading && canManage && !enabled && (
        <p
          className="mt-4 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          Enable this feature above before adding eligible people.
        </p>
      )}

      <div
        className="mt-5 border-t pt-4"
        style={{ borderColor: "var(--border)" }}
      >
        <p
          className="mb-2 text-xs font-700 uppercase tracking-wide"
          style={{ color: "var(--muted-foreground)" }}
        >
          Eligible people
        </p>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Loading eligible people...
          </p>
        ) : eligible.length ? (
          <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
            {eligible.map((person) => (
              <li
                key={person.key}
                className="flex items-center justify-between gap-3 py-2"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="min-w-0">
                  <span
                    className="block truncate text-sm font-600"
                    style={{ color: "var(--foreground)" }}
                  >
                    {person.name}
                  </span>
                  <span
                    className="block truncate text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {person.detail}
                  </span>
                </span>
                {canManage && enabled && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void update("DELETE", person.key)}
                    className="shrink-0 rounded border px-3 py-1.5 text-xs disabled:opacity-50"
                    style={{
                      borderColor: "var(--border)",

                      color: "var(--muted-foreground)",
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No people have been added yet.
          </p>
        )}
      </div>
    </section>
  )
}
