import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

const supplierFields =
  "id, supplier_name, contact_person, phone, email, branch, status, created_at"

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getSupplierAccess(
  permission: "suppliers.view" | "suppliers.create" | "suppliers.delete",
) {
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

  const { data: allowed, error: permissionError } = await supabase.rpc(
    "current_user_has_company_permission",
    {
      requested_company_id: membership.company_id,

      requested_permission: permission,
    },
  )

  if (permissionError) {
    console.error("Supplier permission check failed", permissionError)

    return {
      error: "Unable to verify partner permissions.",
      status: 503 as const,
    }
  }

  if (!allowed) {
    return {
      error:
        permission === "suppliers.delete"
          ? "You do not have permission to delete company partners. A Chairman can grant suppliers.delete in Users & Roles."
          : "You do not have permission to access partners. Workspace administrators should apply the latest Supabase migration if partner setup is incomplete.",
      status: 403 as const,
    }
  }

  return { companyId: membership.company_id, userId: user.id, supabase }
}

export async function GET() {
  try {
    const access = await getSupplierAccess("suppliers.view")

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const { data, error } = await access.supabase

      .from("suppliers")

      .select(supplierFields)

      .eq("company_id", access.companyId)

      .order("created_at", { ascending: false })

    if (error) {
      console.error("Supplier list query failed", error)

      return NextResponse.json({ error: "Unable to load company partners." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    const [
      { data: canCreate, error: createPermissionError },

      { data: canDelete, error: deletePermissionError },

      { data: company, error: companyError },
    ] = await Promise.all([
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,

        requested_permission: "suppliers.create",
      }),

      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,

        requested_permission: "suppliers.delete",
      }),

      access.supabase

        .from("companies")

        .select("primary_admin_user_id")

        .eq("id", access.companyId)

        .maybeSingle(),
    ])

    if (
      createPermissionError ||
      deletePermissionError ||
      companyError ||
      !company
    ) {
      console.error(
        "Supplier edit access lookup failed",
        createPermissionError ?? deletePermissionError ?? companyError,
      )

      return NextResponse.json({ error: "Unable to verify partner access." }, {
        status: 503,
        headers: responseHeaders,
      })
    }

    return NextResponse.json(
      {
        suppliers: data ?? [],

        canCreateSuppliers: Boolean(canCreate),

        canEditSuppliers: company.primary_admin_user_id === access.userId,

        canDeleteSuppliers: Boolean(canDelete),
      },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Supplier list request failed", error)

    return NextResponse.json({ error: "Partner data is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSupplierAccess("suppliers.create")

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const supplierName =
      typeof body?.supplierName === "string" ? body.supplierName.trim() : ""

    const contactPerson =
      typeof body?.contactPerson === "string" ? body.contactPerson.trim() : ""

    const phone = typeof body?.phone === "string" ? body.phone.trim() : ""

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

    const branch = typeof body?.branch === "string" ? body.branch.trim() : ""

    if (
      !supplierName ||
      supplierName.length > 200 ||
      !contactPerson ||
      contactPerson.length > 200 ||
      !phone ||
      phone.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 200 ||
      !branch ||
      branch.length > 200
    ) {
      return NextResponse.json(
        {
          error:
            "Provide a partner name and valid contact, phone, email, and branch details.",
        },
        { status: 400, headers: responseHeaders },
      )
    }

    const { data, error } = await access.supabase

      .from("suppliers")

      .insert({
        company_id: access.companyId,

        created_by: access.userId,

        supplier_name: supplierName,

        contact_person: contactPerson,

        phone,

        email,

        branch,
      })

      .select(supplierFields)

      .single()

    if (error || !data) {
      console.error("Supplier registration failed", error)

      return NextResponse.json({ error: "Unable to register this partner." }, {
        status: 403,
        headers: responseHeaders,
      })
    }

    return NextResponse.json({ supplier: data }, {
      status: 201,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Supplier registration request failed", error)

    return NextResponse.json(
      { error: "Partner registration is unavailable." },
      { status: 503, headers: responseHeaders },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getSupplierAccess("suppliers.view")

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const { data: company, error: companyError } = await access.supabase

      .from("companies")

      .select("primary_admin_user_id")

      .eq("id", access.companyId)

      .maybeSingle()

    if (companyError || !company) {
      console.error("Supplier edit ownership lookup failed", companyError)

      return NextResponse.json(
        { error: "Unable to verify company ownership." },
        { status: 503, headers: responseHeaders },
      )
    }

    if (company.primary_admin_user_id !== access.userId) {
      return NextResponse.json(
        { error: "Only the Chairman can edit partner details." },
        { status: 403, headers: responseHeaders },
      )
    }

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const id = typeof body?.id === "string" ? body.id : ""

    const supplierName =
      typeof body?.supplierName === "string" ? body.supplierName.trim() : ""

    const contactPerson =
      typeof body?.contactPerson === "string" ? body.contactPerson.trim() : ""

    const phone = typeof body?.phone === "string" ? body.phone.trim() : ""

    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

    const branch = typeof body?.branch === "string" ? body.branch.trim() : ""

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !supplierName ||
      supplierName.length > 200 ||
      !contactPerson ||
      contactPerson.length > 200 ||
      !phone ||
      phone.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 200 ||
      !branch ||
      branch.length > 200
    ) {
      return NextResponse.json(
        {
          error:
            "Provide valid partner name, contact, phone, email, and branch details.",
        },
        { status: 400, headers: responseHeaders },
      )
    }

    const admin = createAdminClient()

    if (!admin)
      return NextResponse.json(
        {
          error:
            "Partner editing requires SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers: responseHeaders },
      )

    const { data: supplier, error: updateError } = await admin

      .from("suppliers")

      .update({
        supplier_name: supplierName,

        contact_person: contactPerson,

        phone,

        email,

        branch,
      })

      .eq("id", id)

      .eq("company_id", access.companyId)

      .select(supplierFields)

      .maybeSingle()

    if (updateError || !supplier) {
      console.error("Supplier details update failed", updateError)

      return NextResponse.json(
        { error: "Unable to update this company partner." },
        { status: 500, headers: responseHeaders },
      )
    }

    return NextResponse.json({ supplier }, { headers: responseHeaders })
  } catch (error) {
    console.error("Supplier details PATCH failed", error)

    return NextResponse.json({ error: "Partner editing is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getSupplierAccess("suppliers.delete")

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const id = typeof body?.id === "string" ? body.id : ""

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return NextResponse.json({ error: "Provide a valid partner ID." }, {
        status: 400,
        headers: responseHeaders,
      })
    }

    const admin = createAdminClient()

    if (!admin)
      return NextResponse.json(
        {
          error:
            "Partner deletion requires SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers: responseHeaders },
      )

    const { data: linkedProject, error: projectError } = await admin
      .from("projects")
      .select("project_name")
      .eq("company_id", access.companyId)
      .eq("partner_id", id)
      .limit(1)
      .maybeSingle()

    if (projectError) {
      console.error("Partner deletion reference check failed", projectError)

      return NextResponse.json(
        { error: "Unable to verify whether this partner is in use." },
        { status: 503, headers: responseHeaders },
      )
    }

    if (linkedProject) {
      return NextResponse.json(
        {
          error: `Cannot delete this partner while project "${linkedProject.project_name}" is linked to it.`,
        },
        { status: 409, headers: responseHeaders },
      )
    }

    const { data: deletedSupplier, error: deleteError } = await admin
      .from("suppliers")
      .delete()
      .eq("id", id)
      .eq("company_id", access.companyId)
      .select("id")
      .maybeSingle()

    if (deleteError) {
      console.error("Partner deletion failed", deleteError)

      return NextResponse.json(
        { error: "Unable to delete this company partner." },
        {
          status: deleteError?.code === "23503" ? 409 : 500,
          headers: responseHeaders,
        },
      )
    }

    if (!deletedSupplier) {
      return NextResponse.json(
        { error: "Partner not found in this company." },
        { status: 404, headers: responseHeaders },
      )
    }

    return NextResponse.json({ success: true }, { headers: responseHeaders })
  } catch (error) {
    console.error("Partner DELETE failed", error)

    return NextResponse.json(
      { error: "Partner deletion is unavailable." },
      { status: 503, headers: responseHeaders },
    )
  }
}
