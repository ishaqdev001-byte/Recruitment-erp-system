import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(
  _request: Request,

  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },

      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers: responseHeaders,
      })
    }

    const { agentId } = await params

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
        { status: 403, headers: responseHeaders },
      )
    }

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",

      {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.view",
      },
    )

    if (permissionError || !allowed) {
      return NextResponse.json(
        { error: "You do not have permission to view candidates." },
        { status: 403, headers: responseHeaders },
      )
    }

    const admin = createAdminClient()

    if (!admin) {
      return NextResponse.json(
        { error: "Agent candidate lookup requires SUPABASE_SERVICE_ROLE_KEY." },
        { status: 503, headers: responseHeaders },
      )
    }

    const { data: rosterAgent, error: agentError } = await admin

      .from("company_recruitment_agents")

      .select("id, name, linked_user_id")

      .eq("id", agentId)

      .eq("company_id", membership.company_id)

      .maybeSingle()

    if (agentError) throw agentError

    let rosterAgentId = rosterAgent?.id ?? null

    let linkedUserId = rosterAgent?.linked_user_id ?? null

    let agentName = rosterAgent?.name ?? ""

    if (!rosterAgent) {
      const { data: legacyMembership, error: legacyMembershipError } =
        await admin

          .from("company_memberships")

          .select("user_id, role:company_roles(name)")

          .eq("company_id", membership.company_id)

          .eq("user_id", agentId)

          .maybeSingle()

      if (legacyMembershipError) throw legacyMembershipError

      const role = legacyMembership?.role as { name: string } | {
        name: string
      }[] | null

      const roleName = Array.isArray(role) ? role[0]?.name : role?.name

      if (roleName?.trim().toLowerCase() !== "recruitment agent") {
        return NextResponse.json(
          { error: "Agent not found in this company." },
          { status: 404, headers: responseHeaders },
        )
      }

      linkedUserId = agentId

      const { data: profile, error: profileError } = await admin

        .from("profiles")

        .select("display_name")

        .eq("id", agentId)

        .maybeSingle()

      if (profileError) throw profileError

      agentName = profile?.display_name ?? ""
    }

    const candidateFields =
      "id, first_name, last_name, phone, file_number, agent_name, agent_id, agent_user_id, position, details, created_at"

    const assignedQueries = []

    if (rosterAgentId) {
      assignedQueries.push(
        supabase

          .from("candidates")

          .select(candidateFields)

          .eq("company_id", membership.company_id)

          .eq("agent_id", rosterAgentId)

          .order("created_at", { ascending: false }),
      )
    }

    if (linkedUserId) {
      assignedQueries.push(
        supabase

          .from("candidates")

          .select(candidateFields)

          .eq("company_id", membership.company_id)

          .eq("agent_user_id", linkedUserId)

          .order("created_at", { ascending: false }),
      )
    }

    if (agentName) {
      assignedQueries.push(
        supabase

          .from("candidates")

          .select(candidateFields)

          .eq("company_id", membership.company_id)

          .eq("agent_name", agentName)

          .is("agent_user_id", null)

          .is("agent_id", null)

          .order("created_at", { ascending: false }),
      )
    }

    const results = await Promise.all(assignedQueries)

    const failedResult = results.find((result) => result.error)

    if (failedResult?.error) {
      console.error("Candidate list query failed", failedResult.error)

      return NextResponse.json({ error: "Unable to load agent candidates." }, {
        status: 503,
        headers: responseHeaders,
      })
    }

    const candidates = [
      ...new Map(
        results
          .flatMap((result) => result.data ?? [])
          .map((candidate) => [candidate.id, candidate]),
      ).values(),
    ]

    const enrichedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const visaStatus = candidate.details?.visaStatus ?? ""

        const passportNumber = candidate.details?.passportNumber ?? ""

        let visaReceivedDate: string | null = null

        if (visaStatus === "Received") {
          const { data: invoice } = await supabase

            .from("invoices")

            .select("created_at")

            .eq("visa_candidate_id", candidate.id)

            .eq("company_id", membership.company_id)

            .maybeSingle()

          visaReceivedDate = invoice?.created_at ?? null
        }

        return {
          id: candidate.id,

          firstName: candidate.first_name,

          lastName: candidate.last_name,

          fullName: `${candidate.first_name} ${candidate.last_name}`,

          phone: candidate.phone,

          fileNumber: candidate.file_number,

          position: candidate.position,

          visaStatus,

          passportNumber,

          visaReceivedDate,

          createdAt: candidate.created_at,
        }
      }),
    )

    return NextResponse.json({ candidates: enrichedCandidates }, {
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Agent candidates request failed", error)

    return NextResponse.json({ error: "Unable to load agent candidates." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}
