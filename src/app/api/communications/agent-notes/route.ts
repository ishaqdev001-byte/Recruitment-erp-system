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

    if (authError || !user)
      return NextResponse.json(
        { error: "Authentication required." },

        { status: 401, headers },
      )

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id, role_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership)
      return NextResponse.json(
        { error: "Active company membership not found." },

        { status: 403, headers },
      )

    const { data: role, error: roleError } = await supabase

      .from("company_roles")

      .select("name")

      .eq("id", membership.role_id)

      .eq("company_id", membership.company_id)

      .maybeSingle()

    if (
      roleError ||
      role?.name.trim().toLocaleLowerCase() !== "recruitment agent"
    )
      return NextResponse.json(
        { error: "Agent notes are available only to Recruitment Agents." },

        { status: 403, headers },
      )

    const { data: notes, error } = await supabase

      .from("candidate_agent_notes")

      .select("id, subject, body, candidate_names, created_at")

      .eq("company_id", membership.company_id)

      .eq("recipient_id", user.id)

      .order("created_at", { ascending: false })

      .limit(100)

    if (error) {
      console.error("Candidate agent notes lookup failed", error)

      return NextResponse.json(
        { error: "Unable to load your notes." },

        { status: 503, headers },
      )
    }

    return NextResponse.json({ notes: notes ?? [] }, { headers })
  } catch (error) {
    console.error("Candidate agent notes request failed", error)

    return NextResponse.json(
      { error: "Agent notes are unavailable." },

      { status: 503, headers },
    )
  }
}
