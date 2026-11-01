import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    const permissionChecks = await Promise.all(
      ["candidates.view", "candidates.register", "candidates.edit"].map(
        (requested_permission) =>
          supabase.rpc("current_user_has_company_permission", {
            requested_company_id: membership.company_id,
            requested_permission,
          }),
      ),
    );
    if (permissionChecks.some(({ error }) => error)) {
      return NextResponse.json({ error: "Unable to verify candidate source access." }, { status: 503, headers });
    }
    if (!permissionChecks.some(({ data }) => data)) {
      return NextResponse.json({ error: "You do not have permission to view candidate sources." }, { status: 403, headers });
    }

    const { data, error } = await supabase
      .from("candidate_source_options")
      .select("id, source")
      .eq("company_id", membership.company_id)
      .order("source");
    if (error) {
      console.error("Candidate source options query failed", error);
      return NextResponse.json({ error: "Unable to load candidate sources." }, { status: 503, headers });
    }

    return NextResponse.json({ sources: data ?? [] }, { headers });
  } catch (error) {
    console.error("Candidate sources request failed", error);
    return NextResponse.json({ error: "Candidate sources are unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const body = await request.json().catch(() => null) as { source?: unknown } | null;
    const source = typeof body?.source === "string" ? body.source.trim() : "";
    if (!source || source.length > 80) {
      return NextResponse.json({ error: "Enter a source between 1 and 80 characters." }, { status: 400, headers });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.sources.manage",
      },
    );
    if (permissionError) {
      return NextResponse.json({ error: "Unable to verify candidate source permissions." }, { status: 503, headers });
    }
    if (!allowed) {
      return NextResponse.json({ error: "You do not have permission to add candidate sources." }, { status: 403, headers });
    }

    const { data, error } = await supabase
      .from("candidate_source_options")
      .insert({
        company_id: membership.company_id,
        source,
        created_by: user.id,
      })
      .select("id, source")
      .single();
    if (error || !data) {
      if (error?.code === "23505") {
        return NextResponse.json({ error: "That candidate source already exists." }, { status: 409, headers });
      }
      console.error("Candidate source option insert failed", error);
      return NextResponse.json({ error: "Unable to add this candidate source." }, { status: 503, headers });
    }

    return NextResponse.json({ source: data }, { status: 201, headers });
  } catch (error) {
    console.error("Candidate source creation failed", error);
    return NextResponse.json({ error: "Candidate source creation is unavailable." }, { status: 503, headers });
  }
}
