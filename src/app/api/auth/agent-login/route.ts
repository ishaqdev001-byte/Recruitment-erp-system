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

export async function POST(request: Request) {
  try {
    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const companySlug =
      typeof body?.companySlug === "string"
        ? body.companySlug.trim().toLowerCase()
        : ""

    const username =
      typeof body?.username === "string"
        ? body.username.trim().toLowerCase()
        : ""

    const password = typeof body?.password === "string" ? body.password : ""

    if (!/^[a-z0-9._-]{3,80}$/.test(username) || !companySlug || !password) {
      return NextResponse.json({ error: "Invalid username or password." }, {
        status: 400,
        headers,
      })
    }

    const admin = createAdminClient()

    if (!admin) {
      return NextResponse.json({ error: "Agent sign-in is unavailable." }, {
        status: 503,
        headers,
      })
    }

    const { data: company, error: companyError } = await admin

      .from("companies")

      .select("id, name, slug, logo_url")

      .eq("slug", companySlug)

      .maybeSingle()

    if (companyError) throw companyError

    if (!company) {
      return NextResponse.json({ error: "Invalid username or password." }, {
        status: 401,
        headers,
      })
    }

    const { data: agent, error: agentError } = await admin

      .from("company_recruitment_agents")

      .select("id, name, email, linked_user_id")

      .eq("company_id", company.id)

      .eq("username", username)

      .eq("status", "active")

      .maybeSingle()

    if (agentError) throw agentError

    if (!agent?.linked_user_id) {
      return NextResponse.json({ error: "Invalid username or password." }, {
        status: 401,
        headers,
      })
    }

    const [
      { data: membership, error: membershipError },
      { data: authUser, error: authUserError },
    ] = await Promise.all([
      admin

        .from("company_memberships")

        .select("role:company_roles(name)")

        .eq("company_id", company.id)

        .eq("user_id", agent.linked_user_id)

        .eq("status", "active")

        .maybeSingle(),

      admin.auth.admin.getUserById(agent.linked_user_id),
    ])

    if (membershipError || authUserError) {
      throw membershipError ?? authUserError
    }

    const joinedRole = membership?.role as { name: string } | {
      name: string
    }[] | null

    const roleName = Array.isArray(joinedRole)
      ? joinedRole[0]?.name
      : joinedRole?.name

    if (
      !membership ||
      roleName?.trim().toLowerCase() !== "recruitment agent" ||
      !authUser.user?.email
    ) {
      return NextResponse.json({ error: "Invalid username or password." }, {
        status: 401,
        headers,
      })
    }

    const supabase = await createSupabaseServerClient()

    const { data: signIn, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: authUser.user.email,

        password,
      })

    if (signInError || !signIn.user) {
      return NextResponse.json({ error: "Invalid username or password." }, {
        status: 401,
        headers,
      })
    }

    return NextResponse.json(
      {
        session: {
          userId: signIn.user.id,

          email: signIn.user.email ?? agent.email,

          companyId: company.id,

          companyName: company.name,

          companyLogo: company.logo_url ?? undefined,

          userName: agent.name,

          userRole: "Recruitment Agent",
        },
      },

      { headers },
    )
  } catch (error) {
    console.error("Agent login failed", error)

    return NextResponse.json(
      { error: "Agent sign-in is temporarily unavailable." },
      { status: 503, headers },
    )
  }
}
