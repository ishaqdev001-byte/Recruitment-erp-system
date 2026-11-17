import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers },
      )
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )
    }

    const permissionChecks = await Promise.all(
      ["candidates.view", "candidates.register", "candidates.create", "candidates.edit"].map(
        (requested_permission) =>
          supabase.rpc("current_user_has_company_permission", {
            requested_company_id: membership.company_id,
            requested_permission,
          }),
      ),
    )
    if (permissionChecks.some(({ error }) => error)) {
      return NextResponse.json(
        { error: "Unable to verify candidate referral access." },
        { status: 503, headers },
      )
    }
    if (!permissionChecks.some(({ data }) => data)) {
      return NextResponse.json(
        { error: "You do not have permission to view candidate referral options." },
        { status: 403, headers },
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Partner lookup is not configured on the server." },
        { status: 503, headers },
      )
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: partners, error: partnerError } = await admin
      .from("suppliers")
      .select("id, supplier_name")
      .eq("company_id", membership.company_id)
      .eq("status", "active")
      .order("supplier_name")
    if (partnerError) {
      console.error("Candidate referral partner lookup failed", partnerError)
      return NextResponse.json(
        { error: "Unable to load registered company partners." },
        { status: 503, headers },
      )
    }

    return NextResponse.json({
      partners: (partners ?? []).map((partner) => ({
        id: partner.id,
        name: partner.supplier_name,
      })),
    }, { headers })
  } catch (error) {
    console.error("Candidate referral options request failed", error)
    return NextResponse.json(
      { error: "Candidate referral options are unavailable." },
      { status: 503, headers },
    )
  }
}
