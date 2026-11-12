import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isRecruitmentAgentRole } from "@/lib/role-access-settings"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

/**
 * GET /api/agents/[agentId]/candidates
 *
 * Fetches all candidates assigned to a specific agent, including visa details.
 * Candidates are matched by agent user ID, with a legacy name fallback for older records.
 * Only accessible by users with candidates.view permission in the same company.
 */
export async function GET(
  request: Request,
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

    const { data: currentMembership, error: currentMembershipError } =
      await supabase
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
    if (currentMembershipError || !currentMembership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers: responseHeaders },
      )
    }

    const { data: agentMembership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, role:company_roles(name)")
      .eq("company_id", currentMembership.company_id)
      .eq("user_id", agentId)
      .eq("status", "active")
      .maybeSingle()
    if (membershipError || !agentMembership) {
      return NextResponse.json({ error: "Agent not found in this company." }, {
        status: 404,
        headers: responseHeaders,
      })
    }
    const joinedRole = agentMembership.role as { name: string } | {
      name: string
    }[] | null
    const agentRoleName = Array.isArray(joinedRole)
      ? joinedRole[0]?.name
      : joinedRole?.name
    if (!isRecruitmentAgentRole(agentRoleName ?? "")) {
      return NextResponse.json(
        { error: "Selected user is not a Recruitment Agent." },
        { status: 404, headers: responseHeaders },
      )
    }

    // Verify current user has candidates.view permission in the same company
    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: agentMembership.company_id,
        requested_permission: "candidates.view",
      },
    )
    if (permissionError || !allowed) {
      return NextResponse.json(
        { error: "You do not have permission to view candidates." },
        { status: 403, headers: responseHeaders },
      )
    }

    const { data: agentProfile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", agentId)
      .maybeSingle()
    if (profileError) {
      return NextResponse.json({ error: "Unable to retrieve agent profile." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    const candidateFields =
      "id, first_name, last_name, phone, file_number, agent_name, position, details, created_at"
    const [assignedResult, legacyResult] = await Promise.all([
      supabase
        .from("candidates")
        .select(candidateFields)
        .eq("company_id", agentMembership.company_id)
        .eq("agent_user_id", agentId)
        .order("created_at", { ascending: false }),
      agentProfile?.display_name
        ? supabase
            .from("candidates")
            .select(candidateFields)
            .eq("company_id", agentMembership.company_id)
            .eq("agent_name", agentProfile.display_name)
            .is("agent_user_id", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (assignedResult.error || legacyResult.error) {
      console.error(
        "Candidate list query failed",
        assignedResult.error ?? legacyResult.error,
      )
      return NextResponse.json({ error: "Unable to load agent candidates." }, {
        status: 500,
        headers: responseHeaders,
      })
    }
    const candidates = [
      ...new Map(
        [...(assignedResult.data ?? []), ...(legacyResult.data ?? [])].map(
          (candidate) => [candidate.id, candidate],
        ),
      ).values(),
    ]

    // Enrich candidates with visa and invoice details
    const enrichedCandidates = await Promise.all(
      (candidates ?? []).map(async (candidate) => {
        const visaStatus = candidate.details?.visaStatus ?? ""
        const passportNumber = candidate.details?.passportNumber ?? ""
        const hasVisa = visaStatus === "Received"

        let visaReceivedDate: string | null = null
        if (hasVisa) {
          // Find the invoice to get the visa received date
          const { data: invoice, error: invoiceError } = await supabase
            .from("invoices")
            .select("created_at")
            .eq("visa_candidate_id", candidate.id)
            .eq("company_id", agentMembership.company_id)
            .maybeSingle()
          if (!invoiceError && invoice) {
            visaReceivedDate = invoice.created_at
          }
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
