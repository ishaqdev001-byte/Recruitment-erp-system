import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendCompanySms } from "@/lib/server/sms-billing";
import { normalizeUgandanPhone } from "@/lib/server/smsug";

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
      .select("id, company_id, recipient_phone, message, request_id, request_type")
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
        const { data: claimed, error: claimError } = await admin.from("sms_queue")
          .update({ status: "sending", error_message: null })
          .eq("id", sms.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (claimError) {
          console.error(`Failed to claim SMS queue record ${sms.id}:`, claimError);
          continue;
        }
        if (!claimed) continue;

        const phone = normalizeUgandanPhone(sms.recipient_phone ?? "");
        if (!phone) {
          const { error: updateError } = await admin.from("sms_queue")
            .update({ status: "failed", error_message: "Invalid Ugandan phone number." })
            .eq("id", sms.id)
            .eq("status", "sending");
          if (updateError) console.error(`Failed to update SMS record ${sms.id}:`, updateError);
          else failed++;
          continue;
        }

        const sendResult = await sendCompanySms({
          admin,
          companyId: sms.company_id,
          reference: sms.id,
          title: "RecruitOS",
          message: sms.message,
          contacts: [phone],
          source: "sms_queue",
        });

        if (sendResult.ok) {
          // Update status to sent
          const { error: updateError } = await admin
            .from("sms_queue")
            .update({
              status: "sent",
              smsug_message_id: sendResult.token,
              sent_at: new Date().toISOString(),
            })
            .eq("id", sms.id)
            .eq("status", "sending");

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
              status: sendResult.code === "sms_network_error" ? "unknown" : "failed",
              error_message: sendResult.code === "sms_network_error"
                ? `SMS provider result is unknown; credit is reserved. ${sendResult.message}`
                : sendResult.message,
            })
            .eq("id", sms.id)
            .eq("status", "sending");

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
  const expectedSecret = process.env.SMS_QUEUE_DISPATCH_SECRET?.trim();
  const authHeader = request.headers.get("authorization");
  const suppliedSecret = authHeader?.match(/^Bearer (.+)$/i)?.[1]?.trim();
  if (!expectedSecret || expectedSecret.length < 32) {
    console.error("SMS_QUEUE_DISPATCH_SECRET must be configured with at least 32 characters.");
    return NextResponse.json({ error: "SMS queue dispatch is not configured." }, { status: 503, headers });
  }
  if (!suppliedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const result = await processSmsQueue();
  return NextResponse.json(result, { headers });
}
