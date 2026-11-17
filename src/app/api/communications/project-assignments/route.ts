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

    const { data: notes, error } = await supabase
      .from("workspace_communications")
      .select("id, project_id, subject, body, created_at")
      .eq("company_id", membership.company_id)
      .eq("recipient_id", user.id)
      .eq("event_type", "project_assignment")
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) {
      console.error("Project assignment communication lookup failed", error)
      return NextResponse.json(
        { error: "Unable to load project assignment notes." },
        { status: 503, headers },
      )
    }

    return NextResponse.json({ notes: notes ?? [] }, { headers })
  } catch (error) {
    console.error("Project assignment notes request failed", error)
    return NextResponse.json(
      { error: "Project assignment notes are unavailable." },
      { status: 503, headers },
    )
  }
}
