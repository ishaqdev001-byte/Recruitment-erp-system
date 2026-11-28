import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCompanySms } from "@/lib/server/sms-billing";
import { normalizeUgandanPhone } from "@/lib/server/smsug";

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
  const result = await sendCompanySms({
    admin,
    companyId: row.company_id,
    reference: row.id,
    title: row.sms_title,
    message: row.message,
    contacts: [phone],
    source: "candidate_travel",
  });

  if (result.ok) {
    await admin.from("candidate_travel_sms_queue").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_token: result.token,
      provider_error: null,
    }).eq("id", rowId);
    return NextResponse.json({ ok: true, token: result.token });
  }

  const permanentFailure = result.code !== "sms_network_error";
  await admin.from("candidate_travel_sms_queue").update({
    status: permanentFailure ? "failed" : "unknown",
    provider_error: result.message,
    sent_at: new Date().toISOString(),
  }).eq("id", rowId);

  return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
}
