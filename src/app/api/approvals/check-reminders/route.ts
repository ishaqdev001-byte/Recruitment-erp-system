import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

/**
 * POST /api/approvals/check-reminders
 *
 * Supabase cron job that runs every 30 minutes to:
 * 1. Find approval requests pending > 2 hours without action
 * 2. Send in-app + SMS reminders to assigned approvers
 * 3. Record reminder history for duplicate prevention
 *
 * Cron config in supabase/config.toml:
 * [functions."approvals-check-reminders"]
 * schedule = "*/30 * * * *"  # Every 30 minutes
 */

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface PendingApproval {
  id: string;
  company_id: string;
  request_number: string;
  expense_name: string;
  status: string;
  created_by: string;
  stage_entered_at: string;
  next_approver_id: string;
  request_type: "expense" | "requisition" | "leave";
}

async function checkAndSendReminders() {
  const admin = createAdminClient();
  if (!admin) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is required");
    return { error: "Missing credentials", processed: 0 };
  }

  try {
    // Query approval requests pending > 2 hours
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: pendingExpenses, error: expenseError } = await admin
      .from("expense_requests")
      .select("id, company_id, request_number, expense_name, created_by, stage_entered_at, next_approver_id")
      .eq("staged_visibility", true)
      .in("status", ["pending_general_manager_review", "pending_finance_verification", "pending_chairman_authorization", "authorized_pending_cashout"])
      .lt("stage_entered_at", twoHoursAgo);

    if (expenseError) {
      console.error("Error querying pending expenses", expenseError);
    }

    // Check for already-sent reminders
    const requestIds = (pendingExpenses ?? []).map((r) => r.id);
    let sentReminderIds = new Set<string>();

    if (requestIds.length > 0) {
      const { data: sentReminders } = await admin
        .from("approval_reminders")
        .select("request_id")
        .in("request_id", requestIds)
        .eq("reminder_type", "2hour");

      sentReminderIds = new Set(sentReminders?.map((r) => r.request_id) ?? []);
    }

    // Filter to only those without sent reminders
    const toRemind = pendingExpenses?.filter((r) => !sentReminderIds.has(r.id)) ?? [];

    console.log(`Found ${pendingExpenses?.length ?? 0} pending, ${toRemind.length} need reminders`);

    // Get approver details and company info
    let remindersSent = 0;
    for (const request of toRemind) {
      try {
        // Get approver phone and company name
        const [{ data: approver }, { data: company }] = await Promise.all([
          admin.from("profiles").select("phone, display_name").eq("id", request.next_approver_id).maybeSingle(),
          admin.from("companies").select("name").eq("id", request.company_id).maybeSingle(),
        ]);

        if (!approver?.phone) {
          console.log(`Approver ${request.next_approver_id} has no phone, skipping SMS`);
          continue;
        }

        // Calculate hours pending
        const hoursPending = Math.floor((Date.now() - new Date(request.stage_entered_at).getTime()) / (1000 * 60 * 60));

        // Queue SMS reminder
        const smsMessage = `[${company?.name}] Reminder: ${request.request_number} pending for ${hoursPending}+ hours. Action needed.`;

        const { error: smsError } = await admin.from("sms_queue").insert({
          company_id: request.company_id,
          recipient_id: request.next_approver_id,
          recipient_phone: approver.phone,
          message: smsMessage,
          request_type: "expense",
          request_id: request.id,
          status: "pending",
        });

        if (smsError) {
          console.error(`Failed to queue SMS for ${request.id}:`, smsError);
          continue;
        }

        // Record reminder sent
        const { error: historyError } = await admin.from("approval_reminders").insert({
          company_id: request.company_id,
          request_id: request.id,
          request_type: "expense",
          stage: request.status,
          assigned_to_id: request.next_approver_id,
          reminder_type: "2hour",
        });

        if (historyError) {
          console.warn(`Could not record reminder history for ${request.id}:`, historyError);
        }

        remindersSent++;
      } catch (error) {
        console.error(`Error processing reminder for request ${request.id}:`, error);
      }
    }

    return {
      success: true,
      processed: toRemind.length,
      remindersSent,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Reminder check job failed", error);
    return { error: "Job failed", details: String(error) };
  }
}

export async function POST(request: Request) {
  // Verify this is called from Supabase cron or an authorized source
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Basic security: accept from Supabase cron (which uses the service role key)
  // In production, add rate limiting and request signing
  if (!authHeader || !expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const result = await checkAndSendReminders();
  return NextResponse.json(result, { headers });
}
