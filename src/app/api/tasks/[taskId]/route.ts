import { NextResponse } from "next/server";
import { createTaskAdminClient, getTaskAccess, hasTaskPermission, isIsoDateTime, isUuid, nextRecurringDate } from "@/lib/server/tasks";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const recurrences = ["none", "daily", "weekly", "monthly", "yearly"];
const priorities = ["High", "Medium", "Low"];

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    if (!await hasTaskPermission(access, "tasks.view")) return NextResponse.json({ error: "You do not have permission to view tasks." }, { status: 403, headers });
    const { taskId } = await context.params;
    if (!isUuid(taskId)) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (body?.action === "progress-report") {
      const progressPercent = body.progressPercent;
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!Number.isInteger(progressPercent) || Number(progressPercent) < 0 || Number(progressPercent) > 100 || !note || note.length > 2000) {
        return NextResponse.json({ error: "Enter a whole-number progress percentage from 0 to 100 and a note of up to 2,000 characters." }, { status: 400, headers });
      }
      const { data: task, error: taskError } = await access.supabase.from("tasks")
        .select("id, assigned_to, is_completed, is_cancelled").eq("id", taskId).eq("company_id", access.companyId).maybeSingle();
      if (taskError) throw taskError;
      if (!task || task.assigned_to !== access.userId) {
        return NextResponse.json({ error: "Only the assigned task owner can submit progress updates." }, { status: 403, headers });
      }
      if (task.is_completed || task.is_cancelled) {
        return NextResponse.json({ error: "Progress cannot be added to a completed or cancelled task." }, { status: 400, headers });
      }
      const { data: report, error: reportError } = await access.supabase.from("task_progress_reports")
        .insert({
          company_id: access.companyId,
          task_id: taskId,
          reported_by: access.userId,
          progress_percent: Number(progressPercent),
          note,
        })
        .select("id, task_id, reported_by, progress_percent, note, created_at")
        .single();
      if (reportError || !report) {
        console.error("Task progress report creation failed", reportError);
        return NextResponse.json({ error: "Unable to submit the task progress report." }, { status: 400, headers });
      }
      return NextResponse.json({ report }, { status: 201, headers });
    }

    if (body?.action === "complete") {
      const { data: task, error: taskError } = await access.supabase.from("tasks")
        .select("id, assigned_to, assigned_at, is_completed, is_cancelled")
        .eq("id", taskId).eq("company_id", access.companyId).maybeSingle();
      if (taskError) throw taskError;
      if (!task || task.assigned_to !== access.userId) {
        return NextResponse.json({ error: "Only the assigned task owner can complete this task." }, { status: 403, headers });
      }
      if (task.is_completed || task.is_cancelled) {
        return NextResponse.json({ error: "This task is already closed." }, { status: 400, headers });
      }
      const { data: latestReport, error: reportError } = await access.supabase.from("task_progress_reports")
        .select("reported_by, progress_percent")
        .eq("company_id", access.companyId).eq("task_id", taskId)
        .gte("created_at", task.assigned_at)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (reportError) throw reportError;
      if (latestReport?.reported_by !== access.userId || latestReport.progress_percent !== 100) {
        return NextResponse.json({ error: "Submit a 100% progress update with a comment before completing this task." }, { status: 400, headers });
      }
      const admin = createTaskAdminClient();
      if (!admin) return NextResponse.json({ error: "Task completion is unavailable because server-side task updates are not configured." }, { status: 503, headers });
      const { data: completedTask, error: completionError } = await admin.from("tasks").update({ is_completed: true })
        .eq("id", taskId).eq("company_id", access.companyId)
        .eq("assigned_to", access.userId).eq("is_completed", false).eq("is_cancelled", false)
        .select("*").maybeSingle();
      if (completionError) throw completionError;
      if (!completedTask) return NextResponse.json({ error: "This task was closed before it could be completed." }, { status: 409, headers });
      return NextResponse.json({ task: completedTask }, { headers });
    }

    const { data: task, error: taskError } = await access.supabase.from("tasks")
      .select("id, assigned_to, created_by").eq("id", taskId).eq("company_id", access.companyId).maybeSingle();
    if (taskError) throw taskError;
    if (!task || task.assigned_to !== access.userId || task.created_by === access.userId) {
      return NextResponse.json({ error: "This assignment is not available to you." }, { status: 404, headers });
    }

    const { error } = await access.supabase.from("task_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("company_id", access.companyId)
      .eq("task_id", taskId)
      .eq("recipient_id", access.userId)
      .in("notification_type", ["assignment", "acknowledgement_reminder"])
      .is("read_at", null);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Task acknowledgement failed", error);
    return NextResponse.json({ error: "Unable to acknowledge this task assignment." }, { status: 503, headers });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  try {
    const access = await getTaskAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const { taskId } = await context.params;
    if (!isUuid(taskId)) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Enter valid task details." }, { status: 400, headers });
    const assignmentAction = "assignedTo" in body || "isCancelled" in body;
    const canEdit = await hasTaskPermission(access, "tasks.edit");
    const canReassign = await hasTaskPermission(access, "tasks.reassign");
    if (!canEdit && !assignmentAction) return NextResponse.json({ error: "You do not have permission to edit tasks." }, { status: 403, headers });
    if (assignmentAction && Object.keys(body).some((key) => !["assignedTo", "isCancelled"].includes(key))) {
      return NextResponse.json({ error: "Reassignment or cancellation must be submitted as a separate task action." }, { status: 400, headers });
    }

    const admin = assignmentAction ? createTaskAdminClient() : null;
    if (assignmentAction && !admin) return NextResponse.json({ error: "Task assignment management is unavailable because server-side task updates are not configured." }, { status: 503, headers });
    const taskClient = admin ?? access.supabase;
    const { data: current, error: currentError } = await taskClient.from("tasks").select("*")
      .eq("id", taskId).eq("company_id", access.companyId).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });

    if (assignmentAction) {
      if (current.created_by !== access.userId && !canReassign) {
        return NextResponse.json({ error: "Only the task creator or a user with tasks.reassign can reassign or cancel this task." }, { status: 403, headers });
      }
      if ("assignedTo" in body) {
        if (!isUuid(body.assignedTo)) return NextResponse.json({ error: "Choose an active company member to assign this task to." }, { status: 400, headers });
        if (current.is_completed || current.is_cancelled) return NextResponse.json({ error: "Completed or cancelled tasks cannot be reassigned." }, { status: 400, headers });
        if (body.assignedTo === current.assigned_to) return NextResponse.json({ task: current }, { headers });
        const { data: membership, error: membershipError } = await admin!.from("company_memberships")
          .select("user_id").eq("company_id", access.companyId)
          .eq("user_id", body.assignedTo).eq("status", "active").maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) return NextResponse.json({ error: "Choose an active member of this company." }, { status: 400, headers });
        const { data: reassignedTask, error: reassignmentError } = await admin!.from("tasks").update({
          assigned_to: body.assignedTo,
          assigned_at: new Date().toISOString(),
          assignment_acknowledged_at: null,
          last_progress_reminder_at: null,
          last_overdue_reminder_at: null,
        }).eq("id", taskId).eq("company_id", access.companyId)
          .eq("is_completed", false).eq("is_cancelled", false).select("*").maybeSingle();
        if (reassignmentError) throw reassignmentError;
        if (!reassignedTask) return NextResponse.json({ error: "This task was closed before it could be reassigned." }, { status: 409, headers });
        return NextResponse.json({ task: reassignedTask }, { headers });
      }
      if (body.isCancelled !== true) return NextResponse.json({ error: "Choose a valid cancellation action." }, { status: 400, headers });
      if (current.is_completed) return NextResponse.json({ error: "Completed tasks cannot be cancelled." }, { status: 400, headers });
      const { data: cancelledTask, error: cancellationError } = await admin!.from("tasks").update({ is_cancelled: true })
        .eq("id", taskId).eq("company_id", access.companyId)
        .eq("is_completed", false).eq("is_cancelled", false).select("*").maybeSingle();
      if (cancellationError) throw cancellationError;
      if (!cancelledTask && !current.is_cancelled) return NextResponse.json({ error: "This task could not be cancelled." }, { status: 409, headers });
      return NextResponse.json({ task: cancelledTask ?? current }, { headers });
    }

    if (!canEdit) return NextResponse.json({ error: "You do not have permission to edit tasks." }, { status: 403, headers });
    if (current.created_by !== access.userId && current.assigned_to !== access.userId) {
      return NextResponse.json({ error: "You can only manage tasks created for you." }, { status: 403, headers });
    }

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
      if (assignedTo !== current.assigned_to) {
        return NextResponse.json({ error: "Tasks and their reminders cannot be reassigned to another user." }, { status: 400, headers });
      }
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
      if (body.isCompleted && current.is_cancelled) return NextResponse.json({ error: "Cancelled tasks cannot be completed." }, { status: 400, headers });
      if (body.isCompleted && current.assigned_to === access.userId && current.created_by !== access.userId) {
        const { data: latestReport, error: reportError } = await access.supabase.from("task_progress_reports")
          .select("reported_by, progress_percent")
          .eq("company_id", access.companyId).eq("task_id", taskId)
          .gte("created_at", current.assigned_at)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (reportError) throw reportError;
        if (latestReport?.reported_by !== access.userId || latestReport.progress_percent !== 100) {
          return NextResponse.json({ error: "Submit a 100% progress update with a comment before completing this task." }, { status: 400, headers });
        }
      }
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
    const { taskId } = await context.params;
    if (!isUuid(taskId)) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });
    const { data: task, error: taskError } = await access.supabase.from("tasks").select("created_by, assigned_to")
      .eq("id", taskId).eq("company_id", access.companyId).maybeSingle();
    if (taskError || !task) return NextResponse.json({ error: "Task not found." }, { status: 404, headers });
    const canDeleteAny = await hasTaskPermission(access, "tasks.delete");
    if (task.created_by !== access.userId && task.assigned_to !== access.userId && !canDeleteAny) {
      return NextResponse.json({ error: "You can only delete tasks created for you." }, { status: 403, headers });
    }
    if (!canDeleteAny && !await hasTaskPermission(access, "tasks.edit")) {
      return NextResponse.json({ error: "You do not have permission to delete tasks." }, { status: 403, headers });
    }
    let deleteQuery = access.supabase.from("tasks").delete().eq("id", taskId).eq("company_id", access.companyId);
    if (!canDeleteAny) deleteQuery = deleteQuery.or(`created_by.eq.${access.userId},assigned_to.eq.${access.userId}`);
    const { error } = await deleteQuery;
    if (error) return NextResponse.json({ error: "Unable to delete this task." }, { status: 400, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("Task deletion request failed", error);
    return NextResponse.json({ error: "Task deletion is unavailable." }, { status: 503, headers });
  }
}