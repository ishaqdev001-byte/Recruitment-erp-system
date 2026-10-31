import { useEffect, useState } from "react"

import { FileText, LockKeyhole, UsersRound } from "lucide-react"

import type { View, WorkspaceRole } from "../App"

interface WorkspaceSummary {
  candidateCount: number | null

  documentCount: number | null

  passportCount: number | null
}

export default function LiveDashboard({
  role,
  companyId,
  companyName,
  permissions,
  onNavigate,
}: {
  role: WorkspaceRole
  companyId: string
  companyName: string
  permissions: string[]
  onNavigate: (view: View) => void
}) {
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null)

  const [error, setError] = useState("")

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    setSummary(null)

    setLoading(true)

    setError("")

    fetch(`/api/workspace/summary?companyId=${encodeURIComponent(companyId)}`, {
      cache: "no-store",
    })

      .then(async (response) => {
        const payload = await response.json()

        if (!response.ok)
          throw new Error(payload.error || "Unable to load workspace data.")

        if (!cancelled) setSummary(payload as WorkspaceSummary)
      })

      .catch((requestError: unknown) => {
        if (!cancelled)
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load workspace data.",
          )
      })

      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [companyId, permissions])

  const metrics = [
    {
      label: "Candidates",
      value: summary?.candidateCount,
      icon: UsersRound,
      color: "#2563eb",
      permission: "candidates.view",
      view: "candidates" as const,
    },

    {
      label: "Candidate documents",

      value: summary?.documentCount,

      icon: FileText,

      color: "#0f766e",

      permission: "documents.view",

      view: permissions.includes("candidates.view")
        ? "candidates" as const
        : undefined,
    },

    {
      label: "Passport records",
      value: summary?.passportCount,
      icon: LockKeyhole,
      color: "#b45309",
      permission: "passport.view",
      view: "passport" as const,
    },
  ].filter((metric) => permissions.includes(metric.permission))

  return (
    <div className="mx-auto w-full max-w-7xl p-6 lg:p-8">
      <div className="mb-8">
        <div
          className="text-xs font-700 uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          {role} workspace
        </div>
        <h1
          className="mt-2 text-2xl font-700"
          style={{ color: "var(--foreground)" }}
        >
          Workspace overview
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Dashboard information is limited to the permissions assigned to your
          role.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="border px-4 py-3 text-sm"
          style={{
            borderColor: "#ef444455",
            color: "#ef4444",
            background: "var(--card)",
          }}
        >
          {error}
        </div>
      ) : metrics.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {metrics.map(({ label, value, icon: Icon, color, view }) =>
            view ? (
              <button
                key={label}
                type="button"
                onClick={() => onNavigate(view)}
                className="flex min-h-28 items-center gap-4 border p-5 text-left transition-colors hover:bg-[var(--secondary)]"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--card)",
                }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center"
                  style={{ color, background: `${color}18` }}
                >
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span>
                  <span
                    className="mono block text-2xl font-700"
                    style={{ color: "var(--foreground)" }}
                  >
                    {loading
                      ? "…"
                      : value === null || value === undefined
                        ? "—"
                        : value.toLocaleString()}
                  </span>
                  <span
                    className="text-xs font-700 uppercase"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {label}
                  </span>
                </span>
              </button>
            ) : (
              <section
                key={label}
                className="flex min-h-28 items-center gap-4 border p-5"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--card)",
                }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center"
                  style={{ color, background: `${color}18` }}
                >
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span>
                  <span
                    className="mono block text-2xl font-700"
                    style={{ color: "var(--foreground)" }}
                  >
                    {loading
                      ? "…"
                      : value === null || value === undefined
                        ? "—"
                        : value.toLocaleString()}
                  </span>
                  <span
                    className="text-xs font-700 uppercase"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {label}
                  </span>
                </span>
              </section>
            ),
          )}
        </div>
      ) : (
        <p
          className="border-l-2 pl-4 text-sm"
          style={{
            borderColor: "var(--primary)",
            color: "var(--muted-foreground)",
          }}
        >
          No dashboard metrics are available for your assigned permissions.
        </p>
      )}

      {!loading &&
        !error &&
        permissions.includes("candidates.view") &&
        summary?.candidateCount === 0 && (
            <div
            className="mt-6 border-l-2 pl-4 text-sm"
            style={{
              borderColor: "var(--primary)",
              color: "var(--muted-foreground)",
            }}
          >
              <p>
                {role === "Recruitment Agent"
                  ? `Sorry, you currently have no candidates at ${companyName || "your company"}. Kindly register your candidates at our office under Inquiries.`
                  : "No candidate records are available in this company workspace yet."}
              </p>
              {role === "Recruitment Agent" && (
                <button
                  type="button"
                  onClick={() => onNavigate("candidate-inquiries")}
                  className="mt-3 rounded px-4 py-2 text-sm font-600"
                  style={{
                    background: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  Open Inquiries
                </button>
              )}
            </div>
          )}
    </div>
  )
}
