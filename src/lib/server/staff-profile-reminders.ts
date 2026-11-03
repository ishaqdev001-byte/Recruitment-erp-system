import "server-only";

import type { getLinkedStaffAccess } from "@/lib/server/staff-profile";

type StaffProfileAccess = Extract<
  Awaited<ReturnType<typeof getLinkedStaffAccess>>,
  { admin: unknown; companyId: string; staffId: string; userId: string }
>;

const PROFILE_REMINDER_DAYS = 10;
const PROFILE_REVIEW_DAYS = 42;

type ReminderRow = {
  personal_details_completed_at: string | null;
  reminder_stage: "profile_completion" | "information_review";
  next_reminder_at: string | null;
  update_required: boolean;
  last_reviewed_at: string | null;
};

export type StaffProfileReminder = {
  prompt: "profile_completion" | "information_review" | null;
  updateRequired: boolean;
};

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function ensureReminderRow(access: StaffProfileAccess) {
  const { error: insertError } = await access.admin
    .from("staff_hr_profile_reminders")
    .upsert(
      {
        staff_id: access.staffId,
        company_id: access.companyId,
        user_id: access.userId,
        next_reminder_at: daysFromNow(PROFILE_REMINDER_DAYS),
      },
      { onConflict: "staff_id", ignoreDuplicates: true },
    );
  if (insertError) throw insertError;

  const { data, error } = await access.admin
    .from("staff_hr_profile_reminders")
    .select(
      "personal_details_completed_at, reminder_stage, next_reminder_at, update_required, last_reviewed_at",
    )
    .eq("company_id", access.companyId)
    .eq("staff_id", access.staffId)
    .eq("user_id", access.userId)
    .single();
  if (error) throw error;

  return data as ReminderRow;
}

export async function getStaffProfileReminder(
  access: StaffProfileAccess,
  personalDetailsComplete: boolean,
): Promise<StaffProfileReminder> {
  let row = await ensureReminderRow(access);
  if (personalDetailsComplete && !row.personal_details_completed_at) {
    const now = new Date().toISOString();
    const { data, error } = await access.admin
      .from("staff_hr_profile_reminders")
      .update({
        personal_details_completed_at: now,
        next_reminder_at: new Date(
          Date.now() + PROFILE_REMINDER_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
        updated_at: now,
      })
      .eq("company_id", access.companyId)
      .eq("staff_id", access.staffId)
      .is("personal_details_completed_at", null)
      .select(
        "personal_details_completed_at, reminder_stage, next_reminder_at, update_required, last_reviewed_at",
      )
      .maybeSingle();
    if (error) throw error;
    if (data) row = data as ReminderRow;
    else row = await ensureReminderRow(access);
  }

  const reminderIsDue =
    personalDetailsComplete &&
    !row.update_required &&
    row.next_reminder_at !== null &&
    Date.parse(row.next_reminder_at) <= Date.now();

  return {
    prompt: reminderIsDue ? row.reminder_stage : null,
    updateRequired: row.update_required,
  };
}

export async function markStaffPersonalDetailsSaved(access: StaffProfileAccess) {
  const row = await ensureReminderRow(access);
  const now = new Date().toISOString();
  let updates: Record<string, unknown> | null = null;

  if (row.update_required) {
    updates = {
      reminder_stage: "information_review",
      next_reminder_at: daysFromNow(PROFILE_REVIEW_DAYS),
      update_required: false,
      last_reviewed_at: now,
      updated_at: now,
    };
  } else if (!row.personal_details_completed_at) {
    updates = {
      personal_details_completed_at: now,
      next_reminder_at: daysFromNow(PROFILE_REMINDER_DAYS),
      updated_at: now,
    };
  } else if (row.reminder_stage === "information_review") {
    updates = {
      next_reminder_at: daysFromNow(PROFILE_REVIEW_DAYS),
      last_reviewed_at: now,
      updated_at: now,
    };
  }

  if (updates) {
    const { error } = await access.admin
      .from("staff_hr_profile_reminders")
      .update(updates)
      .eq("company_id", access.companyId)
      .eq("staff_id", access.staffId)
      .eq("user_id", access.userId);
    if (error) throw error;
  }

  return getStaffProfileReminder(access, true);
}

export async function respondToStaffProfileReminder(
  access: StaffProfileAccess,
  action: unknown,
): Promise<StaffProfileReminder> {
  const row = await ensureReminderRow(access);
  const now = new Date().toISOString();
  const due = row.next_reminder_at !== null && Date.parse(row.next_reminder_at) <= Date.now();
  let updates: Record<string, unknown>;

  if (action === "reviewed" && row.reminder_stage === "profile_completion" && due) {
    updates = {
      reminder_stage: "information_review",
      next_reminder_at: daysFromNow(PROFILE_REVIEW_DAYS),
      last_reviewed_at: now,
      updated_at: now,
    };
  } else if (action === "review_later" && row.reminder_stage === "profile_completion" && due) {
    updates = {
      next_reminder_at: daysFromNow(PROFILE_REMINDER_DAYS),
      updated_at: now,
    };
  } else if (action === "same" && row.reminder_stage === "information_review" && due) {
    updates = {
      next_reminder_at: daysFromNow(PROFILE_REVIEW_DAYS),
      last_reviewed_at: now,
      updated_at: now,
    };
  } else if (action === "changed" && row.reminder_stage === "information_review" && due) {
    updates = {
      next_reminder_at: null,
      update_required: true,
      updated_at: now,
    };
  } else {
    throw new Error("This HR profile reminder is no longer available.");
  }

  const { error } = await access.admin
    .from("staff_hr_profile_reminders")
    .update(updates)
    .eq("company_id", access.companyId)
    .eq("staff_id", access.staffId)
    .eq("user_id", access.userId);
  if (error) throw error;

  return getStaffProfileReminder(access, true);
}
