import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

/**
 * GET /api/agents/[agentId]/candidates
 *
 * Fetches all candidates assigned to a specific agent, including visa details.
 * Agent lookup is by matching agent_name against the candidate profile's agent_name field.
 * Only accessible by users with candidates.view permission in the same company.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: responseHeaders });
    }

    const { agentId } = await params;

    // Get the agent user to retrieve their name
    const { data: agentMembership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", agentId)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError || !agentMembership) {
      return NextResponse.json({ error: "Agent not found in this company." }, { status: 404, headers: responseHeaders });
    }

    // Verify current user has candidates.view permission in the same company
    const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: agentMembership.company_id,
      requested_permission: "candidates.view",
    });
    if (permissionError || !allowed) {
      return NextResponse.json({ error: "You do not have permission to view candidates." }, { status: 403, headers: responseHeaders });
    }

    // Get the agent's profile to find their display name
    const { data: agentProfile, error: profileError } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", agentId)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json({ error: "Unable to retrieve agent profile." }, { status: 500, headers: responseHeaders });
    }

    const agentName = agentProfile?.display_name ?? "";
    if (!agentName) {
      return NextResponse.json({ candidates: [] }, { headers: responseHeaders });
    }

    // Fetch all candidates assigned to this agent by matching agent_name
    const { data: candidates, error: candidatesError } = await supabase
      .from("candidates")
      .select(
        `id, first_name, last_name, phone, file_number, agent_name, position,
         details, created_at`,
      )
      .eq("company_id", agentMembership.company_id)
      .eq("agent_name", agentName)
      .order("created_at", { ascending: false });
    if (candidatesError) {
      console.error("Candidate list query failed", candidatesError);
      return NextResponse.json({ error: "Unable to load agent candidates." }, { status: 500, headers: responseHeaders });
    }

    // Enrich candidates with visa and invoice details
    const enrichedCandidates = await Promise.all(
      (candidates ?? []).map(async (candidate) => {
        const visaStatus = candidate.details?.visaStatus ?? "";
        const passportNumber = candidate.details?.passportNumber ?? "";
        const hasVisa = visaStatus === "Received";

        let visaReceivedDate: string | null = null;
        if (hasVisa) {
          // Find the invoice to get the visa received date
          const { data: invoice, error: invoiceError } = await supabase
            .from("invoices")
            .select("created_at")
            .eq("visa_candidate_id", candidate.id)
            .eq("company_id", agentMembership.company_id)
            .maybeSingle();
          if (!invoiceError && invoice) {
            visaReceivedDate = invoice.created_at;
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
        };
      }),
    );

    return NextResponse.json({ candidates: enrichedCandidates }, { headers: responseHeaders });
  } catch (error) {
    console.error("Agent candidates request failed", error);
    return NextResponse.json({ error: "Unable to load agent candidates." }, { status: 503, headers: responseHeaders });
  }
}
