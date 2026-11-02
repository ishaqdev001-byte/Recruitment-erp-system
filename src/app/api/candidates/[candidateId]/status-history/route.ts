import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ candidateId: string }> }) {
  try {
    const { candidateId } = await context.params;
    if (!isUuid(candidateId)) return NextResponse.json({ error: "Candidate not found." }, { status: 404, headers });

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
      console.error("Candidate status history permission check failed", permissionError);
      return NextResponse.json({ error: "Unable to verify candidate history access." }, { status: 503, headers });
    }
    if (!canView) return NextResponse.json({ error: "You do not have permission to view candidate history." }, { status: 403, headers });

    const { data: events, error } = await supabase.from("candidate_stage_events")
      .select("id, event_type, label, occurred_at, metadata")
      .eq("company_id", membership.company_id)
      .eq("candidate_id", candidateId)
      .in("event_type", ["stage", "medical_appointment"])
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) {
      console.error("Candidate status history query failed", error);
      return NextResponse.json({ error: "Unable to load candidate processing history." }, { status: 500, headers });
    }
    const safeEvents = (events ?? []).map((event) => {
      if (event.event_type === "stage") return event;

      const metadata =
        typeof event.metadata === "object" &&
        event.metadata !== null &&
        !Array.isArray(event.metadata)
          ? event.metadata
          : {};
      const appointmentAt = metadata.appointmentAt;
      return {
        ...event,
        label: "Medical appointment booked",
        metadata:
          typeof appointmentAt === "string" ? { appointmentAt } : {},
      };
    });
    return NextResponse.json({ events: safeEvents }, { headers });
  } catch (error) {
    console.error("Candidate status history request failed", error);
    return NextResponse.json({ error: "Candidate processing history is unavailable." }, { status: 503, headers });
  }
}
