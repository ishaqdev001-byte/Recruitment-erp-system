import { NextResponse } from "next/server";
import { getTaskAccess, hasTaskPermission, isUuid } from "@/lib/server/tasks";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.create")) return NextResponse.json({ error: "You do not have permission to create task lists." }, { status: 403, headers });
    const body = await request.json().catch(() => null) as { name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) return NextResponse.json({ error: "List name must be between 1 and 100 characters." }, { status: 400, headers });
    const { data: last } = await access.supabase.from("task_lists").select("position")
      .eq("company_id", access.companyId).order("position", { ascending: false }).limit(1).maybeSingle();
    const { data: list, error } = await access.supabase.from("task_lists").insert({
      company_id: access.companyId,
      name,
      position: (last?.position ?? -1) + 1,
      created_by: access.userId,
    }).select("id, name, position, created_at").single();
    if (error || !list) return NextResponse.json({ error: "Unable to create this list. List names must be unique." }, { status: 400, headers });
    return NextResponse.json({ list }, { status: 201, headers });
  } catch (error) {
    console.error("Task list creation failed", error);
    return NextResponse.json({ error: "Task list creation is unavailable." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.edit")) return NextResponse.json({ error: "You do not have permission to rename task lists." }, { status: 403, headers });
    const body = await request.json().catch(() => null) as { id?: unknown; name?: unknown } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!isUuid(body?.id) || !name || name.length > 100) return NextResponse.json({ error: "Enter a valid list name." }, { status: 400, headers });
    const { data: list, error } = await access.supabase.from("task_lists").update({ name })
      .eq("id", body.id).eq("company_id", access.companyId).select("id, name, position, created_at").maybeSingle();
    if (error || !list) return NextResponse.json({ error: "Unable to rename this list. List names must be unique." }, { status: 400, headers });
    return NextResponse.json({ list }, { headers });
  } catch (error) {
    console.error("Task list update failed", error);
    return NextResponse.json({ error: "Task list update is unavailable." }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.delete")) return NextResponse.json({ error: "You do not have permission to delete task lists." }, { status: 403, headers });
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!isUuid(body?.id)) return NextResponse.json({ error: "Choose a valid task list." }, { status: 400, headers });
    const { count, error: countError } = await access.supabase.from("tasks").select("id", { count: "exact", head: true })
      .eq("company_id", access.companyId).eq("list_id", body.id);
    if (countError) throw countError;
    if ((count ?? 0) > 0) return NextResponse.json({ error: "Move or delete the tasks in this list before deleting it." }, { status: 409, headers });
    const { count: listCount } = await access.supabase.from("task_lists").select("id", { count: "exact", head: true }).eq("company_id", access.companyId);
    if ((listCount ?? 0) <= 1) return NextResponse.json({ error: "Keep at least one task list." }, { status: 409, headers });
    const { error } = await access.supabase.from("task_lists").delete().eq("id", body.id).eq("company_id", access.companyId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Task list deletion failed", error);
    return NextResponse.json({ error: "Unable to delete this task list." }, { status: 503, headers });
  }
}