import { createClient } from "@supabase/supabase-js"

import nodemailer from "nodemailer"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { parseStaffInput, type StaffInput } from "@/lib/server/staff-input"

import {
  isPrimaryAdministratorRole,
  isRecruitmentAgentRestrictedPermission,
  isRecruitmentAgentRole,
  isRoleAccessSettings,
  roleAccessSettings,
} from "@/lib/role-access-settings"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type UserTypeSelection = {
  userType: "member"
  staffInput: null
} | {
  userType: "staff"
  staffInput: StaffInput
}

function parseUserTypeSelection(
  body: Record<string, unknown>,
  name: string,
  branchId: string,
): UserTypeSelection | null {
  const requestedType = body.userType ?? "member"
  if (requestedType === "member")
    return { userType: "member", staffInput: null }
  if (
    requestedType !== "staff" ||
    !body.staff ||
    typeof body.staff !== "object" ||
    Array.isArray(body.staff)
  ) {
    return null
  }
  const staffInput = parseStaffInput({
    ...body.staff as Record<string, unknown>,
    name,
    status: "Active",
    branchId,
    linkedUserId: null,
  })
  return staffInput ? { userType: "staff", staffInput } : null
}

async function validateStaffInvitation(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  companyId: string,
  staffInput: StaffInput,
  canChooseAnyAccount: boolean,
  currentBranchId: string | null,
) {
  if (staffInput.lineManagerStaffId) {
    let managerQuery = admin
      .from("company_staff_members")
      .select("id")
      .eq("id", staffInput.lineManagerStaffId)
      .eq("company_id", companyId)
      .eq("status", "Active")
    if (!canChooseAnyAccount && currentBranchId)
      managerQuery = managerQuery.eq("branch_id", currentBranchId)
    const { data: manager, error } = await managerQuery.maybeSingle()
    if (error) throw error
    if (!manager)
      return "Choose an active line manager from your authorized staff list."
  }

  if (staffInput.transportAccountId) {
    let accountQuery = admin
      .from("company_accounts")
      .select("id")
      .eq("id", staffInput.transportAccountId)
      .eq("company_id", companyId)
      .eq("status", "active")
    if (!canChooseAnyAccount && currentBranchId)
      accountQuery = accountQuery.eq("branch_id", currentBranchId)
    const { data: account, error } = await accountQuery.maybeSingle()
    if (error) throw error
    if (!account)
      return "Choose an active funding account from your company branch."
  }
  return null
}

async function insertInvitedStaffRecord(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  companyId: string,
  createdBy: string,
  userId: string,
  staffInput: StaffInput,
  phone = "",
) {
  const { data: allocation, error: allocationError } = await admin.rpc(
    "allocate_company_staff_sequence",
    { requested_company_id: companyId },
  )
  if (allocationError) throw allocationError
  const sequence = (Array.isArray(allocation) ? allocation[0] : allocation) as {
    staff_id_prefix: string
    sequence_number: number | string
  } | null
  if (!sequence) throw new Error("Staff ID sequence is not configured.")

  const { data: staff, error } = await admin
    .from("company_staff_members")
    .insert({
      company_id: companyId,
      branch_id: staffInput.branchId,
      staff_id: `${sequence.staff_id_prefix}-${String(sequence.sequence_number).padStart(4, "0")}`,
      linked_user_id: userId,
      line_manager_staff_id: staffInput.lineManagerStaffId,
      name: staffInput.name,
      phone,
      position: staffInput.position,
      status: staffInput.status,
      date_joined: staffInput.dateJoined,
      pay_type: staffInput.payType,
      base_salary: staffInput.baseSalary,
      weekly_transport_allowance: staffInput.weeklyTransportAllowance,
      transport_account_id: staffInput.transportAccountId,
      created_by: createdBy,
    })
    .select("id")
    .single()
  if (error) throw error
  return staff.id
}

function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }
    return entities[character] ?? character
  })
}

function parseRequestedPermissions(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((permission) => typeof permission !== "string")
  ) {
    return null
  }

  return [...new Set(value)]
}

async function getAuthorizedCompany(permission: "users.view" | "users.edit") {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id, branch_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError || !membership)
    return {
      error: "Active company membership not found.",

      status: 403 as const,
    }

  const admin = createAdminClient()
  if (!admin)
    return {
      error:
        "Set SUPABASE_SERVICE_ROLE_KEY in the server environment to manage company users.",

      status: 503 as const,
    }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("primary_admin_user_id")
    .eq("id", membership.company_id)
    .maybeSingle()

  if (companyError || !company)
    return {
      error: "Unable to verify company ownership.",

      status: 503 as const,
    }

  const isPrimaryAdmin = company.primary_admin_user_id === user.id

  let isMainBranch = isPrimaryAdmin
  if (!isPrimaryAdmin) {
    const { data, error: branchError } = await supabase.rpc(
      "current_user_is_main_branch_user",
      { requested_company_id: membership.company_id },
    )
    if (branchError)
      return {
        error: "Unable to verify your company branch.",
        status: 503 as const,
      }
    isMainBranch = Boolean(data)
  }

  if (!isMainBranch && !membership.branch_id && !isPrimaryAdmin)
    return {
      error: "Your account must be assigned to a branch.",

      status: 403 as const,
    }

  let allowed = isPrimaryAdmin
  if (!allowed) {
    const { data, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: membership.company_id,
        requested_permission: permission,
      },
    )
    if (permissionError)
      return {
        error: "You do not have permission to manage company users.",
        status: 403 as const,
      }
    allowed = Boolean(data)
  }

  if (!allowed)
    return {
      error: "You do not have permission to manage company users.",

      status: 403 as const,
    }

  // Also check if this user can manage roles (roles.manage permission)

  const { data: canManageRoles, error: rolePermissionError } = isPrimaryAdmin
    ? { data: true, error: null }
    : await supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "roles.manage",
      })

  if (rolePermissionError)
    return {
      error: "Unable to verify role-management permission.",

      status: 503 as const,
    }

  return {
    supabase,

    companyId: membership.company_id,

    userId: user.id,

    branchId: membership.branch_id,

    isMainBranch,

    isPrimaryAdmin,

    canManageRoles: Boolean(canManageRoles) && (isMainBranch || isPrimaryAdmin),
  }
}

export async function GET() {
  try {
    const access = await getAuthorizedCompany("users.view")

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,

        headers: responseHeaders,
      })

    const admin = createAdminClient()

    if (!admin)
      return NextResponse.json(
        {
          error:
            "Set SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the Next.js server to enable user management.",
        },

        { status: 503, headers: responseHeaders },
      )

    let membershipsQuery = admin

      .from("company_memberships")

      .select("user_id, status, role_id, branch_id, role:company_roles(name)")

      .eq("company_id", access.companyId)

      .order("created_at")

    if (!access.isMainBranch && !access.isPrimaryAdmin && access.branchId)
      membershipsQuery = membershipsQuery.eq("branch_id", access.branchId)

    let branchesQuery = admin

      .from("company_branches")

      .select("id, name, code, is_main_branch")

      .eq("company_id", access.companyId)

      .eq("status", "active")

    if (!access.isMainBranch && !access.isPrimaryAdmin && access.branchId)
      branchesQuery = branchesQuery.eq("id", access.branchId)

    const [
      rolesResult,

      membershipsResult,

      permissionsResult,

      companyResult,

      branchesResult,
    ] = await Promise.all([
      admin

        .from("company_roles")

        .select(
          "id, name, description, is_system_default, created_at, access_settings",
        )

        .eq("company_id", access.companyId)

        .order("name"),

      membershipsQuery,

      admin.from("permissions").select("code, description").order("code"),

      admin

        .from("companies")

        .select("primary_admin_user_id")

        .eq("id", access.companyId)

        .single(),

      branchesQuery.order("is_main_branch", { ascending: false }).order("name"),
    ])

    if (
      rolesResult.error ||
      membershipsResult.error ||
      permissionsResult.error ||
      companyResult.error ||
      branchesResult.error
    ) {
      console.error(
        "Workspace user management query failed",

        rolesResult.error ??
          membershipsResult.error ??
          permissionsResult.error ??
          companyResult.error ??
          branchesResult.error,
      )

      return NextResponse.json(
        { error: "Unable to load company users and roles." },

        { status: 500, headers: responseHeaders },
      )
    }

    const { data: staffLinks, error: staffLinksError } = await admin
      .from("company_staff_members")
      .select("linked_user_id")
      .eq("company_id", access.companyId)
      .not("linked_user_id", "is", null)
    if (staffLinksError) {
      console.error("Workspace staff links query failed", staffLinksError)
      return NextResponse.json(
        { error: "Unable to load company user types." },
        { status: 500, headers: responseHeaders },
      )
    }

    const staffUserIds = new Set(
      (staffLinks ?? [])
        .map((staff) => staff.linked_user_id)
        .filter((userId): userId is string => Boolean(userId)),
    )

    const userIds = (membershipsResult.data ?? []).map(
      (membership) => membership.user_id,
    )

    const [
      { data: profiles },

      { data: authUsers, error: authUsersError },

      { data: rolePermissions, error: rolePermissionsError },
    ] = await Promise.all([
      userIds.length
        ? admin

            .from("profiles")

            .select("id, display_name, phone, branch")

            .in("id", userIds)
        : Promise.resolve({
            data: [] as {
              id: string

              display_name: string

              phone: string

              branch: string
            }[],
          }),

      admin.auth.admin.listUsers({ perPage: 1000 }),

      rolesResult.data?.length
        ? admin

            .from("role_permissions")

            .select("role_id, permission_code")

            .eq("company_id", access.companyId)
        : Promise.resolve({
            data: [] as { role_id: string; permission_code: string }[],

            error: null,
          }),
    ])

    if (authUsersError || rolePermissionsError) {
      console.error(
        "Workspace user details query failed",

        authUsersError ?? rolePermissionsError,
      )

      return NextResponse.json({ error: "Unable to load user details." }, {
        status: 500,

        headers: responseHeaders,
      })
    }

    const profileById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    )

    const authUserById = new Map(
      (authUsers?.users ?? []).map((authUser) => [authUser.id, authUser]),
    )

    const roleNameById = new Map(
      (rolesResult.data ?? []).map((roleRecord) => [
        roleRecord.id,

        roleRecord.name,
      ]),
    )

    const recruitmentAgentRoleIds = new Set(
      (rolesResult.data ?? [])

        .filter((roleRecord) => isRecruitmentAgentRole(roleRecord.name))

        .map((roleRecord) => roleRecord.id),
    )

    const branchNameById = new Map(
      (branchesResult.data ?? []).map((branch) => [branch.id, branch.name]),
    )
    const mainBranch = (branchesResult.data ?? []).find(
      (branch) => branch.is_main_branch,
    )

    const visibleRolePermissions = (rolePermissions ?? []).filter(
      (rolePermission) =>
        !recruitmentAgentRoleIds.has(rolePermission.role_id) ||
        !isRecruitmentAgentRestrictedPermission(rolePermission.permission_code),
    )

    const users = (membershipsResult.data ?? []).map((membership) => {
      const authUser = authUserById.get(membership.user_id)

      const joinedRole = membership.role as unknown as { name: string } | {
        name: string
      }[] | null

      const role = Array.isArray(joinedRole)
        ? joinedRole[0]?.name
        : joinedRole?.name
      const branchId = membership.branch_id ?? mainBranch?.id ?? null

      return {
        id: membership.user_id,

        name:
          profileById.get(membership.user_id)?.display_name ||
          String(authUser?.user_metadata?.full_name ?? "User"),

        email: authUser?.email ?? "",

        phone: profileById.get(membership.user_id)?.phone ?? "",

        branch:
          (branchId && branchNameById.get(branchId)) ||
          profileById.get(membership.user_id)?.branch ||
          "",

        branchId,

        roleId: membership.role_id,

        role: role ?? roleNameById.get(membership.role_id) ?? "Unknown role",

        status:
          membership.status === "disabled"
            ? "disabled"
            : authUser?.confirmed_at
              ? membership.status
              : "invited",

        isPrimaryAdmin:
          membership.user_id === companyResult.data.primary_admin_user_id,

        userType: staffUserIds.has(membership.user_id) ? "staff" : "member",
      }
    })

    return NextResponse.json(
      {
        users,

        roles: rolesResult.data ?? [],

        permissions: permissionsResult.data ?? [],

        rolePermissions: visibleRolePermissions,

        canManageRoles: access.canManageRoles,

        canEditAgentDetails:
          access.userId === companyResult.data.primary_admin_user_id,

        branches: (branchesResult.data ?? []).map((branch) => ({
          id: branch.id,

          name: branch.name,

          code: branch.code,

          isMainBranch: branch.is_main_branch,
        })),
      },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Workspace users request failed", error)

    return NextResponse.json({ error: "User management is unavailable." }, {
      status: 503,

      headers: responseHeaders,
    })
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAuthorizedCompany("users.edit")

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,

        headers: responseHeaders,
      })

    const admin = createAdminClient()

    if (!admin)
      return NextResponse.json(
        {
          error:
            "Set SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the Next.js server to enable user management.",
        },

        { status: 503, headers: responseHeaders },
      )

    const body = (await request.json()) as Record<string, unknown>

    if (body.action === "edit-user-details") {
      const userId = typeof body.userId === "string" ? body.userId : ""
      const name = typeof body.name === "string" ? body.name.trim() : ""
      const phone = typeof body.phone === "string" ? body.phone.trim() : ""
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
      const roleId = typeof body.roleId === "string" ? body.roleId : ""
      const branchId = typeof body.branchId === "string" ? body.branchId : ""
      const userType = body.userType
      const requestedStatus = body.status
      const staffBody =
        body.staff && typeof body.staff === "object" && !Array.isArray(body.staff)
          ? (body.staff as Record<string, unknown>)
          : null

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        ) ||
        !name ||
        name.length > 200 ||
        phone.length > 100 ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        email.length > 200 ||
        !roleId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          branchId,
        ) ||
        (userType !== "staff" && userType !== "member") ||
        (requestedStatus !== "active" &&
          requestedStatus !== "disabled" &&
          requestedStatus !== "invited")
      ) {
        return NextResponse.json(
          { error: "Enter valid account, access, and staff details." },
          { status: 400, headers: responseHeaders },
        )
      }

      const { data: company, error: companyError } = await admin
        .from("companies")
        .select("name, slug, primary_admin_user_id")
        .eq("id", access.companyId)
        .maybeSingle()
      if (companyError || !company) {
        console.error("User edit company lookup failed", companyError)
        return NextResponse.json(
          { error: "Unable to verify company ownership." },
          { status: 500, headers: responseHeaders },
        )
      }
      if (company.primary_admin_user_id !== access.userId) {
        return NextResponse.json(
          { error: "Only the Chairman can edit all user details." },
          { status: 403, headers: responseHeaders },
        )
      }
      if (userId === access.userId) {
        return NextResponse.json(
          { error: "You cannot edit your own account from this screen." },
          { status: 400, headers: responseHeaders },
        )
      }

      const { data: membership, error: membershipError } = await admin
        .from("company_memberships")
        .select("user_id, role_id, branch_id, status, role:company_roles(name)")
        .eq("company_id", access.companyId)
        .eq("user_id", userId)
        .maybeSingle()
      if (membershipError) throw membershipError
      if (!membership) {
        return NextResponse.json(
          { error: "Selected user is not a member of this company." },
          { status: 404, headers: responseHeaders },
        )
      }

      const joinedRole = membership.role as { name: string } | {
        name: string
      }[] | null
      const currentRoleName = Array.isArray(joinedRole)
        ? joinedRole[0]?.name
        : joinedRole?.name
      if (
        userId === company.primary_admin_user_id ||
        isPrimaryAdministratorRole(currentRoleName ?? "")
      ) {
        return NextResponse.json(
          { error: "Protected administrator accounts cannot be edited." },
          { status: 403, headers: responseHeaders },
        )
      }

      const [
        { data: targetRole, error: roleError },
        { data: branch, error: branchError },
        { data: authResult, error: authError },
        { data: profile, error: profileError },
        { data: linkedStaff, error: staffError },
      ] = await Promise.all([
        admin
          .from("company_roles")
          .select("id, name")
          .eq("id", roleId)
          .eq("company_id", access.companyId)
          .maybeSingle(),
        admin
          .from("company_branches")
          .select("id, name")
          .eq("id", branchId)
          .eq("company_id", access.companyId)
          .eq("status", "active")
          .maybeSingle(),
        admin.auth.admin.getUserById(userId),
        admin
          .from("profiles")
          .select("id, display_name, phone")
          .eq("id", userId)
          .maybeSingle(),
        admin
          .from("company_staff_members")
          .select(
            "id, staff_id, name, phone, position, status, date_joined, branch_id, linked_user_id, line_manager_staff_id, pay_type, base_salary, weekly_transport_allowance, transport_account_id, updated_by",
          )
          .eq("company_id", access.companyId)
          .eq("linked_user_id", userId)
          .limit(2),
      ])

      if (roleError || branchError || authError || profileError || staffError) {
        throw roleError ?? branchError ?? authError ?? profileError ?? staffError
      }
      if (!targetRole || isPrimaryAdministratorRole(targetRole.name)) {
        return NextResponse.json(
          { error: "Choose an eligible role from this company." },
          { status: 400, headers: responseHeaders },
        )
      }
      if (!branch) {
        return NextResponse.json(
          { error: "Choose an active branch from this company." },
          { status: 400, headers: responseHeaders },
        )
      }
      if (!authResult.user?.email) {
        return NextResponse.json(
          { error: "Unable to retrieve the user's login email." },
          { status: 404, headers: responseHeaders },
        )
      }
      if ((linkedStaff ?? []).length > 1) {
        return NextResponse.json(
          { error: "This user has multiple linked staff records. Contact support." },
          { status: 409, headers: responseHeaders },
        )
      }

      const currentStaff = linkedStaff?.[0] ?? null
      const staffInput =
        userType === "staff" && staffBody
          ? parseStaffInput({
              ...staffBody,
              name,
              branchId,
              linkedUserId: userId,
            })
          : null
      if (userType === "staff" && !staffInput) {
        return NextResponse.json(
          {
            error:
              "Enter a position and joining date, and provide valid pay details for the selected arrangement.",
          },
          { status: 400, headers: responseHeaders },
        )
      }
      if (userType === "member" && currentStaff) {
        const { count, error: reportsError } = await admin
          .from("company_staff_members")
          .select("id", { count: "exact", head: true })
          .eq("company_id", access.companyId)
          .eq("line_manager_staff_id", currentStaff.id)
          .neq("status", "Inactive")
        if (reportsError) throw reportsError
        if (count) {
          return NextResponse.json(
            {
              error:
                "Reassign this staff member's direct reports before changing their type.",
            },
            { status: 409, headers: responseHeaders },
          )
        }
      }

      if (staffInput?.lineManagerStaffId) {
        let managerQuery = admin
          .from("company_staff_members")
          .select("id")
          .eq("id", staffInput.lineManagerStaffId)
          .eq("company_id", access.companyId)
          .eq("status", "Active")
        if (currentStaff) managerQuery = managerQuery.neq("id", currentStaff.id)
        const { data: manager, error: managerError } =
          await managerQuery.maybeSingle()
        if (managerError) throw managerError
        if (!manager) {
          return NextResponse.json(
            { error: "Choose an active line manager from this company." },
            { status: 400, headers: responseHeaders },
          )
        }
      }

      if (staffInput?.transportAccountId) {
        const { data: account, error: accountError } = await admin
          .from("company_accounts")
          .select("id")
          .eq("id", staffInput.transportAccountId)
          .eq("company_id", access.companyId)
          .eq("status", "active")
          .maybeSingle()
        if (accountError) throw accountError
        if (!account) {
          return NextResponse.json(
            { error: "Choose an active funding account from this company." },
            { status: 400, headers: responseHeaders },
          )
        }
      }

      const currentEmail = authResult.user.email
      const emailChanged = currentEmail.toLowerCase() !== email
      let currentEmailChangeLink = ""
      let newEmailChangeLink = ""
      let emailSmtpConfig: {
        host: string
        port: number
        user: string
        pass: string
      } | null = null
      let emailFrom = ""
      if (emailChanged) {
        const smtpHost = process.env.SYSTEM_SMTP_HOST?.trim()
        const smtpPort = Number(process.env.SYSTEM_SMTP_PORT ?? "587")
        const smtpUser = process.env.SYSTEM_SMTP_USER?.trim()
        const smtpPass = process.env.SYSTEM_SMTP_PASS?.trim()
        emailFrom = process.env.SYSTEM_SMTP_FROM?.trim() || smtpUser || ""
        if (
          !smtpHost ||
          !smtpUser ||
          !smtpPass ||
          !emailFrom ||
          !Number.isInteger(smtpPort) ||
          smtpPort < 1 ||
          smtpPort > 65535
        ) {
          return NextResponse.json(
            {
              error:
                "Login email changes require SYSTEM_SMTP_HOST, SYSTEM_SMTP_PORT, SYSTEM_SMTP_USER, and SYSTEM_SMTP_PASS on the server.",
            },
            { status: 503, headers: responseHeaders },
          )
        }
        emailSmtpConfig = {
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
        }

        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
        const redirectTo = siteUrl && company.slug
          ? new URL(`/${company.slug}/login`, siteUrl).toString()
          : undefined
        const options = redirectTo ? { redirectTo } : undefined
        const [currentLinkResult, newLinkResult] = await Promise.all([
          admin.auth.admin.generateLink({
            type: "email_change_current",
            email: currentEmail,
            newEmail: email,
            ...(options ? { options } : {}),
          }),
          admin.auth.admin.generateLink({
            type: "email_change_new",
            email: currentEmail,
            newEmail: email,
            ...(options ? { options } : {}),
          }),
        ])
        if (currentLinkResult.error || newLinkResult.error) {
          const linkError = currentLinkResult.error ?? newLinkResult.error
          console.error("Email-change verification link generation failed", linkError)
          return NextResponse.json(
            {
              error:
                linkError?.code === "email_exists"
                  ? "That login email is already used by another account."
                  : "Unable to prepare the login email verification links.",
            },
            {
              status: linkError?.code === "email_exists" ? 409 : 400,
              headers: responseHeaders,
            },
          )
        }

        currentEmailChangeLink = currentLinkResult.data.properties.action_link
        newEmailChangeLink = newLinkResult.data.properties.action_link
      }

      const originalRoleId = membership.role_id
      const originalBranchId = membership.branch_id
      const originalMembershipStatus = membership.status
      const originalProfile = profile
      const originalMetadata = authResult.user.user_metadata ?? {}
      let profileUpdated = false
      let membershipUpdated = false
      let staffUpdated = false
      let createdStaffId = ""

      const rollback = async () => {
        const failures: string[] = []
        const actions: Array<[string, () => Promise<{ error: unknown } | { error: null }>]>
          = []

        if (staffUpdated && createdStaffId) {
          actions.push([
            "new staff record",
            async () =>
              await admin
                .from("company_staff_members")
                .delete()
                .eq("company_id", access.companyId)
                .eq("id", createdStaffId),
          ])
        } else if (staffUpdated && currentStaff) {
          actions.push([
            "staff record",
            async () =>
              await admin
                .from("company_staff_members")
                .update({
                  branch_id: currentStaff.branch_id,
                  linked_user_id: currentStaff.linked_user_id,
                  line_manager_staff_id: currentStaff.line_manager_staff_id,
                  name: currentStaff.name,
                  phone: currentStaff.phone,
                  position: currentStaff.position,
                  status: currentStaff.status,
                  date_joined: currentStaff.date_joined,
                  pay_type: currentStaff.pay_type,
                  base_salary: currentStaff.base_salary,
                  weekly_transport_allowance: currentStaff.weekly_transport_allowance,
                  transport_account_id: currentStaff.transport_account_id,
                  updated_by: currentStaff.updated_by,
                })
                .eq("company_id", access.companyId)
                .eq("id", currentStaff.id),
          ])
        }
        if (membershipUpdated) {
          actions.push([
            "company membership",
            async () =>
              await admin
                .from("company_memberships")
                .update({
                  role_id: originalRoleId,
                  branch_id: originalBranchId,
                  status: originalMembershipStatus,
                })
                .eq("company_id", access.companyId)
                .eq("user_id", userId),
          ])
        }
        if (profileUpdated) {
          actions.push([
            "user profile",
            async () =>
              originalProfile
                ? await admin
                    .from("profiles")
                    .update({
                      display_name: originalProfile.display_name,
                      phone: originalProfile.phone,
                    })
                    .eq("id", userId)
                : await admin.from("profiles").delete().eq("id", userId),
          ])
        }

        await Promise.all(
          actions.map(async ([label, action]) => {
            try {
              const { error } = await action()
              if (error) {
                failures.push(label)
                console.error(`User edit rollback failed for ${label}`, error)
              }
            } catch (rollbackError) {
              failures.push(label)
              console.error(`User edit rollback failed for ${label}`, rollbackError)
            }
          }),
        )
        return failures
      }

      try {
        const { error: profileUpdateError } = await admin
          .from("profiles")
          .upsert(
            { id: userId, display_name: name, phone },
            { onConflict: "id" },
          )
        if (profileUpdateError) throw profileUpdateError
        profileUpdated = true

        if (userType === "staff" && staffInput) {
          if (currentStaff) {
            const { data: updatedStaff, error: staffUpdateError } = await admin
              .from("company_staff_members")
              .update({
                branch_id: branchId,
                line_manager_staff_id: staffInput.lineManagerStaffId,
                name,
                phone,
                position: staffInput.position,
                status: staffInput.status,
                date_joined: staffInput.dateJoined,
                linked_user_id: userId,
                pay_type: staffInput.payType,
                base_salary: staffInput.baseSalary,
                weekly_transport_allowance: staffInput.weeklyTransportAllowance,
                transport_account_id: staffInput.transportAccountId,
                updated_by: access.userId,
              })
              .eq("company_id", access.companyId)
              .eq("id", currentStaff.id)
              .select("id")
              .maybeSingle()
            if (staffUpdateError) throw staffUpdateError
            if (!updatedStaff) throw new Error("The linked staff record was not found.")
          } else {
            createdStaffId = await insertInvitedStaffRecord(
              admin,
              access.companyId,
              access.userId,
              userId,
              staffInput,
              phone,
            )
          }
          staffUpdated = true
        } else if (userType === "member" && currentStaff) {
          const { data: updatedStaff, error: staffUpdateError } = await admin
            .from("company_staff_members")
            .update({
              linked_user_id: null,
              status: "Inactive",
              updated_by: access.userId,
            })
            .eq("company_id", access.companyId)
            .eq("id", currentStaff.id)
            .select("id")
            .maybeSingle()
          if (staffUpdateError) throw staffUpdateError
          if (!updatedStaff) throw new Error("The linked staff record was not found.")
          staffUpdated = true
        }

        const nextMembershipStatus =
          requestedStatus === "invited"
            ? membership.status
            : requestedStatus
        const { data: updatedMembership, error: membershipUpdateError } =
          await admin
            .from("company_memberships")
            .update({
              role_id: roleId,
              branch_id: branchId,
              status: nextMembershipStatus,
            })
            .eq("company_id", access.companyId)
            .eq("user_id", userId)
            .select("user_id")
            .maybeSingle()
        if (membershipUpdateError) throw membershipUpdateError
        if (!updatedMembership) throw new Error("The company membership was not found.")
        membershipUpdated = true

        const { error: metadataError } = await admin.auth.admin.updateUserById(
          userId,
          {
            user_metadata: {
              ...originalMetadata,
              full_name: name,
            },
          },
        )
        if (metadataError) throw metadataError
      } catch (updateError) {
        console.error("Company user details update failed", updateError)
        const rollbackFailures = await rollback()
        if (rollbackFailures.length) {
          return NextResponse.json(
            {
              error:
                "The user update failed and some changes could not be restored. Contact support before retrying.",
            },
            { status: 500, headers: responseHeaders },
          )
        }
        return NextResponse.json(
          { error: "Unable to update user details. No profile, staff, or access changes were retained." },
          { status: 500, headers: responseHeaders },
        )
      }

      let emailChangeWarning = ""
      if (emailChanged && emailSmtpConfig) {
        const emailTransport = nodemailer.createTransport({
          host: emailSmtpConfig.host,
          port: emailSmtpConfig.port,
          secure: emailSmtpConfig.port === 465,
          auth: {
            user: emailSmtpConfig.user,
            pass: emailSmtpConfig.pass,
          },
        })
        const displayName = escapeEmailHtml(name)
        const companyName = escapeEmailHtml(company.name ?? "your company")
        const escapedEmail = escapeEmailHtml(email)
        const emailMessage = (link: string, recipient: string) => ({
          from: emailFrom,
          to: recipient,
          subject: "Confirm your login email change",
          text: `A Chairman requested a login email change for your ${company.name ?? "company"} account. Confirm the change using this link: ${link}`,
          html: `<p>Hello ${displayName},</p><p>A Chairman requested changing the login email for your ${companyName} account to <strong>${escapedEmail}</strong>.</p><p><a href="${escapeEmailHtml(link)}">Confirm email change</a></p><p>If you did not expect this request, you can ignore this message. The login email will not change until the verification steps are completed.</p>`,
        })
        try {
          const deliveries = await Promise.allSettled([
            emailTransport.sendMail(emailMessage(currentEmailChangeLink, currentEmail)),
            emailTransport.sendMail(emailMessage(newEmailChangeLink, email)),
          ])
          if (deliveries.some((delivery) => delivery.status === "rejected"))
            throw new Error("One or more verification messages were not delivered.")
        } catch (emailError) {
          console.error("Company user email-change verification delivery failed", emailError)
          emailChangeWarning =
            "The account was updated, but email verification could not be fully delivered. The login email remains unchanged; retry the email change."
        } finally {
          emailTransport.close()
        }
      }

      return NextResponse.json(
        {
          success: true,
          emailChangePending: emailChanged && !emailChangeWarning,
          emailChangeWarning: emailChangeWarning || undefined,
        },
        { headers: responseHeaders },
      )
    }

    if (body.action === "edit-agent-details") {
      const userId = typeof body.userId === "string" ? body.userId : ""

      const name = typeof body.name === "string" ? body.name.trim() : ""

      const phone = typeof body.phone === "string" ? body.phone.trim() : ""

      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

      const branchId = typeof body.branchId === "string" ? body.branchId : ""

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        ) ||
        !name ||
        name.length > 200 ||
        phone.length > 100 ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        email.length > 200 ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          branchId,
        )
      ) {
        return NextResponse.json(
          { error: "Enter a valid agent name, phone, email, and branch." },

          { status: 400, headers: responseHeaders },
        )
      }

      const { data: company, error: companyError } = await admin

        .from("companies")

        .select("primary_admin_user_id")

        .eq("id", access.companyId)

        .maybeSingle()

      if (companyError || !company) {
        console.error("Agent edit company lookup failed", companyError)

        return NextResponse.json(
          { error: "Unable to verify company ownership." },

          { status: 500, headers: responseHeaders },
        )
      }

      if (company.primary_admin_user_id !== access.userId)
        return NextResponse.json(
          { error: "Only the Chairman can edit agent details." },

          { status: 403, headers: responseHeaders },
        )

      const { data: target, error: targetError } = await admin

        .from("company_memberships")

        .select("user_id, role:company_roles(name)")

        .eq("company_id", access.companyId)

        .eq("user_id", userId)

        .maybeSingle()

      if (targetError || !target)
        return NextResponse.json(
          { error: "Selected user is not a member of this company." },

          { status: 404, headers: responseHeaders },
        )

      const targetRole = target.role as { name: string } | {
        name: string
      }[] | null

      const targetRoleName = Array.isArray(targetRole)
        ? targetRole[0]?.name
        : targetRole?.name

      if (!isRecruitmentAgentRole(targetRoleName ?? ""))
        return NextResponse.json(
          { error: "Only Recruitment Agent details can be edited here." },

          { status: 400, headers: responseHeaders },
        )

      const { data: branch, error: branchError } = await admin

        .from("company_branches")

        .select("id")

        .eq("id", branchId)

        .eq("company_id", access.companyId)

        .eq("status", "active")

        .maybeSingle()

      if (branchError || !branch)
        return NextResponse.json(
          { error: "Select an active branch from this company." },

          { status: 400, headers: responseHeaders },
        )

      const { data: authUser, error: authUserError } =
        await admin.auth.admin.getUserById(userId)

      if (authUserError || !authUser.user?.email)
        return NextResponse.json(
          { error: "Unable to retrieve the agent's login email." },

          { status: 404, headers: responseHeaders },
        )

      const previousEmail = authUser.user.email

      const emailChanged =
        previousEmail.toLocaleLowerCase() !== email.toLocaleLowerCase()

      if (emailChanged) {
        const { error: emailError } = await admin.auth.admin.updateUserById(
          userId,

          { email },
        )

        if (emailError) {
          console.error("Agent login email update failed", emailError)

          return NextResponse.json(
            {
              error:
                emailError.code === "email_exists"
                  ? "That email address is already used by another account."
                  : "Unable to update the agent's login email.",
            },

            {
              status: emailError.code === "email_exists" ? 409 : 400,
              headers: responseHeaders,
            },
          )
        }
      }

      const { error: profileError } = await access.supabase.rpc(
        "update_company_agent_details",

        {
          p_company_id: access.companyId,

          p_agent_user_id: userId,

          p_display_name: name,

          p_phone: phone,

          p_branch_id: branchId,
        },
      )

      if (profileError) {
        let emailRollbackFailed = false

        if (emailChanged) {
          const { error: rollbackError } =
            await admin.auth.admin.updateUserById(userId, {
              email: previousEmail,
            })

          if (rollbackError) {
            emailRollbackFailed = true

            console.error(
              "Agent email rollback after profile update failure failed",

              rollbackError,
            )
          }
        }

        console.error("Agent profile update failed", profileError)

        if (emailRollbackFailed)
          return NextResponse.json(
            {
              error:
                "The agent email changed, but the profile update failed and the prior email could not be restored. Contact support.",
            },

            { status: 500, headers: responseHeaders },
          )

        if (profileError.code === "42501")
          return NextResponse.json(
            { error: profileError.message },

            { status: 403, headers: responseHeaders },
          )

        if (["22023", "P0002"].includes(profileError.code ?? ""))
          return NextResponse.json(
            { error: profileError.message },

            { status: 400, headers: responseHeaders },
          )

        return NextResponse.json(
          { error: "Unable to update agent details." },

          { status: 500, headers: responseHeaders },
        )
      }

      return NextResponse.json({ success: true }, { headers: responseHeaders })
    }

    if (body.action === "change-user-type") {
      const userId = typeof body.userId === "string" ? body.userId : ""
      const userType = body.userType
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          userId,
        ) ||
        (userType !== "staff" && userType !== "member")
      ) {
        return NextResponse.json(
          { error: "Select a valid company user and user type." },
          { status: 400, headers: responseHeaders },
        )
      }

      const { data: company, error: companyError } = await admin
        .from("companies")
        .select("primary_admin_user_id")
        .eq("id", access.companyId)
        .maybeSingle()
      if (companyError || !company) {
        console.error("User type edit company lookup failed", companyError)
        return NextResponse.json(
          { error: "Unable to verify company ownership." },
          { status: 500, headers: responseHeaders },
        )
      }
      if (company.primary_admin_user_id !== access.userId)
        return NextResponse.json(
          { error: "Only the Chairman can change a user's type." },
          { status: 403, headers: responseHeaders },
        )
      if (userId === access.userId)
        return NextResponse.json(
          { error: "You cannot change your own user type." },
          { status: 400, headers: responseHeaders },
        )

      const { data: membership, error: membershipError } = await admin
        .from("company_memberships")
        .select("user_id, branch_id, role:company_roles(name)")
        .eq("company_id", access.companyId)
        .eq("user_id", userId)
        .maybeSingle()
      if (membershipError || !membership) {
        return NextResponse.json(
          { error: "Selected user is not a member of this company." },
          { status: 404, headers: responseHeaders },
        )
      }

      const joinedRole = membership.role as { name: string } | {
        name: string
      }[] | null
      const roleName = Array.isArray(joinedRole)
        ? joinedRole[0]?.name
        : joinedRole?.name
      if (
        userId === company.primary_admin_user_id ||
        isPrimaryAdministratorRole(roleName ?? "")
      ) {
        return NextResponse.json(
          { error: "Protected administrator accounts cannot be changed." },
          { status: 403, headers: responseHeaders },
        )
      }

      const { data: linkedStaff, error: linkedStaffError } = await admin
        .from("company_staff_members")
        .select("id")
        .eq("company_id", access.companyId)
        .eq("linked_user_id", userId)
        .limit(2)
      if (linkedStaffError) throw linkedStaffError
      if ((linkedStaff ?? []).length > 1)
        return NextResponse.json(
          { error: "This user has multiple linked staff records. Contact support." },
          { status: 409, headers: responseHeaders },
        )

      const currentlyStaff = Boolean(linkedStaff?.length)
      if ((userType === "staff") === currentlyStaff)
        return NextResponse.json({ success: true }, { headers: responseHeaders })

      if (userType === "member") {
        const staffId = linkedStaff?.[0]?.id
        if (!staffId)
          return NextResponse.json({ success: true }, { headers: responseHeaders })

        const { count, error: reportsError } = await admin
          .from("company_staff_members")
          .select("id", { count: "exact", head: true })
          .eq("company_id", access.companyId)
          .eq("line_manager_staff_id", staffId)
          .neq("status", "Inactive")
        if (reportsError) throw reportsError
        if (count)
          return NextResponse.json(
            {
              error:
                "Reassign this staff member's direct reports before changing their type.",
            },
            { status: 409, headers: responseHeaders },
          )

        const { error: unlinkError } = await admin
          .from("company_staff_members")
          .update({ linked_user_id: null, status: "Inactive" })
          .eq("id", staffId)
          .eq("company_id", access.companyId)
          .eq("linked_user_id", userId)
        if (unlinkError) {
          console.error("Staff user-type change failed", unlinkError)
          return NextResponse.json(
            { error: "Unable to change this user to Member." },
            { status: 500, headers: responseHeaders },
          )
        }
        return NextResponse.json({ success: true }, { headers: responseHeaders })
      }

      const staffBody =
        body.staff && typeof body.staff === "object" && !Array.isArray(body.staff)
          ? (body.staff as Record<string, unknown>)
          : null
      if (!staffBody)
        return NextResponse.json(
          { error: "Enter the required staff details." },
          { status: 400, headers: responseHeaders },
        )

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle()
      if (profileError) throw profileError
      const name = profile?.display_name?.trim() ?? ""
      if (!name)
        return NextResponse.json(
          { error: "This user needs a profile name before becoming Staff." },
          { status: 400, headers: responseHeaders },
        )

      let branchQuery = admin
        .from("company_branches")
        .select("id")
        .eq("company_id", access.companyId)
        .eq("status", "active")
      branchQuery = membership.branch_id
        ? branchQuery.eq("id", membership.branch_id)
        : branchQuery.eq("is_main_branch", true)
      const { data: branch, error: branchError } =
        await branchQuery.maybeSingle()
      if (branchError || !branch) {
        console.error("Staff type branch lookup failed", branchError)
        return NextResponse.json(
          { error: "The user's assigned active branch could not be found." },
          { status: 400, headers: responseHeaders },
        )
      }

      const staffInput = parseStaffInput({
        name,
        position: staffBody.position,
        status: "Active",
        dateJoined: staffBody.dateJoined,
        branchId: branch.id,
        linkedUserId: null,
        payType: "no_payroll",
        baseSalary: 0,
        weeklyTransportAllowance: 0,
        transportAccountId: null,
        lineManagerStaffId: null,
      })
      if (!staffInput)
        return NextResponse.json(
          { error: "Enter a valid staff position and joining date." },
          { status: 400, headers: responseHeaders },
        )

      try {
        await insertInvitedStaffRecord(
          admin,
          access.companyId,
          access.userId,
          userId,
          staffInput,
        )
      } catch (insertError) {
        console.error("Staff user-type record creation failed", insertError)
        return NextResponse.json(
          { error: "Unable to create the staff record." },
          { status: 500, headers: responseHeaders },
        )
      }
      return NextResponse.json({ success: true }, { headers: responseHeaders })
    }

    const lifecycleActions = new Set([
      "change-role",

      "set-status",

      "resend-invite",

      "revoke-invite",

      "delete-user",
    ])

    if (typeof body.action === "string" && lifecycleActions.has(body.action)) {
      const userId = typeof body.userId === "string" ? body.userId : ""

      if (!userId)
        return NextResponse.json({ error: "Select a company user." }, {
          status: 400,

          headers: responseHeaders,
        })

      if (userId === access.userId)
        return NextResponse.json(
          { error: "You cannot change or remove your own company access." },

          { status: 400, headers: responseHeaders },
        )

      const { data: membership, error: membershipError } = await admin

        .from("company_memberships")

        .select("user_id, status, role_id, branch_id, role:company_roles(name)")

        .eq("company_id", access.companyId)

        .eq("user_id", userId)

        .maybeSingle()

      if (membershipError || !membership)
        return NextResponse.json(
          { error: "User is not a member of this company." },

          { status: 404, headers: responseHeaders },
        )

      if (!access.isMainBranch && membership.branch_id !== access.branchId) {
        return NextResponse.json(
          { error: "You can only manage users assigned to your branch." },

          { status: 403, headers: responseHeaders },
        )
      }

      const { data: company, error: companyError } = await admin

        .from("companies")

        .select("primary_admin_user_id")

        .eq("id", access.companyId)

        .single()

      if (companyError)
        return NextResponse.json(
          { error: "Unable to verify protected company users." },

          { status: 500, headers: responseHeaders },
        )

      const targetRole = membership.role as unknown as { name: string } | {
        name: string
      }[] | null

      const targetRoleName = Array.isArray(targetRole)
        ? targetRole[0]?.name
        : targetRole?.name

      if (
        userId === company.primary_admin_user_id ||
        isPrimaryAdministratorRole(targetRoleName ?? "")
      ) {
        return NextResponse.json(
          {
            error:
              "The primary company administrator account is protected from user-management actions.",
          },

          { status: 403, headers: responseHeaders },
        )
      }

      if (body.action === "resend-invite") {
        if (membership.status !== "active")
          return NextResponse.json(
            { error: "This company membership is not active." },

            { status: 409, headers: responseHeaders },
          )

        const { data: authUser, error: authUserError } =
          await admin.auth.admin.getUserById(userId)

        if (authUserError || !authUser.user)
          return NextResponse.json(
            { error: "Unable to find the invited account." },

            { status: 404, headers: responseHeaders },
          )

        if (authUser.user.confirmed_at)
          return NextResponse.json(
            { error: "This user has already accepted the invitation." },

            { status: 409, headers: responseHeaders },
          )

        if (!authUser.user.email)
          return NextResponse.json(
            { error: "The invited account has no email address." },

            { status: 409, headers: responseHeaders },
          )

        const { data: companyDetails, error: companyDetailsError } = await admin

          .from("companies")

          .select("name, slug")

          .eq("id", access.companyId)

          .maybeSingle()

        if (companyDetailsError || !companyDetails?.slug)
          return NextResponse.json(
            { error: "Unable to load the inviting company." },

            { status: 500, headers: responseHeaders },
          )

        const invitationId = crypto.randomUUID()

        const { error: invitationInsertError } = await admin

          .from("workspace_invitations")

          .insert({
            id: invitationId,

            company_id: access.companyId,

            user_id: userId,

            role_id: membership.role_id,
          })

        if (invitationInsertError) {
          console.error(
            "Workspace invitation renewal record creation failed",
            invitationInsertError,
          )

          return NextResponse.json(
            { error: "Unable to create a fresh invitation link." },

            { status: 500, headers: responseHeaders },
          )
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

        const publicKey =
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseUrl || !publicKey) {
          const { error: cleanupError } = await admin

            .from("workspace_invitations")

            .delete()

            .eq("id", invitationId)

          if (cleanupError)
            console.error(
              "Failed to remove invitation record without email configuration",

              cleanupError,
            )

          return NextResponse.json(
            { error: "Invitation email delivery is not configured." },

            { status: 503, headers: responseHeaders },
          )
        }

        const siteUrl =
          process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
          new URL(request.url).origin

        const redirectUrl = new URL(
          `/${encodeURIComponent(companyDetails.slug)}`,

          siteUrl,
        )

        redirectUrl.searchParams.set("invite", "1")

        redirectUrl.searchParams.set("invitation_id", invitationId)

        const mailer = createClient(supabaseUrl, publicKey, {
          auth: {
            autoRefreshToken: false,

            persistSession: false,
          },
        })

        const { error: emailError } = await mailer.auth.signInWithOtp({
          email: authUser.user.email,

          options: {
            shouldCreateUser: false,

            emailRedirectTo: redirectUrl.toString(),
          },
        })

        if (emailError) {
          const { error: cleanupError } = await admin

            .from("workspace_invitations")

            .delete()

            .eq("id", invitationId)

          if (cleanupError)
            console.error(
              "Failed to remove invitation record after email delivery failure",

              cleanupError,
            )

          console.error("Workspace invitation email resend failed", emailError)

          return NextResponse.json(
            { error: "Unable to send the invitation email. Please try again." },

            { status: 502, headers: responseHeaders },
          )
        }

        return NextResponse.json(
          { success: true },

          { headers: responseHeaders },
        )
      }

      if (body.action === "change-role") {
        const roleId = typeof body.roleId === "string" ? body.roleId : ""

        if (!roleId)
          return NextResponse.json({ error: "Select a role." }, {
            status: 400,

            headers: responseHeaders,
          })

        const { data: role, error: roleError } = await admin

          .from("company_roles")

          .select("id, name")

          .eq("id", roleId)

          .eq("company_id", access.companyId)

          .maybeSingle()

        if (roleError || !role)
          return NextResponse.json(
            { error: "Selected role does not belong to this company." },

            { status: 400, headers: responseHeaders },
          )

        if (isPrimaryAdministratorRole(role.name))
          return NextResponse.json(
            {
              error:
                "The primary administrator role is reserved for the protected company user.",
            },

            { status: 400, headers: responseHeaders },
          )

        const { error } = await admin

          .from("company_memberships")

          .update({ role_id: roleId })

          .eq("company_id", access.companyId)

          .eq("user_id", userId)

        if (error)
          return NextResponse.json(
            { error: "Unable to change the user's role." },

            { status: 500, headers: responseHeaders },
          )

        return NextResponse.json({ success: true }, {
          headers: responseHeaders,
        })
      }

      if (body.action === "set-status") {
        const status = body.status

        if (status !== "active" && status !== "disabled")
          return NextResponse.json(
            { error: "Choose active or disabled status." },

            { status: 400, headers: responseHeaders },
          )

        const { error } = await admin

          .from("company_memberships")

          .update({ status })

          .eq("company_id", access.companyId)

          .eq("user_id", userId)

        if (error)
          return NextResponse.json(
            { error: "Unable to update the user's status." },

            { status: 500, headers: responseHeaders },
          )

        return NextResponse.json({ success: true }, {
          headers: responseHeaders,
        })
      }

      const { data: otherMemberships, error: otherMembershipsError } =
        await admin

          .from("company_memberships")

          .select("company_id")

          .eq("user_id", userId)

          .neq("company_id", access.companyId)

      if (otherMembershipsError)
        return NextResponse.json(
          { error: "Unable to verify the user's other company access." },

          { status: 500, headers: responseHeaders },
        )

      if (body.action === "revoke-invite") {
        const { data: authUser, error: authUserError } =
          await admin.auth.admin.getUserById(userId)

        if (authUserError || !authUser.user)
          return NextResponse.json(
            { error: "Unable to find the invited account." },

            { status: 404, headers: responseHeaders },
          )

        if (authUser.user.confirmed_at)
          return NextResponse.json(
            { error: "This user has already accepted the invitation." },

            { status: 409, headers: responseHeaders },
          )
      }

      if (!otherMemberships?.length) {
        const { error: disableError } = await admin

          .from("company_memberships")

          .update({ status: "disabled" })

          .eq("company_id", access.companyId)

          .eq("user_id", userId)

        if (disableError) {
          console.error(
            "Company membership disable before account deletion failed",

            disableError,
          )

          return NextResponse.json(
            {
              error:
                "Unable to disable the user's company access before deletion.",
            },

            { status: 500, headers: responseHeaders },
          )
        }

        // Keep Auth user references in finance and audit history valid while preventing future sign-ins.

        const { error: deleteError } = await admin.auth.admin.deleteUser(
          userId,

          true,
        )

        if (deleteError) {
          console.error("Workspace user soft deletion failed", deleteError)

          return NextResponse.json(
            { error: "Unable to deactivate and remove the user's account." },

            { status: 500, headers: responseHeaders },
          )
        }

        const { error: membershipDeleteError } = await admin

          .from("company_memberships")

          .delete()

          .eq("company_id", access.companyId)

          .eq("user_id", userId)

        if (membershipDeleteError) {
          console.error(
            "Company membership removal after account deletion failed",

            membershipDeleteError,
          )

          return NextResponse.json(
            {
              error:
                "The account was deactivated, but its company membership could not be removed.",
            },

            { status: 500, headers: responseHeaders },
          )
        }
      } else {
        const { error } = await admin

          .from("company_memberships")

          .delete()

          .eq("company_id", access.companyId)

          .eq("user_id", userId)

        if (error) {
          console.error("Workspace company membership removal failed", error)

          return NextResponse.json(
            {
              error:
                body.action === "revoke-invite"
                  ? "Unable to revoke the company invitation."
                  : "Unable to remove the user from this company.",
            },

            { status: 500, headers: responseHeaders },
          )
        }
      }

      return NextResponse.json({ success: true }, { headers: responseHeaders })
    }

    if (body.action === "create-role") {
      if (!access.canManageRoles)
        return NextResponse.json(
          {
            error:
              "Only main-branch users with role-management permission can manage company roles.",
          },

          { status: 403, headers: responseHeaders },
        )

      const name = typeof body.name === "string" ? body.name.trim() : ""

      const description =
        typeof body.description === "string" ? body.description.trim() : ""

      const requestedPermissions = parseRequestedPermissions(body.permissions)

      if (!name || name.length > 100)
        return NextResponse.json(
          { error: "Role name must be between 1 and 100 characters." },

          { status: 400, headers: responseHeaders },
        )

      if (!description || description.length > 1000)
        return NextResponse.json(
          { error: "Role duties must be between 1 and 1,000 characters." },

          { status: 400, headers: responseHeaders },
        )

      if (!requestedPermissions)
        return NextResponse.json(
          { error: "Provide the exact list of selected permissions." },

          { status: 400, headers: responseHeaders },
        )

      const { data: catalog, error: catalogError } = await admin

        .from("permissions")

        .select("code")

      if (catalogError)
        return NextResponse.json(
          { error: "Unable to validate the selected permissions." },

          { status: 500, headers: responseHeaders },
        )

      const allowedPermissions = new Set(
        (catalog ?? []).map((permission) => permission.code),
      )

      if (
        requestedPermissions.some(
          (permission) => !allowedPermissions.has(permission),
        )
      ) {
        return NextResponse.json(
          { error: "One or more selected permissions are invalid." },

          { status: 400, headers: responseHeaders },
        )
      }

      if (
        !isRecruitmentAgentRole(name) &&
        requestedPermissions.includes("agent_finance.view")
      ) {
        return NextResponse.json(
          {
            error:
              "Agent finance access is restricted to the protected Recruitment Agent role.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      if (
        isRecruitmentAgentRole(name) &&
        requestedPermissions.some(isRecruitmentAgentRestrictedPermission)
      ) {
        return NextResponse.json(
          {
            error:
              "Recruitment Agent roles cannot be granted Human Resource, Company Drive, Approvals, Tasks, or Communications access.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      const { data: role, error: roleError } = await admin

        .from("company_roles")

        .insert({
          company_id: access.companyId,

          name,

          description,

          is_system_default: false,
        })

        .select("id, name, description, created_at, access_settings")

        .single()

      if (roleError || !role) {
        return NextResponse.json(
          {
            error:
              roleError?.code === "23505"
                ? "A role with that name already exists."
                : "Unable to create role.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      const { data: savedPermissions, error: savePermissionsError } =
        await admin.rpc("replace_company_role_permissions", {
          requested_role_id: role.id,

          requested_company_id: access.companyId,

          requested_permissions: requestedPermissions,
        })

      if (savePermissionsError || !savedPermissions) {
        console.error(
          `[create-role] Failed to save permissions for role ${role.id}:`,

          savePermissionsError,
        )

        await admin

          .from("company_roles")

          .delete()

          .eq("id", role.id)

          .eq("company_id", access.companyId)

        return NextResponse.json(
          { error: "Unable to save role permissions." },

          { status: 500, headers: responseHeaders },
        )
      }

      return NextResponse.json(
        {
          role: {
            ...role,

            access_settings: roleAccessSettings(
              role.access_settings,
              role.name,
            ),
          },

          permissions: savedPermissions,
        },
        {
          status: 201,

          headers: responseHeaders,
        },
      )
    }

    // ── update-role ──────────────────────────────────────────────────────────────

    if (body.action === "update-role") {
      if (!access.canManageRoles)
        return NextResponse.json(
          { error: "You do not have permission to manage roles." },

          { status: 403, headers: responseHeaders },
        )

      const roleId = typeof body.roleId === "string" ? body.roleId.trim() : ""

      const name = typeof body.name === "string" ? body.name.trim() : ""

      const description =
        typeof body.description === "string" ? body.description.trim() : ""

      const requestedPermissions = parseRequestedPermissions(body.permissions)

      const requestedAccessSettings = body.accessSettings

      if (!roleId)
        return NextResponse.json({ error: "Select a role to update." }, {
          status: 400,

          headers: responseHeaders,
        })

      if (!name || name.length > 100)
        return NextResponse.json(
          { error: "Role name must be between 1 and 100 characters." },

          { status: 400, headers: responseHeaders },
        )

      if (!description || description.length > 1000)
        return NextResponse.json(
          { error: "Role duties must be between 1 and 1,000 characters." },

          { status: 400, headers: responseHeaders },
        )

      if (!requestedPermissions)
        return NextResponse.json(
          { error: "Provide the exact list of selected permissions." },

          { status: 400, headers: responseHeaders },
        )

      if (!isRoleAccessSettings(requestedAccessSettings))
        return NextResponse.json(
          { error: "Provide valid role access settings." },

          { status: 400, headers: responseHeaders },
        )

      // Verify role belongs to this company and get its current state

      const { data: existingRole, error: existingRoleError } = await admin

        .from("company_roles")

        .select("id, name, is_system_default, access_settings")

        .eq("id", roleId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (existingRoleError || !existingRole)
        return NextResponse.json({ error: "Role not found in this company." }, {
          status: 404,

          headers: responseHeaders,
        })

      if (
        isRecruitmentAgentRole(existingRole.name) !==
        isRecruitmentAgentRole(name)
      ) {
        return NextResponse.json(
          { error: "The Recruitment Agent role name cannot be changed." },

          { status: 403, headers: responseHeaders },
        )
      }

      if (
        !isRecruitmentAgentRole(name) &&
        requestedPermissions.includes("agent_finance.view")
      ) {
        return NextResponse.json(
          {
            error:
              "Agent finance access is restricted to the protected Recruitment Agent role.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      if (
        isRecruitmentAgentRole(name) &&
        requestedPermissions.some(isRecruitmentAgentRestrictedPermission)
      ) {
        return NextResponse.json(
          {
            error:
              "Recruitment Agent roles cannot be granted Human Resource, Company Drive, Approvals, Tasks, or Communications access.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      // The primary admin role name is immutable — protect it from rename

      const isPrimaryAdminRole = isPrimaryAdministratorRole(existingRole.name)

      if (isPrimaryAdminRole && name !== existingRole.name) {
        return NextResponse.json(
          { error: "The primary administrator role name cannot be changed." },

          { status: 403, headers: responseHeaders },
        )
      }

      // Validate all requested permission codes against catalog

      const { data: catalog, error: catalogError } = await admin

        .from("permissions")

        .select("code")

      if (catalogError)
        return NextResponse.json(
          { error: "Unable to validate the selected permissions." },

          { status: 500, headers: responseHeaders },
        )

      const allowedPermissions = new Set((catalog ?? []).map((p) => p.code))

      if (requestedPermissions.some((p) => !allowedPermissions.has(p))) {
        return NextResponse.json(
          { error: "One or more selected permissions are invalid." },

          { status: 400, headers: responseHeaders },
        )
      }

      // Update name and description

      const { data: updatedRole, error: updateError } = await admin

        .from("company_roles")

        .update({
          name,

          description,

          access_settings: roleAccessSettings(requestedAccessSettings, name),
        })

        .eq("id", roleId)

        .eq("company_id", access.companyId)

        .select(
          "id, name, description, is_system_default, created_at, access_settings",
        )

        .single()

      if (updateError || !updatedRole) {
        return NextResponse.json(
          {
            error:
              updateError?.code === "23505"
                ? "A role with that name already exists."
                : "Unable to update role.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      // Replace permissions: delete all existing, insert new set

      const { data: savedPermissions, error: savePermissionsError } =
        await admin.rpc("replace_company_role_permissions", {
          requested_role_id: roleId,

          requested_company_id: access.companyId,

          requested_permissions: requestedPermissions,
        })

      if (savePermissionsError || !savedPermissions) {
        console.error(
          `[update-role] Failed to save permissions for role ${roleId}:`,

          savePermissionsError,
        )

        return NextResponse.json(
          { error: "Unable to update role permissions." },

          { status: 500, headers: responseHeaders },
        )
      }

      return NextResponse.json(
        {
          role: {
            ...updatedRole,

            access_settings: roleAccessSettings(
              updatedRole.access_settings,

              updatedRole.name,
            ),
          },

          permissions: savedPermissions,
        },

        { headers: responseHeaders },
      )
    }

    // ── delete-role ──────────────────────────────────────────────────────────────

    if (body.action === "delete-role") {
      if (!access.canManageRoles)
        return NextResponse.json(
          { error: "You do not have permission to manage roles." },

          { status: 403, headers: responseHeaders },
        )

      const roleId = typeof body.roleId === "string" ? body.roleId.trim() : ""

      if (!roleId)
        return NextResponse.json({ error: "Select a role to delete." }, {
          status: 400,

          headers: responseHeaders,
        })

      // Verify role belongs to this company

      const { data: existingRole, error: existingRoleError } = await admin

        .from("company_roles")

        .select("id, name, is_system_default")

        .eq("id", roleId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (existingRoleError || !existingRole)
        return NextResponse.json({ error: "Role not found in this company." }, {
          status: 404,

          headers: responseHeaders,
        })

      // Primary admin role and its system-default partners cannot be deleted

      if (isPrimaryAdministratorRole(existingRole.name)) {
        return NextResponse.json(
          { error: "The primary administrator role cannot be deleted." },

          { status: 403, headers: responseHeaders },
        )
      }

      // Cannot delete a role that is currently assigned to users

      const { count, error: memberCountError } = await admin

        .from("company_memberships")

        .select("user_id", { count: "exact", head: true })

        .eq("company_id", access.companyId)

        .eq("role_id", roleId)

      if (memberCountError)
        return NextResponse.json(
          { error: "Unable to verify role membership." },

          { status: 500, headers: responseHeaders },
        )

      if (count && count > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete a role that is assigned to ${count} user${
              count === 1 ? "" : "s"
            }. Reassign them first.`,
          },

          { status: 409, headers: responseHeaders },
        )
      }

      const { error: deleteError } = await admin

        .from("company_roles")

        .delete()

        .eq("id", roleId)

        .eq("company_id", access.companyId)

      if (deleteError)
        return NextResponse.json({ error: "Unable to delete role." }, {
          status: 500,

          headers: responseHeaders,
        })

      return NextResponse.json({ ok: true }, { headers: responseHeaders })
    }

    if (body.action === "invite-user") {
      const name = typeof body.name === "string" ? body.name.trim() : ""

      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

      const phone = typeof body.phone === "string" ? body.phone.trim() : ""

      const branch = typeof body.branch === "string" ? body.branch.trim() : ""

      const roleId = typeof body.roleId === "string" ? body.roleId : ""

      const branchId = typeof body.branchId === "string" ? body.branchId : ""
      const userTypeSelection = parseUserTypeSelection(body, name, branchId)

      if (
        !name ||
        name.length > 200 ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !roleId ||
        !branchId ||
        phone.length > 100 ||
        branch.length > 200 ||
        !userTypeSelection
      ) {
        return NextResponse.json(
          {
            error:
              "Enter valid account details and complete all required staff information.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      const { data: targetBranch, error: targetBranchError } = await admin

        .from("company_branches")

        .select("id, status")

        .eq("id", branchId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (targetBranchError)
        return NextResponse.json(
          { error: "Unable to verify the selected branch." },

          { status: 500, headers: responseHeaders },
        )

      if (
        !targetBranch ||
        targetBranch.status !== "active" ||
        (!access.isMainBranch &&
          !access.isPrimaryAdmin &&
          branchId !== access.branchId)
      ) {
        return NextResponse.json(
          { error: "Select a branch you are authorized to assign." },

          { status: 403, headers: responseHeaders },
        )
      }

      const { data: role, error: roleError } = await admin

        .from("company_roles")

        .select("id, name")

        .eq("id", roleId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (roleError || !role)
        return NextResponse.json(
          { error: "Selected role does not belong to this company." },

          { status: 400, headers: responseHeaders },
        )

      if (isPrimaryAdministratorRole(role.name)) {
        return NextResponse.json(
          {
            error:
              "The primary administrator role is reserved for the protected company user.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      if (userTypeSelection.staffInput) {
        const staffValidationError = await validateStaffInvitation(
          admin,
          access.companyId,
          userTypeSelection.staffInput,
          access.isMainBranch || access.isPrimaryAdmin,
          access.branchId,
        )
        if (staffValidationError)
          return NextResponse.json({ error: staffValidationError }, {
            status: 400,
            headers: responseHeaders,
          })
      }

      const { data: company, error: companyError } = await admin

        .from("companies")

        .select("name, slug")

        .eq("id", access.companyId)

        .maybeSingle()

      if (companyError || !company || !company.slug)
        return NextResponse.json(
          { error: "Unable to load the inviting company." },

          { status: 500, headers: responseHeaders },
        )

      const invitationId = crypto.randomUUID()

      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin

      const redirectUrl = new URL(
        `/${encodeURIComponent(company.slug)}`,
        siteUrl,
      )

      redirectUrl.searchParams.set("invite", "1")

      redirectUrl.searchParams.set("invitation_id", invitationId)

      const { data: inviteData, error: inviteError } =
        await admin.auth.admin.inviteUserByEmail(email, {
          data: {
            full_name: name,

            company_name: company.name,

            role_name: role.name,
          },

          redirectTo: redirectUrl.toString(),
        })

      if (inviteError || !inviteData.user) {
        return NextResponse.json(
          { error: inviteError?.message ?? "Unable to send invitation." },

          { status: 400, headers: responseHeaders },
        )
      }

      const userId = inviteData.user.id

      const { error: invitationMetadataError } =
        await admin.auth.admin.updateUserById(userId, {
          app_metadata: {
            ...inviteData.user.app_metadata,

            invitation_company_id: access.companyId,
          },
        })

      if (invitationMetadataError) {
        await admin.auth.admin.deleteUser(userId)

        return NextResponse.json(
          {
            error:
              "Invitation was sent but its company assignment could not be saved. Send a new invitation.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      const { error: profileError } = await admin

        .from("profiles")

        .upsert({ id: userId, display_name: name, phone, branch })

      if (profileError) {
        console.error(
          "Workspace invitation profile creation failed",
          profileError,
        )

        const { error: cleanupError } =
          await admin.auth.admin.deleteUser(userId)

        if (cleanupError) {
          console.error(
            "Failed to remove invited account after profile creation failed",

            cleanupError,
          )
        }

        return NextResponse.json(
          {
            error:
              "Invitation was created but the user's profile could not be saved.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      const { error: membershipError } = await admin

        .from("company_memberships")

        .insert({
          company_id: access.companyId,

          user_id: userId,

          role_id: roleId,

          branch_id: branchId,

          status: "active",
        })

      if (membershipError) {
        console.error(
          "Workspace invitation membership assignment failed",
          membershipError,
        )

        const { error: cleanupError } =
          await admin.auth.admin.deleteUser(userId)

        if (cleanupError) {
          console.error(
            "Failed to remove invited account after membership assignment failed",

            cleanupError,
          )
        }

        return NextResponse.json(
          {
            error:
              "Invitation was created but could not be assigned to the company role.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      if (userTypeSelection.staffInput) {
        try {
          await insertInvitedStaffRecord(
            admin,
            access.companyId,
            access.userId,
            userId,
            userTypeSelection.staffInput,
          )
        } catch (staffError) {
          console.error("Invited staff record creation failed", staffError)
          const { error: cleanupError } =
            await admin.auth.admin.deleteUser(userId)
          if (cleanupError)
            console.error(
              "Failed to remove account after staff setup failed",
              cleanupError,
            )
          return NextResponse.json(
            {
              error:
                "The invitation could not be completed because the staff record was not created. The invitation account was removed; please try again.",
            },
            { status: 500, headers: responseHeaders },
          )
        }
      }

      const { error: invitationError } = await admin

        .from("workspace_invitations")

        .insert({
          id: invitationId,

          company_id: access.companyId,

          user_id: userId,

          role_id: roleId,
        })

      if (invitationError) {
        if (userTypeSelection.staffInput) {
          const { error: staffCleanupError } = await admin
            .from("company_staff_members")
            .delete()
            .eq("company_id", access.companyId)
            .eq("linked_user_id", userId)
          if (staffCleanupError)
            console.error(
              "Invited staff record cleanup failed",
              staffCleanupError,
            )
        }
        const { error: cleanupError } =
          await admin.auth.admin.deleteUser(userId)
        if (cleanupError)
          console.error("Invited account cleanup failed", cleanupError)

        return NextResponse.json(
          {
            error:
              "Invitation was sent but its one-hour acceptance record could not be saved. Send a new invitation.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      return NextResponse.json(
        {
          user: {
            id: userId,

            name,

            email,

            phone,

            branch,

            roleId,

            status: "invited",

            userType: userTypeSelection.userType,
          },
        },

        { status: 201, headers: responseHeaders },
      )
    }

    // ── create-user-with-password ─────────────────────────────────────────────

    // Creates a confirmed workspace user with a temporary password set by the admin.

    // The user will be forced to change this password on their first login.

    if (body.action === "create-user-with-password") {
      const name = typeof body.name === "string" ? body.name.trim() : ""

      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

      const phone = typeof body.phone === "string" ? body.phone.trim() : ""

      const branch = typeof body.branch === "string" ? body.branch.trim() : ""

      const roleId = typeof body.roleId === "string" ? body.roleId : ""

      const branchId = typeof body.branchId === "string" ? body.branchId : ""
      const userTypeSelection = parseUserTypeSelection(body, name, branchId)

      const password = typeof body.password === "string" ? body.password : ""

      if (
        !name ||
        name.length > 200 ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        !roleId ||
        !branchId ||
        phone.length > 100 ||
        branch.length > 200 ||
        !userTypeSelection
      ) {
        return NextResponse.json(
          { error: "Enter a valid name, email, role, phone, and branch." },

          { status: 400, headers: responseHeaders },
        )
      }

      const { data: targetBranch, error: targetBranchError } = await admin

        .from("company_branches")

        .select("id, status")

        .eq("id", branchId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (targetBranchError)
        return NextResponse.json(
          { error: "Unable to verify the selected branch." },

          { status: 500, headers: responseHeaders },
        )

      if (
        !targetBranch ||
        targetBranch.status !== "active" ||
        (!access.isMainBranch &&
          !access.isPrimaryAdmin &&
          branchId !== access.branchId)
      ) {
        return NextResponse.json(
          { error: "Select a branch you are authorized to assign." },

          { status: 403, headers: responseHeaders },
        )
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: "The default password must be at least 8 characters." },

          { status: 400, headers: responseHeaders },
        )
      }

      const { data: role, error: roleError } = await admin

        .from("company_roles")

        .select("id, name")

        .eq("id", roleId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (roleError || !role)
        return NextResponse.json(
          { error: "Selected role does not belong to this company." },

          { status: 400, headers: responseHeaders },
        )

      if (isPrimaryAdministratorRole(role.name)) {
        return NextResponse.json(
          {
            error:
              "The primary administrator role is reserved for the protected company user.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      if (userTypeSelection.staffInput) {
        const staffValidationError = await validateStaffInvitation(
          admin,
          access.companyId,
          userTypeSelection.staffInput,
          access.isMainBranch || access.isPrimaryAdmin,
          access.branchId,
        )
        if (staffValidationError)
          return NextResponse.json({ error: staffValidationError }, {
            status: 400,
            headers: responseHeaders,
          })
      }

      // Check for an existing user with this email

      const { data: existingUsers } = await admin.auth.admin.listUsers({
        perPage: 1000,
      })

      const existing = existingUsers?.users.find(
        (u) => u.email?.toLowerCase() === email,
      )

      if (existing) {
        return NextResponse.json(
          { error: "A user with this email address already exists." },

          { status: 409, headers: responseHeaders },
        )
      }

      // Create the auth user with email_confirm = true (no invite email sent)

      const { data: createdUser, error: createError } =
        await admin.auth.admin.createUser({
          email,

          password,

          email_confirm: true,

          user_metadata: { full_name: name },
        })

      if (createError || !createdUser.user) {
        return NextResponse.json(
          {
            error: createError?.message ?? "Unable to create the user account.",
          },

          { status: 400, headers: responseHeaders },
        )
      }

      const userId = createdUser.user.id

      // Upsert profile, set must_change_password = true

      const { error: profileError } = await admin.from("profiles").upsert({
        id: userId,

        display_name: name,

        phone,

        branch,

        must_change_password: true,
      })

      if (profileError) {
        await admin.auth.admin.deleteUser(userId)

        return NextResponse.json(
          { error: "User was created but their profile could not be saved." },

          { status: 500, headers: responseHeaders },
        )
      }

      // Insert company membership

      const { error: membershipError } = await admin

        .from("company_memberships")

        .insert({
          company_id: access.companyId,

          user_id: userId,

          role_id: roleId,

          branch_id: branchId,

          status: "active",
        })

      if (membershipError) {
        await admin.auth.admin.deleteUser(userId)

        return NextResponse.json(
          {
            error:
              "User was created but could not be assigned to the company role.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      if (userTypeSelection.staffInput) {
        try {
          await insertInvitedStaffRecord(
            admin,
            access.companyId,
            access.userId,
            userId,
            userTypeSelection.staffInput,
          )
        } catch (staffError) {
          console.error("New staff account record creation failed", staffError)
          const { error: cleanupError } =
            await admin.auth.admin.deleteUser(userId)
          if (cleanupError)
            console.error(
              "Failed to remove account after staff setup failed",
              cleanupError,
            )
          return NextResponse.json(
            {
              error:
                "The user account was created but the staff record could not be saved. The account was removed; please try again.",
            },
            { status: 500, headers: responseHeaders },
          )
        }
      }

      return NextResponse.json(
        {
          user: {
            id: userId,

            name,

            email,

            phone,

            branch,

            roleId,

            status: "active",

            userType: userTypeSelection.userType,
          },
        },

        { status: 201, headers: responseHeaders },
      )
    }

    return NextResponse.json({ error: "Unsupported user management action." }, {
      status: 400,

      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Workspace user management update failed", error)

    return NextResponse.json(
      { error: "Unable to save user management changes." },

      { status: 503, headers: responseHeaders },
    )
  }
}
