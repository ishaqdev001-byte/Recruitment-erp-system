import { NextResponse } from "next/server";
import { getWorkforceAccess, hasWorkforcePermission, isIsoDate } from "@/lib/server/workforce";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const leaveTypes = new Set(["annual", "sick", "personal", "parental", "unpaid"]);

export async function GET() {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const [canViewTeam, canCreate, canReview] = await Promise.all([
      hasWorkforcePermission(access, "leave.view"),
      hasWorkforcePermission(access, "leave.create"),
      hasWorkforcePermission(access, "leave.manage"),
    ]);
    if (!canViewTeam && !canCreate && !canReview) return NextResponse.json({ error: "You do not have permission to view leave requests. Check your role permissions and apply the latest attendance and leave migration if setup is incomplete." }, { status: 403, headers: responseHeaders });

    const { data: requests, error } = await access.supabase
      .from("leave_requests")
      .select("id, employee_id, leave_type, start_date, end_date, reason, status, review_note, reviewed_by, reviewed_at, created_at")
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Leave requests query failed", error);
      return NextResponse.json({ error: "Unable to load leave requests. Apply the latest attendance and leave migration if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    const employeeIds = [...new Set((requests ?? []).flatMap((item) => [item.employee_id, item.reviewed_by].filter((id): id is string => Boolean(id))))];
    const { data: profiles, error: profilesError } = employeeIds.length
      ? await access.supabase.from("profiles").select("id, display_name").in("id", employeeIds)
      : { data: [], error: null };
    if (profilesError) {
      console.error("Leave request employee profiles query failed", profilesError);
      return NextResponse.json({ error: "Unable to load leave request employee names." }, { status: 500, headers: responseHeaders });
    }

    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
    return NextResponse.json({
      requests: (requests ?? []).map((item) => ({
        ...item,
        employee_name: names.get(item.employee_id) || (item.employee_id === access.userId ? "You" : "Employee"),
        reviewer_name: item.reviewed_by ? names.get(item.reviewed_by) || "Manager" : "",
      })),
      permissions: { canViewTeam, canCreate, canReview },
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Leave requests request failed", error);
    return NextResponse.json({ error: "Leave management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Enter valid leave request details." }, { status: 400, headers: responseHeaders });

    if (body.action === "review") {
      if (!await hasWorkforcePermission(access, "leave.manage")) return NextResponse.json({ error: "You do not have permission to review leave requests." }, { status: 403, headers: responseHeaders });
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      const status = body.status;
      const note = typeof body.note === "string" ? body.note.trim() : "";
      if (!requestId || (status !== "approved" && status !== "rejected") || note.length > 1000) {
        return NextResponse.json({ error: "Choose a request, decision, and review note up to 1,000 characters." }, { status: 400, headers: responseHeaders });
      }
      const { data, error } = await access.supabase.rpc("review_leave_request", {
        requested_leave_id: requestId,
        requested_status: status,
        requested_note: note,
      });
      if (error || !data) {
        if (error?.code === "22023" || error?.code === "P0002") return NextResponse.json({ error: error.message }, { status: 409, headers: responseHeaders });
        console.error("Leave request review failed", error);
        return NextResponse.json({ error: "Unable to review this leave request." }, { status: 400, headers: responseHeaders });
      }
      return NextResponse.json({ request: data }, { headers: responseHeaders });
    }

    if (!await hasWorkforcePermission(access, "leave.create")) return NextResponse.json({ error: "You do not have permission to submit leave requests." }, { status: 403, headers: responseHeaders });
    const leaveType = typeof body.leaveType === "string" ? body.leaveType : "";
    const startDate = body.startDate;
    const endDate = body.endDate;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!leaveTypes.has(leaveType) || !isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate || !reason || reason.length > 2000) {
      return NextResponse.json({ error: "Enter a valid leave type, date range, and reason (up to 2,000 characters)." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.from("leave_requests").insert({
      company_id: access.companyId,
      employee_id: access.userId,
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      reason,
    }).select("id, employee_id, leave_type, start_date, end_date, reason, status, review_note, reviewed_by, reviewed_at, created_at").single();
    if (error || !data) {
      console.error("Leave request creation failed", error);
      return NextResponse.json({ error: "Unable to submit this leave request." }, { status: 400, headers: responseHeaders });
    }
    return NextResponse.json({ request: { ...data, employee_name: "You", reviewer_name: "" } }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Leave request submission failed", error);
    return NextResponse.json({ error: "Leave management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
