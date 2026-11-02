import { NextResponse } from "next/server";
import { getTaskAccess, hasTaskPermission } from "@/lib/server/tasks";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.view")) return NextResponse.json({ error: "Task access is not set up. Apply supabase/migrations/202610040025_google_tasks.sql, or ask an administrator to grant tasks.view." }, { status: 403, headers });

    const [
      canCreate,
      canEdit,
      canDelete,
      canSendSmsResult,
      { data: lists, error: listError },
      { data: tasks, error: taskError },
    ] = await Promise.all([
      hasTaskPermission(access, "tasks.create"),
      hasTaskPermission(access, "tasks.edit"),
      hasTaskPermission(access, "tasks.delete"),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "communications.sms.send",
      }),
      access.supabase.from("task_lists").select("id, name, position, created_at")
        .eq("company_id", access.companyId).order("position").order("name"),
      access.supabase.from("tasks").select("*").eq("company_id", access.companyId)
        .or(`created_by.eq.${access.userId},assigned_to.eq.${access.userId}`)
        .order("is_starred", { ascending: false }).order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }),
    ]);
    if (listError || taskError) throw listError ?? taskError;
    let taskLists = lists ?? [];
    if (!taskLists.length && canCreate) {
      const { data: newList, error: createListError } = await access.supabase.from("task_lists")
        .insert({ company_id: access.companyId, name: "My Tasks", created_by: access.userId })
        .select("id, name, position, created_at")
        .single();
      if (createListError || !newList) throw createListError ?? new Error("Unable to create the default task list.");
      taskLists = [newList];
    }
    const { data: profile, error: profileError } = await access.supabase.from("profiles")
      .select("id, display_name").eq("id", access.userId).maybeSingle();
    if (profileError) throw profileError;
    return NextResponse.json({
      tasks: tasks ?? [],
      lists: taskLists,
      members: [{ id: access.userId, name: profile?.display_name || `Staff ${access.userId.slice(0, 8)}` }],
      permissions: { canCreate, canEdit, canDelete, canSendSms: !canSendSmsResult.error && Boolean(canSendSmsResult.data) },
    }, { headers });
  } catch (error) {
    console.error("Task list request failed", error);
    return NextResponse.json({ error: "Task data is unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    const listId = typeof body?.listId === "string" ? body.listId : "";
    const dueAt = body?.dueAt === null || body?.dueAt === "" ? null : body?.dueAt;
    const reminderAt = body?.reminderAt === null || body?.reminderAt === "" ? null : body?.reminderAt;
    const parentTaskId = body?.parentTaskId === null || body?.parentTaskId === "" ? null : body?.parentTaskId;
    const smsReminderEnabled = body?.smsReminderEnabled === true;
    const priority = body?.priority ?? "Medium";
    const recurrence = body?.recurrence ?? "none";
    if (!title || title.length > 300 || notes.length > 10000 || !/^[0-9a-f-]{36}$/i.test(listId)
      || (dueAt !== null && (typeof dueAt !== "string" || Number.isNaN(Date.parse(dueAt))))
      || (reminderAt !== null && (typeof reminderAt !== "string" || Number.isNaN(Date.parse(reminderAt))))
      || (parentTaskId !== null && (typeof parentTaskId !== "string" || !/^[0-9a-f-]{36}$/i.test(parentTaskId)))
      || !["High", "Medium", "Low"].includes(String(priority))
      || !["none", "daily", "weekly", "monthly", "yearly"].includes(String(recurrence))) {
      return NextResponse.json({ error: "Enter a task title and valid task details." }, { status: 400, headers });
    }
    if (body?.assignedTo !== undefined && body.assignedTo !== null && body.assignedTo !== "" && body.assignedTo !== access.userId) {
      return NextResponse.json({ error: "Tasks and their reminders can only be assigned to you." }, { status: 400, headers });
    }

    const [canCreate, smsPermission] = await Promise.all([
      hasTaskPermission(access, "tasks.create"),
      smsReminderEnabled && reminderAt
        ? access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "communications.sms.send",
        })
        : Promise.resolve(null),
    ]);
    if (!canCreate) return NextResponse.json({ error: "You do not have permission to create tasks. Apply the Google Tasks migration if task permissions have not been configured." }, { status: 403, headers });
    if (smsReminderEnabled && (!reminderAt || !smsPermission || smsPermission.error || !smsPermission.data)) {
      return NextResponse.json({ error: "SMS reminders require a scheduled reminder and the communications.sms.send permission." }, { status: 403, headers });
    }

    const parentLookup = parentTaskId
      ? access.supabase.from("tasks").select("id, list_id, parent_task_id")
        .eq("company_id", access.companyId).eq("id", parentTaskId).maybeSingle()
      : Promise.resolve(null);
    const parentResult = await parentLookup;
    if (parentResult?.error) throw parentResult.error;
    if (parentTaskId && (!parentResult?.data || parentResult.data.list_id !== listId)) {
      return NextResponse.json({ error: "Choose a parent task in the selected list." }, { status: 400, headers });
    }
    if (parentResult?.data?.parent_task_id) return NextResponse.json({ error: "Subtasks can only be nested one level deep." }, { status: 400, headers });

    const { data: task, error } = await access.supabase.from("tasks").insert({
      company_id: access.companyId,
      list_id: listId,
      parent_task_id: parentTaskId,
      title,
      notes,
      due_at: dueAt,
      reminder_at: reminderAt,
      assigned_to: access.userId,
      priority,
      recurrence,
      sms_reminder_enabled: smsReminderEnabled,
      created_by: access.userId,
    }).select("*").single();
    if (error || !task) {
      console.error("Task creation failed", error);
      return NextResponse.json({ error: "Unable to create this task. Check the selected list and assignee." }, { status: 400, headers });
    }
    return NextResponse.json({ task }, { status: 201, headers });
  } catch (error) {
    console.error("Task creation request failed", error);
    return NextResponse.json({ error: "Task creation is unavailable." }, { status: 503, headers });
  }
}