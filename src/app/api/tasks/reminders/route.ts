import { NextResponse } from "next/server";
import { dispatchDueTaskReminders, getTaskAccess, hasTaskPermission, isUuid } from "@/lib/server/tasks";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.view")) return NextResponse.json({ error: "Task reminders are not set up. Apply supabase/migrations/202610040025_google_tasks.sql, or ask an administrator to grant tasks.view." }, { status: 403, headers });
    await dispatchDueTaskReminders(access);
    const { data, error } = await access.supabase.from("task_notifications").select("*")
      .eq("company_id", access.companyId)
      .eq("recipient_id", access.userId)
      .order("sent_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ reminders: data ?? [] }, { headers });
  } catch (error) {
    console.error("Task reminder request failed", error);
    return NextResponse.json({ error: "Task reminders are unavailable." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.view")) return NextResponse.json({ error: "You do not have permission to update task reminders." }, { status: 403, headers });
    const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
    let query = access.supabase.from("task_notifications").update({ read_at: new Date().toISOString() })
      .eq("company_id", access.companyId).eq("recipient_id", access.userId).is("read_at", null);
    if (body?.all === true) {
      const { error } = await query;
      if (error) throw error;
    } else if (isUuid(body?.id)) {
      const { error } = await query.eq("id", body.id);
      if (error) throw error;
    } else {
      return NextResponse.json({ error: "Choose a reminder to mark as read." }, { status: 400, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Task reminder update failed", error);
    return NextResponse.json({ error: "Unable to update this reminder." }, { status: 503, headers });
  }
}