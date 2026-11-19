import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>

type PositionAccess = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>

  admin: AdminClient

  companyId: string

  userId: string

  canManage: boolean
}

type AccessError = { error: string; status: number }

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

async function getAccess(): Promise<PositionAccess | AccessError> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError) {
    console.error("Position membership lookup failed", membershipError)

    return { error: "Unable to verify company access.", status: 503 }
  }

  if (!membership)
    return { error: "Active company membership not found.", status: 403 }

  const admin = createAdminClient()

  if (!admin)
    return {
      error: "Server is not configured for position management.",

      status: 503,
    }

  const [{ data: company, error: companyError }, permissionResult] =
    await Promise.all([
      admin

        .from("companies")

        .select("primary_admin_user_id")

        .eq("id", membership.company_id)

        .maybeSingle(),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "staff.positions.manage",
      }),
    ])

  if (companyError || !company) {
    console.error("Position company lookup failed", companyError)

    return { error: "Unable to verify company access.", status: 503 }
  }

  const isPrimaryAdmin = company.primary_admin_user_id === user.id

  if (permissionResult.error && !isPrimaryAdmin) {
    console.error("Position permission check failed", permissionResult.error)

    return {
      error: "Unable to verify position-management access.",
      status: 503,
    }
  }

  return {
    supabase,

    admin,

    companyId: membership.company_id,

    userId: user.id,

    canManage: isPrimaryAdmin || Boolean(permissionResult.data),
  }
}

function accessErrorResponse(access: AccessError) {
  return NextResponse.json(
    { error: access.error },

    { status: access.status, headers: responseHeaders },
  )
}

function canManageResponse() {
  return NextResponse.json(
    { error: "You do not have permission to manage company positions." },

    { status: 403, headers: responseHeaders },
  )
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access) return accessErrorResponse(access)

    let query = access.admin

      .from("company_positions")

      .select("id, name, is_active, created_at, updated_at")

      .eq("company_id", access.companyId)

    if (!access.canManage) query = query.eq("is_active", true)

    const { data, error } = await query.order("name")

    if (error) {
      console.error("Company positions query failed", error)

      return NextResponse.json(
        { error: "Unable to load company positions." },

        { status: 500, headers: responseHeaders },
      )
    }

    return NextResponse.json(
      { positions: data ?? [], canManage: access.canManage },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Company positions GET failed", error)

    return NextResponse.json(
      { error: "Company positions are unavailable." },

      { status: 503, headers: responseHeaders },
    )
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access) return accessErrorResponse(access)

    if (!access.canManage) return canManageResponse()

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const name = typeof body?.name === "string" ? body.name.trim() : ""

    if (!name || name.length > 150)
      return NextResponse.json(
        { error: "Enter a position name (up to 150 characters)." },

        { status: 400, headers: responseHeaders },
      )

    const { data, error } = await access.admin

      .from("company_positions")

      .insert({
        company_id: access.companyId,

        name,

        created_by: access.userId,

        updated_by: access.userId,
      })

      .select("id, name, is_active, created_at, updated_at")

      .single()

    if (error?.code === "23505")
      return NextResponse.json(
        { error: `A position named "${name}" already exists.` },

        { status: 409, headers: responseHeaders },
      )

    if (error) {
      console.error("Company position creation failed", error)

      return NextResponse.json(
        { error: "Unable to create the position." },

        { status: 500, headers: responseHeaders },
      )
    }

    return NextResponse.json({ position: data }, {
      status: 201,

      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Company positions POST failed", error)

    return NextResponse.json(
      { error: "Position management is unavailable." },

      { status: 503, headers: responseHeaders },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access) return accessErrorResponse(access)

    if (!access.canManage) return canManageResponse()

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body || !isUuid(body.id))
      return NextResponse.json(
        { error: "Select a valid position." },

        { status: 400, headers: responseHeaders },
      )

    const updates: {
      name?: string

      is_active?: boolean

      updated_by: string

      updated_at: string
    } = {
      updated_by: access.userId,

      updated_at: new Date().toISOString(),
    }

    if (typeof body.name === "string") {
      const name = body.name.trim()

      if (!name || name.length > 150)
        return NextResponse.json(
          { error: "Enter a position name (up to 150 characters)." },

          { status: 400, headers: responseHeaders },
        )

      updates.name = name
    }

    if (typeof body.isActive === "boolean") updates.is_active = body.isActive

    if (updates.name === undefined && updates.is_active === undefined)
      return NextResponse.json(
        { error: "Provide a position name or active status to update." },

        { status: 400, headers: responseHeaders },
      )

    const { data, error } = await access.admin

      .from("company_positions")

      .update(updates)

      .eq("id", body.id)

      .eq("company_id", access.companyId)

      .select("id, name, is_active, created_at, updated_at")

      .maybeSingle()

    if (error?.code === "23505")
      return NextResponse.json(
        { error: `A position named "${updates.name}" already exists.` },

        { status: 409, headers: responseHeaders },
      )

    if (error) {
      console.error("Company position update failed", error)

      return NextResponse.json(
        { error: "Unable to update the position." },

        { status: 500, headers: responseHeaders },
      )
    }

    if (!data)
      return NextResponse.json(
        { error: "Position not found." },

        { status: 404, headers: responseHeaders },
      )

    return NextResponse.json({ position: data }, { headers: responseHeaders })
  } catch (error) {
    console.error("Company positions PATCH failed", error)

    return NextResponse.json(
      { error: "Position management is unavailable." },

      { status: 503, headers: responseHeaders },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access) return accessErrorResponse(access)

    if (!access.canManage) return canManageResponse()

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body || !isUuid(body.id))
      return NextResponse.json(
        { error: "Select a valid position." },

        { status: 400, headers: responseHeaders },
      )

    const { data, error } = await access.admin

      .from("company_positions")

      .delete()

      .eq("id", body.id)

      .eq("company_id", access.companyId)

      .select("id")

      .maybeSingle()

    if (error) {
      console.error("Company position deletion failed", error)

      return NextResponse.json(
        { error: "Unable to delete the position." },

        { status: 500, headers: responseHeaders },
      )
    }

    if (!data)
      return NextResponse.json(
        { error: "Position not found." },

        { status: 404, headers: responseHeaders },
      )

    return NextResponse.json({ success: true }, { headers: responseHeaders })
  } catch (error) {
    console.error("Company positions DELETE failed", error)

    return NextResponse.json(
      { error: "Position management is unavailable." },

      { status: 503, headers: responseHeaders },
    )
  }
}
