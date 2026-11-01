import { useEffect, useState } from "react"

import {
  Ban,
  FileCheck2,
  FileText,
  LockKeyhole,
  Plane,
  UsersRound,
  UserRoundX,
} from "lucide-react"

import type { View, WorkspaceRole } from "../App"

type VisaTrend = {
  months: {
    key: string
    label: string
  }[]
  contractors: {
    name: string
    values: number[]
  }[]
}

type DeploymentCountry = {
  country: string

  total: number

  contractors: {
    name: string
    count: number
  }[]
}

interface WorkspaceSummary {
  candidateCount: number | null

  newCandidateCount: number | null

  previousCandidateCount: number | null

  withdrawnCandidateCount: number | null

  cancelledCandidateCount: number | null

  deployedCandidateCount: number | null

  documentCount: number | null

  passportCount: number | null

  availablePassportCount: number | null

  withdrawnPassportCount: number | null

  agentCount: number | null

  visaTrend: VisaTrend | null

  deploymentByCountry: DeploymentCountry[] | null
}

const chartColors = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
]

function TrendChart({ trend }: { trend: VisaTrend }) {
  const width = 840

  const height = 300

  const left = 48

  const right = 18

  const top = 20

  const bottom = 48

  const plotWidth = width - left - right

  const plotHeight = height - top - bottom

  const maximum = Math.max(
    1,

    ...trend.contractors.flatMap((contractor) => contractor.values),
  )

  const hasData = trend.contractors.some((contractor) =>
    contractor.values.some((value) => value > 0),
  )

  const xFor = (index: number) =>
    left +
    (trend.months.length <= 1
      ? plotWidth / 2
      : (index / (trend.months.length - 1)) * plotWidth)

  const yFor = (value: number) =>
    top + plotHeight - (value / maximum) * plotHeight

  if (!hasData) {
    return (
      <p
        className="py-16 text-center text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        No visa receipts have been recorded in the last 12 months.
      </p>
    )
  }

  return (
    <div>
      <svg
        role="img"
        aria-label="Monthly new visas by contractor for the last 12 months"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = Math.round(maximum * fraction)

          const y = yFor(value)

          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray={fraction === 0 ? undefined : "4 5"}
              />
              <text
                x={left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {value.toLocaleString()}
              </text>
            </g>
          )
        })}
        {trend.months.map((month, index) => (
          <text
            key={month.key}
            x={xFor(index)}
            y={height - 17}
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            {month.label}
          </text>
        ))}
        {trend.contractors.map((contractor, contractorIndex) => {
          const color = chartColors[contractorIndex % chartColors.length]

          const points = contractor.values

            .map((value, index) => `${xFor(index)},${yFor(value)}`)

            .join(" ")

          return (
            <g key={contractor.name}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {contractor.values.map((value, index) => (
                <circle
                  key={`${contractor.name}-${trend.months[index]?.key ?? index}`}
                  cx={xFor(index)}
                  cy={yFor(value)}
                  r="3"
                  fill={color}
                />
              ))}
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {trend.contractors.map((contractor, index) => (
          <span
            key={contractor.name}
            className="inline-flex items-center gap-2 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: chartColors[index % chartColors.length] }}
              aria-hidden="true"
            />
            {contractor.name}
          </span>
        ))}
      </div>
    </div>
  )
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

    const controller = new AbortController()

    setSummary(null)

    setLoading(true)

    setError("")

    fetch(`/api/workspace/summary?companyId=${encodeURIComponent(companyId)}`, {
      cache: "no-store",

      signal: controller.signal,
    })

      .then(async (response) => {
        const payload = await response.json()

        if (!response.ok)
          throw new Error(payload.error || "Unable to load workspace data.")

        if (!cancelled) setSummary(payload as WorkspaceSummary)
      })

      .catch((requestError: unknown) => {
        if (
          !cancelled &&
          !(
            requestError instanceof DOMException &&
            requestError.name === "AbortError"
          )
        ) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load workspace data.",
          )
        }
      })

      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true

      controller.abort()
    }
  }, [companyId, permissions])

  const metrics = [
    {
      label: "Total candidates",

      value: summary?.candidateCount,

      icon: UsersRound,

      color: "#2563eb",

      permission: "candidates.view",

      view: "candidates" as const,
    },

    {
      label: "New candidates · this month",

      value: summary?.newCandidateCount,

      icon: UsersRound,

      color: "#0f766e",

      permission: "candidates.view",

      view: "candidates" as const,
    },

    {
      label: "Previous month",

      value: summary?.previousCandidateCount,

      icon: UsersRound,

      color: "#64748b",

      permission: "candidates.view",

      view: "candidates" as const,
    },

    {
      label: "Withdrawn candidates",

      value: summary?.withdrawnCandidateCount,

      icon: UserRoundX,

      color: "#dc2626",

      permission: "candidates.view",

      view: "candidates" as const,
    },

    {
      label: "Cancelled candidates",

      value: summary?.cancelledCandidateCount,

      icon: Ban,

      color: "#b45309",

      permission: "candidates.view",

      view: "candidates" as const,
    },

    {
      label: "Deployed candidates",

      value: summary?.deployedCandidateCount,

      icon: Plane,

      color: "#059669",

      permission: "candidates.view",

      view: "candidates" as const,
    },

    {
      label: "Available passports",

      value: summary?.availablePassportCount,

      icon: LockKeyhole,

      color: "#7c3aed",

      permission: "passport.view",

      view: "passport" as const,
    },

    {
      label: "Withdrawn passports",

      value: summary?.withdrawnPassportCount,

      icon: LockKeyhole,

      color: "#c2410c",

      permission: "passport.view",

      view: "passport" as const,
    },

    {
      label: "Total passport records",

      value: summary?.passportCount,

      icon: FileCheck2,

      color: "#b45309",

      permission: "passport.view",

      view: "passport" as const,
    },

    {
      label: "Total agents",
      value: summary?.agentCount,

      icon: UsersRound,

      color: "#4f46e5",

      permission: "users.view",

      view: "users" as const,
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
  ].filter((metric) => permissions.includes(metric.permission))

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
      <header className="mb-7">
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
          Company-wide recruitment activity, filtered by your role permissions.
          Candidate registrations compare this month with the previous month.
        </p>
      </header>

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon, color, view }) => {
            const content = (
              <>
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center"
                  style={{ color, background: `${color}18` }}
                >
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="min-w-0">
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
              </>
            )

            return view ? (
              <button
                key={label}
                type="button"
                onClick={() => onNavigate(view)}
                className="flex min-h-24 items-center gap-4 border p-4 text-left transition-colors hover:bg-[var(--secondary)]"
                style={{
                  borderColor: "var(--border)",

                  background: "var(--card)",
                }}
              >
                {content}
              </button>
            ) : (
              <section
                key={label}
                className="flex min-h-24 items-center gap-4 border p-4"
                style={{
                  borderColor: "var(--border)",

                  background: "var(--card)",
                }}
              >
                {content}
              </section>
            )
          })}
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

      {!loading && !error && summary?.visaTrend && (
        <section
          className="mt-6 border p-4 sm:p-6"
          aria-labelledby="visa-trend-title"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <div className="mb-4">
            <h2
              id="visa-trend-title"
              className="text-base font-700"
              style={{ color: "var(--foreground)" }}
            >
              New visas by contractor
            </h2>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Monthly visa receipts over the last 12 months. Only recorded visa
              receipt dates are included.
            </p>
          </div>
          <TrendChart trend={summary.visaTrend} />
        </section>
      )}

      {!loading &&
        !error &&
        summary?.deploymentByCountry &&
        permissions.includes("projects.view") && (
          <section
            className="mt-6 border"
            aria-labelledby="deployment-country-title"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div
              className="border-b px-4 py-4 sm:px-6"
              style={{ borderColor: "var(--border)" }}
            >
              <h2
                id="deployment-country-title"
                className="text-base font-700"
                style={{ color: "var(--foreground)" }}
              >
                Deployed candidates by country
              </h2>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Counts are grouped by their assigned project and contractor.
              </p>
            </div>
            {summary.deploymentByCountry.length ? (
              <div className="max-h-96 overflow-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead
                    className="sticky top-0"
                    style={{ background: "var(--secondary)" }}
                  >
                    <tr style={{ color: "var(--muted-foreground)" }}>
                      <th className="px-4 py-3 font-600 sm:px-6">Country</th>
                      <th className="px-4 py-3 font-600 sm:px-6">
                        Contractors
                      </th>
                      <th className="px-4 py-3 text-right font-600 sm:px-6">
                        Deployed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.deploymentByCountry.map((country) => (
                      <tr
                        key={country.country}
                        className="border-t"
                        style={{
                          borderColor: "var(--border)",

                          color: "var(--foreground)",
                        }}
                      >
                        <th className="px-4 py-3 font-600 sm:px-6">
                          {country.country}
                        </th>
                        <td className="px-4 py-3 sm:px-6">
                          <div className="flex flex-wrap gap-2">
                            {country.contractors.map((contractor) => (
                              <span
                                key={contractor.name}
                                className="inline-flex items-center gap-1 border px-2 py-1 text-xs"
                                style={{
                                  borderColor: "var(--border)",

                                  color: "var(--muted-foreground)",
                                }}
                              >
                                {contractor.name}
                                <span className="mono">
                                  ({contractor.count})
                                </span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="mono px-4 py-3 text-right font-700 sm:px-6">
                          {country.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p
                className="px-4 py-10 text-center text-sm sm:px-6"
                style={{ color: "var(--muted-foreground)" }}
              >
                No deployed candidates have been recorded yet.
              </p>
            )}
          </section>
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
