import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

/**
 * POST /api/communications/email/send-queue
 *
 * Worker that processes pending emails from email_queue table.
 * Currently only handles visa stage updates to project-assigned staff.
 * Integrates with Resend for email delivery.
 *
 * Runs as a cron job or background worker every 5 minutes.
 */

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

interface EmailContext {
  candidateName?: string;
  projectName?: string;
  projectDetails?: string;
  visaNumber?: string;
  visaIssuedDate?: string;
  staffName?: string;
  companyName?: string;
}

async function sendEmailViaResend(
  recipientEmail: string,
  template: string,
  context: EmailContext
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.error("RESEND_API_KEY is not configured");
    return { success: false, error: "Email provider not configured" };
  }

  const resend = new Resend(resendApiKey);

  let htmlContent = "";
  let subject = "";

  if (template === "visa_issued") {
    subject = `Visa Issued: ${context.candidateName}`;
    htmlContent = `
      <h2>Visa Issued Notification</h2>
      <p>Dear ${context.staffName},</p>
      <p>The visa for <strong>${context.candidateName}</strong> has been issued.</p>
      
      <h3>Project Details</h3>
      <p>
        <strong>Project:</strong> ${context.projectName}<br>
        <strong>Details:</strong> ${context.projectDetails}<br>
        <strong>Visa Number:</strong> ${context.visaNumber}<br>
        <strong>Issued Date:</strong> ${context.visaIssuedDate}
      </p>

      <p style="font-size: 12px; color: #666; margin-top: 20px;">
        This is an automated notification from ${context.companyName} RecruitOS.
      </p>
    `;
  } else {
    return { success: false, error: `Unknown email template: ${template}` };
  }

  try {
    const response = await resend.emails.send({
      from: "notifications@recuritos.com", // Update with your domain
      to: recipientEmail,
      subject,
      html: htmlContent,
    });

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return { success: true, messageId: response.data?.id };
  } catch (error) {
    return { success: false, error: `Email send failed: ${String(error)}` };
  }
}

async function processEmailQueue() {
  const admin = createAdminClient();
  if (!admin) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is required");
    return { error: "Missing credentials", processed: 0 };
  }

  try {
    // Get pending emails (limit to 50 per run)
    const { data: pendingEmails, error: queryError } = await admin
      .from("email_queue")
      .select("id, recipient_email, template, context, request_type, request_id")
      .eq("status", "pending")
      .order("created_at")
      .limit(50);

    if (queryError) {
      console.error("Failed to query email queue", queryError);
      return { error: "Query failed", processed: 0 };
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      console.log("No pending emails to send");
      return { success: true, processed: 0 };
    }

    console.log(`Processing ${pendingEmails.length} pending emails`);

    let sent = 0;
    let failed = 0;

    for (const email of pendingEmails) {
      try {
        const context = typeof email.context === "object" ? (email.context as EmailContext) : {};

        // Send email via Resend
        const sendResult = await sendEmailViaResend(email.recipient_email, email.template, context);

        if (sendResult.success) {
          // Update status to sent
          const { error: updateError } = await admin
            .from("email_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
            })
            .eq("id", email.id);

          if (updateError) {
            console.warn(`Failed to update email record ${email.id}:`, updateError);
          } else {
            sent++;
          }
        } else {
          // Mark as failed with error
          const { error: updateError } = await admin
            .from("email_queue")
            .update({
              status: "failed",
              error_message: sendResult.error,
            })
            .eq("id", email.id);

          if (updateError) {
            console.warn(`Failed to update email failure record ${email.id}:`, updateError);
          } else {
            failed++;
          }
        }
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
        failed++;
      }
    }

    return {
      success: true,
      processed: pendingEmails.length,
      sent,
      failed,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Email queue processing failed", error);
    return { error: "Processing failed", details: String(error) };
  }
}

export async function POST(request: Request) {
  // Basic security check
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const result = await processEmailQueue();
  return NextResponse.json(result, { headers });
}
