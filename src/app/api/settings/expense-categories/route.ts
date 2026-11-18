import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

type ExpenseCategoryChanges = {
  name?: string
  is_active?: boolean
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
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

    .select("company_id")

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
        "Expense categories require SUPABASE_SERVICE_ROLE_KEY in the server environment.",
      status: 503 as const,
    }

  const { data: company, error: companyError } = await admin
    .from("companies")

    .select("primary_admin_user_id")

    .eq("id", membership.company_id)

    .maybeSingle()

  if (companyError || !company)
    return { error: "Unable to verify company access.", status: 500 as const }

  return {
    admin,

    companyId: membership.company_id,

    userId: user.id,

    canManage: company.primary_admin_user_id === user.id,
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

    let query = access.admin
      .from("expense_categories")

      .select("id, name, is_active, created_at")

      .eq("company_id", access.companyId)

      .order("name")

    if (!access.canManage) query = query.eq("is_active", true)

    const { data, error } = await query

    if (error) {
      console.error("Expense categories query failed", error)

      return NextResponse.json(
        {
          error:
            "Unable to load expense categories. Apply the company expense categories migration.",
        },
        { status: 500, headers },
      )
    }

    return NextResponse.json(
      { categories: data ?? [], canManage: access.canManage },
      { headers },
    )
  } catch (error) {
    console.error("Expense categories GET failed", error)

    return NextResponse.json({ error: "Expense categories are unavailable." }, {
      status: 503,
      headers,
    })
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    if (!access.canManage)
      return NextResponse.json(
        { error: "Only the Chairman can manage expense categories." },
        { status: 403, headers },
      )

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const name = typeof body?.name === "string" ? body.name.trim() : ""

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Enter an expense category name (up to 100 characters)." },
        { status: 400, headers },
      )
    }

    const { data, error } = await access.admin
      .from("expense_categories")
      .insert({
        company_id: access.companyId,

        name,

        created_by: access.userId,
      })
      .select("id, name, is_active, created_at")
      .single()

    if (error?.code === "23505") {
      return NextResponse.json(
        { error: `An expense category named "${name}" already exists.` },
        { status: 409, headers },
      )
    }

    if (error || !data) {
      console.error("Expense category creation failed", error)

      return NextResponse.json(
        { error: "Unable to create the expense category." },
        { status: 500, headers },
      )
    }

    return NextResponse.json({ category: data }, { status: 201, headers })
  } catch (error) {
    console.error("Expense categories POST failed", error)

    return NextResponse.json(
      { error: "Expense category management is unavailable." },
      { status: 503, headers },
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
        { error: "Only the Chairman can manage expense categories." },
        { status: 403, headers },
      )

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body || !isUuid(body.id)) {
      return NextResponse.json({ error: "Provide a valid expense category." }, {
        status: 400,
        headers,
      })
    }

    const updates: ExpenseCategoryChanges = {}

    if (typeof body.name === "string") {
      const name = body.name.trim()
      if (!name || name.length > 100) {
        return NextResponse.json(
          { error: "Enter an expense category name (up to 100 characters)." },
          { status: 400, headers },
        )
      }
      updates.name = name
    }

    if (typeof body.isActive === "boolean") updates.is_active = body.isActive

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Provide a new category name or active status." },
        { status: 400, headers },
      )
    }

    const { data, error } = await access.admin
      .from("expense_categories")

      .update(updates)

      .eq("id", body.id)

      .eq("company_id", access.companyId)

      .select("id, name, is_active, created_at")

      .maybeSingle()

    if (error?.code === "23505") {
      return NextResponse.json(
        {
          error: updates.name
            ? `An expense category named "${updates.name}" already exists.`
            : "Unable to update the expense category.",
        },
        { status: 409, headers },
      )
    }

    if (error || !data) {
      console.error("Expense category update failed", error)

      return NextResponse.json(
        {
          error: error
            ? "Unable to update the expense category."
            : "Expense category not found.",
        },
        { status: error ? 500 : 404, headers },
      )
    }

    return NextResponse.json({ category: data }, { headers })
  } catch (error) {
    console.error("Expense categories PATCH failed", error)

    return NextResponse.json(
      { error: "Expense category management is unavailable." },
      { status: 503, headers },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    if (!access.canManage)
      return NextResponse.json(
        { error: "Only the Chairman can manage expense categories." },
        { status: 403, headers },
      )

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body || !isUuid(body.id)) {
      return NextResponse.json({ error: "Provide a valid expense category." }, {
        status: 400,
        headers,
      })
    }

    const { data, error } = await access.admin
      .from("expense_categories")
      .delete()
      .eq("id", body.id)
      .eq("company_id", access.companyId)
      .select("id")
      .maybeSingle()

    if (error || !data) {
      if (error) console.error("Expense category deletion failed", error)
      return NextResponse.json(
        {
          error: error
            ? "Unable to delete the expense category."
            : "Expense category not found.",
        },
        { status: error ? 500 : 404, headers },
      )
    }

    return NextResponse.json({ deleted: true }, { headers })
  } catch (error) {
    console.error("Expense categories DELETE failed", error)

    return NextResponse.json(
      { error: "Expense category management is unavailable." },
      { status: 503, headers },
    )
  }
}
