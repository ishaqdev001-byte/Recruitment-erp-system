import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

async function getReminderAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };
  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function GET() {
  try {
    const access = await getReminderAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const { error: dispatchError } = await access.supabase.rpc("dispatch_candidate_inquiry_reminders", {
      requested_company_id: access.companyId,
    });
    if (dispatchError) throw dispatchError;
    const { data, error } = await access.supabase.from("candidate_inquiry_notifications").select("id, title, body, sent_at, read_at")
      .eq("company_id", access.companyId).eq("recipient_id", access.userId)
      .order("sent_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ reminders: data ?? [] }, { headers });
  } catch (error) {
    console.error("Candidate inquiry reminder request failed", error);
    return NextResponse.json({ error: "Candidate inquiry reminders are unavailable." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getReminderAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
    let query = access.supabase.from("candidate_inquiry_notifications").update({ read_at: new Date().toISOString() })
      .eq("company_id", access.companyId).eq("recipient_id", access.userId).is("read_at", null);
    if (body?.all === true) {
      const { error } = await query;
      if (error) throw error;
    } else if (typeof body?.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
      const { error } = await query.eq("id", body.id);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Choose a reminder to mark as read." }, { status: 400, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Candidate inquiry reminder update failed", error);
    return NextResponse.json({ error: "Unable to update this inquiry reminder." }, { status: 503, headers });
  }
}