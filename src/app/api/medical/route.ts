import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ─── Send system alert email via SMTP (server-to-server, no user auth needed) ─
async function sendSystemAlertEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}) {
  const smtpHost = process.env.SYSTEM_SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SYSTEM_SMTP_PORT ?? "587");
  const smtpUser = process.env.SYSTEM_SMTP_USER?.trim();
  const smtpPass = process.env.SYSTEM_SMTP_PASS?.trim();
  const fromAddr = process.env.SYSTEM_SMTP_FROM?.trim() ?? smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !fromAddr || !opts.to.length) return;

  // Dynamic import — nodemailer is a CJS module
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    requireTLS: smtpPort !== 465,
  });

  try {
    await transport.sendMail({
      from: `"Kilax Smart Recruit Alerts" <${fromAddr}>`,
      to: opts.to.join(", "),
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
  } finally {
    transport.close();
  }
}

// ─── Collect alert-recipient emails (Supervisor / Agent, GM, CEO) ─────────────
async function collectAlertRecipients(admin: ReturnType<typeof createAdminClient>, companyId: string, candidateId: string | null) {
  if (!admin) return [];
  const recipients = new Set<string>();

  // Always include GM and CEO from memberships
  const { data: managers } = await admin
    .from("company_memberships")
    .select("user_id, role:company_roles!inner(name)")
    .eq("company_id", companyId)
    .eq("status", "active");

  for (const m of managers ?? []) {
    const roleValue = m.role as unknown as { name: string } | { name: string }[] | null;
    const roleName = Array.isArray(roleValue) ? roleValue[0]?.name : roleValue?.name;
    if (
      roleName === "General Manager" ||
      roleName === "CEO" ||
      roleName === "Company Owner / Primary Administrator" ||
      roleName === "Administrator"
    ) {
      const { data: authUser } = await admin.auth.admin.getUserById(m.user_id);
      if (authUser.user?.email) recipients.add(authUser.user.email);
    }
  }

  // Also include the candidate's agent supervisor if the candidate is linked
  if (candidateId) {
    const { data: inquiry } = await admin
      .from("candidate_inquiries")
      .select("agent_user_id")
      .eq("company_id", companyId)
      .not("agent_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inquiry?.agent_user_id) {
      // Fetch the agent's supervisor
      const { data: agentMembership } = await admin
        .from("company_memberships")
        .select("user_id")
        .eq("user_id", inquiry.agent_user_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (agentMembership) {
        const { data: agentAuth } = await admin.auth.admin.getUserById(inquiry.agent_user_id);
        if (agentAuth.user?.email) recipients.add(agentAuth.user.email);
      }

      // Also find recruitment managers / supervisors
      const { data: supervisors } = await admin
        .from("company_memberships")
        .select("user_id, role:company_roles!inner(name)")
        .eq("company_id", companyId)
        .eq("status", "active");

      for (const s of supervisors ?? []) {
        const roleValue = s.role as unknown as { name: string } | { name: string }[] | null;
        const roleName = Array.isArray(roleValue) ? roleValue[0]?.name : roleValue?.name;
        if (roleName === "Recruitment Manager" || roleName === "Branch Manager") {
          const { data: su } = await admin.auth.admin.getUserById(s.user_id);
          if (su.user?.email) recipients.add(su.user.email);
        }
      }
    }
  }

  return [...recipients];
}

// ─── Access helper ────────────────────────────────────────────────────────────
async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, role_id, branch_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const admin = createAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is required for medical management.", status: 503 as const };

  const { data: role } = await admin
    .from("company_roles")
    .select("name")
    .eq("id", membership.role_id)
    .eq("company_id", membership.company_id)
    .maybeSingle();

  const { data: company } = await admin
    .from("companies")
    .select("primary_admin_user_id, name")
    .eq("id", membership.company_id)
    .maybeSingle();

  // Check explicit permissions via RPC
  const [canView, canUpdate] = await Promise.all([
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "medical.view",
    }),
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "medical.update",
    }),
  ]);

  if (canView.error || canUpdate.error) return { error: "Unable to verify medical permissions.", status: 503 as const };

  const canViewMedical = Boolean(canView.data);
  const canUpdateMedical = Boolean(canUpdate.data);

  if (!canViewMedical) return { error: "You do not have access to the medical examination queue.", status: 403 as const };

  // Check if user is on the main branch (sees all branches)
  // Graceful fallback if migration not yet applied
  let isMainBranchUser = false;
  try {
    const { data } = await supabase.rpc("current_user_is_main_branch_user", {
      requested_company_id: membership.company_id,
    });
    isMainBranchUser = data !== null && data !== undefined ? Boolean(data) : membership.branch_id == null;
  } catch {
    isMainBranchUser = membership.branch_id == null;
  }

  return {
    admin,
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    roleName: (role?.name as string) ?? "",
    companyName: company?.name ?? "Kilax Smart Recruit",
    canViewMedical,
    canUpdateMedical,
    branchId: membership.branch_id ?? null,
    isMainBranchUser,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/medical — list medical appointments with linked candidate info
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    // Branch-scoped filtering: non-main-branch users only see their branch's appointments
    let apptQuery = access.admin
      .from("medical_appointments")
      .select(`
        id, company_id, candidate_id, branch_id,
        candidate_first_name, candidate_last_name,
        candidate_date_of_birth, candidate_age,
        candidate_passport_number, candidate_phone,
        appointment_at, fee_amount, status,
        exam_result, exam_notes, examined_at, examined_by,
        payment_reference, created_at,
        income_type:company_income_types(name)
      `)
      .eq("company_id", access.companyId);

    if (!access.isMainBranchUser && access.branchId) {
      apptQuery = apptQuery.eq("branch_id", access.branchId);
    }

    const { data: appointments, error: apptError } = await apptQuery
      .order("appointment_at", { ascending: false });

    if (apptError) {
      console.error("Medical appointments list failed", apptError);
      return NextResponse.json({ error: "Unable to load medical appointments." }, { status: 500, headers });
    }

    // Collect candidate details for linked appointments
    const candidateIds = [...new Set((appointments ?? []).map((a) => a.candidate_id).filter((id): id is string => Boolean(id)))];
    const candidateMap = new Map<string, { id: string; file_number: string; details: Record<string, unknown> | null }>();
    if (candidateIds.length) {
      const { data: candidates } = await access.admin
        .from("candidates")
        .select("id, file_number, details")
        .eq("company_id", access.companyId)
        .in("id", candidateIds);
      for (const c of candidates ?? []) candidateMap.set(c.id, c);
    }

    const list = (appointments ?? []).map((a) => {
      const incomeType = a.income_type as unknown as { name: string } | { name: string }[] | null;
      const incomeName = Array.isArray(incomeType) ? incomeType[0]?.name : incomeType?.name;
      const candidate = a.candidate_id ? candidateMap.get(a.candidate_id) : null;
      const stage = candidate ? ((candidate.details as Record<string, unknown> | null)?.stage as string | undefined) ?? "Registration" : null;
      return {
        id: a.id,
        candidateId: a.candidate_id ?? null,
        candidateFileNumber: candidate?.file_number ?? null,
        candidateStage: stage,
        firstName: a.candidate_first_name,
        lastName: a.candidate_last_name,
        dateOfBirth: a.candidate_date_of_birth,
        age: a.candidate_age,
        passportNumber: a.candidate_passport_number,
        phone: a.candidate_phone,
        appointmentAt: a.appointment_at,
        feeAmount: Number(a.fee_amount),
        serviceName: incomeName ?? "Medical service",
        status: a.status,
        examResult: a.exam_result ?? "pending",
        examNotes: a.exam_notes ?? "",
        examinedAt: a.examined_at ?? null,
        paymentReference: a.payment_reference ?? "",
        createdAt: a.created_at,
      };
    });

    // Compute summary stats
    const total = list.length;
    const examined = list.filter((a) => a.examResult !== "pending").length;
    const fit = list.filter((a) => a.examResult === "fit").length;
    const unfit = list.filter((a) => a.examResult === "unfit").length;

    return NextResponse.json({
      appointments: list,
      stats: { total, examined, fit, unfit, pending: total - examined },
      canUpdate: access.canUpdateMedical,
    }, { headers });
  } catch (error) {
    console.error("Medical GET failed", error);
    return NextResponse.json({ error: "Medical management is unavailable." }, { status: 503, headers });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/medical — record exam result
// ═══════════════════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    if (!access.canUpdateMedical) {
      return NextResponse.json({ error: "You do not have permission to record examination results." }, { status: 403, headers });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "";

    // ── record-exam-result ───────────────────────────────────────────────────
    if (action === "record-exam-result") {
      const appointmentId = typeof body?.appointmentId === "string" ? body.appointmentId : "";
      const examResult = typeof body?.examResult === "string" ? body.examResult : "";
      const examNotes = typeof body?.examNotes === "string" ? body.examNotes.trim().slice(0, 5000) : "";

      if (!isUuid(appointmentId)) return NextResponse.json({ error: "Invalid appointment." }, { status: 400, headers });
      if (!["fit", "unfit"].includes(examResult)) return NextResponse.json({ error: "Exam result must be 'fit' or 'unfit'." }, { status: 400, headers });

      // Fetch appointment + candidate
      const { data: appt, error: apptError } = await access.admin
        .from("medical_appointments")
        .select("id, company_id, candidate_id, candidate_first_name, candidate_last_name, status, exam_result")
        .eq("id", appointmentId)
        .eq("company_id", access.companyId)
        .maybeSingle();

      if (apptError || !appt) return NextResponse.json({ error: "Appointment not found." }, { status: 404, headers });
      if (appt.status === "cancelled") return NextResponse.json({ error: "Cannot record results for a cancelled appointment." }, { status: 409, headers });

      const now = new Date().toISOString();

      // Update exam result
      const { data: updated, error: updateError } = await access.admin
        .from("medical_appointments")
        .update({
          exam_result: examResult,
          exam_notes: examNotes || null,
          examined_at: now,
          examined_by: access.userId,
          status: "completed",
        })
        .eq("id", appointmentId)
        .eq("company_id", access.companyId)
        .select("id, status, exam_result, exam_notes, examined_at")
        .maybeSingle();

      if (updateError || !updated) {
        console.error("Exam result update failed", updateError);
        return NextResponse.json({ error: "Unable to save examination result." }, { status: 500, headers });
      }

      const candidateName = `${appt.candidate_first_name} ${appt.candidate_last_name}`;

      // ── Update candidate stage to "Medical Examination" ───────────────────
      if (appt.candidate_id) {
        const { data: candidate } = await access.admin
          .from("candidates")
          .select("id, details")
          .eq("id", appt.candidate_id)
          .eq("company_id", access.companyId)
          .maybeSingle();

        if (candidate) {
          const existingDetails = (candidate.details ?? {}) as Record<string, unknown>;
          const newStage = examResult === "fit" ? "Medical Examination" : "Medical Examination";
          const updatedDetails: Record<string, unknown> = {
            ...existingDetails,
            stage: newStage,
            medicalExamResult: examResult,
            medicalExamAt: now,
            medicalExamNotes: examNotes || null,
          };

          await access.admin
            .from("candidates")
            .update({ details: updatedDetails as never })
            .eq("id", appt.candidate_id)
            .eq("company_id", access.companyId);
        }
      }

      // ── Send urgent alert if unfit ─────────────────────────────────────────
      if (examResult === "unfit") {
        const recipients = await collectAlertRecipients(access.admin, access.companyId, appt.candidate_id ?? null);

        if (recipients.length) {
          const subject = `🚨 URGENT: Medically Unfit – ${candidateName}`;
          const text = [
            "⚠️  CRITICAL MEDICAL ALERT",
            "=====================================",
            `Candidate:       ${candidateName}`,
            `Appointment ID:  ${appointmentId}`,
            `Examined at:     ${new Date(now).toLocaleString()}`,
            `Result:          MEDICALLY UNFIT`,
            examNotes ? `Doctor's Notes:  ${examNotes}` : "",
            "",
            "Immediate action is required. Please review this candidate's file and take the necessary steps.",
            "",
            `— ${access.companyName} Medical System`,
          ].filter((line) => line !== undefined).join("\n");

          const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;margin:0;padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0"
             style="background:#1e293b;border:2px solid #ef4444;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#ef4444;padding:16px 24px;">
            <h1 style="margin:0;color:#fff;font-size:20px;letter-spacing:.5px;">
              🚨&nbsp; URGENT — MEDICALLY UNFIT
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px;">
            <p style="margin:0 0 16px;font-size:15px;color:#f1f5f9;">
              A candidate has been declared <strong style="color:#ef4444;">MEDICALLY UNFIT</strong>
              and requires your immediate attention.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#0f172a;border-radius:6px;padding:16px;margin-bottom:20px;">
              <tr>
                <td style="color:#94a3b8;font-size:12px;padding:4px 0;width:140px;">Candidate</td>
                <td style="color:#f1f5f9;font-size:14px;font-weight:700;padding:4px 0;">${candidateName}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8;font-size:12px;padding:4px 0;">Examined at</td>
                <td style="color:#f1f5f9;font-size:13px;padding:4px 0;">${new Date(now).toLocaleString()}</td>
              </tr>
              <tr>
                <td style="color:#94a3b8;font-size:12px;padding:4px 0;">Result</td>
                <td style="color:#ef4444;font-size:14px;font-weight:700;padding:4px 0;">UNFIT</td>
              </tr>
              ${examNotes ? `
              <tr>
                <td style="color:#94a3b8;font-size:12px;padding:4px 0;vertical-align:top;">Doctor's Notes</td>
                <td style="color:#fbbf24;font-size:13px;padding:4px 0;">${examNotes.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
              </tr>` : ""}
            </table>
            <p style="font-size:13px;color:#94a3b8;margin:0;">
              Please log in to <strong style="color:#f1f5f9;">${access.companyName}</strong>
              and review the candidate file immediately.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 24px;border-top:1px solid #334155;">
            <p style="margin:0;font-size:11px;color:#475569;">
              This is an automated alert from ${access.companyName} · Kilax Smart Recruit Medical System.
              Do not reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

          await sendSystemAlertEmail({ to: recipients, subject, html, text }).catch((err) => {
            console.error("Medical unfit alert email failed (non-fatal)", err);
          });

          // Also insert task_notifications for each recipient
          const notifRows = recipients.map((email) => {
            // We can't easily map email→user_id here without another lookup;
            // use the managers list we already have
            return null; // placeholder — will insert below
          });
          void notifRows; // suppress lint

          const { data: managerRows } = await access.admin
            .from("company_memberships")
            .select("user_id, role:company_roles!inner(name)")
            .eq("company_id", access.companyId)
            .eq("status", "active");

          const notifInserts: {
            company_id: string;
            task_id: null;
            recipient_id: string;
            title: string;
            body: string;
            remind_at: string;
            sms_status: string;
          }[] = [];

          for (const m of managerRows ?? []) {
            const roleValue = m.role as unknown as { name: string } | { name: string }[] | null;
            const rn = Array.isArray(roleValue) ? roleValue[0]?.name : roleValue?.name;
            if (
              rn === "General Manager" ||
              rn === "CEO" ||
              rn === "Company Owner / Primary Administrator" ||
              rn === "Administrator" ||
              rn === "Recruitment Manager" ||
              rn === "Branch Manager"
            ) {
              notifInserts.push({
                company_id: access.companyId,
                task_id: null,
                recipient_id: m.user_id,
                title: `🚨 Medically Unfit — ${candidateName}`,
                body: `${candidateName} has been declared MEDICALLY UNFIT. Immediate review required.${examNotes ? ` Doctor's notes: ${examNotes.slice(0, 120)}` : ""}`,
                remind_at: now,
                sms_status: "not_requested",
              });
            }
          }

          if (notifInserts.length) {
            const { error: notifError } = await access.admin
              .from("task_notifications")
              .insert(notifInserts);
            if (notifError) console.error("Notif insert failed", notifError);
          }
        }
      }

      return NextResponse.json({ updated, candidateStageUpdated: Boolean(appt.candidate_id) }, { headers });
    }

    // ── update-stage-on-booking ──────────────────────────────────────────────
    // Called by the MedicalAppointments booking flow after a successful booking.
    if (action === "update-stage-on-booking") {
      const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
      if (!isUuid(candidateId)) return NextResponse.json({ error: "Invalid candidate." }, { status: 400, headers });

      const { data: candidate, error: candidateError } = await access.admin
        .from("candidates")
        .select("id, details")
        .eq("id", candidateId)
        .eq("company_id", access.companyId)
        .maybeSingle();

      if (candidateError || !candidate) return NextResponse.json({ error: "Candidate not found." }, { status: 404, headers });

      const existingDetails = (candidate.details ?? {}) as Record<string, unknown>;

      // Only advance to "Medical Booked" if not already at a later stage
      const laterStages = new Set(["Medical Examination", "Visa Processing", "Travel"]);
      if (laterStages.has(String(existingDetails.stage ?? ""))) {
        return NextResponse.json({ ok: true, skipped: true }, { headers });
      }

      const { error: updateError } = await access.admin
        .from("candidates")
        .update({
          details: {
            ...existingDetails,
            stage: "Medical Booked",
            medicalBookedAt: new Date().toISOString(),
          } as never,
        })
        .eq("id", candidateId)
        .eq("company_id", access.companyId);

      if (updateError) {
        console.error("Stage update on booking failed", updateError);
        return NextResponse.json({ error: "Stage could not be updated." }, { status: 500, headers });
      }

      return NextResponse.json({ ok: true }, { headers });
    }

    return NextResponse.json({ error: "Unknown medical action." }, { status: 400, headers });
  } catch (error) {
    console.error("Medical POST failed", error);
    return NextResponse.json({ error: "Medical management is unavailable." }, { status: 503, headers });
  }
}
