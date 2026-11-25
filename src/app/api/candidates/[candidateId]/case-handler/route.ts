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

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

export async function PATCH(
  request: Request,

  context: RouteContext<"/api/candidates/[candidateId]/case-handler">,
) {
  try {
    const { candidateId } = await context.params

    if (!isUuid(candidateId))
      return NextResponse.json({ error: "Candidate not found." }, {
        status: 404,
        headers,
      })

    const supabase = await createSupabaseServerClient()

    const {
      data: { user },

      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user)
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })

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

    const body = (await request.json().catch(() => null)) as {
      userId?: unknown
    } | null

    const handlerUserId =
      body?.userId === null || body?.userId === ""
        ? null
        : isUuid(body?.userId)
          ? body.userId
          : undefined

    if (handlerUserId === undefined)
      return NextResponse.json(
        { error: "Choose an active company member or clear the assignment." },
        { status: 400, headers },
      )

    const [
      { data: company, error: companyError },

      { data: role, error: roleError },

      permissionResult,

      { data: candidate, error: candidateError },
    ] = await Promise.all([
      supabase
        .from("companies")

        .select("primary_admin_user_id, case_handlers_enabled")

        .eq("id", membership.company_id)

        .maybeSingle(),

      supabase
        .from("company_roles")

        .select("name")

        .eq("id", membership.role_id)

        .eq("company_id", membership.company_id)

        .maybeSingle(),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.case_handler.assign",
      }),

      supabase
        .from("candidates")

        .select("id, case_handler_user_id")

        .eq("id", candidateId)

        .eq("company_id", membership.company_id)

        .maybeSingle(),
    ])

    if (companyError || !company || roleError || !role) {
      console.error(
        "Candidate case-handler access lookup failed",
        companyError ?? roleError,
      )

      return NextResponse.json({ error: "Unable to verify company access." }, {
        status: 503,
        headers,
      })
    }

    if (candidateError) {
      console.error(
        "Candidate case-handler candidate lookup failed",
        candidateError,
      )

      return NextResponse.json(
        { error: "Unable to verify candidate access." },
        { status: 503, headers },
      )
    }

    if (!candidate)
      return NextResponse.json({ error: "Candidate not found." }, {
        status: 404,
        headers,
      })

    if (!company.case_handlers_enabled)
      return NextResponse.json(
        { error: "Case handlers are not enabled for this company." },
        { status: 409, headers },
      )

    const roleName = role.name.trim().toLocaleLowerCase()
    const isCaseHandlerChairman =
      company.primary_admin_user_id === user.id ||
      [
        "chairman",
        "company owner / primary administrator",
      ].includes(roleName)

    if (permissionResult.error && !isCaseHandlerChairman) {
      console.error(
        "Candidate case-handler permission lookup failed",
        permissionResult.error,
      )

      return NextResponse.json(
        { error: "Unable to verify case-handler permissions." },
        { status: 503, headers },
      )
    }

    if (!isCaseHandlerChairman && !permissionResult.data)
      return NextResponse.json(
        { error: "You do not have permission to assign case handlers." },
        { status: 403, headers },
      )

    const admin = createAdminClient()

    if (!admin)
      return NextResponse.json(
        { error: "Case-handler assignments are unavailable on this server." },
        { status: 503, headers },
      )

    if (handlerUserId === candidate.case_handler_user_id) {
      if (!handlerUserId)
        return NextResponse.json(
          { caseHandlerUserId: null, caseHandlerName: null },
          { headers },
        )

      const { data: currentProfile, error: profileError } = await admin

        .from("profiles")

        .select("display_name")

        .eq("id", handlerUserId)

        .maybeSingle()

      if (profileError) throw profileError

      return NextResponse.json(
        {
          caseHandlerUserId: handlerUserId,

          caseHandlerName: currentProfile?.display_name || "Company member",
        },
        { headers },
      )
    }

    let handlerName: string | null = null

    if (handlerUserId) {
      const { data: activeMembership, error: activeMembershipError } =
        await admin
          .from("company_memberships")

          .select("user_id")

          .eq("company_id", membership.company_id)

          .eq("user_id", handlerUserId)

          .eq("status", "active")

          .maybeSingle()

      if (activeMembershipError) {
        console.error(
          "Candidate case-handler target lookup failed",
          activeMembershipError,
        )

        return NextResponse.json(
          { error: "Unable to verify the selected Staff member." },
          { status: 503, headers },
        )
      }

      if (!activeMembership)
        return NextResponse.json(
          { error: "Choose an active member in this company." },
          { status: 400, headers },
        )

      const { data: profile, error: profileError } = await admin

        .from("profiles")

        .select("display_name")

        .eq("id", handlerUserId)

        .maybeSingle()

      if (profileError) throw profileError

      handlerName = profile?.display_name || "Staff member"
    }

    const { error: updateError } = await admin

      .from("candidates")

      .update({
        case_handler_user_id: handlerUserId,

        case_handler_assigned_by: user.id,
      })

      .eq("company_id", membership.company_id)

      .eq("id", candidateId)

    if (updateError) {
      console.error("Candidate case-handler assignment failed", updateError)

      if (updateError.code === "42501")
        return NextResponse.json(
          { error: "You do not have permission to assign case handlers." },
          { status: 403, headers },
        )

      if (["23503", "23514"].includes(updateError.code ?? ""))
        return NextResponse.json(
          {
            error:
              "The selected Staff member is no longer active in this company.",
          },
          { status: 409, headers },
        )

      return NextResponse.json({ error: "Unable to assign this candidate." }, {
        status: 500,
        headers,
      })
    }

    return NextResponse.json(
      {
        caseHandlerUserId: handlerUserId,

        caseHandlerName: handlerName,
      },
      { headers },
    )
  } catch (error) {
    console.error("Candidate case-handler assignment request failed", error)

    return NextResponse.json(
      { error: "Case-handler assignment is unavailable." },
      { status: 503, headers },
    )
  }
}
