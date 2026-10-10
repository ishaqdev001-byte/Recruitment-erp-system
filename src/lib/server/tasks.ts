import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeUgandanPhone, sendSmsUg } from "@/lib/server/smsug";

export type TaskPermission = "tasks.view" | "tasks.create" | "tasks.edit" | "tasks.delete";
export type TaskSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type TaskAccess =
  | { supabase: TaskSupabase; companyId: string; userId: string }
  | { error: string; status: 401 | 403 };

export async function getTaskAccess(): Promise<TaskAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };

  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error || !membership) return { error: "Active company membership not found.", status: 403 };

  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function hasTaskPermission(access: TaskAccess, permission: TaskPermission) {
  if ("error" in access) return false;
  const { data, error } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: permission,
  });
  return !error && Boolean(data);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

export async function dispatchDueTaskReminders(access: Extract<TaskAccess, { supabase: unknown }>) {
  const now = new Date().toISOString();
  const [{ data: dueTasks, error: taskError }, { data: existing, error: notificationError }] = await Promise.all([
    access.supabase.from("tasks")
      .select("id, title, due_at, reminder_at, assigned_to, created_by, sms_reminder_enabled")
      .eq("company_id", access.companyId)
      .eq("is_completed", false)
      .not("reminder_at", "is", null)
      .lte("reminder_at", now)
      .limit(100),
    access.supabase.from("task_notifications")
      .select("task_id, recipient_id, remind_at")
      .eq("company_id", access.companyId),
  ]);
  if (taskError || notificationError || !dueTasks?.length) return;

  const delivered = new Set((existing ?? []).map((item) => `${item.task_id}:${item.recipient_id}:${item.remind_at}`));
  const notifications = dueTasks.flatMap((task) => {
    const recipientId = task.assigned_to ?? task.created_by ?? access.userId;
    const key = `${task.id}:${recipientId}:${task.reminder_at}`;
    if (delivered.has(key)) return [];
    return [{
      company_id: access.companyId,
      task_id: task.id,
      recipient_id: recipientId,
      title: task.title,
      body: task.due_at ? `Task reminder. Due ${new Date(task.due_at).toLocaleString()}.` : "Task reminder.",
      remind_at: task.reminder_at,
      sms_status: task.sms_reminder_enabled ? "queued" : "not_requested",
    }];
  });
  if (notifications.length) {
    const { error } = await access.supabase.from("task_notifications")
      .upsert(notifications, { onConflict: "task_id,recipient_id,remind_at", ignoreDuplicates: true });
    if (error) console.error("Task reminder record creation failed", error);
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!process.env.SMSUG_API_KEY?.trim() || !serviceRoleKey || !supabaseUrl) return;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: queued, error: queuedError } = await admin.from("task_notifications")
    .select("id, recipient_id, title, body")
    .eq("company_id", access.companyId)
    .eq("sms_status", "queued")
    .order("sent_at", { ascending: true })
    .limit(20);
  if (queuedError || !queued?.length) return;

  for (const reminder of queued) {
    const { data: claimed, error: claimError } = await admin.from("task_notifications")
      .update({ sms_status: "sending" })
      .eq("id", reminder.id).eq("company_id", access.companyId).eq("sms_status", "queued")
      .select("id").maybeSingle();
    if (claimError || !claimed) continue;

    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("phone").eq("id", reminder.recipient_id).maybeSingle();
    const phone = profileError || !profile?.phone ? null : normalizeUgandanPhone(profile.phone);
    if (!phone) {
      await admin.from("task_notifications").update({ sms_status: "failed", sms_error: "The assignee does not have a valid Ugandan phone number on their profile." })
        .eq("id", reminder.id).eq("company_id", access.companyId);
      continue;
    }

    const result = await sendSmsUg("Task Reminder", `${reminder.title}. ${reminder.body}`, [phone]);
    if (result.ok) {
      await admin.from("task_notifications").update({
        sms_status: "sent",
        sms_error: "",
        sms_token: result.token,
        sms_cost: result.cost,
        sms_balance: result.balance,
      }).eq("id", reminder.id).eq("company_id", access.companyId);
    } else {
      await admin.from("task_notifications").update({
        sms_status: result.code === "sms_network_error" ? "unknown" : "failed",
        sms_error: result.message,
      }).eq("id", reminder.id).eq("company_id", access.companyId);
    }
  }
}

export function nextRecurringDate(value: string, recurrence: string) {
  const next = new Date(value);
  if (recurrence === "daily") next.setUTCDate(next.getUTCDate() + 1);
  if (recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  if (recurrence === "monthly") {
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  if (recurrence === "yearly") {
    const month = next.getUTCMonth();
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    next.setUTCMonth(month);
    const lastDay = new Date(Date.UTC(next.getUTCFullYear(), month + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, lastDay));
  }
  return next.toISOString();
}