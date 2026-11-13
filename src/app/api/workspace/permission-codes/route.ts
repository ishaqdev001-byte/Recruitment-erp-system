import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get("companyId")
    if (!companyId || !/^[0-9a-f-]{36}$/i.test(companyId)) {
      return NextResponse.json(
        { error: "A valid company ID is required." },
        { status: 400, headers: responseHeaders },
      )
    }

    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers: responseHeaders },
      )
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()
    if (membershipError) throw membershipError
    if (!membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers: responseHeaders },
      )
    }

    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        { error: "Company permissions are unavailable on this server." },
        { status: 503, headers: responseHeaders },
      )
    }

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("primary_admin_user_id")
      .eq("id", companyId)
      .maybeSingle()
    if (companyError) throw companyError
    if (company?.primary_admin_user_id !== user.id) {
      return NextResponse.json(
        { error: "Only the company Chairman can load all permission codes." },
        { status: 403, headers: responseHeaders },
      )
    }

    const { data: permissions, error: permissionsError } = await admin
      .from("permissions")
      .select("code")
      .order("code")
    if (permissionsError) throw permissionsError

    return NextResponse.json(
      { permissionCodes: (permissions ?? []).map(({ code }) => code) },
      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Company permission catalog request failed", error)
    return NextResponse.json(
      { error: "Unable to load company permissions." },
      { status: 503, headers: responseHeaders },
    )
  }
}
