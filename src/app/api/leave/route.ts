import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWorkforceAccess, hasWorkforcePermission, isIsoDate } from "@/lib/server/workforce";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Stage labels for notifications
const stageLabels: Record<string, string> = {
  supervisor: "Supervisor",
  manager: "General Manager",
  final: "Director / CEO",
};

// Notification title/body builders
function buildNotification(stage: string, decision: "approved" | "rejected", employeeName: string, leaveTypeName: string, days: number) {
  const stageName = stageLabels[stage] ?? stage;
  if (decision === "approved") {
    if (stage === "supervisor") return { title: "Leave approved by Supervisor", body: `Your ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) has been approved by your supervisor and forwarded to the General Manager.` };
    if (stage === "manager") return { title: "Leave approved by General Manager", body: `Your ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) has been approved by the General Manager and forwarded for final approval.` };
    if (stage === "final") return { title: "Leave fully approved", body: `Your ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) has been fully approved. Your leave balance has been updated.` };
  }
  return { title: `Leave declined by ${stageName}`, body: `Your ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) was declined at the ${stageName} stage.` };
}

// Notification for approvers at the next stage
function buildApproverNotification(stage: string, employeeName: string, leaveTypeName: string, days: number) {
  if (stage === "manager") return { title: "Leave request awaiting your approval", body: `${employeeName} submitted a ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) — supervisor has approved and it needs your review.` };
  if (stage === "final") return { title: "Leave request awaiting final approval", body: `${employeeName} submitted a ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) — supervisor and General Manager have approved. Final approval required.` };
  return { title: "New leave request to review", body: `${employeeName} submitted a ${leaveTypeName} request (${days} day${days !== 1 ? "s" : ""}) awaiting your review.` };
}

async function insertNotification(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  leaveRequestId: string,
  recipientId: string,
  stage: string,
  title: string,
  body: string,
) {
  if (!admin) return;
  await admin.from("leave_notifications").insert({
    company_id: companyId,
    leave_request_id: leaveRequestId,
    recipient_id: recipientId,
    stage,
    title,
    body,
  });
}

async function notifyApproversAtStage(
  admin: ReturnType<typeof createAdminClient>,
  supabase: ReturnType<typeof getWorkforceAccess> extends Promise<infer T> ? T extends { supabase: infer S } ? S : never : never,
  companyId: string,
  leaveRequestId: string,
  nextStage: "manager" | "final",
  employeeName: string,
  leaveTypeName: string,
  days: number,
) {
  if (!admin) return;
  // Find users who have the required permission for the next stage
  const permCode = nextStage === "final" ? "leave.finalize" : "leave.manage";
  const { data: approvers } = await supabase
    .from("company_memberships")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("status", "active");

  if (!approvers?.length) return;

  const { title, body } = buildApproverNotification(nextStage, employeeName, leaveTypeName, days);

  // We insert a notification for every active member and filter by permission on read.
  // Better approach: use RPC/role check. We'll query role_permissions to find eligible users.
  const { data: permUsers } = await admin
    .from("role_permissions")
    .select("company_roles!inner(company_memberships!inner(user_id, status))")
    .eq("company_id", companyId)
    .eq("permission_code", permCode);

  // Flatten and deduplicate user IDs from nested join
  const userIds = new Set<string>();
  if (permUsers) {
    for (const row of permUsers as unknown as Array<{ company_roles: { company_memberships: Array<{ user_id: string; status: string }> } }>) {
      for (const membership of row.company_roles?.company_memberships ?? []) {
        if (membership.status === "active") userIds.add(membership.user_id);
      }
    }
  }

  for (const uid of userIds) {
    await insertNotification(admin, companyId, leaveRequestId, uid, nextStage === "manager" ? "supervisor_approved" : "manager_approved", title, body);
  }
}

// GET /api/leave — list leave requests + balances for current user
export async function GET() {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const [canViewTeam, canCreate, canManage] = await Promise.all([
      hasWorkforcePermission(access, "leave.view"),
      hasWorkforcePermission(access, "leave.create"),
      hasWorkforcePermission(access, "leave.manage"),
    ]);

    const { data: canFinalize } = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "leave.finalize",
    });

    if (!canViewTeam && !canCreate && !canManage) {
      return NextResponse.json({ error: "You do not have permission to view leave requests." }, { status: 403, headers: responseHeaders });
    }

    const select = [
      "id", "employee_id", "leave_type", "leave_type_id", "start_date", "end_date",
      "days_count", "reason", "status",
      "supervisor_status", "supervisor_note", "supervisor_id", "supervisor_reviewed_at",
      "manager_status", "manager_note", "manager_id", "manager_reviewed_at",
      "final_status", "final_note", "final_reviewer_id", "final_reviewed_at",
      "review_note", "reviewed_by", "reviewed_at", "created_at",
    ].join(", ");

    const query = access.supabase
      .from("leave_requests")
      .select(select)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false });

    const { data: rawRequests, error } = await query;
    if (error) {
      console.error("Leave requests query failed", error);
      return NextResponse.json({ error: "Unable to load leave requests." }, { status: 500, headers: responseHeaders });
    }
    const requests = (rawRequests ?? []) as unknown as Array<Record<string, unknown>>;

    // Resolve display names
    const allUserIds = new Set<string>();
    for (const req of requests) {
      if (req.employee_id) allUserIds.add(req.employee_id as string);
      if (req.supervisor_id) allUserIds.add(req.supervisor_id as string);
      if (req.manager_id) allUserIds.add(req.manager_id as string);
      if (req.final_reviewer_id) allUserIds.add(req.final_reviewer_id as string);
    }
    const { data: profiles } = allUserIds.size
      ? await access.supabase.from("profiles").select("id, display_name").in("id", [...allUserIds])
      : { data: [] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string]));
    const resolveName = (id: string | null | undefined) => (!id ? "" : id === access.userId ? "You" : names.get(id) || "Team member");

    // Load leave types for name resolution
    const { data: leaveTypes } = await access.supabase
      .from("company_leave_types")
      .select("id, name")
      .eq("company_id", access.companyId);
    const leaveTypeNames = new Map((leaveTypes ?? []).map((lt) => [lt.id, lt.name as string]));

    // Load balances for the current user
    const currentYear = new Date().getFullYear();
    const { data: balances } = await access.supabase
      .from("leave_balances")
      .select("leave_type_id, year, days_allocated, days_used")
      .eq("company_id", access.companyId)
      .eq("user_id", access.userId)
      .eq("year", currentYear);

    return NextResponse.json({
      requests: requests.map((req) => ({
        ...req,
        leave_type_name: req.leave_type_id ? leaveTypeNames.get(req.leave_type_id as string) || req.leave_type || "" : req.leave_type || "",
        employee_name: resolveName(req.employee_id as string | null),
        supervisor_name: resolveName(req.supervisor_id as string | null),
        manager_name: resolveName(req.manager_id as string | null),
        final_reviewer_name: resolveName(req.final_reviewer_id as string | null),
        reviewer_name: resolveName(req.reviewed_by as string | null),
      })),
      balances: balances ?? [],
      leaveTypes: leaveTypes ?? [],
      permissions: {
        canViewTeam,
        canCreate,
        canManage,
        canFinalize: Boolean(canFinalize),
      },
    }, { headers: responseHeaders });
  } catch (err) {
    console.error("Leave requests GET failed", err);
    return NextResponse.json({ error: "Leave management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// POST /api/leave — submit a new leave request
export async function POST(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    if (!await hasWorkforcePermission(access, "leave.create")) {
      return NextResponse.json({ error: "You do not have permission to submit leave requests." }, { status: 403, headers: responseHeaders });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Enter valid leave request details." }, { status: 400, headers: responseHeaders });

    const leaveTypeId = typeof body.leaveTypeId === "string" ? body.leaveTypeId.trim() : "";
    const startDate = body.startDate;
    const endDate = body.endDate;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!isUuid(leaveTypeId)) return NextResponse.json({ error: "Choose a valid leave type." }, { status: 400, headers: responseHeaders });
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return NextResponse.json({ error: "Enter a valid date range (start date must be on or before end date)." }, { status: 400, headers: responseHeaders });
    if (!reason || reason.length > 2000) return NextResponse.json({ error: "Enter a reason (up to 2,000 characters)." }, { status: 400, headers: responseHeaders });

    // Verify the leave type exists and is active for this company
    const { data: leaveTypeRow } = await access.supabase
      .from("company_leave_types")
      .select("id, name, days_per_year")
      .eq("id", leaveTypeId)
      .eq("company_id", access.companyId)
      .eq("is_active", true)
      .maybeSingle();
    if (!leaveTypeRow) return NextResponse.json({ error: "The selected leave type is not available." }, { status: 400, headers: responseHeaders });

    const days = Math.floor((Date.parse(`${endDate as string}T00:00:00Z`) - Date.parse(`${startDate as string}T00:00:00Z`)) / 86400000) + 1;

    // Check balance if one exists
    const year = new Date(`${startDate as string}T00:00:00Z`).getUTCFullYear();
    const { data: balance } = await access.supabase
      .from("leave_balances")
      .select("days_allocated, days_used")
      .eq("company_id", access.companyId)
      .eq("user_id", access.userId)
      .eq("leave_type_id", leaveTypeId)
      .eq("year", year)
      .maybeSingle();

    if (balance) {
      const remaining = balance.days_allocated - balance.days_used;
      if (days > remaining) {
        return NextResponse.json({ error: `You only have ${remaining} day${remaining !== 1 ? "s" : ""} remaining for ${leaveTypeRow.name} in ${year}.` }, { status: 400, headers: responseHeaders });
      }
    }

    const admin = createAdminClient();

    // Auto-provision balance if not yet created
    if (!balance && admin) {
      await admin.rpc("ensure_leave_balance", {
        p_company_id: access.companyId,
        p_user_id: access.userId,
        p_leave_type_id: leaveTypeId,
        p_year: year,
      });
    }

    const { data: req, error } = await access.supabase
      .from("leave_requests")
      .insert({
        company_id: access.companyId,
        employee_id: access.userId,
        leave_type: leaveTypeRow.name,
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "pending",
      })
      .select("id, employee_id, leave_type, leave_type_id, start_date, end_date, days_count, reason, status, supervisor_status, manager_status, final_status, created_at")
      .single();

    if (error || !req) {
      console.error("Leave request insert failed", error);
      return NextResponse.json({ error: "Unable to submit leave request." }, { status: 500, headers: responseHeaders });
    }

    // Notify supervisors (anyone with leave.manage) about the new request
    if (admin) {
      const { data: profiles } = await access.supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", access.userId)
        .maybeSingle();
      const employeeName = profiles?.display_name || "An employee";
      const { title, body: notifBody } = buildApproverNotification("supervisor", employeeName, leaveTypeRow.name, days);

      // Find users with leave.manage
      const { data: managerIds } = await admin
        .from("role_permissions")
        .select("role_id, company_id, company_roles!inner(id, company_id)")
        .eq("company_id", access.companyId)
        .eq("permission_code", "leave.manage");

      const roleIds = new Set((managerIds ?? []).map((r) => (r as unknown as { role_id: string }).role_id));
      if (roleIds.size > 0) {
        const { data: userRoles } = await admin
          .from("company_user_roles")
          .select("user_id")
          .eq("company_id", access.companyId)
          .in("role_id", [...roleIds]);
        for (const ur of userRoles ?? []) {
          if (ur.user_id !== access.userId) {
            await insertNotification(admin, access.companyId, req.id, ur.user_id, "submitted", title, notifBody);
          }
        }
      }
    }

    return NextResponse.json({
      request: {
        ...req,
        leave_type_name: leaveTypeRow.name,
        employee_name: "You",
        supervisor_name: "",
        manager_name: "",
        final_reviewer_name: "",
        reviewer_name: "",
      },
    }, { status: 201, headers: responseHeaders });
  } catch (err) {
    console.error("Leave request POST failed", err);
    return NextResponse.json({ error: "Leave management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PATCH /api/leave — advance a leave request through the approval chain
export async function PATCH(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Provide approval details." }, { status: 400, headers: responseHeaders });

    const leaveId = typeof body.leaveId === "string" ? body.leaveId : "";
    const stage = typeof body.stage === "string" ? body.stage : "";
    const decision = body.decision;
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!isUuid(leaveId)) return NextResponse.json({ error: "Choose a valid leave request." }, { status: 400, headers: responseHeaders });
    if (!["supervisor", "manager", "final"].includes(stage)) return NextResponse.json({ error: "Choose a valid approval stage." }, { status: 400, headers: responseHeaders });
    if (decision !== "approved" && decision !== "rejected") return NextResponse.json({ error: "Choose approved or rejected." }, { status: 400, headers: responseHeaders });
    if (note.length > 1000) return NextResponse.json({ error: "Note must be 1,000 characters or fewer." }, { status: 400, headers: responseHeaders });

    // Check required permissions per stage
    if (stage === "supervisor" || stage === "manager") {
      if (!await hasWorkforcePermission(access, "leave.manage")) {
        return NextResponse.json({ error: "Leave management permission is required to review at this stage." }, { status: 403, headers: responseHeaders });
      }
    } else {
      const { data: canFinalize } = await access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "leave.finalize",
      });
      if (!canFinalize) return NextResponse.json({ error: "Final approval permission is required for this stage." }, { status: 403, headers: responseHeaders });
    }

    // Call the database RPC
    const { data: updated, error } = await access.supabase.rpc("advance_leave_request", {
      requested_leave_id: leaveId,
      requested_stage: stage,
      requested_decision: decision,
      requested_note: note,
    });

    if (error || !updated) {
      const code = error?.code;
      if (code === "42501") return NextResponse.json({ error: error?.message ?? "Permission denied." }, { status: 403, headers: responseHeaders });
      if (code === "22023" || code === "P0002") return NextResponse.json({ error: error?.message ?? "Unable to process this leave request." }, { status: 409, headers: responseHeaders });
      console.error("advance_leave_request RPC failed", error);
      return NextResponse.json({ error: "Unable to process the leave decision." }, { status: 500, headers: responseHeaders });
    }

    const leaveRecord = updated as Record<string, unknown>;

    // Fire in-app notifications
    const admin = createAdminClient();
    if (admin) {
      // Resolve names
      const employeeId = leaveRecord.employee_id as string;
      const leaveTypeId = leaveRecord.leave_type_id as string | null;
      const daysCount = (leaveRecord.days_count as number) ?? 0;

      const { data: empProfile } = await access.supabase
        .from("profiles").select("display_name").eq("id", employeeId).maybeSingle();
      const employeeName = empProfile?.display_name || "Employee";

      const { data: ltRow } = leaveTypeId
        ? await access.supabase.from("company_leave_types").select("name").eq("id", leaveTypeId).maybeSingle()
        : { data: null };
      const leaveTypeName = ltRow?.name || (leaveRecord.leave_type as string) || "Leave";

      // Notify the employee about the decision
      const { title, body: notifBody } = buildNotification(stage, decision as "approved" | "rejected", employeeName, leaveTypeName, daysCount);
      const stageKey = `${stage}_${decision}` as string;
      await insertNotification(admin, access.companyId, leaveId, employeeId, stageKey, title, notifBody);

      // If approved and not final, notify next-stage approvers
      if (decision === "approved" && stage !== "final") {
        const nextStage = stage === "supervisor" ? "manager" : "final";
        await notifyApproversAtStage(
          admin,
          access.supabase as Parameters<typeof notifyApproversAtStage>[1],
          access.companyId,
          leaveId,
          nextStage,
          employeeName,
          leaveTypeName,
          daysCount,
        );
      }
    }

    return NextResponse.json({ request: leaveRecord }, { headers: responseHeaders });
  } catch (err) {
    console.error("Leave PATCH failed", err);
    return NextResponse.json({ error: "Leave management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
