import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getAccess() {
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

  if (membershipError) {
    console.error(
      "Case-handler settings membership lookup failed",
      membershipError,
    )

    return { error: "Unable to verify company access.", status: 503 as const }
  }

  if (!membership)
    return {
      error: "Active company membership not found.",
      status: 403 as const,
    }

  const admin = createAdminClient()

  if (!admin)
    return {
      error: "Case-handler settings are unavailable on this server.",

      status: 503 as const,
    }

  const [
    { data: company, error: companyError },

    { data: role, error: roleError },
  ] = await Promise.all([
    admin
      .from("companies")

      .select("primary_admin_user_id, case_handlers_enabled")

      .eq("id", membership.company_id)

      .maybeSingle(),

    admin
      .from("company_roles")

      .select("name")

      .eq("id", membership.role_id)

      .eq("company_id", membership.company_id)

      .maybeSingle(),
  ])

  if (companyError || !company || roleError || !role) {
    console.error(
      "Case-handler settings access lookup failed",
      companyError ?? roleError,
    )

    return { error: "Unable to load company settings.", status: 503 as const }
  }

  const roleName = role.name.trim().toLocaleLowerCase()

  return {
    admin,

    companyId: membership.company_id,

    enabled: company.case_handlers_enabled,

    canManage:
      company.primary_admin_user_id === user.id ||
      roleName === "chairman" ||
      roleName === "company owner / primary administrator",
  }
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,

        headers,
      })

    return NextResponse.json(
      {
        enabled: access.enabled,

        canManage: access.canManage,
      },
      { headers },
    )
  } catch (error) {
    console.error("Case-handler settings GET failed", error)

    return NextResponse.json(
      { error: "Case-handler settings are unavailable." },
      {
        status: 503,

        headers,
      },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,

        headers,
      })

    if (!access.canManage)
      return NextResponse.json(
        { error: "Only the Chairman can enable case handlers." },
        {
          status: 403,

          headers,
        },
      )

    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown
    } | null

    if (typeof body?.enabled !== "boolean")
      return NextResponse.json(
        { error: "Choose whether case handlers are enabled." },
        {
          status: 400,

          headers,
        },
      )

    const { data, error } = await access.admin

      .from("companies")

      .update({ case_handlers_enabled: body.enabled })

      .eq("id", access.companyId)

      .select("case_handlers_enabled")

      .single()

    if (error || !data) {
      console.error("Case-handler setting update failed", error)

      return NextResponse.json(
        { error: "Unable to update the case-handler setting." },
        {
          status: 500,

          headers,
        },
      )
    }

    return NextResponse.json(
      {
        enabled: data.case_handlers_enabled,

        canManage: access.canManage,
      },
      { headers },
    )
  } catch (error) {
    console.error("Case-handler settings PATCH failed", error)

    return NextResponse.json(
      { error: "Case-handler settings are unavailable." },
      {
        status: 503,

        headers,
      },
    )
  }
}
