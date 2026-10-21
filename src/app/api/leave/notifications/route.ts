import { NextResponse } from "next/server";
import { getWorkforceAccess } from "@/lib/server/workforce";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// GET /api/leave/notifications — fetch unread/recent leave notifications for the current user
export async function GET() {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data, error } = await access.supabase
      .from("leave_notifications")
      .select("id, leave_request_id, stage, title, body, sent_at, read_at")
      .eq("company_id", access.companyId)
      .eq("recipient_id", access.userId)
      .order("sent_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Leave notifications query failed", error);
      return NextResponse.json({ error: "Unable to load leave notifications. Apply migration 202610170004_leave_types_workflow.sql if setup is incomplete." }, { status: 500, headers });
    }

    return NextResponse.json({ notifications: data ?? [] }, { headers });
  } catch (err) {
    console.error("Leave notifications GET failed", err);
    return NextResponse.json({ error: "Leave notifications are unavailable." }, { status: 503, headers });
  }
}

// PATCH /api/leave/notifications — mark one or all as read
export async function PATCH(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
    const now = new Date().toISOString();

    if (body?.all === true) {
      const { error } = await access.supabase
        .from("leave_notifications")
        .update({ read_at: now })
        .eq("company_id", access.companyId)
        .eq("recipient_id", access.userId)
        .is("read_at", null);
      if (error) throw error;
    } else if (isUuid(body?.id)) {
      const { error } = await access.supabase
        .from("leave_notifications")
        .update({ read_at: now })
        .eq("id", body.id)
        .eq("company_id", access.companyId)
        .eq("recipient_id", access.userId);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Choose a notification to mark as read." }, { status: 400, headers });
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (err) {
    console.error("Leave notifications PATCH failed", err);
    return NextResponse.json({ error: "Unable to update leave notification." }, { status: 503, headers });
  }
}
