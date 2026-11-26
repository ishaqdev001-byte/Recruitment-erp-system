import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

type AssignmentType = "case_handler" | "assistant_staff"

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function parseType(value: string | null): AssignmentType | null {
  return value === "case_handler" || value === "assistant_staff" ? value : null
}

function parseTarget(value: unknown) {
  if (typeof value !== "string") return null

  const separator = value.indexOf(":")

  const kind = separator === -1 ? "" : value.slice(0, separator)

  const id = separator === -1 ? "" : value.slice(separator + 1)

  if (
    !["member", "staff"].includes(kind) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    return null
  }

  return { kind, id }
}

async function getAccess(type: AssignmentType) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id, role_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError || !membership) {
    if (membershipError)
      console.error("Eligibility membership lookup failed", membershipError)

    return {
      error: "Active company membership not found.",
      status: 403 as const,
    }
  }

  const admin = createAdminClient()

  if (!admin)
    return {
      error: "Assignment eligibility is unavailable on this server.",
      status: 503 as const,
    }

  const [{ data: company, error: companyError }, permissionResult] =
    await Promise.all([
      admin

        .from("companies")

        .select(
          "primary_admin_user_id, case_handlers_enabled, assistant_staff_enabled",
        )

        .eq("id", membership.company_id)

        .maybeSingle(),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission:
          type === "case_handler"
            ? "candidates.case_handler.assign"
            : "projects.assign",
      }),
    ])

  if (companyError || !company || permissionResult.error) {
    console.error(
      "Assignment eligibility access lookup failed",

      companyError ?? permissionResult.error,
    )

    return {
      error: "Unable to verify assignment access.",
      status: 503 as const,
    }
  }

  const { data: role, error: roleError } = await admin

    .from("company_roles")

    .select("name")

    .eq("company_id", membership.company_id)

    .eq("id", membership.role_id)

    .maybeSingle()

  if (roleError || !role) {
    console.error("Assignment eligibility role lookup failed", roleError)

    return {
      error: "Unable to verify assignment access.",
      status: 503 as const,
    }
  }

  const roleName = role.name.trim().toLocaleLowerCase()

  const isChairman =
    company.primary_admin_user_id === user.id ||
    roleName === "chairman" ||
    roleName === "company owner / primary administrator"

  const enabled =
    type === "case_handler"
      ? company.case_handlers_enabled
      : company.assistant_staff_enabled

  return {
    admin,

    companyId: membership.company_id,

    userId: user.id,

    enabled,

    canManage: isChairman || Boolean(permissionResult.data),

    isChairman,
  }
}

async function getRoster(
  type: AssignmentType,
  access: Awaited<ReturnType<typeof getAccess>>,
) {
  if ("error" in access) throw new Error(access.error)

  const { data: memberships, error: membershipError } = await access.admin

    .from("company_memberships")

    .select("user_id, role_id")

    .eq("company_id", access.companyId)

    .eq("status", "active")

  const { data: staff, error: staffError } = await access.admin

    .from("company_staff_members")

    .select("id, name, position, linked_user_id")

    .eq("company_id", access.companyId)

    .eq("status", "Active")

    .order("name")

  const { data: eligibility, error: eligibilityError } = await access.admin

    .from("company_assignment_eligibility")

    .select("user_id, staff_id")

    .eq("company_id", access.companyId)

    .eq("assignment_type", type)

  if (membershipError || staffError || eligibilityError) {
    throw membershipError ?? staffError ?? eligibilityError
  }

  const activeMemberships = memberships ?? []

  const activeStaff = staff ?? []

  const profileIds = [
    ...new Set([
      ...activeMemberships.map((membership) => membership.user_id),

      ...(eligibility ?? []).flatMap((entry) =>
        entry.user_id ? [entry.user_id] : [],
      ),
    ]),
  ]

  const [
    { data: profiles, error: profileError },
    { data: roles, error: roleError },
  ] = await Promise.all([
    profileIds.length
      ? access.admin
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),

    activeMemberships.length
      ? access.admin

          .from("company_roles")

          .select("id, name")

          .eq("company_id", access.companyId)

          .in("id", [...new Set(activeMemberships.map((item) => item.role_id))])
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profileError || roleError) throw profileError ?? roleError

  const profileName = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.display_name || "Company member",
    ]),
  )

  const roleName = new Map((roles ?? []).map((role) => [role.id, role.name]))

  const staffByUserId = new Map(
    activeStaff

      .filter((record) => record.linked_user_id)

      .map((record) => [record.linked_user_id!, record]),
  )

  const eligibleStaffIds = new Set(
    (eligibility ?? []).flatMap((entry) =>
      entry.staff_id ? [entry.staff_id] : [],
    ),
  )

  const eligibleStaffUserIds = new Set(
    activeStaff

      .filter(
        (record) => record.linked_user_id && eligibleStaffIds.has(record.id),
      )

      .map((record) => record.linked_user_id!),
  )

  const available =
    type === "case_handler"
      ? activeMemberships.map((membership) => {
          const staffRecord = staffByUserId.get(membership.user_id)

          return {
            key: `member:${membership.user_id}`,

            name:
              staffRecord?.name ||
              profileName.get(membership.user_id) ||
              "Company member",

            detail: staffRecord
              ? `Staff · ${staffRecord.position || "No position"}`
              : roleName.get(membership.role_id) || "Company member",
          }
        })
      : [
          ...activeStaff.map((record) => ({
            key: `staff:${record.id}`,

            name: record.name,

            detail: record.position || "Staff",
          })),

          ...activeMemberships

            .filter(
              (membership) => !eligibleStaffUserIds.has(membership.user_id),
            )

            .map((membership) => ({
              key: `member:${membership.user_id}`,

              name: profileName.get(membership.user_id) || "Company member",

              detail: roleName.get(membership.role_id) || "Company member",
            })),
        ]

  const availableByKey = new Map(available.map((entry) => [entry.key, entry]))

  const eligible = (eligibility ?? []).map((entry) => {
    const key = entry.staff_id
      ? `staff:${entry.staff_id}`
      : `member:${entry.user_id}`

    const current = availableByKey.get(key)

    return (
      current ?? {
        key,

        name: entry.staff_id
          ? "Inactive staff record"
          : profileName.get(entry.user_id!) || "Former company member",

        detail: entry.staff_id ? "Inactive staff" : "Inactive member",
      }
    )
  })

  const eligibleKeys = new Set(eligible.map((entry) => entry.key))

  return {
    eligible: eligible.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),

    available: available

      .filter((entry) => !eligibleKeys.has(entry.key))

      .sort((left, right) => left.name.localeCompare(right.name)),
  }
}

export async function GET(request: Request) {
  try {
    const type = parseType(new URL(request.url).searchParams.get("type"))

    if (!type)
      return NextResponse.json({ error: "Choose an assignment type." }, {
        status: 400,
        headers,
      })

    const access = await getAccess(type)

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    const roster = access.canManage
      ? await getRoster(type, access)
      : { eligible: [], available: [] }

    return NextResponse.json(
      { enabled: access.enabled, canManage: access.canManage, ...roster },

      { headers },
    )
  } catch (error) {
    console.error("Assignment eligibility GET failed", error)

    return NextResponse.json(
      { error: "Unable to load assignment eligibility." },
      { status: 503, headers },
    )
  }
}

async function changeEligibility(request: Request, method: "POST" | "DELETE") {
  try {
    const body = (await request.json().catch(() => null)) as {
      type?: unknown

      target?: unknown
    } | null

    const type = parseType(typeof body?.type === "string" ? body.type : null)

    let target = parseTarget(body?.target)

    if (
      !type ||
      !target ||
      (type === "case_handler" && target.kind !== "member")
    )
      return NextResponse.json(
        { error: "Choose a valid active member or staff record." },
        { status: 400, headers },
      )

    const access = await getAccess(type)

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    if (!access.canManage)
      return NextResponse.json(
        {
          error: "You do not have permission to manage this assignment roster.",
        },
        { status: 403, headers },
      )

    if (!access.enabled)
      return NextResponse.json(
        { error: "Enable this assignment feature before managing its roster." },
        { status: 409, headers },
      )

    if (method === "POST") {
      if (target.kind === "member") {
        const { data, error } = await access.admin

          .from("company_memberships")

          .select("user_id")

          .eq("company_id", access.companyId)

          .eq("user_id", target.id)

          .eq("status", "active")

          .maybeSingle()

        if (error) throw error

        if (!data)
          return NextResponse.json(
            { error: "Select an active member of this company." },
            { status: 400, headers },
          )

        if (type === "assistant_staff") {
          const { data: linkedStaff, error: linkedStaffError } =
            await access.admin
              .from("company_staff_members")
              .select("id")
              .eq("company_id", access.companyId)
              .eq("linked_user_id", target.id)
              .eq("status", "Active")
              .limit(2)
          if (linkedStaffError) throw linkedStaffError
          if (linkedStaff?.length === 1)
            target = { kind: "staff", id: linkedStaff[0].id }
        }
      } else {
        const { data, error } = await access.admin

          .from("company_staff_members")

          .select("id")

          .eq("company_id", access.companyId)

          .eq("id", target.id)

          .eq("status", "Active")

          .maybeSingle()

        if (error) throw error

        if (!data)
          return NextResponse.json(
            { error: "Select an active staff record in this company." },
            { status: 400, headers },
          )
      }

      const { error } = await access.admin

        .from("company_assignment_eligibility")

        .insert({
          company_id: access.companyId,

          assignment_type: type,

          user_id: target.kind === "member" ? target.id : null,

          staff_id: target.kind === "staff" ? target.id : null,
        })

      if (error) {
        if (error.code === "23505")
          return NextResponse.json(
            { error: "This person is already on the assignment list." },
            { status: 409, headers },
          )

        throw error
      }
    } else {
      let query = access.admin

        .from("company_assignment_eligibility")

        .delete()

        .eq("company_id", access.companyId)

        .eq("assignment_type", type)

      query =
        target.kind === "member"
          ? query.eq("user_id", target.id)
          : query.eq("staff_id", target.id)

      const { error } = await query

      if (error) throw error
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error(`Assignment eligibility ${method} failed`, error)

    return NextResponse.json(
      { error: "Unable to update the assignment roster." },
      { status: 503, headers },
    )
  }
}

export async function POST(request: Request) {
  return changeEligibility(request, "POST")
}

export async function DELETE(request: Request) {
  return changeEligibility(request, "DELETE")
}
