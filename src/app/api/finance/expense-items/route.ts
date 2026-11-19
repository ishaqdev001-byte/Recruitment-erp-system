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
    "expense_requests.create",
    "expense_items.manage",
    "expense_items.custom",
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
    canCreateExpenseRequests,
    canManageCatalog,
    canUseCustomItems,
  ] = permissionResults.map((result) => Boolean(result.data))

  const canView = [
    canViewFinance,

    canCreateExpense,

    canViewRequisitions,

    hasRequisitionCreatePermission,

    canVerifyRequisitions,
    canCreateExpenseRequests,
    canManageCatalog,
    canUseCustomItems,
  ].some(Boolean)

  const roleName = roleResult.data?.name ?? ""
  const canManage =
    canManageCatalog ||
    roleName === "Chairman" ||
    roleName === "Company Owner / Primary Administrator"

  if (!canView)
    return {
      error: "You do not have permission to view company items.",

      status: 403 as const,
    }

  return {
    admin: createAdminClient(),

    companyId: membership.company_id,

    userId: user.id,

    canManage,
    canUseCustomItems,
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

    const [{ data, error }, { data: company, error: companyError }] =
      await Promise.all([
        access.admin
          .from("company_expense_items")
          .select("id, name, item_code, is_active")
          .eq("company_id", access.companyId)
          .order("item_code"),
        access.admin
          .from("companies")
          .select("expense_item_catalog_enabled, primary_admin_user_id")
          .eq("id", access.companyId)
          .maybeSingle(),
      ])

    if (companyError || !company) {
      console.error("Company item catalog settings query failed", companyError)
      return NextResponse.json(
        { error: "Unable to load company item catalog settings." },
        { status: 500, headers },
      )
    }

    const canManage =
      access.canManage || company.primary_admin_user_id === access.userId
    let visibleItems = data ?? []
    if (!canManage) visibleItems = visibleItems.filter((item) => item.is_active)

    if (error) {
      console.error("Company item catalog query failed", error)

      return NextResponse.json(
        { error: "Unable to load the company item catalog." },

        { status: 500, headers },
      )
    }

    return NextResponse.json(
      {
        items: visibleItems,
        enabled: company.expense_item_catalog_enabled,
        canManage,
        canToggle: company.primary_admin_user_id === access.userId,
        canUseCustomItems: access.canUseCustomItems,
      },
      { headers },
    )
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

    if (!access.canManage)
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

      .select("id, name, item_code, is_active")

      .single()

    if (error?.code === "23505") {
      const { data: existingItems, error: lookupError } = await access.admin

        .from("company_expense_items")

        .select("id, name, item_code, is_active")

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

      if (existing) {
        if (!existing.is_active && access.canManage) {
          const { data: reactivated, error: reactivateError } = await access.admin
            .from("company_expense_items")
            .update({ is_active: true })
            .eq("id", existing.id)
            .eq("company_id", access.companyId)
            .select("id, name, item_code, is_active")
            .single()
          if (reactivateError) {
            console.error("Duplicate catalog item reactivation failed", reactivateError)
            return NextResponse.json(
              { error: "Unable to reactivate the existing catalog item." },
              { status: 500, headers },
            )
          }
          return NextResponse.json({ item: reactivated }, { headers })
        }
        return NextResponse.json({ item: existing }, { headers })
      }
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

export async function PATCH(request: Request) {
  try {
    const access = await getAccess()
    if ("error" in access)
      return NextResponse.json(
        { error: access.error },
        { status: access.status, headers },
      )
    if (!access.canManage)
      return NextResponse.json(
        { error: "You do not have permission to manage company catalog items." },
        { status: 403, headers },
      )
    if (!access.admin)
      return NextResponse.json(
        { error: "The company item catalog requires SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503, headers },
      )

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (!body)
      return NextResponse.json({ error: "Provide catalog settings." }, {
        status: 400,
        headers,
      })

    if (typeof body.catalogEnabled === "boolean") {
      const { data: company, error: companyError } = await access.admin
        .from("companies")
        .select("primary_admin_user_id")
        .eq("id", access.companyId)
        .maybeSingle()
      if (companyError || !company) {
        console.error("Company owner lookup failed", companyError)
        return NextResponse.json(
          { error: "Unable to verify company ownership." },
          { status: 500, headers },
        )
      }
      if (company.primary_admin_user_id !== access.userId)
        return NextResponse.json(
          { error: "Only the Chairman can enable or disable the item catalog." },
          { status: 403, headers },
        )

      const { error } = await access.admin
        .from("companies")
        .update({ expense_item_catalog_enabled: body.catalogEnabled })
        .eq("id", access.companyId)
      if (error) {
        console.error("Company item catalog toggle failed", error)
        return NextResponse.json(
          { error: "Unable to update the company item catalog setting." },
          { status: 500, headers },
        )
      }
      return NextResponse.json({ enabled: body.catalogEnabled }, { headers })
    }

    const itemId =
      typeof body.id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.id,
      )
        ? body.id
        : ""
    const updates: { name?: string; is_active?: boolean } = {}
    if (typeof body.name === "string") {
      const name = body.name.trim()
      if (!name || name.length > 200)
        return NextResponse.json(
          { error: "Enter an item name of 1 to 200 characters." },
          { status: 400, headers },
        )
      updates.name = name
    }
    if (typeof body.isActive === "boolean") updates.is_active = body.isActive
    if (!itemId || Object.keys(updates).length === 0)
      return NextResponse.json(
        { error: "Provide an item and a new name or active status." },
        { status: 400, headers },
      )

    const { data, error } = await access.admin
      .from("company_expense_items")
      .update(updates)
      .eq("id", itemId)
      .eq("company_id", access.companyId)
      .select("id, name, item_code, is_active")
      .maybeSingle()
    if (error?.code === "23505")
      return NextResponse.json(
        { error: "An item with that name already exists." },
        { status: 409, headers },
      )
    if (error || !data) {
      if (error) console.error("Company catalog item update failed", error)
      return NextResponse.json(
        { error: error ? "Unable to update the catalog item." : "Catalog item not found." },
        { status: error ? 500 : 404, headers },
      )
    }
    return NextResponse.json({ item: data }, { headers })
  } catch (error) {
    console.error("Company item catalog PATCH failed", error)
    return NextResponse.json(
      { error: "The company item catalog is unavailable." },
      { status: 503, headers },
    )
  }
}
