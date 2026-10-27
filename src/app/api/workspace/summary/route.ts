import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" }

  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })
    }

    const companyId = request.nextUrl.searchParams.get("companyId")

    if (!companyId) {
      return NextResponse.json({ error: "Company ID is required." }, {
        status: 400,
        headers,
      })
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
        { status: 403, headers },
      )
    }

    const countForPermission = async (
      table: "candidates" | "candidate_documents" | "passport_custody",

      permission: string,
    ): Promise<number | null> => {
      const { data: allowed, error: permissionError } = await supabase.rpc(
        "current_user_has_company_permission",
        {
          requested_company_id: companyId,

          requested_permission: permission,
        },
      )

      if (permissionError) throw permissionError

      if (!allowed) return null

      const { count, error: countError } = await supabase

        .from(table)

        .select("id", { count: "exact", head: true })

        .eq("company_id", companyId)

      if (countError) throw countError

      return count ?? 0
    }

    const [candidateCount, documentCount, passportCount] = await Promise.all([
      countForPermission("candidates", "candidates.view"),

      countForPermission("candidate_documents", "documents.view"),

      countForPermission("passport_custody", "passport.view"),
    ])

    return NextResponse.json(
      {
        candidateCount,

        documentCount,

        passportCount,
      },
      { headers },
    )
  } catch (error) {
    console.error("Workspace summary request failed", error)

    return NextResponse.json({ error: "Workspace data is unavailable." }, {
      status: 503,
      headers,
    })
  }
}
