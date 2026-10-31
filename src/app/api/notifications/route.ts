import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isWorkspaceNotificationsMigrationMissing(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "42P01" || error.code === "PGRST205";
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data, error } = await supabase.from("workspace_notifications")
      .select("id, company_id, category, title, body, created_at, read_at")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isWorkspaceNotificationsMigrationMissing(error)) {
        return NextResponse.json({
          available: false,
          notifications: [],
          warning: "Workspace alerts are not set up yet. Apply supabase/migrations/20261031140816_workspace_notification_events.sql, then reload the app.",
          code: "workspace_notifications_migration_required",
        }, { headers });
      }
      throw error;
    }

    return NextResponse.json({ notifications: data ?? [] }, { headers });
  } catch (error) {
    console.error("Workspace notifications request failed", error);
    return NextResponse.json({ error: "Workspace notifications are unavailable." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
    let query = supabase.from("workspace_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);

    if (body?.all === true) {
      const { error } = await query;
      if (error) throw error;
    } else if (typeof body?.id === "string" && uuidPattern.test(body.id)) {
      const { data, error } = await query.eq("id", body.id).select("id");
      if (error) throw error;
      if (!data?.length) {
        return NextResponse.json({ error: "Notification not found or unavailable." }, { status: 404, headers });
      }
    } else {
      return NextResponse.json({ error: "Choose a notification to mark as read." }, { status: 400, headers });
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Workspace notification update failed", error);
    return NextResponse.json({ error: "Unable to update workspace notifications." }, { status: 503, headers });
  }
}
