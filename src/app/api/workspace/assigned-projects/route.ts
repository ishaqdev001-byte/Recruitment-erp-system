import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration is missing." },
        { status: 503, headers: responseHeaders },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          cookie: cookieStore.toString(),
        },
      },
    })

    // Get current user
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

    // Get user's current company from company_memberships
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Unable to determine current company." },
        { status: 400, headers: responseHeaders },
      )
    }

    // Fetch projects where user is assigned as Project Handler or Assistant Staff
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("id, project_name, project_manager_user_id, assigned_staff_id, status")
      .eq("company_id", membership.company_id)
      .or(
        `project_manager_user_id.eq.${user.id},assigned_staff_id.eq.${user.id}`,
      )
      .eq("status", "active")
      .order("project_name")

    if (projectsError) {
      console.error("Failed to fetch assigned projects", projectsError)
      return NextResponse.json(
        { error: "Unable to load assigned projects." },
        { status: 500, headers: responseHeaders },
      )
    }

    const assignedProjects = (projects ?? []).map((project) => ({
      id: project.id,
      name: project.project_name,
      role: project.project_manager_user_id === user.id ? "Project Handler" : "Assistant Staff",
    }))

    return NextResponse.json(
      {
        count: assignedProjects.length,
        projects: assignedProjects,
      },
      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Assigned projects request failed", error)
    return NextResponse.json(
      { error: "Project assignment data is unavailable." },
      { status: 503, headers: responseHeaders },
    )
  }
}
