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

    const { count: candidateCount, error: candidateError } = await supabase
      .from("candidates")
      .select("id", { count: "exact", head: true });
    if (candidateError) {
      console.error("Candidate summary query failed", candidateError);
      return NextResponse.json({ error: "Unable to load workspace data." }, { status: 403, headers });
    }

    const { count: documentCount, error: documentError } = await supabase
      .from("candidate_documents")
      .select("id", { count: "exact", head: true });
    const { count: passportCount, error: passportError } = await supabase
      .from("passport_custody")
      .select("id", { count: "exact", head: true });

    return NextResponse.json({
      candidateCount: candidateCount ?? 0,
      documentCount: documentError ? null : documentCount ?? 0,
      passportCount: passportError ? null : passportCount ?? 0,
    }, { headers });
  } catch (error) {
    console.error("Workspace summary request failed", error);
    return NextResponse.json({ error: "Workspace data is unavailable." }, { status: 503, headers });
  }
}