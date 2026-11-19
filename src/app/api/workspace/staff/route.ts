import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

import { parseStaffInput } from "@/lib/server/staff-input"

import { loadCompanyWorkCalendar } from "@/lib/server/company-work-calendar"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getStaffAccess() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id, role_id, branch_id")

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
        "Set SUPABASE_SERVICE_ROLE_KEY in the server environment to enable staff management.",
      status: 503 as const,
    }

  const [
    { data: company, error: companyError },
    { data: role, error: roleError },
  ] = await Promise.all([
    admin
      .from("companies")
      .select("primary_admin_user_id")
      .eq("id", membership.company_id)
      .maybeSingle(),

    admin
      .from("company_roles")
      .select("name")
      .eq("id", membership.role_id)
      .eq("company_id", membership.company_id)
      .maybeSingle(),
  ])

  if (companyError || roleError || !company || !role)
    return {
      error: "Unable to verify staff-management access.",
      status: 500 as const,
    }

  const isPrimaryAdmin = company.primary_admin_user_id === user.id

  let isMainBranch = isPrimaryAdmin

  if (!isPrimaryAdmin) {
    const { data, error: branchError } = await supabase.rpc(
      "current_user_is_main_branch_user",
      {
        requested_company_id: membership.company_id,
      },
    )

    if (branchError)
      return {
        error: "Unable to verify your company branch.",
        status: 503 as const,
      }

    isMainBranch = Boolean(data)
  }

  if (!isMainBranch && !membership.branch_id) {
    return {
      error: "Your account must be assigned to a branch.",
      status: 403 as const,
    }
  }

  const allowedRoles = ["Chairman", "CEO", "General Manager"]

  if (!isPrimaryAdmin && !allowedRoles.includes(role.name)) {
    return {
      error:
        "Staff records are limited to the Chairman, CEO, and General Manager.",
      status: 403 as const,
    }
  }

  // Chairman (primary admin) can change the staff ID prefix and sequence.

  // CEO and GM can manage staff records but cannot change the ID settings.

  const canChangeSequence = isPrimaryAdmin || role.name === "Chairman"

  return {
    admin,

    companyId: membership.company_id,

    userId: user.id,

    branchId: membership.branch_id ?? null,

    isMainBranch,

    primaryAdminId: company.primary_admin_user_id,

    isPrimaryAdmin,

    canChangeSequence,
  }
}

function ownerInitials(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .replace(/[^a-z]/gi, "")
    .toUpperCase()
    .slice(0, 6)

  return initials || "STAFF"
}

function mapStaff(record: Record<string, unknown>) {
  return {
    id: String(record.id),

    staffId: String(record.staff_id),

    name: String(record.name),

    positionId: String(record.position_id ?? ""),

    position: String(record.position),

    phone: String(record.phone ?? ""),

    status: String(record.status),

    dateJoined: String(record.date_joined),

    branchId: String(record.branch_id ?? ""),

    linkedUserId: String(record.linked_user_id ?? ""),

    lineManagerStaffId: String(record.line_manager_staff_id ?? ""),

    payType: String(record.pay_type ?? "payroll"),

    baseSalary: Number(record.base_salary ?? 0),

    weeklyTransportAllowance: Number(record.weekly_transport_allowance ?? 0),

    transportAccountMode: String(record.transport_account_mode ?? "fixed"),

    transportAccountId: String(record.transport_account_id ?? ""),
  }
}

export async function GET() {
  try {
    const access = await getStaffAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    const { data: profile } = await access.admin
      .from("profiles")
      .select("display_name")
      .eq("id", access.primaryAdminId)
      .maybeSingle()

    const { data: ownerAuth } = await access.admin.auth.admin.getUserById(
      access.primaryAdminId,
    )

    const ownerName =
      profile?.display_name ||
      String(
        ownerAuth.user?.user_metadata?.full_name ??
          ownerAuth.user?.email?.split("@")[0] ??
          "",
      )

    let { data: settings, error: settingsError } = await access.admin
      .from("company_staff_id_settings")

      .select("staff_id_prefix, next_sequence")

      .eq("company_id", access.companyId)

      .maybeSingle()

    if (settingsError) throw settingsError

    if (!settings) {
      const inserted = await access.admin
        .from("company_staff_id_settings")

        .insert({
          company_id: access.companyId,
          staff_id_prefix: ownerInitials(ownerName),
          next_sequence: 1,
        })

        .select("staff_id_prefix, next_sequence")

        .single()

      if (inserted.error?.code === "23505") {
        const current = await access.admin
          .from("company_staff_id_settings")
          .select("staff_id_prefix, next_sequence")
          .eq("company_id", access.companyId)
          .single()

        if (current.error) throw current.error

        settings = current.data
      } else {
        if (inserted.error) throw inserted.error

        settings = inserted.data
      }
    }

    const canChooseStaffBranch = access.isMainBranch || access.isPrimaryAdmin

    const branchFilter = canChooseStaffBranch ? null : access.branchId

    const [
      { data: staff, error: staffError },

      { data: accounts, error: accountsError },

      { data: branches, error: branchesError },

      { data: positions, error: positionsError },

      workCalendar,
    ] = await Promise.all([
      (() => {
        let q = access.admin
          .from("company_staff_members")

          .select(
            "id, staff_id, name, position_id, position, phone, status, date_joined, branch_id, linked_user_id, line_manager_staff_id, pay_type, base_salary, weekly_transport_allowance, transport_account_mode, transport_account_id",
          )

          .eq("company_id", access.companyId)

        if (branchFilter) q = q.eq("branch_id", branchFilter)

        return q.order("created_at", { ascending: false })
      })(),

      (() => {
        let q = access.admin
          .from("company_accounts")

          .select("id, name, account_type, account_number")

          .eq("company_id", access.companyId)

          .eq("status", "active")

        if (branchFilter) q = q.eq("branch_id", branchFilter)

        return q.order("name")
      })(),

      (() => {
        let q = access.admin
          .from("company_branches")

          .select("id, name, code, is_main_branch")

          .eq("company_id", access.companyId)

          .eq("status", "active")

        if (branchFilter) q = q.eq("id", branchFilter)

        return q.order("name")
      })(),

      access.admin
        .from("company_positions")
        .select("id, name, is_active")
        .eq("company_id", access.companyId)
        .order("name"),

      loadCompanyWorkCalendar(access.admin, access.companyId),
    ])

    if (staffError || accountsError || branchesError || positionsError)
      throw staffError ?? accountsError ?? branchesError ?? positionsError

    return NextResponse.json(
      {
        staff: (staff ?? []).map((record) =>
          mapStaff(record as Record<string, unknown>),
        ),

        accounts: accounts ?? [],

        positions: positions ?? [],

        workCalendar,

        branches: (branches ?? []).map((branch) => ({
          id: branch.id,

          name: branch.name,

          code: branch.code,

          isMainBranch: branch.is_main_branch,
        })),

        branchSelectionRequired: canChooseStaffBranch,

        canDeleteStaff: access.isPrimaryAdmin,

        settings: {
          prefix: settings.staff_id_prefix,
          nextSequence: settings.next_sequence,
          canChangeSequence: access.canChangeSequence,
        },
      },
      { headers },
    )
  } catch (error) {
    console.error("Company staff request failed", error)

    return NextResponse.json(
      {
        error:
          "Staff records are unavailable. Apply the company staff and accounts migrations and try again.",
      },
      { status: 503, headers },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getStaffAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    if (!access.isPrimaryAdmin)
      return NextResponse.json(
        { error: "Only the Chairman can delete staff records." },
        { status: 403, headers },
      )

    const body = (await request.json().catch(() => null)) as
      | { id?: unknown }
      | null
    const id = typeof body?.id === "string" ? body.id : ""

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      return NextResponse.json(
        { error: "Select a valid staff record to delete." },
        { status: 400, headers },
      )

    const { data: linkedUserId, error } = await access.admin.rpc(
      "delete_company_staff_member_and_membership",
      {
        requested_company_id: access.companyId,
        requested_staff_member_id: id,
      },
    )

    if (error?.code === "P0002")
      return NextResponse.json(
        { error: "Staff member not found." },
        { status: 404, headers },
      )

    if (error?.code === "42501")
      return NextResponse.json(
        { error: "The Chairman staff record cannot be deleted." },
        { status: 403, headers },
      )

    if (error?.code === "P0001")
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers },
      )

    if (error) {
      console.error("Company staff deletion failed", error)
      return NextResponse.json(
        { error: "Unable to delete this staff record." },
        { status: 500, headers },
      )
    }

    return NextResponse.json(
      {
        success: true,
        removedCompanyMembership: Boolean(linkedUserId),
      },
      { headers },
    )
  } catch (error) {
    console.error("Company staff deletion failed", error)
    return NextResponse.json(
      { error: "Unable to delete this staff record." },
      { status: 500, headers },
    )
  }
}

export async function POST(request: Request) {
  try {
    const access = await getStaffAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const input = body ? parseStaffInput(body) : null

    if (!input)
      return NextResponse.json(
        {
          error:
            "Choose a pay arrangement. Payroll staff need a positive base salary; a weekly transport allowance needs an active funding account.",
        },
        { status: 400, headers },
      )

    const { data: position, error: positionError } = await access.admin
      .from("company_positions")
      .select("id, name")
      .eq("id", input.positionId)
      .eq("company_id", access.companyId)
      .eq("is_active", true)
      .maybeSingle()

    if (positionError) throw positionError

    if (!position)
      return NextResponse.json(
        { error: "Select an active position from Settings." },
        { status: 400, headers },
      )

    const branchId =
      access.isMainBranch || access.isPrimaryAdmin
        ? input.branchId
        : access.branchId

    if (!branchId || !/^[0-9a-f-]{36}$/i.test(branchId)) {
      return NextResponse.json(
        { error: "Select the branch where this staff member will work." },
        { status: 400, headers },
      )
    }

    const { data: branch, error: branchError } = await access.admin
      .from("company_branches")

      .select("id")

      .eq("id", branchId)

      .eq("company_id", access.companyId)

      .eq("status", "active")

      .maybeSingle()

    if (branchError) throw branchError

    if (!branch)
      return NextResponse.json(
        { error: "Select an active branch from this company." },
        { status: 400, headers },
      )

    if (input.lineManagerStaffId) {
      let managerQuery = access.admin
        .from("company_staff_members")

        .select("id")

        .eq("id", input.lineManagerStaffId)

        .eq("company_id", access.companyId)

        .eq("status", "Active")

      if (!access.isMainBranch && !access.isPrimaryAdmin)
        managerQuery = managerQuery.eq("branch_id", branchId)

      const { data: manager, error: managerError } =
        await managerQuery.maybeSingle()

      if (managerError) throw managerError

      if (!manager)
        return NextResponse.json(
          {
            error:
              "Choose an active line manager from your authorized staff list.",
          },
          { status: 400, headers },
        )
    }

    const { data: allocation, error: allocationError } = await access.admin.rpc(
      "allocate_company_staff_sequence",
      { requested_company_id: access.companyId },
    )

    if (allocationError) throw allocationError

    const sequence = (
      Array.isArray(allocation) ? allocation[0] : allocation
    ) as {
      staff_id_prefix: string
      sequence_number: number | string
    } | null

    if (!sequence) throw new Error("Staff ID sequence is not configured.")

    const staffId = `${sequence.staff_id_prefix}-${String(sequence.sequence_number).padStart(4, "0")}`

    if (input.linkedUserId) {
      let memberQuery = access.admin
        .from("company_memberships")
        .select("user_id, branch_id")

        .eq("company_id", access.companyId)
        .eq("user_id", input.linkedUserId)
        .eq("status", "active")

      if (!access.isMainBranch && !access.isPrimaryAdmin)
        memberQuery = memberQuery.eq("branch_id", access.branchId!)

      const { data: membership, error: membershipError } =
        await memberQuery.maybeSingle()

      if (membershipError) throw membershipError

      if (!membership)
        return NextResponse.json(
          { error: "Link an active user in this company." },
          { status: 400, headers },
        )
    }

    if (input.transportAccountId) {
      let accountQuery = access.admin
        .from("company_accounts")
        .select("id")

        .eq("id", input.transportAccountId)
        .eq("company_id", access.companyId)
        .eq("status", "active")

      if (!access.isMainBranch && !access.isPrimaryAdmin)
        accountQuery = accountQuery.eq("branch_id", access.branchId!)

      const { data: account, error: accountError } =
        await accountQuery.maybeSingle()

      if (accountError) throw accountError

      if (!account)
        return NextResponse.json(
          { error: "Choose an active funding account from this company." },
          { status: 400, headers },
        )
    }

    const { data: staff, error } = await access.admin
      .from("company_staff_members")
      .insert({
        company_id: access.companyId,

        branch_id: branchId,

        staff_id: staffId,

        linked_user_id: input.linkedUserId,

        line_manager_staff_id: input.lineManagerStaffId,

        ...{
          name: input.name,

          position_id: position.id,

          position: position.name,

          status: input.status,

          date_joined: input.dateJoined,

          pay_type: input.payType,

          base_salary: input.baseSalary,

          weekly_transport_allowance: input.weeklyTransportAllowance,

          transport_account_mode: input.transportAccountMode,

          transport_account_id: input.transportAccountId,

          created_by: access.userId,
        },
      })
      .select(
        "id, staff_id, name, position_id, position, phone, status, date_joined, branch_id, linked_user_id, line_manager_staff_id, pay_type, base_salary, weekly_transport_allowance, transport_account_mode, transport_account_id",
      )
      .single()

    if (error?.code === "23505")
      return NextResponse.json(
        { error: "That user is already linked to a staff record." },
        { status: 409, headers },
      )

    if (error || !staff)
      throw error ?? new Error("Staff record was not created.")

    return NextResponse.json(
      { staff: mapStaff(staff as Record<string, unknown>) },
      { status: 201, headers },
    )
  } catch (error) {
    console.error("Company staff creation failed", error)

    return NextResponse.json({ error: "Unable to add the staff member." }, {
      status: 500,
      headers,
    })
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getStaffAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body)
      return NextResponse.json({ error: "Invalid staff update." }, {
        status: 400,
        headers,
      })

    if (body.action === "update-individual-id") {
      if (!access.canChangeSequence) {
        return NextResponse.json(
          { error: "Only the Chairman can change staff IDs." },
          { status: 403, headers },
        )
      }

      const id = typeof body.id === "string" ? body.id : ""

      const prefix =
        typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : ""

      const sequence = Number(body.sequence)

      if (
        !/^[0-9a-f-]{36}$/i.test(id) ||
        !/^[A-Z][A-Z0-9]{0,9}$/.test(prefix) ||
        !Number.isInteger(sequence) ||
        sequence < 1 ||
        sequence > 999998
      ) {
        return NextResponse.json(
          {
            error: "Enter a valid staff ID number using the configured prefix.",
          },
          { status: 400, headers },
        )
      }

      const { data: staffId, error: staffIdError } = await access.admin.rpc(
        "update_company_staff_id_for_member",

        {
          requested_company_id: access.companyId,

          requested_staff_member_id: id,

          requested_sequence: sequence,

          requested_prefix: prefix,

          requested_branch_id: access.isMainBranch ? null : access.branchId,

          requested_updated_by: access.userId,
        },
      )

      if (staffIdError?.code === "23505") {
        return NextResponse.json(
          {
            error: "That staff ID is already assigned. Choose another number.",
          },
          { status: 409, headers },
        )
      }

      if (staffIdError?.code === "40001") {
        return NextResponse.json(
          {
            error:
              "The staff ID prefix changed. Refresh the staff list and try again.",
          },
          { status: 409, headers },
        )
      }

      if (staffIdError?.code === "P0002") {
        return NextResponse.json(
          { error: "Staff member or ID settings not found." },
          { status: 404, headers },
        )
      }

      if (staffIdError) throw staffIdError

      if (!staffId) throw new Error("Staff ID update returned no result.")

      return NextResponse.json({ staffId }, { headers })
    }

    if (body.action === "configure-ids") {
      if (!access.canChangeSequence)
        return NextResponse.json(
          { error: "Only the Chairman can change staff ID settings." },
          { status: 403, headers },
        )

      const prefix =
        typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : ""

      const startSequence = Number(body.nextSequence ?? 1)

      if (
        !/^[A-Z][A-Z0-9]{0,9}$/.test(prefix) ||
        !Number.isInteger(startSequence) ||
        startSequence < 1 ||
        startSequence > 999999
      ) {
        return NextResponse.json(
          {
            error:
              "Enter a 1-10 character prefix and a starting sequence between 1 and 999999.",
          },
          { status: 400, headers },
        )
      }

      // Fetch all existing staff ordered by creation date so re-numbering is stable

      const { data: existingStaff, error: fetchError } = await access.admin

        .from("company_staff_members")

        .select("id, staff_id")

        .eq("company_id", access.companyId)

        .order("created_at", { ascending: true })

      if (fetchError) throw fetchError

      const members = existingStaff ?? []

      // Re-stamp every existing staff member with the new prefix + sequential number

      let seq = startSequence

      const updates: { id: string; oldId: string; newId: string }[] = []

      for (const member of members) {
        const newStaffId = `${prefix}-${String(seq).padStart(4, "0")}`

        updates.push({
          id: member.id,
          oldId: member.staff_id,
          newId: newStaffId,
        })

        seq++
      }

      // Apply all re-stamps individually (unique constraint requires one at a time

      // to avoid collisions between old and new IDs in the same batch)

      for (const update of updates) {
        const { error: updateError } = await access.admin

          .from("company_staff_members")

          .update({ staff_id: update.newId })

          .eq("id", update.id)

          .eq("company_id", access.companyId)

        if (updateError) {
          console.error(
            `Failed to re-stamp staff ID ${update.oldId} → ${update.newId}`,
            updateError,
          )

          throw new Error(
            `Unable to update staff ID for ${update.oldId}. Check for conflicts and try again.`,
          )
        }
      }

      // next_sequence is the number that will be assigned to the NEXT new member

      const nextAfterExisting = seq // seq is now one past the last assigned number

      const { data: settings, error: settingsError } = await access.admin

        .from("company_staff_id_settings")

        .upsert({
          company_id: access.companyId,

          staff_id_prefix: prefix,

          next_sequence: nextAfterExisting,
        })

        .select("staff_id_prefix, next_sequence")

        .single()

      if (settingsError || !settings)
        throw settingsError ?? new Error("Staff ID settings were not updated.")

      return NextResponse.json(
        {
          settings: {
            prefix: settings.staff_id_prefix,

            nextSequence: settings.next_sequence,

            canChangeSequence: true,
          },

          restamped: updates.length,

          message:
            updates.length > 0
              ? `Staff ID settings saved. ${updates.length} existing staff member${
                  updates.length === 1 ? "'s ID was" : "s' IDs were"
                } updated to the ${prefix} prefix.`
              : `Staff ID prefix set to ${prefix}. No existing staff to update.`,
        },
        { headers },
      )
    }

    const id = typeof body.id === "string" ? body.id : ""

    const input = parseStaffInput(body)

    if (!/^[0-9a-f-]{36}$/i.test(id) || !input)
      return NextResponse.json(
        {
          error:
            "Choose a pay arrangement. Payroll staff need a positive base salary; a weekly transport allowance needs an active funding account.",
        },
        { status: 400, headers },
      )

    const branchId =
      access.isMainBranch || access.isPrimaryAdmin
        ? input.branchId
        : access.branchId

    if (!branchId || !/^[0-9a-f-]{36}$/i.test(branchId)) {
      return NextResponse.json(
        { error: "Select the branch where this staff member will work." },
        { status: 400, headers },
      )
    }

    const { data: branch, error: branchError } = await access.admin
      .from("company_branches")

      .select("id")

      .eq("id", branchId)

      .eq("company_id", access.companyId)

      .eq("status", "active")

      .maybeSingle()

    if (branchError) throw branchError

    if (!branch)
      return NextResponse.json(
        { error: "Select an active branch from this company." },
        { status: 400, headers },
      )

    if (input.lineManagerStaffId) {
      let managerQuery = access.admin
        .from("company_staff_members")

        .select("id")

        .eq("id", input.lineManagerStaffId)

        .eq("company_id", access.companyId)

        .eq("status", "Active")

        .neq("id", id)

      if (!access.isMainBranch && !access.isPrimaryAdmin)
        managerQuery = managerQuery.eq("branch_id", branchId)

      const { data: manager, error: managerError } =
        await managerQuery.maybeSingle()

      if (managerError) throw managerError

      if (!manager)
        return NextResponse.json(
          {
            error:
              "Choose an active line manager from your authorized staff list.",
          },
          { status: 400, headers },
        )
    }

    if (input.linkedUserId) {
      let memberQuery = access.admin
        .from("company_memberships")
        .select("user_id, branch_id")

        .eq("company_id", access.companyId)
        .eq("user_id", input.linkedUserId)
        .eq("status", "active")

      if (!access.isMainBranch && !access.isPrimaryAdmin)
        memberQuery = memberQuery.eq("branch_id", access.branchId!)

      const { data: membership, error: membershipError } =
        await memberQuery.maybeSingle()

      if (membershipError) throw membershipError

      if (!membership)
        return NextResponse.json(
          { error: "Link an active user in this company." },
          { status: 400, headers },
        )
    }

    if (input.transportAccountId) {
      let accountQuery = access.admin
        .from("company_accounts")
        .select("id")

        .eq("id", input.transportAccountId)
        .eq("company_id", access.companyId)
        .eq("status", "active")

      if (!access.isMainBranch && !access.isPrimaryAdmin)
        accountQuery = accountQuery.eq("branch_id", access.branchId!)

      const { data: account, error: accountError } =
        await accountQuery.maybeSingle()

      if (accountError) throw accountError

      if (!account)
        return NextResponse.json(
          { error: "Choose an active funding account from this company." },
          { status: 400, headers },
        )
    }

    const { data: currentStaff, error: currentStaffError } = await access.admin
      .from("company_staff_members")
      .select("position_id")
      .eq("company_id", access.companyId)
      .eq("id", id)
      .maybeSingle()

    if (currentStaffError) throw currentStaffError

    if (!currentStaff)
      return NextResponse.json({ error: "Staff member not found." }, {
        status: 404,
        headers,
      })

    const { data: position, error: positionError } = await access.admin
      .from("company_positions")
      .select("id, name, is_active")
      .eq("id", input.positionId)
      .eq("company_id", access.companyId)
      .maybeSingle()

    if (positionError) throw positionError

    if (
      !position ||
      (!position.is_active && currentStaff.position_id !== input.positionId)
    )
      return NextResponse.json(
        { error: "Select an active position from Settings." },
        { status: 400, headers },
      )

    let updateQuery = access.admin
      .from("company_staff_members")
      .update({
        name: input.name,

        position_id: position.id,

        position: position.name,

        status: input.status,

        date_joined: input.dateJoined,

        branch_id: branchId,

        line_manager_staff_id: input.lineManagerStaffId,

        linked_user_id: input.linkedUserId,

        pay_type: input.payType,

        base_salary: input.baseSalary,

        weekly_transport_allowance: input.weeklyTransportAllowance,

        transport_account_mode: input.transportAccountMode,

        transport_account_id: input.transportAccountId,

        updated_by: access.userId,
      })
      .eq("company_id", access.companyId)
      .eq("id", id)

    if (!access.isMainBranch && !access.isPrimaryAdmin)
      updateQuery = updateQuery.eq("branch_id", access.branchId!)

    const { data: staff, error } = await updateQuery

      .select(
        "id, staff_id, name, position_id, position, phone, status, date_joined, branch_id, linked_user_id, line_manager_staff_id, pay_type, base_salary, weekly_transport_allowance, transport_account_mode, transport_account_id",
      )

      .maybeSingle()

    if (error?.code === "23505")
      return NextResponse.json(
        { error: "That user is already linked to a staff record." },
        { status: 409, headers },
      )

    if (error) throw error

    if (!staff)
      return NextResponse.json({ error: "Staff member not found." }, {
        status: 404,
        headers,
      })

    return NextResponse.json(
      { staff: mapStaff(staff as Record<string, unknown>) },
      { headers },
    )
  } catch (error) {
    console.error("Company staff update failed", error)

    return NextResponse.json({ error: "Unable to update staff record." }, {
      status: 500,
      headers,
    })
  }
}
