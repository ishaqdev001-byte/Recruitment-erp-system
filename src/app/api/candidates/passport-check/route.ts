import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPassportNumberValid, normalizePassportNumber, passportNumberRule } from "@/lib/passport-number";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const body = await request.json().catch(() => null) as { passportNumber?: unknown; nationality?: unknown } | null;
    const passportNumber = typeof body?.passportNumber === "string"
      ? normalizePassportNumber(body.passportNumber)
      : "";
    const nationality = typeof body?.nationality === "string" ? body.nationality.trim() : "";
    if (!passportNumber || passportNumber.length > 100 || !nationality) {
      return NextResponse.json({ error: "Enter the candidate nationality and passport number." }, { status: 400, headers });
    }
    if (!isPassportNumberValid(nationality, passportNumber)) {
      return NextResponse.json({ error: passportNumberRule(nationality) }, { status: 400, headers });
    }

    const { data, error } = await supabase.rpc(
      "lookup_candidate_passport_registration",
      { requested_passport_number: passportNumber },
    );
    if (error) {
      console.error("Candidate passport validation failed", error);
      return NextResponse.json({ error: "Unable to validate this passport number." }, { status: 503, headers });
    }

    const result = data?.[0];
    if (!result) {
      return NextResponse.json({ error: "You do not have permission to register candidates." }, { status: 403, headers });
    }

    return NextResponse.json({
      registered: result.is_registered,
      registeredBy: result.registered_by,
    }, { headers });
  } catch (error) {
    console.error("Candidate passport validation request failed", error);
    return NextResponse.json({ error: "Passport validation is unavailable." }, { status: 503, headers });
  }
}
