import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

const pageSize = 1000

type CandidateSummaryRow = {
  created_at: string

  details: unknown
}

type ProjectSummaryRow = {
  id: string

  project_name: string

  country: string

  contractor_name: string
}

type CompanyRoleRow = {
  id: string

  name: string
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readText(record: Record<string, unknown>, key: string) {
  const value = record[key]

  return typeof value === "string" ? value.trim() : ""
}

async function loadAll<T>(
  queryPage: (
    from: number,

    to: number,
  ) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
) {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)

    if (error) throw error

    rows.push(...(data ?? []))

    if (!data || data.length < pageSize) return rows
  }
}

function makeVisaTrend(
  candidates: CandidateSummaryRow[],

  projects: ProjectSummaryRow[],

  now: Date,
): VisaTrend {
  const monthDates = Array.from(
    { length: 12 },
    (_, index) =>
      new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1),
      ),
  )

  const months = monthDates.map((date) => {
    const key = date.toISOString().slice(0, 7)

    return {
      key,

      label: new Intl.DateTimeFormat("en", {
        month: "short",

        timeZone: "UTC",
      }).format(date),
    }
  })

  const monthIndexes = new Map(months.map((month, index) => [month.key, index]))

  const projectsById = new Map(projects.map((project) => [project.id, project]))

  const projectsByName = new Map(
    projects.map((project) => [
      project.project_name.trim().toLocaleLowerCase(),
      project,
    ]),
  )

  const countsByContractor = new Map<string, number[]>()

  for (const candidate of candidates) {
    if (!isRecord(candidate.details)) continue

    const receivedAt = readText(candidate.details, "visaReceivedAt")

    const receivedDate = new Date(receivedAt)

    if (!receivedAt || Number.isNaN(receivedDate.getTime())) continue

    const monthIndex = monthIndexes.get(receivedAt.slice(0, 7))

    if (monthIndex === undefined) continue

    const projectId =
      readText(candidate.details, "visaProjectId") ||
      readText(candidate.details, "assignedProjectId")

    const projectName =
      readText(candidate.details, "visaProjectName") ||
      readText(candidate.details, "assignedContracts")

    const project =
      projectsById.get(projectId) ||
      projectsByName.get(projectName.toLocaleLowerCase())

    const contractorName =
      project?.contractor_name.trim() || "Contractor unavailable"

    const values = countsByContractor.get(contractorName) ?? Array(12).fill(0)

    values[monthIndex] += 1

    countsByContractor.set(contractorName, values)
  }

  const sortedContractors = [...countsByContractor.entries()]

    .map(([name, values]) => ({ name, values }))

    .sort(
      (left, right) =>
        right.values.reduce((total, count) => total + count, 0) -
        left.values.reduce((total, count) => total + count, 0),
    )

  const topContractors = sortedContractors.slice(0, 5)

  const otherContractors = sortedContractors.slice(5)

  if (otherContractors.length) {
    topContractors.push({
      name: "Other contractors",

      values: months.map((_, index) =>
        otherContractors.reduce(
          (total, contractor) => total + contractor.values[index],

          0,
        ),
      ),
    })
  }

  return { months, contractors: topContractors }
}

function makeDeploymentSummary(
  candidates: CandidateSummaryRow[],

  projects: ProjectSummaryRow[],
) {
  const projectsById = new Map(projects.map((project) => [project.id, project]))

  const projectsByName = new Map(
    projects.map((project) => [
      project.project_name.trim().toLocaleLowerCase(),
      project,
    ]),
  )

  const countries = new Map<string, {
    country: string
    total: number
    contractors: Map<string, number>
  }>()

  let total = 0

  for (const candidate of candidates) {
    if (!isRecord(candidate.details)) continue

    const stage = readText(candidate.details, "stage").toLocaleLowerCase()

    const travelStatus = readText(
      candidate.details,
      "travelStatus",
    ).toLocaleLowerCase()

    if (stage !== "travelled" && travelStatus !== "travelled") continue

    total += 1

    const projectId =
      readText(candidate.details, "assignedProjectId") ||
      readText(candidate.details, "visaProjectId")

    const projectName =
      readText(candidate.details, "assignedContracts") ||
      readText(candidate.details, "visaProjectName")

    const project =
      projectsById.get(projectId) ||
      projectsByName.get(projectName.toLocaleLowerCase())

    const country = project?.country.trim() || "Country not recorded"

    const contractorName =
      project?.contractor_name.trim() || "Contractor unavailable"

    const summary = countries.get(country) ?? {
      country,

      total: 0,

      contractors: new Map<string, number>(),
    }

    summary.total += 1

    summary.contractors.set(
      contractorName,

      (summary.contractors.get(contractorName) ?? 0) + 1,
    )

    countries.set(country, summary)
  }

  return {
    total,

    countries: [...countries.values()]

      .map((country) => ({
        country: country.country,

        total: country.total,

        contractors: [...country.contractors.entries()]

          .map(([name, count]) => ({ name, count }))

          .sort((left, right) => right.count - left.count),
      }))

      .sort((left, right) => right.total - left.total),
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },

      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },

        { status: 401, headers: responseHeaders },
      )
    }

    const companyId = request.nextUrl.searchParams.get("companyId")

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required." },

        { status: 400, headers: responseHeaders },
      )
    }

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id")

      .eq("company_id", companyId)

      .eq("user_id", user.id)

      .eq("status", "active")

      .maybeSingle()

    if (membershipError) throw membershipError

    if (!membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },

        { status: 403, headers: responseHeaders },
      )
    }

    const permissions = [
      "candidates.view",

      "documents.view",

      "passport.view",

      "projects.view",

      "users.view",
    ] as const

    const permissionResults = await Promise.all(
      permissions.map((permission) =>
        supabase.rpc("current_user_has_company_permission", {
          requested_company_id: companyId,

          requested_permission: permission,
        }),
      ),
    )

    const permissionError = permissionResults.find((result) => result.error)
      ?.error

    if (permissionError) throw permissionError

    const allowed = new Map(
      permissions.map((permission, index) => [
        permission,

        Boolean(permissionResults[index].data),
      ]),
    )

    const canViewCandidates = allowed.get("candidates.view") ?? false

    const canViewProjects = allowed.get("projects.view") ?? false

    const canViewPassports = allowed.get("passport.view") ?? false

    const canViewDocuments = allowed.get("documents.view") ?? false

    const canViewUsers = allowed.get("users.view") ?? false

    const now = new Date()

    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString()

    const previousMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    ).toISOString()

    const [
      candidateRows,
      projectRows,
      passportCountResult,
      availablePassportCountResult,
      withdrawnPassportCountResult,
      documentCountResult,
      roleRows,
    ] = await Promise.all([
      canViewCandidates
        ? loadAll<CandidateSummaryRow>((from, to) =>
            supabase

              .from("candidates")

              .select("created_at, details")

              .eq("company_id", companyId)

              .order("created_at", { ascending: true })

              .order("id", { ascending: true })

              .range(from, to),
          )
        : Promise.resolve(null),

      canViewCandidates && canViewProjects
        ? loadAll<ProjectSummaryRow>((from, to) =>
            supabase

              .from("projects")

              .select("id, project_name, country, contractor_name")

              .eq("company_id", companyId)

              .order("id", { ascending: true })

              .range(from, to),
          )
        : Promise.resolve(null),

      canViewPassports
        ? supabase
            .from("candidate_passports")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
        : Promise.resolve(null),

      canViewPassports
        ? supabase
            .from("candidate_passports")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("passport_status", "available")
        : Promise.resolve(null),

      canViewPassports
        ? supabase
            .from("candidate_passports")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .eq("passport_status", "withdrawn")
        : Promise.resolve(null),

      canViewDocuments
        ? supabase

            .from("candidate_documents")

            .select("id", { count: "exact", head: true })

            .eq("company_id", companyId)
        : Promise.resolve(null),

      canViewUsers
        ? supabase

            .from("company_roles")

            .select("id, name")

            .eq("company_id", companyId)

            .order("name")
        : Promise.resolve(null),
    ])

    const passportError =
      passportCountResult?.error ??
      availablePassportCountResult?.error ??
      withdrawnPassportCountResult?.error
    if (passportError) throw passportError

    if (documentCountResult?.error) throw documentCountResult.error

    if (roleRows?.error) throw roleRows.error

    const candidates = candidateRows ?? []

    const projects = projectRows ?? []

    const deployments = makeDeploymentSummary(candidates, projects)

    const roles = (roleRows?.data ?? []) as CompanyRoleRow[]

    const agentRoleIds = roles

      .filter((role) => role.name.toLocaleLowerCase().includes("agent"))

      .map((role) => role.id)

    let agentCount: number | null = null

    if (canViewUsers) {
      if (!agentRoleIds.length) {
        agentCount = 0
      } else {
        const { count, error: agentCountError } = await supabase

          .from("company_memberships")

          .select("user_id", { count: "exact", head: true })

          .eq("company_id", companyId)

          .in("role_id", agentRoleIds)

        if (agentCountError) throw agentCountError

        agentCount = count ?? 0
      }
    }

    const passportCount = passportCountResult?.count ?? null

    const availablePassportCount =
      availablePassportCountResult?.count ?? null

    const withdrawnPassportCount =
      withdrawnPassportCountResult?.count ?? null

    const visaTrend =
      canViewCandidates && canViewProjects
        ? makeVisaTrend(candidates, projects, now)
        : null

    const currentMonthPrefix = currentMonthStart.slice(0, 7)

    const previousMonthPrefix = previousMonthStart.slice(0, 7)

    return NextResponse.json(
      {
        candidateCount: canViewCandidates ? candidates.length : null,

        newCandidateCount: canViewCandidates
          ? candidates.filter((candidate) =>
              candidate.created_at.startsWith(currentMonthPrefix),
            ).length
          : null,

        previousCandidateCount: canViewCandidates
          ? candidates.filter((candidate) =>
              candidate.created_at.startsWith(previousMonthPrefix),
            ).length
          : null,

        withdrawnCandidateCount: canViewCandidates
          ? candidates.filter((candidate) => {
              if (!isRecord(candidate.details)) return false

              return (
                readText(candidate.details, "stage").toLocaleLowerCase() ===
                  "withdrawn" ||
                readText(
                  candidate.details,
                  "travelStatus",
                ).toLocaleLowerCase() === "withdrawn"
              )
            }).length
          : null,

        cancelledCandidateCount: canViewCandidates
          ? candidates.filter((candidate) => {
              if (!isRecord(candidate.details)) return false

              const stage = readText(
                candidate.details,
                "stage",
              ).toLocaleLowerCase()

              const visaStatus = readText(
                candidate.details,
                "visaStatus",
              ).toLocaleLowerCase()
              const travelStatus = readText(
                candidate.details,
                "travelStatus",
              ).toLocaleLowerCase()
              return (
                stage === "cancelled" ||
                stage === "canceled" ||
                visaStatus === "cancelled" ||
                visaStatus === "canceled" ||
                travelStatus === "cancelled" ||
                travelStatus === "canceled"
              )
            }).length
          : null,

        deployedCandidateCount: canViewCandidates ? deployments.total : null,

        documentCount: documentCountResult?.count ?? null,

        passportCount,

        availablePassportCount,

        withdrawnPassportCount,

        agentCount,

        visaTrend,

        deploymentByCountry:
          canViewCandidates && canViewProjects ? deployments.countries : null,
      },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Workspace summary request failed", error)

    return NextResponse.json(
      { error: "Workspace data is unavailable." },

      { status: 503, headers: responseHeaders },
    )
  }
}
