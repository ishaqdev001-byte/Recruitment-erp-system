import { NextResponse } from "next/server";
import { getTaskAccess, hasTaskPermission, isIsoDateTime, isUuid, nextRecurringDate } from "@/lib/server/tasks";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const recurrences = ["none", "daily", "weekly", "monthly", "yearly"];
const priorities = ["High", "Medium", "Low"];

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.edit")) return NextResponse.json({ error: "You do not have permission to edit tasks." }, { status: 403, headers });
    const { taskId } = await context.params;
    if (!isUuid(taskId)) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Enter valid task details." }, { status: 400, headers });
    const { data: current, error: currentError } = await access.supabase.from("tasks").select("*")
      .eq("id", taskId).eq("company_id", access.companyId).maybeSingle();
    if (currentError || !current) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });

    const update: Record<string, unknown> = {};
    if ("title" in body) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title || title.length > 300) return NextResponse.json({ error: "Task title must be between 1 and 300 characters." }, { status: 400, headers });
      update.title = title;
    }
    if ("notes" in body) {
      if (typeof body.notes !== "string" || body.notes.length > 10000) return NextResponse.json({ error: "Notes must be 10,000 characters or fewer." }, { status: 400, headers });
      update.notes = body.notes.trim();
    }
    if ("listId" in body) {
      if (!isUuid(body.listId)) return NextResponse.json({ error: "Choose a valid task list." }, { status: 400, headers });
      update.list_id = body.listId;
    }
    for (const [key, column] of [["dueAt", "due_at"], ["reminderAt", "reminder_at"]] as const) {
      if (key in body) {
        const value = body[key];
        if (value !== null && value !== "" && !isIsoDateTime(value)) return NextResponse.json({ error: "Choose a valid date and time." }, { status: 400, headers });
        update[column] = value === "" ? null : value;
      }
    }
    if (update.reminder_at === null) update.sms_reminder_enabled = false;
    if ("assignedTo" in body) {
      const assignedTo = body.assignedTo === "" ? null : body.assignedTo;
      if (assignedTo !== null && !isUuid(assignedTo)) return NextResponse.json({ error: "Choose an active company member." }, { status: 400, headers });
      if (assignedTo) {
        const { data: member } = await access.supabase.from("company_memberships").select("user_id")
          .eq("company_id", access.companyId).eq("user_id", assignedTo).eq("status", "active").maybeSingle();
        if (!member) return NextResponse.json({ error: "Choose an active company member." }, { status: 400, headers });
      }
      update.assigned_to = assignedTo;
    }
    if ("priority" in body) {
      if (!priorities.includes(String(body.priority))) return NextResponse.json({ error: "Choose a valid priority." }, { status: 400, headers });
      update.priority = body.priority;
    }
    if ("recurrence" in body) {
      if (!recurrences.includes(String(body.recurrence))) return NextResponse.json({ error: "Choose a valid repeat interval." }, { status: 400, headers });
      update.recurrence = body.recurrence;
    }
    if ("smsReminderEnabled" in body) {
      if (typeof body.smsReminderEnabled !== "boolean") return NextResponse.json({ error: "Choose a valid SMS reminder setting." }, { status: 400, headers });
      if (body.smsReminderEnabled) {
        const canSendSms = await access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "communications.sms.send",
        });
        if (canSendSms.error || !canSendSms.data || !("reminder_at" in update ? update.reminder_at : current.reminder_at)) {
          return NextResponse.json({ error: "SMS reminders require a scheduled reminder and the communications.sms.send permission." }, { status: 403, headers });
        }
      }
      update.sms_reminder_enabled = body.smsReminderEnabled;
    }
    if ("isStarred" in body) {
      if (typeof body.isStarred !== "boolean") return NextResponse.json({ error: "Choose a valid star state." }, { status: 400, headers });
      update.is_starred = body.isStarred;
    }
    if ("isCompleted" in body) {
      if (typeof body.isCompleted !== "boolean") return NextResponse.json({ error: "Choose a valid completion state." }, { status: 400, headers });
      update.is_completed = body.isCompleted;
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ task: current }, { headers });

    const { data: task, error } = await access.supabase.from("tasks").update(update)
      .eq("id", taskId).eq("company_id", access.companyId).select("*").single();
    if (error || !task) {
      console.error("Task update failed", error);
      return NextResponse.json({ error: "Unable to update this task." }, { status: 400, headers });
    }

    if (!current.is_completed && task.is_completed && task.recurrence !== "none" && task.due_at) {
      const nextDueAt = nextRecurringDate(task.due_at, task.recurrence);
      const reminderOffset = task.reminder_at ? Date.parse(task.due_at) - Date.parse(task.reminder_at) : null;
      const nextReminderAt = reminderOffset === null ? null : new Date(Date.parse(nextDueAt) - reminderOffset).toISOString();
      const { error: recurrenceError } = await access.supabase.from("tasks").insert({
        company_id: access.companyId,
        list_id: task.list_id,
        parent_task_id: task.parent_task_id,
        title: task.title,
        notes: task.notes,
        due_at: nextDueAt,
        reminder_at: nextReminderAt,
        assigned_to: task.assigned_to,
        priority: task.priority,
        recurrence: task.recurrence,
        sms_reminder_enabled: task.sms_reminder_enabled,
        created_by: access.userId,
      });
      if (recurrenceError) console.error("Recurring task creation failed", recurrenceError);
    }
    return NextResponse.json({ task }, { headers });
  } catch (error) {
    console.error("Task update request failed", error);
    return NextResponse.json({ error: "Task update is unavailable." }, { status: 503, headers });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.delete")) return NextResponse.json({ error: "You do not have permission to delete tasks." }, { status: 403, headers });
    const { taskId } = await context.params;
    if (!isUuid(taskId)) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });
    const { error } = await access.supabase.from("tasks").delete().eq("id", taskId).eq("company_id", access.companyId);
    if (error) return NextResponse.json({ error: "Unable to delete this task." }, { status: 400, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Task deletion request failed", error);
    return NextResponse.json({ error: "Task deletion is unavailable." }, { status: 503, headers });
  }
}