import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import {
  getProjectAccess,
  getProjectAssignmentContext,
} from "@/lib/server/projects"

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

async function getAccess() {
  const access = await getProjectAccess()

  if ("error" in access) return access

  const [assignmentContext, { data: membership, error: membershipError }] =
    await Promise.all([
      getProjectAssignmentContext(access),

      access.supabase

        .from("company_memberships")

        .select("role_id")

        .eq("company_id", access.companyId)

        .eq("user_id", access.userId)

        .eq("status", "active")

        .maybeSingle(),
    ])

  if (membershipError || !membership) {
    console.error(
      "Assistant Staff settings membership lookup failed",
      membershipError,
    )

    return { error: "Unable to verify company access.", status: 503 as const }
  }

  const { data: role, error: roleError } = await access.supabase

    .from("company_roles")

    .select("name")

    .eq("company_id", access.companyId)

    .eq("id", membership.role_id)

    .maybeSingle()

  if (roleError || !role) {
    console.error("Assistant Staff settings role lookup failed", roleError)

    return { error: "Unable to verify settings access.", status: 503 as const }
  }

  const roleName = role.name.trim().toLocaleLowerCase()

  const canManage =
    assignmentContext.isChairman ||
    roleName === "chairman" ||
    roleName === "company owner / primary administrator"

  return {
    ...access,

    enabled: assignmentContext.assistantStaffEnabled,

    canManage,
  }
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,

        headers,
      })
    }

    return NextResponse.json(
      { enabled: access.enabled, canManage: access.canManage },

      { headers },
    )
  } catch (error) {
    console.error("Assistant Staff settings GET failed", error)

    return NextResponse.json(
      { error: "Assistant Staff settings are unavailable." },

      { status: 503, headers },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,

        headers,
      })
    }

    if (!access.canManage) {
      return NextResponse.json(
        { error: "Only the Chairman can change Assistant Staff settings." },

        { status: 403, headers },
      )
    }

    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown
    } | null

    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json(
        { error: "Choose whether Assistant Staff is enabled." },

        { status: 400, headers },
      )
    }

    const admin = createAdminClient()

    if (!admin) {
      return NextResponse.json(
        { error: "Assistant Staff settings are unavailable on this server." },

        { status: 503, headers },
      )
    }

    const { data, error } = await admin

      .from("companies")

      .update({ assistant_staff_enabled: body.enabled })

      .eq("id", access.companyId)

      .select("assistant_staff_enabled")

      .single()

    if (error || !data) {
      console.error("Assistant Staff setting update failed", error)

      return NextResponse.json(
        { error: "Unable to update the Assistant Staff setting." },

        { status: 500, headers },
      )
    }

    return NextResponse.json(
      { enabled: data.assistant_staff_enabled, canManage: access.canManage },

      { headers },
    )
  } catch (error) {
    console.error("Assistant Staff settings PATCH failed", error)

    return NextResponse.json(
      { error: "Assistant Staff settings are unavailable." },

      { status: 503, headers },
    )
  }
}
