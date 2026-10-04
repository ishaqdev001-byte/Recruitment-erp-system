import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data, error } = await supabase
      .from("candidates")
      .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Candidate list query failed", error);
      return NextResponse.json({ error: "Unable to load candidates." }, { status: 403, headers });
    }

    return NextResponse.json({ candidates: data }, { headers });
  } catch (error) {
    console.error("Candidate list request failed", error);
    return NextResponse.json({ error: "Candidate data is unavailable." }, { status: 503, headers });
  }
}