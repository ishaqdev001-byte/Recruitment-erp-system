import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET /api/candidates/search?q=<name>&limit=20
// Returns candidates (pipeline + inquiry-converted) matching the name query.
// Also joins passport number from candidate_passports and details JSONB.
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, branch_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });

    const { data: isMainBranch, error: branchError } = await supabase.rpc("current_user_is_main_branch_user", {
      requested_company_id: membership.company_id,
    });
    if (branchError || (!isMainBranch && !membership.branch_id)) {
      return NextResponse.json({ error: "Unable to verify your company branch." }, { status: 503, headers });
    }

    const { data: canView } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "candidates.view",
    });
    const { data: canCreate } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "candidates.create",
    });
    if (!canView && !canCreate) {
      return NextResponse.json({ error: "You do not have permission to search candidates." }, { status: 403, headers });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 50);

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Candidate search requires server configuration." }, { status: 503, headers });

    // Build candidate query — search by first_name, last_name, or file_number
    let query = admin
      .from("candidates")
      .select("id, file_number, first_name, last_name, phone, date_of_birth, details")
      .eq("company_id", membership.company_id)
      .order("first_name")
      .limit(limit);
    if (!isMainBranch) query = query.eq("branch_id", membership.branch_id);

    if (q) {
      // ilike search across name and file number
      query = query.or(
        `first_name.ilike.%${q}%,last_name.ilike.%${q}%,file_number.ilike.%${q}%`,
      );
    }

    const { data: candidates, error: candidateError } = await query;
    if (candidateError) {
      console.error("Candidate search failed", candidateError);
      return NextResponse.json({ error: "Unable to search candidates." }, { status: 500, headers });
    }

    // Fetch passport numbers for matched candidates from candidate_passports table
    const candidateIds = (candidates ?? []).map((c) => c.id);
    const { data: passports } = candidateIds.length
      ? await admin
          .from("candidate_passports")
          .select("candidate_id, passport_number")
          .eq("company_id", membership.company_id)
          .in("candidate_id", candidateIds)
      : { data: [] };

    const passportByCandidate = new Map(
      (passports ?? []).map((p) => [p.candidate_id, p.passport_number as string]),
    );

    const results = (candidates ?? []).map((c) => {
      const details = (c.details ?? {}) as Record<string, unknown>;
      // Passport number: prefer candidate_passports table, fall back to details JSONB
      const passportNumber: string =
        passportByCandidate.get(c.id) ||
        (typeof details.passportNumber === "string" ? details.passportNumber : "") ||
        "";

      return {
        id: c.id,
        fileNumber: c.file_number as string,
        firstName: c.first_name as string,
        lastName: c.last_name as string,
        fullName: `${c.first_name} ${c.last_name}`,
        phone: (c.phone as string) || "",
        dateOfBirth: c.date_of_birth ? String(c.date_of_birth) : "",
        passportNumber,
      };
    });

    return NextResponse.json({ candidates: results }, { headers });
  } catch (err) {
    console.error("Candidate search request failed", err);
    return NextResponse.json({ error: "Candidate search is unavailable." }, { status: 503, headers });
  }
}
