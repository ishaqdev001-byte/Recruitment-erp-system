import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

/**
 * POST /api/communications/sms/send-queue
 *
 * Worker that processes pending SMS from sms_queue table.
 * Integrates with SMSUG API to send SMS messages.
 *
 * Runs as a cron job or background worker every 5 minutes.
 */

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function sendSmsViaSmsug(phoneNumber: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = process.env.SMSUG_API_KEY;
  if (!apiKey) {
    console.error("SMSUG_API_KEY is not configured");
    return { success: false, error: "SMS provider not configured" };
  }

  try {
    const response = await fetch("https://api.smsug.com/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        phone: phoneNumber,
        message: message,
        sender: "RecruitOS", // Or company name if available
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errorMessage = typeof data.error === "string" ? data.error : "Unknown SMSUG error";
      return { success: false, error: errorMessage };
    }

    const messageId = typeof data.message_id === "string" ? data.message_id : String(data.message_id);
    return { success: true, messageId };
  } catch (error) {
    return { success: false, error: `SMS send failed: ${String(error)}` };
  }
}

async function processSmsQueue() {
  const admin = createAdminClient();
  if (!admin) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is required");
    return { error: "Missing credentials", processed: 0 };
  }

  try {
    // Get pending SMS messages (limit to 50 per run)
    const { data: pendingSms, error: queryError } = await admin
      .from("sms_queue")
      .select("id, recipient_phone, message, request_id, request_type")
      .eq("status", "pending")
      .order("created_at")
      .limit(50);

    if (queryError) {
      console.error("Failed to query SMS queue", queryError);
      return { error: "Query failed", processed: 0 };
    }

    if (!pendingSms || pendingSms.length === 0) {
      console.log("No pending SMS to send");
      return { success: true, processed: 0 };
    }

    console.log(`Processing ${pendingSms.length} pending SMS messages`);

    let sent = 0;
    let failed = 0;

    for (const sms of pendingSms) {
      try {
        // Send SMS via SMSUG
        const sendResult = await sendSmsViaSmsug(sms.recipient_phone, sms.message);

        if (sendResult.success) {
          // Update status to sent
          const { error: updateError } = await admin
            .from("sms_queue")
            .update({
              status: "sent",
              smsug_message_id: sendResult.messageId,
              sent_at: new Date().toISOString(),
            })
            .eq("id", sms.id);

          if (updateError) {
            console.warn(`Failed to update SMS record ${sms.id}:`, updateError);
          } else {
            sent++;
          }
        } else {
          // Mark as failed with error
          const { error: updateError } = await admin
            .from("sms_queue")
            .update({
              status: "failed",
              error_message: sendResult.error,
            })
            .eq("id", sms.id);

          if (updateError) {
            console.warn(`Failed to update SMS failure record ${sms.id}:`, updateError);
          } else {
            failed++;
          }
        }
      } catch (error) {
        console.error(`Error processing SMS ${sms.id}:`, error);
        failed++;
      }
    }

    return {
      success: true,
      processed: pendingSms.length,
      sent,
      failed,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("SMS queue processing failed", error);
    return { error: "Processing failed", details: String(error) };
  }
}

export async function POST(request: Request) {
  // Basic security check
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const result = await processSmsQueue();
  return NextResponse.json(result, { headers });
}
