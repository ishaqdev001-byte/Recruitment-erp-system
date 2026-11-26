import "server-only"

import { createClient } from "@supabase/supabase-js"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export type ProjectPermission = "projects.view" | "projects.view_full" | "projects.create" | "projects.edit" | "projects.delete" | "projects.status" | "projects.assign"

export type ProjectSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type ProjectAccess = {
  supabase: ProjectSupabase
  companyId: string
  userId: string
  branchId: string | null
} | { error: string; status: 401 | 403 }

export type ProjectAccount = {
  id: string
  name: string
  branch_id: string | null
}

export type ProjectHandlerOption = {
  id: string

  name: string

  position: string
}

export type ProjectStaffOption = {
  id: string
  name: string
  position: string
  status: string
}

export type ProjectContractorOption = {
  id: string
  company_name: string
}

export type ProjectPartnerOption = {
  id: string
  supplier_name: string
}

export type ProjectAssignmentContext = {
  isChairman: boolean

  assistantStaffEnabled: boolean

  handlers: ProjectHandlerOption[]

  staffHandlers: ProjectHandlerOption[]

  staff: ProjectStaffOption[]
}

export type ProjectHandlerAssignment = {
  project_manager_user_id: string | null
  project_handler_staff_id: string | null
}

export function resolveProjectHandlerSelection(
  value: unknown,
  context: ProjectAssignmentContext,
): ProjectHandlerAssignment | null {
  if (value === null || value === "") {
    return {
      project_manager_user_id: null,
      project_handler_staff_id: null,
    }
  }

  if (typeof value !== "string") return null

  const separator = value.indexOf(":")
  const kind = separator === -1 ? "member" : value.slice(0, separator)
  const id = separator === -1 ? value : value.slice(separator + 1)

  if (!id) return null

  if (
    kind === "member" &&
    context.handlers.some((handler) => handler.id === id)
  ) {
    return {
      project_manager_user_id: id,
      project_handler_staff_id: null,
    }
  }

  if (
    kind === "staff" &&
    context.staffHandlers.some((staff) => staff.id === id)
  ) {
    return {
      project_manager_user_id: null,
      project_handler_staff_id: id,
    }
  }

  return null
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function listProjectCounterpartyCounts(companyId: string) {
  const admin = createAdminClient()

  if (!admin)
    throw new Error(
      "Project counterparty counts require the server service-role configuration.",
    )

  const contractorCounts = new Map<string, number>()
  const partnerCounts = new Map<string, number>()
  const pageSize = 1000
  let afterProjectId: string | null = null

  while (true) {
    let query = admin
      .from("projects")
      .select("id, contractor_id, partner_id")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .limit(pageSize)

    if (afterProjectId) query = query.gt("id", afterProjectId)

    const { data, error } = await query

    if (error) {
      console.error("Project counterparty count query failed", error)
      throw error
    }

    const projects = data ?? []

    for (const project of projects) {
      if (project.contractor_id) {
        contractorCounts.set(
          project.contractor_id,
          (contractorCounts.get(project.contractor_id) ?? 0) + 1,
        )
      }

      if (project.partner_id) {
        partnerCounts.set(
          project.partner_id,
          (partnerCounts.get(project.partner_id) ?? 0) + 1,
        )
      }
    }

    if (projects.length < pageSize) break
    afterProjectId = projects[projects.length - 1].id
  }

  return { contractorCounts, partnerCounts }
}

export async function getProjectAccess(): Promise<ProjectAccess> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id, branch_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError) throw membershipError

  if (!membership)
    return { error: "Active company membership not found.", status: 403 }

  return {
    supabase,

    companyId: membership.company_id,

    userId: user.id,

    branchId: membership.branch_id,
  }
}

export async function hasProjectPermission(
  access: ProjectAccess,
  permission: ProjectPermission,
) {
  if ("error" in access) return false

  const { data, error } = await access.supabase.rpc(
    "current_user_has_company_permission",
    {
      requested_company_id: access.companyId,

      requested_permission: permission,
    },
  )

  if (error) throw error

  return Boolean(data)
}

export async function listProjectAccounts(
  access: ProjectAccess,
): Promise<ProjectAccount[]> {
  if ("error" in access) throw new Error(access.error)

  const admin = createAdminClient()

  if (!admin)
    throw new Error(
      "Project account selection requires the server service-role configuration.",
    )

  const { data: isMainBranch, error: branchError } = await access.supabase.rpc(
    "current_user_is_main_branch_user",

    { requested_company_id: access.companyId },
  )

  if (branchError) throw branchError

  if (!isMainBranch && !access.branchId) {
    throw new Error(
      "Unable to verify the user's company branch for project account selection.",
    )
  }

  let query = admin

    .from("company_accounts")

    .select("id, name, branch_id")

    .eq("company_id", access.companyId)

    .eq("status", "active")

    .order("name")

  if (!isMainBranch) query = query.eq("branch_id", access.branchId!)

  const { data, error } = await query

  if (error) throw error

  return data ?? []
}

export async function listProjectCounterparties(access: ProjectAccess) {
  if ("error" in access) throw new Error(access.error)

  const admin = createAdminClient()

  if (!admin)
    throw new Error(
      "Project source selection requires the server service-role configuration.",
    )

  const [
    { data: contractors, error: contractorError },
    { data: partners, error: partnerError },
  ] = await Promise.all([
    admin
      .from("employers")
      .select("id, company_name")
      .eq("company_id", access.companyId)
      .order("company_name"),
    admin
      .from("suppliers")
      .select("id, supplier_name")
      .eq("company_id", access.companyId)
      .eq("status", "active")
      .order("supplier_name"),
  ])

  if (contractorError || partnerError) throw contractorError ?? partnerError

  return {
    contractors: (contractors ?? []) as ProjectContractorOption[],
    partners: (partners ?? []) as ProjectPartnerOption[],
  }
}

export async function getProjectAssignmentContext(
  access: ProjectAccess,
): Promise<ProjectAssignmentContext> {
  if ("error" in access) throw new Error(access.error)

  const admin = createAdminClient()

  if (!admin)
    throw new Error(
      "Project assignments require the server service-role configuration.",
    )

  const [
    { data: company, error: companyError },

    { data: memberships, error: membershipError },

    { data: staff, error: staffError },
  ] = await Promise.all([
    admin

      .from("companies")

      .select("primary_admin_user_id, assistant_staff_enabled")

      .eq("id", access.companyId)

      .maybeSingle(),

    admin

      .from("company_memberships")

      .select("user_id")

      .eq("company_id", access.companyId)

      .eq("status", "active"),

    admin

      .from("company_staff_members")

      .select("id, name, position, status, linked_user_id")

      .eq("company_id", access.companyId)

      .eq("status", "Active")

      .order("name"),
  ])

  if (companyError || membershipError || staffError) {
    throw companyError ?? membershipError ?? staffError
  }

  if (!company) throw new Error("Unable to verify company project assignments.")

  const memberIds = [...new Set((memberships ?? []).map((membership) => membership.user_id))]

  const memberProfilesResult = memberIds.length
    ? await admin

        .from("profiles")

        .select("id, display_name")

        .in("id", memberIds)
    : { data: [], error: null }

  if (memberProfilesResult.error) throw memberProfilesResult.error

  const profileNameById = new Map(
    (memberProfilesResult.data ?? []).map((profile) => [
      profile.id,

      profile.display_name,
    ]),
  )

  const staffByUserId = new Map(
    (staff ?? [])
      .filter((record) => record.status === "Active" && record.linked_user_id)
      .map((record) => [record.linked_user_id!, record]),
  )

  const handlers = memberIds

    .map((id) => {
      const staffRecord = staffByUserId.get(id)
      return {
        id,

        name:
          staffRecord?.name ||
          profileNameById.get(id) ||
          "Active company member",

        position: staffRecord?.position || "Company member",
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))

  const assistantStaff = (staff ?? []).map((record) => ({
    id: record.id,
    name: record.name,
    position: record.position ?? "",
    status: record.status,
  }))

  const staffHandlers = (staff ?? [])
    .filter((record) => !record.linked_user_id)
    .map((record) => ({
      id: record.id,
      name: record.name,
      position: record.position ?? "",
    }))

  return {
    isChairman: company.primary_admin_user_id === access.userId,

    assistantStaffEnabled: company.assistant_staff_enabled,

    handlers,

    staffHandlers,

    staff: assistantStaff,
  }
}

export type ProjectInput = {
  projectName: string

  accountId: string

  projectSourceType: "contractor" | "partner"

  contractorId: string | null

  partnerId: string | null

  contractorName: string

  country: string

  salaryRange: string

  ageBracket: string

  totalDemand: number

  contractorServiceCharge: number

  partnerServiceCharge: number

  candidateServiceCharge: number

  interviewMode: "Face to face" | "Online" | "Direct submission"

  status: "active" | "inactive" | "cancelled"

  visaCount: number

  ticketCount: number
}

const interviewModes = new Set(["Face to face", "Online", "Direct submission"])

const projectStatuses = new Set(["active", "inactive", "cancelled"])

export function parseProjectInput(value: unknown): ProjectInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const body = value as Record<string, unknown>

  const projectName =
    typeof body.projectName === "string" ? body.projectName.trim() : ""

  const accountId =
    typeof body.accountId === "string" ? body.accountId.trim() : ""

  const projectSourceType =
    body.projectSourceType === undefined || body.projectSourceType === "contractor"
      ? "contractor"
      : body.projectSourceType === "partner"
        ? "partner"
        : null

  const contractorName =
    typeof body.contractorName === "string" ? body.contractorName.trim() : ""

  const country = typeof body.country === "string" ? body.country.trim() : ""

  const salaryRange =
    typeof body.salaryRange === "string" ? body.salaryRange.trim() : ""

  const ageBracket =
    typeof body.ageBracket === "string" ? body.ageBracket.trim() : ""

  const contractorId =
    typeof body.contractorId === "string" && body.contractorId
      ? body.contractorId
      : null

  const partnerId =
    typeof body.partnerId === "string" && body.partnerId
      ? body.partnerId
      : null

  const totalDemand = Number(body.totalDemand)

  const contractorServiceCharge = Number(body.contractorServiceCharge)

  const partnerServiceCharge = Number(body.partnerServiceCharge ?? 0)

  const candidateServiceCharge = Number(body.candidateServiceCharge)

  const visaCount = body.visaCount === undefined ? 0 : Number(body.visaCount)

  const ticketCount =
    body.ticketCount === undefined ? 0 : Number(body.ticketCount)

  const interviewMode =
    typeof body.interviewMode === "string" ? body.interviewMode : ""

  const status = typeof body.status === "string" ? body.status : "active"

  if (
    projectSourceType === null ||
    !projectName ||
    projectName.length > 200 ||
    !accountId ||
    (projectSourceType === "contractor" &&
      (!contractorId || !contractorName || contractorName.length > 200)) ||
    (projectSourceType === "partner" &&
      (!partnerId || (contractorName && contractorName.length > 200))) ||
    (contractorId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        contractorId,
      )) ||
    (partnerId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        partnerId,
      )) ||
    (projectSourceType === "contractor" &&
      (partnerId !== null || partnerServiceCharge !== 0)) ||
    (projectSourceType === "partner" &&
      (contractorId !== null || contractorServiceCharge !== 0)) ||
    !country ||
    country.length > 200 ||
    !salaryRange ||
    salaryRange.length > 200 ||
    !ageBracket ||
    ageBracket.length > 100 ||
    !Number.isInteger(totalDemand) ||
    totalDemand < 1 ||
    !Number.isFinite(contractorServiceCharge) ||
    contractorServiceCharge < 0 ||
    !Number.isFinite(partnerServiceCharge) ||
    partnerServiceCharge < 0 ||
    !Number.isFinite(candidateServiceCharge) ||
    candidateServiceCharge < 0 ||
    !Number.isInteger(visaCount) ||
    visaCount < 0 ||
    !Number.isInteger(ticketCount) ||
    ticketCount < 0 ||
    !interviewModes.has(interviewMode) ||
    !projectStatuses.has(status)
  )
    return null

  return {
    projectName,

    accountId,

    projectSourceType,

    contractorId,

    partnerId,

    contractorName,

    country,

    salaryRange,

    ageBracket,

    totalDemand,

    contractorServiceCharge,

    partnerServiceCharge,

    candidateServiceCharge,

    interviewMode: interviewMode as ProjectInput["interviewMode"],

    status: status as ProjectInput["status"],

    visaCount,

    ticketCount,
  }
}

export function projectToDatabase(
  input: ProjectInput,
  branchId: string | null,
) {
  return {
    account_id: input.accountId,

    branch_id: branchId,

    project_source_type: input.projectSourceType,

    contractor_id:
      input.projectSourceType === "contractor" ? input.contractorId : null,

    partner_id: input.projectSourceType === "partner" ? input.partnerId : null,

    contractor_name: input.contractorName,

    project_name: input.projectName,

    country: input.country,

    salary_range: input.salaryRange,

    age_bracket: input.ageBracket,

    total_demand: input.totalDemand,

    contractor_service_charge:
      input.projectSourceType === "contractor"
        ? input.contractorServiceCharge
        : 0,

    partner_service_charge:
      input.projectSourceType === "partner" ? input.partnerServiceCharge : 0,

    candidate_service_charge: input.candidateServiceCharge,

    interview_mode: input.interviewMode,

    status: input.status,

    visa_count: input.visaCount,

    ticket_count: input.ticketCount,
  }
}

export async function resolveProjectSource(
  access: ProjectAccess,
  input: ProjectInput,
  existingPartnerId?: string | null,
): Promise<{ input: ProjectInput } | { error: string }> {
  if ("error" in access) throw new Error(access.error)

  const admin = createAdminClient()

  if (!admin)
    throw new Error(
      "Project source verification requires the server service-role configuration.",
    )

  if (input.projectSourceType === "partner") {
    if (!input.partnerId)
      return { error: "Select an active partner registered by this company." }

    const { data: partner, error } = await admin
      .from("suppliers")
      .select("id, supplier_name, status")
      .eq("id", input.partnerId)
      .eq("company_id", access.companyId)
      .maybeSingle()

    if (error) throw error

    if (
      !partner ||
      (partner.status !== "active" && input.partnerId !== existingPartnerId)
    ) {
      return { error: "Select an active partner registered by this company." }
    }

    return {
      input: {
        ...input,
        contractorId: null,
        contractorName: partner.supplier_name,
      },
    }
  }

  if (!input.contractorId)
    return { error: "Select a registered contractor for this company." }

  const { data: contractor, error } = await admin
    .from("employers")
    .select("id, company_name")
    .eq("id", input.contractorId)
    .eq("company_id", access.companyId)
    .maybeSingle()

  if (error) throw error

  if (!contractor)
    return { error: "Select a registered contractor for this company." }

  return {
    input: {
      ...input,
      partnerId: null,
      partnerServiceCharge: 0,
      contractorName: contractor.company_name,
    },
  }
}
