import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSmsUg, normalizeUgandanPhone } from "@/lib/server/smsug";

export const runtime = "nodejs";

// This route is called by the pg_cron job every minute.
// Auth: the request must carry the service role key in x-internal-secret.
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  // Verify internal secret — must match the service role key
  const secret = request.headers.get("x-internal-secret");
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { id?: string } | null;
  const rowId = typeof body?.id === "string" ? body.id : "";
  if (!rowId) return NextResponse.json({ error: "Missing row id." }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service not configured." }, { status: 503 });

  // Fetch the queued row (status should already be 'sending' — set by pg func)
  const { data: row, error: fetchError } = await admin
    .from("candidate_travel_sms_queue")
    .select("id, company_id, candidate_id, phone, sms_title, message, sms_type, status")
    .eq("id", rowId)
    .in("status", ["queued", "sending"])
    .maybeSingle();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Row not found or already processed." }, { status: 404 });
  }

  // Normalize phone
  const phone = normalizeUgandanPhone(row.phone);
  if (!phone) {
    await admin.from("candidate_travel_sms_queue")
      .update({ status: "failed", provider_error: "Invalid phone number.", sent_at: new Date().toISOString() })
      .eq("id", rowId);
    return NextResponse.json({ error: "Invalid phone." }, { status: 400 });
  }

  // Send via SMSUG
  const result = await sendSmsUg(row.sms_title, row.message, [phone]);

  if (result.ok) {
    await admin.from("candidate_travel_sms_queue").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_token: result.token,
      provider_error: null,
    }).eq("id", rowId);
    return NextResponse.json({ ok: true, token: result.token });
  }

  const permanentFailure = !["sms_network_error", "sms_not_configured"].includes(result.code);
  await admin.from("candidate_travel_sms_queue").update({
    status: permanentFailure ? "failed" : "queued", // retry network errors
    provider_error: result.message,
    sent_at: permanentFailure ? new Date().toISOString() : null,
  }).eq("id", rowId);

  return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
}
