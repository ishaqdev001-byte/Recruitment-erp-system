import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

/**
 * GET /api/projects/[projectId]/visa-candidates
 *
 * Fetches all candidates who have received visas for a specific project.
 * Includes candidate name, passport number, and visa received date.
 * Only accessible by users with finance.view permission in the same company.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: responseHeaders });
    }

    const { projectId } = await params;

    // Get the project to verify it exists and get company_id
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, company_id, project_name, contractor_name")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError || !project) {
      return NextResponse.json({ error: "Project not found." }, { status: 404, headers: responseHeaders });
    }

    // Verify current user has finance.view permission in this company
    const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: project.company_id,
      requested_permission: "finance.view",
    });
    if (permissionError || !allowed) {
      return NextResponse.json({ error: "You do not have permission to view project finance records." }, { status: 403, headers: responseHeaders });
    }

    // Fetch all candidates with received visas for this project
    // Join via project_contractor_charges table which tracks visa receipt
    const { data: visaCandidates, error: candidatesError } = await supabase
      .from("project_contractor_charges")
      .select(
        `id, candidate_id, candidate_name, amount, visa_received_at,
         candidate:candidates (
           id, first_name, last_name, phone, details
         )`,
      )
      .eq("company_id", project.company_id)
      .eq("project_id", projectId)
      .order("visa_received_at", { ascending: false });
    if (candidatesError) {
      console.error("Visa candidates query failed", candidatesError);
      return NextResponse.json({ error: "Unable to load project visa candidates." }, { status: 500, headers: responseHeaders });
    }

    // Transform the data to include passport number and formatted dates
    const enrichedCandidates = (visaCandidates ?? []).map((charge: any) => {
      const candidateData = charge.candidate as any;
      const passportNumber = candidateData?.details?.passportNumber ?? "";

      return {
        id: charge.candidate_id,
        fullName: charge.candidate_name,
        firstName: candidateData?.first_name ?? "",
        lastName: candidateData?.last_name ?? "",
        phone: candidateData?.phone ?? "",
        passportNumber,
        visaReceivedDate: charge.visa_received_at,
        visaReceivedDateFormatted: new Date(charge.visa_received_at).toLocaleDateString(),
        serviceCharge: charge.amount,
      };
    });

    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.project_name,
          contractor: project.contractor_name,
        },
        candidates: enrichedCandidates,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("Project visa candidates request failed", error);
    return NextResponse.json({ error: "Unable to load project visa candidates." }, { status: 503, headers: responseHeaders });
  }
}
