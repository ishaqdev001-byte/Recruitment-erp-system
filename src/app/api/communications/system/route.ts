import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });

    const { data: membership, error: membershipError } = await supabase.from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    const { data: canView, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "candidates.view",
    });
    if (permissionError) {
      console.error("System communication permission check failed", permissionError);
      return NextResponse.json({ error: "Unable to verify communications access." }, { status: 503, headers });
    }
    if (!canView) return NextResponse.json({ error: "You do not have permission to view system communications." }, { status: 403, headers });

    const { data: messages, error } = await supabase.from("workspace_communications")
      .select("id, candidate_id, project_id, event_type, subject, body, created_at")
      .eq("company_id", membership.company_id)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("System communications query failed", error);
      return NextResponse.json({ error: "Unable to load system communications." }, { status: 500, headers });
    }

    const candidateIds = [...new Set((messages ?? []).map((message) => message.candidate_id))];
    const projectIds = [...new Set((messages ?? []).map((message) => message.project_id))];
    const [candidateResult, projectResult] = await Promise.all([
      candidateIds.length
        ? supabase.from("candidates").select("id, first_name, last_name").eq("company_id", membership.company_id).in("id", candidateIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length
        ? supabase.from("projects").select("id, project_name").eq("company_id", membership.company_id).in("id", projectIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (candidateResult.error || projectResult.error) {
      console.error("System communication references query failed", candidateResult.error ?? projectResult.error);
      return NextResponse.json({ error: "Unable to load communication references." }, { status: 500, headers });
    }
    const candidates = new Map((candidateResult.data ?? []).map((candidate) => [
      candidate.id,
      `${candidate.first_name} ${candidate.last_name}`.trim(),
    ]));
    const projects = new Map((projectResult.data ?? []).map((project) => [project.id, project.project_name]));

    return NextResponse.json({
      messages: (messages ?? []).map((message) => ({
        ...message,
        contact: candidates.get(message.candidate_id) ?? "Candidate",
        projectName: projects.get(message.project_id) ?? "Project",
      })),
    }, { headers });
  } catch (error) {
    console.error("System communications request failed", error);
    return NextResponse.json({ error: "System communications are unavailable." }, { status: 503, headers });
  }
}
