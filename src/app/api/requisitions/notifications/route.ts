import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: "Active company membership not found.", status: 403 as const };
  return { supabase, companyId: membership.company_id, userId: user.id };
}

// GET /api/requisitions/notifications — get unread count + recent notifications for current user
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data, error } = await access.supabase
      .from("requisition_notifications")
      .select("id, requisition_id, stage, title, body, is_read, created_at")
      .eq("company_id", access.companyId)
      .eq("recipient_id", access.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Requisition notifications query failed", error);
      return NextResponse.json({ error: "Unable to load notifications." }, { status: 500, headers: responseHeaders });
    }

    const unreadCount = (data ?? []).filter((n) => !n.is_read).length;
    return NextResponse.json({ notifications: data ?? [], unreadCount }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisition notifications GET failed", err);
    return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PATCH /api/requisitions/notifications — mark one or all as read
export async function PATCH(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;

    let query = access.supabase
      .from("requisition_notifications")
      .update({ is_read: true })
      .eq("company_id", access.companyId)
      .eq("recipient_id", access.userId);

    if (typeof body?.id === "string") {
      query = query.eq("id", body.id);
    } else {
      // Mark all unread
      query = query.eq("is_read", false);
    }

    const { error } = await query;
    if (error) {
      console.error("Mark notifications read failed", error);
      return NextResponse.json({ error: "Unable to update notifications." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json({ ok: true }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisition notifications PATCH failed", err);
    return NextResponse.json({ error: "Notifications are unavailable." }, { status: 503, headers: responseHeaders });
  }
}
