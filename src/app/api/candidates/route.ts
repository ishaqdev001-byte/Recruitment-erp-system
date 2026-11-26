import { randomUUID } from "node:crypto"

import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { isUuid } from "@/lib/server/documents"

import { canViewCandidateFinance } from "@/lib/server/candidate-finance-access"

import { createSupabaseServerClient } from "@/lib/supabase/server"

import { roleAccessSettings } from "@/lib/role-access-settings"

import { ensureInterServerCandidateFolders } from "@/lib/storage/interserver"

import {
  isPassportNumberValid,
  normalizePassportNumber,
  passportNumberRule,
  passportRegistrationDuplicateMessage,
} from "@/lib/passport-number"

export const runtime = "nodejs"

const candidateDetailFields = new Set([
  "otherNames",
  "secondaryPhone",
  "otherPhone",
  "age",
  "gender",
  "maritalStatus",
  "abroadStatus",
  "abroadExperience",
  "source",
  "mediaChannel",
  "nationality",
  "referralPartnerId",
  "referralPartnerName",

  "nin",
  "passportNumber",
  "passportIssue",
  "passportExpiry",
  "passportStatus",
  "passportBranch",
  "passportStorageLocation",
  "height",
  "weight",
  "shirtSize",
  "shoeSize",
  "waistSize",
  "preferredCities",

  "physicalAddress",
  "residenceCountry",
  "residenceState",
  "district",
  "county",
  "subCounty",
  "parish",
  "fatherPhone",
  "fatherStatus",
  "motherPhone",
  "motherStatus",

  "kinFirstName",
  "kinLastName",
  "kinPhone",
  "kinRelationship",
  "emergencyFirstName",
  "emergencyLastName",
  "emergencyPhone",
  "emergencyRelationship",

  "jobOfInterest",
  "preferredCountries",
  "assignedContracts",
  "stage",
  "travelStatus",
  "visaStatus",
  "acceptance",
  "contracts",
  "contractManager",
  "branch",
  "verification",
  "photo",

  "educationQualification",
  "educationInstitution",
  "educationYearCompleted",
  "educationField",
  "lastEmployer",
  "previousJobTitle",
  "employmentFrom",
  "employmentTo",
  "employmentDuties",
  "keySkills",
  "languagesSpoken",
  "certifications",
  "recruiterNotes",
])

function createCandidateAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function readCandidateDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const details: Record<string, string | number | string[]> = {}

  for (const [key, fieldValue] of Object.entries(value)) {
    if (!candidateDetailFields.has(key)) continue

    if (
      (key === "passportIssue" || key === "passportExpiry") &&
      typeof fieldValue === "string" &&
      fieldValue &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(fieldValue) ||
        Number.isNaN(Date.parse(`${fieldValue}T00:00:00Z`)))
    )
      return null

    if (typeof fieldValue === "string" && fieldValue.length <= 4000)
      details[key] = fieldValue
    else if (
      typeof fieldValue === "number" &&
      key === "age" &&
      Number.isFinite(fieldValue) &&
      fieldValue >= 0 &&
      fieldValue <= 120
    )
      details[key] = fieldValue
    else if (
      Array.isArray(fieldValue) &&
      fieldValue.length <= 50 &&
      fieldValue.every((item) => typeof item === "string" && item.length <= 200)
    )
      details[key] = fieldValue
    else return null
  }

  return details
}

function passportSetupError(
  details: Record<string, string | number | string[]>,
  agentName: string,
) {
  const passportNumber =
    typeof details.passportNumber === "string"
      ? normalizePassportNumber(details.passportNumber)
      : ""

  if (!passportNumber) return "Enter the candidate passport number."

  const nationality =
    typeof details.nationality === "string" ? details.nationality : ""

  if (!nationality) return "Select the candidate nationality."

  if (!isPassportNumberValid(nationality, passportNumber))
    return passportNumberRule(nationality)

  if (
    details.passportStatus !== "Available" &&
    details.passportStatus !== "With Agent"
  )
    return "Choose whether the passport is available or with the assigned agent."

  if (
    details.passportStatus === "Available" &&
    (typeof details.passportBranch !== "string" ||
      !details.passportBranch.trim() ||
      typeof details.passportStorageLocation !== "string" ||
      !details.passportStorageLocation.trim())
  )
    return "Select a storage branch and location for an available passport."

  if (details.passportStatus === "With Agent" && !agentName.trim())
    return "Assign an agent when the passport is with an agent."

  return ""
}

function candidateAge(dateOfBirth: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null

  const [year, month, day] = dateOfBirth.split("-").map(Number)

  const birthDate = new Date(Date.UTC(year, month - 1, day))

  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  )
    return null

  const today = new Date()

  if (
    birthDate >
    new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    )
  )
    return null

  let age = today.getUTCFullYear() - year

  if (
    today.getUTCMonth() < month - 1 ||
    (today.getUTCMonth() === month - 1 && today.getUTCDate() < day)
  )
    age -= 1

  return age
}

/**
 * GET /api/candidates
 *
 * Fetches paginated candidates list with permission checks and metadata.
 *
 * Query Parameters:
 * - `limit` (optional): Number of records per page, default 50, max 1000
 * - `offset` (optional): Number of records to skip, default 0
 * - `cursor` (optional): For cursor-based pagination, skips offset parameter
 *
 * Response Format:
 * {
 *   candidates: [...],
 *   pagination: {
 *     total: number,
 *     limit: number,
 *     offset: number,
 *     has_next: boolean,
 *     next_cursor: string | null
 *   },
 *   agentOptions: [...],
 *   caseHandlerOptions: [...],
 *   caseHandlersEnabled: boolean,
 *   permissions: {...},
 *   warning?: string
 * }
 */
export async function GET(request: Request) {
  // Cache candidates list for 5 minutes to improve performance
  // stale-while-revalidate allows showing cached data while fetching fresh data
  const headers = {
    "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
  }

  try {
    // Parse pagination parameters from query string
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const cursor = searchParams.get("cursor")

    // Validate and parse limit (default 50, max 1000)
    let limit = 50
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 1000) {
        limit = parsedLimit
      }
    }

    // Validate and parse offset (default 0, ignored if cursor provided)
    let offset = 0
    if (!cursor && offsetParam) {
      const parsedOffset = parseInt(offsetParam, 10)
      if (!Number.isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset
      }
    }

    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })
    }

    // Get user's company membership and role

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id, role_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )
    }

    // Check if user has finance.view permission

    const [
      { data: roleData, error: roleError },
      { data: company, error: companyError },
    ] = await Promise.all([
      supabase
        .from("company_roles")
        .select("name, access_settings")
        .eq("id", membership.role_id)
        .eq("company_id", membership.company_id)
        .maybeSingle(),

      supabase
        .from("companies")
        .select("primary_admin_user_id, case_handlers_enabled")
        .eq("id", membership.company_id)
        .maybeSingle(),
    ])

    if (roleError || !roleData || companyError || !company) {
      if (roleError || companyError)
        console.error(
          "Candidate role access lookup failed",
          roleError ?? companyError,
        )

      return NextResponse.json(
        { error: "Unable to verify your company role." },
        { status: 503, headers },
      )
    }

    const [
      { data: hasFinancePermission, error: financePermissionError },

      { data: canEditCandidates, error: editPermissionError },

      { data: canRegisterCandidates, error: registerPermissionError },

      { data: canCreateCandidates, error: legacyCreatePermissionError },

      {
        data: canCreateCandidateInquiries,
        error: inquiryCreatePermissionError,
      },

      { data: canViewAgentFinance, error: agentFinancePermissionError },

      { data: canManageCandidateSources, error: sourcePermissionError },

      { data: canDeleteCandidates, error: deletePermissionError },

      { data: canUpdateCandidateStages, error: stagePermissionError },

      {
        data: canSubmitCandidatesToProjects,
        error: projectSubmissionPermissionError,
      },

      { data: canSendSms, error: smsPermissionError },

      { data: canAssignCaseHandler, error: caseHandlerPermissionError },
    ] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "finance.view",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.edit",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.register",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.create",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidate_inquiries.create",
      }),

      supabase.rpc("current_user_can_view_agent_finance", {
        requested_company_id: membership.company_id,
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.sources.manage",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.delete",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.stage",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.project_submit",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "communications.sms.send",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.case_handler.assign",
      }),
    ])

    const roleName = roleData?.name || ""
    const normalizedRoleName = roleName.trim().toLocaleLowerCase()
    const isCaseHandlerChairman =
      company.primary_admin_user_id === user.id ||
      [
        "chairman",
        "company owner / primary administrator",
      ].includes(normalizedRoleName)

    if (
      financePermissionError ||
      editPermissionError ||
      registerPermissionError ||
      legacyCreatePermissionError ||
      inquiryCreatePermissionError ||
      sourcePermissionError ||
      deletePermissionError ||
      stagePermissionError ||
      projectSubmissionPermissionError ||
      smsPermissionError ||
      (caseHandlerPermissionError && !isCaseHandlerChairman)
    ) {
      return NextResponse.json(
        { error: "Unable to verify candidate access." },
        { status: 503, headers },
      )
    }

    if (agentFinancePermissionError) {
      console.error(
        "Candidate agent-finance permission lookup failed",
        agentFinancePermissionError,
      )
    }

    const roleSettings = roleAccessSettings(roleData?.access_settings, roleName)

    const canViewActivityLogs =
      roleName.includes("Chairman") || roleName.includes("General Manager")

    const canManagePassportStatus =
      company.primary_admin_user_id === user.id ||
      [
        "chairman",
        "company owner / primary administrator",
        "general manager",
        "supervisor",
      ]

        .includes(roleName.trim().toLocaleLowerCase())

    const canViewFinance = canViewCandidateFinance(
      roleName,

      Boolean(hasFinancePermission),

      company.primary_admin_user_id === user.id,
    )

    const isAgent = roleSettings.candidate_scope === "assigned"

    const canRegister =
      Boolean(canRegisterCandidates) && roleSettings.candidate_registration

    // Build candidates query with pagination
    const selectFields =
      "id, source_row_number, branch_id, inquiry_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_id, agent_name, agent_user_id, religion, position, nationality, father_name, mother_name, details, created_at, created_by, updated_at, updated_by, case_handler_user_id"

    // Get total count for pagination metadata
    const countQuery = supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("company_id", membership.company_id)

    // Build data query with pagination
    let dataQuery = supabase
      .from("candidates")
      .select(selectFields)
      .eq("company_id", membership.company_id)
      .order("created_at", { ascending: false })

    // Apply cursor-based or offset-based pagination
    if (cursor) {
      dataQuery = dataQuery.lt("created_at", cursor).limit(limit + 1)
    } else {
      dataQuery = dataQuery.range(offset, offset + limit)
    }

    const [{ count: totalCount, error: countError }, { data, error }, { data: people, error: peopleError }] =
      await Promise.all([
        countQuery,
        dataQuery,
        supabase.rpc("list_candidate_inquiry_people", {
          requested_company_id: membership.company_id,
        }),
      ])

    if (countError) {
      console.error("Candidate count query failed", countError)
      return NextResponse.json({ error: "Unable to count candidates." }, {
        status: 503,
        headers,
      })
    }

    if (error) {
      console.error("Candidate list query failed", error)

      return NextResponse.json({ error: "Unable to load candidates." }, {
        status: 503,
        headers,
      })
    }

    if (peopleError)
      console.error("Candidate staff-name lookup failed", peopleError)

    const agentAdmin = createCandidateAdminClient()
    if (!agentAdmin) {
      return NextResponse.json(
        {
          error:
            "Agent options require SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers },
      )
    }
    const { data: rosterAgents, error: rosterAgentError } = await agentAdmin
      .from("company_recruitment_agents")
      .select("id, name")
      .eq("company_id", membership.company_id)
      .eq("status", "active")
      .order("name")
    if (rosterAgentError) {
      console.error("Candidate agent roster lookup failed", rosterAgentError)
      return NextResponse.json(
        { error: "Unable to load candidate agent options." },
        { status: 503, headers },
      )
    }

    const names = new Map(
      (people ?? []).map((person: { user_id: string; display_name: string }) => [
        person.user_id,
        person.display_name,
      ]),
    )

    const agentOptions = (rosterAgents ?? []).map((agent) => ({
      userId: agent.id,
      displayName: agent.name,
    }))

    const canAssignCaseHandlerToCandidates =
      isCaseHandlerChairman || Boolean(canAssignCaseHandler)

    let caseHandlerOptions: {
      userId: string
      displayName: string
      description: string
    }[] = []

    let caseHandlerNames = new Map<string, string>()

    if (company.case_handlers_enabled && canAssignCaseHandlerToCandidates) {
      const admin = createCandidateAdminClient()

      if (!admin) {
        return NextResponse.json(
          {
            error:
              "Case-handler assignments require SUPABASE_SERVICE_ROLE_KEY in the server environment.",
          },
          { status: 503, headers },
        )
      }

      const { data: eligibilityRows, error: eligibilityError } = await admin
        .from("company_assignment_eligibility")
        .select("user_id")
        .eq("company_id", membership.company_id)
        .eq("assignment_type", "case_handler")

      if (eligibilityError) {
        console.error(
          "Candidate case-handler eligibility lookup failed",
          eligibilityError,
        )
        return NextResponse.json(
          { error: "Unable to load case-handler options." },
          { status: 503, headers },
        )
      }

      const eligibleUserIds = new Set(
        (eligibilityRows ?? []).flatMap((entry) =>
          entry.user_id ? [entry.user_id] : [],
        ),
      )
      const activeMemberships: { user_id: string; role_id: string }[] = []
      const membershipPageSize = 1000
      let afterUserId: string | null = null

      while (true) {
        let membershipQuery = admin
          .from("company_memberships")
          .select("user_id, role_id")
          .eq("company_id", membership.company_id)
          .eq("status", "active")
          .order("user_id", { ascending: true })
          .limit(membershipPageSize)

        if (afterUserId)
          membershipQuery = membershipQuery.gt("user_id", afterUserId)

        const { data: membershipPage, error: activeMembershipError } =
          await membershipQuery

        if (activeMembershipError) {
          console.error(
            "Candidate case-handler membership lookup failed",
            activeMembershipError,
          )

          return NextResponse.json(
            { error: "Unable to load case-handler options." },
            { status: 503, headers },
          )
        }

        const page = membershipPage ?? []
        activeMemberships.push(
          ...page.filter((item) => eligibleUserIds.has(item.user_id)),
        )

        if (page.length < membershipPageSize) break
        afterUserId = page[page.length - 1].user_id
      }

      const candidateHandlerIds = [
        ...new Set(
          (data ?? [])

            .map((candidate) => candidate.case_handler_user_id)

            .filter((userId): userId is string => Boolean(userId)),
        ),
      ]

      const profileIds = [
        ...new Set([
          ...activeMemberships.map((item) => item.user_id),
          ...candidateHandlerIds,
        ]),
      ]
      const profileRows: { id: string; display_name: string | null }[] = []
      const profileBatchSize = 500

      for (let offset = 0; offset < profileIds.length; offset += profileBatchSize) {
        const { data: profiles, error: profileError } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds.slice(offset, offset + profileBatchSize))

        if (profileError) {
          console.error(
            "Candidate case-handler profile lookup failed",
            profileError,
          )

          return NextResponse.json(
            { error: "Unable to load case-handler options." },
            { status: 503, headers },
          )
        }

        profileRows.push(...(profiles ?? []))
      }

      caseHandlerNames = new Map(
        profileRows.map((profile) => [
          profile.id,
          profile.display_name || `Member ${profile.id.slice(0, 8)}`,
        ]),
      )

      const roleIds = [...new Set(activeMemberships.map((item) => item.role_id))]
      const roleNames = new Map<string, string>()

      if (roleIds.length) {
        const { data: roles, error: roleLookupError } = await admin
          .from("company_roles")
          .select("id, name")
          .eq("company_id", membership.company_id)
          .in("id", roleIds)

        if (roleLookupError) {
          console.error(
            "Candidate case-handler role lookup failed",
            roleLookupError,
          )

          return NextResponse.json(
            { error: "Unable to load case-handler options." },
            { status: 503, headers },
          )
        }

        for (const role of roles ?? []) roleNames.set(role.id, role.name)
      }

      caseHandlerOptions = activeMemberships
        .map((item) => ({
          userId: item.user_id,
          displayName:
            caseHandlerNames.get(item.user_id) ??
            `Member ${item.user_id.slice(0, 8)}`,
          description: `${roleNames.get(item.role_id) ?? "Company member"} · ${item.user_id.slice(0, 8)}`,
        }))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName),
        )
    }

    // Calculate pagination metadata
    let paginatedData = data ?? []
    let hasNextPage = false
    let nextCursor: string | null = null

    if (cursor) {
      // For cursor-based pagination, we fetched limit + 1 to check if there are more
      if (paginatedData.length > limit) {
        hasNextPage = true
        paginatedData = paginatedData.slice(0, limit)
        // Next cursor is the created_at of the last item in current page
        const lastItem = paginatedData[paginatedData.length - 1]
        if (lastItem?.created_at) {
          nextCursor = lastItem.created_at
        }
      }
    } else {
      // For offset-based pagination, check if there are more records
      hasNextPage = (totalCount ?? 0) > offset + limit
    }

    return NextResponse.json(
      {
        candidates: paginatedData.map((candidate) => ({
          ...candidate,

          created_by_name: candidate.created_by
            ? (names.get(candidate.created_by) ?? "Former team member")
            : null,

          updated_by_name: candidate.updated_by
            ? (names.get(candidate.updated_by) ?? "Former team member")
            : null,

          case_handler_name: candidate.case_handler_user_id
            ? (caseHandlerNames.get(candidate.case_handler_user_id) ??
              names.get(candidate.case_handler_user_id) ??
              "Former team member")
            : null,
        })),

        pagination: {
          total: totalCount ?? 0,
          limit,
          offset: cursor ? undefined : offset,
          has_next: hasNextPage,
          next_cursor: nextCursor,
        },

        agentOptions,

        caseHandlerOptions,

        caseHandlersEnabled: Boolean(company.case_handlers_enabled),

        ...(peopleError
          ? {
              warning:
                "Some candidate creator and updater names are unavailable.",
            }
          : {}),

        permissions: {
          canViewFinance: Boolean(canViewFinance),

          canViewAgentFinance: Boolean(
            canViewAgentFinance && !agentFinancePermissionError,
          ),

          canViewActivityLogs,

          canEditCandidates: Boolean(canEditCandidates),

          canDeleteCandidates: Boolean(canDeleteCandidates),

          canUpdateCandidateStages: Boolean(canUpdateCandidateStages),

          canSubmitCandidatesToProjects: Boolean(canSubmitCandidatesToProjects),

          canRegisterCandidates:
            (Boolean(canRegisterCandidates) || Boolean(canCreateCandidates)) &&
            canRegister,

          canCreateInquiries:
            Boolean(canCreateCandidateInquiries) ||
            Boolean(canCreateCandidates),

          canManageCandidateSources: Boolean(canManageCandidateSources),

          canManagePassportStatus,

          canSendBulkSms:
            Boolean(canSendSms) &&
            roleName.trim().toLocaleLowerCase() !== "recruitment agent",

          canAssignCaseHandler:
            Boolean(company.case_handlers_enabled) &&
            canAssignCaseHandlerToCandidates,

          isAgent,
        },
      },
      { headers },
    )
  } catch (error) {
    console.error("Candidate list request failed", error)

    return NextResponse.json({ error: "Candidate data is unavailable." }, {
      status: 503,
      headers,
    })
  }
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }

  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user)
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body)
      return NextResponse.json(
        { error: "Candidate information is required." },
        { status: 400, headers },
      )

    if (
      "file_number" in body ||
      (body.fileNumber !== undefined &&
        (typeof body.fileNumber !== "string" || body.fileNumber.trim()))
    ) {
      return NextResponse.json(
        {
          error:
            "File numbers are assigned automatically and cannot be supplied.",
        },
        { status: 400, headers },
      )
    }

    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : ""

    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : ""

    const phone = typeof body.phone === "string" ? body.phone.trim() : ""

    if (
      !firstName ||
      firstName.length > 200 ||
      !lastName ||
      lastName.length > 200 ||
      !phone ||
      phone.length > 100
    ) {
      return NextResponse.json(
        { error: "First name, last name, and phone are required." },
        { status: 400, headers },
      )
    }

    const details = readCandidateDetails(body.details)

    if (!details)
      return NextResponse.json(
        { error: "One or more extended candidate details are invalid." },
        { status: 400, headers },
      )

    const inquiryId =
      body.inquiryId === undefined ||
      body.inquiryId === null ||
      body.inquiryId === ""
        ? null
        : typeof body.inquiryId === "string" && isUuid(body.inquiryId)
          ? body.inquiryId
          : false

    if (inquiryId === false)
      return NextResponse.json({ error: "The candidate inquiry is invalid." }, {
        status: 400,
        headers,
      })

    details.stage = "Registration"

    details.assignedContracts = ""

    details.contracts = ""

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id, branch_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership)
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )

    const [
      { data: canRegister, error: registerPermissionError },

      { data: canCreate, error: legacyCreatePermissionError },

      { data: registrationSetting, error: registrationSettingError },

      { data: candidateScope, error: scopeError },
    ] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.register",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.create",
      }),

      supabase.rpc("current_user_role_setting", {
        requested_company_id: membership.company_id,

        requested_setting: "candidate_registration",

        fallback_value: "true",
      }),

      supabase.rpc("current_user_role_setting", {
        requested_company_id: membership.company_id,

        requested_setting: "candidate_scope",

        fallback_value: "company",
      }),
    ])

    if (
      registerPermissionError ||
      legacyCreatePermissionError ||
      registrationSettingError ||
      scopeError
    ) {
      return NextResponse.json(
        { error: "Unable to verify candidate registration access." },
        { status: 503, headers },
      )
    }

    if (!(canRegister || canCreate) || registrationSetting !== "true") {
      return NextResponse.json(
        { error: "You do not have permission to register candidates." },
        { status: 403, headers },
      )
    }

    const passportNumber =
      typeof details.passportNumber === "string"
        ? normalizePassportNumber(details.passportNumber)
        : ""

    if (passportNumber) details.passportNumber = passportNumber

    let passportCheck: {
      is_registered: boolean

      registered_in_another_company: boolean

      registered_last_name: string | null

      registered_agent_name: string | null

      belongs_to_another_agent: boolean
    }[] = []

    if (passportNumber) {
      const { data, error: passportCheckError } = await supabase.rpc(
        "lookup_candidate_passport_registration",

        {
          requested_passport_number: passportNumber,

          requested_exclude_inquiry_id: inquiryId,
        },
      )

      if (passportCheckError || !data?.length) {
        console.error(
          "Candidate passport duplicate check failed",
          passportCheckError,
        )

        return NextResponse.json(
          { error: "Unable to validate this passport number." },
          { status: 503, headers },
        )
      }

      passportCheck = data

      if (passportCheck[0].is_registered) {
        return NextResponse.json(
          {
            error: passportRegistrationDuplicateMessage(passportCheck[0]),
          },
          { status: 409, headers },
        )
      }
    }

    const source =
      typeof details.source === "string" ? details.source.trim() : ""

    const sourceType = source.toLocaleLowerCase()

    if (candidateScope !== "assigned" && !source) {
      return NextResponse.json(
        { error: "Select a candidate source before registering." },
        { status: 400, headers },
      )
    }

    if (source) {
      const { data: sourceOption, error: sourceError } = await supabase

        .from("candidate_source_options")

        .select("id")

        .eq("company_id", membership.company_id)

        .eq("source", source)

        .maybeSingle()

      if (sourceError) {
        console.error("Candidate source validation failed", sourceError)

        return NextResponse.json(
          { error: "Unable to verify the selected candidate source." },
          { status: 503, headers },
        )
      }

      if (!sourceOption) {
        return NextResponse.json(
          { error: "Select a source configured for this company." },
          { status: 400, headers },
        )
      }
    }

    let inquiryAgentId: string | null = null
    let inquiryAgentUserId: string | null = null

    let inquiryCreatedBy: string | null = null

    if (inquiryId) {
      const { data: inquiry, error: inquiryError } = await supabase
        .from("candidate_inquiries")

        .select(
          "id, agent_id, agent_user_id, created_by, first_name, last_name, phone",
        )

        .eq("id", inquiryId)
        .eq("company_id", membership.company_id)
        .eq("status", "inquiry")
        .maybeSingle()

      if (inquiryError || !inquiry)
        return NextResponse.json(
          { error: "This inquiry is no longer open for registration." },
          { status: 409, headers },
        )

      if (
        inquiry.first_name.trim().toLocaleLowerCase() !==
          firstName.toLocaleLowerCase() ||
        inquiry.last_name.trim().toLocaleLowerCase() !==
          lastName.toLocaleLowerCase() ||
        inquiry.phone.replace(/\s+/g, "") !== phone.replace(/\s+/g, "")
      ) {
        return NextResponse.json(
          {
            error:
              "The candidate's name and phone must match the selected inquiry.",
          },
          { status: 400, headers },
        )
      }

      inquiryAgentId = inquiry.agent_id
      inquiryAgentUserId = inquiry.agent_user_id

      inquiryCreatedBy = inquiry.created_by
    }

    const isPartnerSource = sourceType === "partner"

    const requestedAgentUserId = isPartnerSource
      ? null
      : typeof body.agentId === "string" && body.agentId
        ? body.agentId
        : typeof body.agentUserId === "string" && body.agentUserId
          ? body.agentUserId
          : null

    if (requestedAgentUserId && !isUuid(requestedAgentUserId)) {
      return NextResponse.json({ error: "The assigned agent is invalid." }, {
        status: 400,
        headers,
      })
    }

    const agentAdmin = createCandidateAdminClient()
    if (!agentAdmin) {
      return NextResponse.json(
        {
          error:
            "Agent assignment requires SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers },
      )
    }
    const { data: agents, error: agentError } = await agentAdmin
      .from("company_recruitment_agents")
      .select("id, name, linked_user_id")
      .eq("company_id", membership.company_id)
      .eq("status", "active")
    if (agentError) {
      console.error("Candidate agent lookup failed", agentError)
      return NextResponse.json(
        { error: "Unable to verify the assigned agent." },
        { status: 503, headers },
      )
    }

    const requestedAgentName = isPartnerSource
      ? ""
      : typeof body.agent === "string"
        ? body.agent.trim()
        : ""

    let assignedAgent = isPartnerSource
      ? undefined
      : requestedAgentUserId
        ? agents.find(
            (person) =>
              person.id === requestedAgentUserId ||
              person.linked_user_id === requestedAgentUserId,
          )
        : agents.find(
            (person) =>
              person.name.trim().toLocaleLowerCase() ===
              requestedAgentName.toLocaleLowerCase(),
          )

    if (requestedAgentUserId && !assignedAgent) {
      return NextResponse.json(
        { error: "Select an active agent in this company." },
        { status: 400, headers },
      )
    }

    if (candidateScope === "assigned" && !isPartnerSource) {
      const ownAgent = agents.find(
        (person) => person.linked_user_id === user.id,
      )
      if (requestedAgentUserId && assignedAgent?.id !== ownAgent?.id) {
        return NextResponse.json(
          {
            error: "You can only assign candidates to your own agent account.",
          },
          { status: 403, headers },
        )
      }

      assignedAgent = ownAgent
    } else if (
      !isPartnerSource &&
      !assignedAgent &&
      (inquiryAgentId || inquiryAgentUserId)
    ) {
      assignedAgent = agents.find(
        (person) =>
          person.id === inquiryAgentId ||
          person.linked_user_id === inquiryAgentUserId,
      )
    } else if (
      !isPartnerSource &&
      !assignedAgent &&
      inquiryCreatedBy === user.id
    ) {
      assignedAgent = agents.find((person) => person.linked_user_id === user.id)
    }

    if (requestedAgentName && !assignedAgent && candidateScope !== "assigned") {
      return NextResponse.json(
        { error: "Choose an active agent from the company roster." },
        { status: 400, headers },
      )
    }

    const agentId = isPartnerSource ? null : assignedAgent?.id ?? null
    const agentUserId = isPartnerSource
      ? null
      : assignedAgent?.linked_user_id ?? null

    let agentName = isPartnerSource
      ? ""
      : assignedAgent?.name ?? requestedAgentName

    if (sourceType === "recruitment agent" && !assignedAgent) {
      return NextResponse.json(
        {
          error:
            "Select an active company Recruitment Agent for this referral.",
        },
        { status: 400, headers },
      )
    }

    const branchId =
      typeof body.branchId === "string" && isUuid(body.branchId)
        ? body.branchId
        : ""

    if (!branchId)
      return NextResponse.json({ error: "Select an active company branch." }, {
        status: 400,
        headers,
      })

    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Candidate branch verification is not configured on the server.",
        },
        { status: 503, headers },
      )
    }

    const admin = createClient(serviceUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: selectedBranch, error: branchError } = await admin
      .from("company_branches")

      .select("id, name")

      .eq("id", branchId)

      .eq("company_id", membership.company_id)

      .eq("status", "active")

      .maybeSingle()

    if (branchError || !selectedBranch) {
      if (branchError)
        console.error("Candidate branch validation failed", branchError)

      return NextResponse.json(
        { error: "Select an active branch registered by this company." },
        { status: 400, headers },
      )
    }

    details.branch = selectedBranch.name

    if (sourceType === "partner") {
      const referralPartnerId =
        typeof details.referralPartnerId === "string"
          ? details.referralPartnerId.trim()
          : ""

      if (!isUuid(referralPartnerId)) {
        return NextResponse.json(
          { error: "Select a registered partner for this referral." },
          { status: 400, headers },
        )
      }

      const { data: partner, error: partnerError } = await admin
        .from("suppliers")

        .select("id, supplier_name")

        .eq("id", referralPartnerId)

        .eq("company_id", membership.company_id)

        .eq("status", "active")

        .maybeSingle()

      if (partnerError) {
        console.error(
          "Candidate referral partner validation failed",
          partnerError,
        )

        return NextResponse.json(
          { error: "Unable to verify the selected referral partner." },
          { status: 503, headers },
        )
      }

      if (!partner) {
        return NextResponse.json(
          { error: "Select an active partner registered by this company." },
          { status: 400, headers },
        )
      }

      details.referralPartnerId = partner.id

      details.referralPartnerName = partner.supplier_name

      agentName = partner.supplier_name
    } else {
      details.referralPartnerId = ""

      details.referralPartnerName = ""
    }

    const passportError = passportSetupError(details, agentName)

    if (passportError)
      return NextResponse.json({ error: passportError }, {
        status: 400,
        headers,
      })

    if (
      details.passportStatus === "Available" &&
      details.passportBranch !== selectedBranch.name
    ) {
      return NextResponse.json(
        {
          error:
            "Passport storage branch must be selected from this company's active branches.",
        },
        { status: 400, headers },
      )
    }

    const dateOfBirth =
      typeof body.dob === "string" && body.dob ? body.dob : null

    const age = dateOfBirth ? candidateAge(dateOfBirth) : null

    if (dateOfBirth && age === null) {
      return NextResponse.json({ error: "Date of birth is invalid." }, {
        status: 400,
        headers,
      })
    }

    details.age = age ?? 0

    const candidateId = randomUUID()

    try {
      await ensureInterServerCandidateFolders(
        membership.company_id,
        candidateId,
        `${firstName} ${lastName}`,
      )
    } catch (error) {
      console.error("Candidate InterServer folder could not be created", error)

      return NextResponse.json(
        {
          error:
            "Unable to create the candidate folder in InterServer. Check the FTP connection and remote base path.",
        },
        { status: 503, headers },
      )
    }

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        id: candidateId,

        company_id: membership.company_id,

        branch_id: branchId,

        created_by: user.id,

        inquiry_id: inquiryId,

        file_number: "",

        first_name: firstName,

        last_name: lastName,

        phone,

        date_of_birth: dateOfBirth,

        place_of_birth:
          typeof body.placeOfBirth === "string" ? body.placeOfBirth.trim() : "",

        agent_name: agentName,

        agent_id: agentId,

        agent_user_id: agentUserId,

        religion: typeof body.religion === "string" ? body.religion.trim() : "",

        position: Array.isArray(body.jobOfInterest)
          ? body.jobOfInterest.join(", ")
          : "",

        nationality:
          typeof body.nationality === "string" ? body.nationality.trim() : "",

        father_name:
          typeof body.fatherName === "string" ? body.fatherName.trim() : "",

        mother_name:
          typeof body.motherName === "string" ? body.motherName.trim() : "",

        details,
      })
      .select(
        "id, source_row_number, inquiry_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_id, agent_name, agent_user_id, religion, position, nationality, father_name, mother_name, details, created_at, created_by, updated_at, updated_by",
      )
      .single()

    if (error || !data) {
      console.error("Candidate registration failed", error)

      const duplicateError =
        `${error?.message ?? ""} ${error?.details ?? ""}`.toLocaleLowerCase()

      if (duplicateError.includes("daily candidate number limit")) {
        return NextResponse.json(
          {
            error:
              "This company has reached today's generated candidate number limit. Try again tomorrow.",
          },
          { status: 409, headers },
        )
      }

      const duplicateFileNumber =
        error?.code === "23505" && duplicateError.includes("file_number")

      if (duplicateFileNumber) {
        return NextResponse.json(
          {
            error: "That file number is already assigned to another candidate.",
          },
          { status: 409, headers },
        )
      }

      const duplicatePassport =
        error?.code === "23505" &&
        (duplicateError.includes("passport") ||
          duplicateError.includes("company_passport_number_unique"))

      if (duplicatePassport) {
        const { data: passportCheck, error: passportCheckError } =
          await supabase.rpc(
            "lookup_candidate_passport_registration",

            {
              requested_passport_number: passportNumber,

              requested_exclude_inquiry_id: inquiryId,
            },
          )

        if (passportCheckError || !passportCheck?.[0]?.is_registered) {
          console.error(
            "Candidate passport owner lookup failed",
            passportCheckError,
          )

          return NextResponse.json(
            {
              error:
                "This passport number is already registered, but its registrar could not be verified. Please try again.",
            },
            { status: 503, headers },
          )
        }

        return NextResponse.json(
          {
            error: passportRegistrationDuplicateMessage(passportCheck[0]),
          },
          { status: 409, headers },
        )
      }

      return NextResponse.json(
        {
          error:
            error?.code === "23505"
              ? "A conflicting candidate record already exists."
              : "Unable to register this candidate. Check your create permission.",
        },
        { status: error?.code === "23505" ? 409 : 403, headers },
      )
    }

    const { data: people, error: peopleError } = await supabase.rpc(
      "list_candidate_inquiry_people",
      { requested_company_id: membership.company_id },
    )
    if (peopleError)
      console.error("Candidate creator-name lookup failed", peopleError)

    const actorNames = new Map(
      (people ?? []).map((person: { user_id: string; display_name: string }) => [
        person.user_id,
        person.display_name,
      ]),
    )

    return NextResponse.json(
      {
        candidate: {
          ...data,

          created_by_name: data.created_by
            ? (actorNames.get(data.created_by) ?? "Former team member")
            : null,

          updated_by_name: data.updated_by
            ? (actorNames.get(data.updated_by) ?? "Former team member")
            : null,
        },

        ...(passportCheck[0]?.registered_in_another_company
          ? {
              warning:
                "This passport number is already registered in another company, but the candidate was saved.",
            }
          : {}),
      },
      { status: 201, headers },
    )
  } catch (error) {
    console.error("Candidate registration request failed", error)

    return NextResponse.json(
      { error: "Candidate registration is unavailable." },
      { status: 503, headers },
    )
  }
}
