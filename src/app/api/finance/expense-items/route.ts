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

  if (membershipError || !membership)
    return {
      error: "Active company membership not found.",

      status: 403 as const,
    }

  const permissionCodes = [
    "finance.view",

    "finance.create",

    "requisitions.view",

    "requisitions.create",

    "requisitions.verify",
  ] as const

  const [permissionResults, roleResult] = await Promise.all([
    Promise.all(
      permissionCodes.map((permission) =>
        supabase.rpc("current_user_has_company_permission", {
          requested_company_id: membership.company_id,

          requested_permission: permission,
        }),
      ),
    ),

    supabase

      .from("company_roles")

      .select("name, is_system_default")

      .eq("id", membership.role_id)

      .eq("company_id", membership.company_id)

      .maybeSingle(),
  ])

  if (permissionResults.some((result) => result.error) || roleResult.error)
    return {
      error: "Unable to verify company item catalog access.",

      status: 503 as const,
    }

  const [
    canViewFinance,

    canCreateExpense,

    canViewRequisitions,

    hasRequisitionCreatePermission,

    canVerifyRequisitions,
  ] = permissionResults.map((result) => Boolean(result.data))

  const canCreateRequisition =
    roleResult.data?.name.trim().toLocaleLowerCase() ===
      "administration officer" &&
    roleResult.data?.is_system_default === true &&
    hasRequisitionCreatePermission

  const canView = [
    canViewFinance,

    canCreateExpense,

    canViewRequisitions,

    hasRequisitionCreatePermission,

    canVerifyRequisitions,
  ].some(Boolean)

  const canCreate =
    canCreateExpense || canCreateRequisition || canVerifyRequisitions

  if (!canView)
    return {
      error: "You do not have permission to view company items.",

      status: 403 as const,
    }

  return {
    admin: createAdminClient(),

    companyId: membership.company_id,

    userId: user.id,

    canCreate,
  }
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers },
      )

    if (!access.admin)
      return NextResponse.json(
        {
          error: "The company item catalog requires SUPABASE_SERVICE_ROLE_KEY.",
        },

        { status: 503, headers },
      )

    const { data, error } = await access.admin

      .from("company_expense_items")

      .select("id, name")

      .eq("company_id", access.companyId)

      .order("name")

    if (error) {
      console.error("Company item catalog query failed", error)

      return NextResponse.json(
        { error: "Unable to load the company item catalog." },

        { status: 500, headers },
      )
    }

    return NextResponse.json({ items: data ?? [] }, { headers })
  } catch (error) {
    console.error("Company item catalog GET failed", error)

    return NextResponse.json(
      { error: "The company item catalog is unavailable." },

      { status: 503, headers },
    )
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers },
      )

    if (!access.canCreate)
      return NextResponse.json(
        { error: "You do not have permission to add company catalog items." },

        { status: 403, headers },
      )

    if (!access.admin)
      return NextResponse.json(
        {
          error: "The company item catalog requires SUPABASE_SERVICE_ROLE_KEY.",
        },

        { status: 503, headers },
      )

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const name = typeof body?.name === "string" ? body.name.trim() : ""

    if (!name || name.length > 200)
      return NextResponse.json(
        { error: "Enter an item name of 1 to 200 characters." },

        { status: 400, headers },
      )

    const { data, error } = await access.admin

      .from("company_expense_items")

      .insert({
        company_id: access.companyId,

        name,

        created_by: access.userId,
      })

      .select("id, name")

      .single()

    if (error?.code === "23505") {
      const { data: existingItems, error: lookupError } = await access.admin

        .from("company_expense_items")

        .select("id, name")

        .eq("company_id", access.companyId)

      if (lookupError) {
        console.error("Duplicate catalog item lookup failed", lookupError)

        return NextResponse.json(
          { error: "An item with that name already exists." },

          { status: 409, headers },
        )
      }

      const existing = (existingItems ?? []).find(
        (item) =>
          item.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      )

      if (existing) return NextResponse.json({ item: existing }, { headers })
    }

    if (error || !data) {
      console.error("Company catalog item creation failed", error)

      return NextResponse.json(
        { error: "Unable to add this company catalog item." },

        { status: 500, headers },
      )
    }

    return NextResponse.json({ item: data }, { status: 201, headers })
  } catch (error) {
    console.error("Company item catalog POST failed", error)

    return NextResponse.json(
      { error: "The company item catalog is unavailable." },

      { status: 503, headers },
    )
  }
}
