import { NextResponse } from "next/server";
import { getWorkforceAccess, hasWorkforcePermission, isIsoDate } from "@/lib/server/workforce";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

function kampalaWorkDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

type AttendanceView = "daily" | "weekly" | "monthly";

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function threeMonthsAgo(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const dayOfMonth = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 3);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(dayOfMonth, lastDay));
  return date.toISOString().slice(0, 10);
}

function dateRange(mode: AttendanceView, selectedDate: string) {
  if (mode === "weekly") {
    const weekday = new Date(`${selectedDate}T00:00:00.000Z`).getUTCDay();
    const startDate = addDays(selectedDate, -((weekday + 6) % 7));
    return { startDate, endDate: addDays(startDate, 6) };
  }
  if (mode === "monthly") {
    const month = selectedDate.slice(0, 7);
    const endDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    return { startDate: `${month}-01`, endDate };
  }
  return { startDate: selectedDate, endDate: selectedDate };
}

export async function GET(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const url = new URL(request.url);
    const modeValue = url.searchParams.get("mode") ?? "daily";
    const mode = modeValue === "daily" || modeValue === "weekly" || modeValue === "monthly" ? modeValue : null;
    const selectedDate = url.searchParams.get("date") ?? kampalaWorkDate();
    if (!mode || !isIsoDate(selectedDate) || selectedDate > kampalaWorkDate()) {
      return NextResponse.json({ error: "Choose a valid attendance period ending today or earlier." }, { status: 400, headers: responseHeaders });
    }

    const [canViewTeam, canClock] = await Promise.all([
      hasWorkforcePermission(access, "attendance.view"),
      hasWorkforcePermission(access, "attendance.clock"),
    ]);
    if (!canViewTeam && !canClock) return NextResponse.json({ error: "You do not have permission to view attendance. Check your role permissions and apply the latest attendance and leave migration if setup is incomplete." }, { status: 403, headers: responseHeaders });

    const range = dateRange(mode, selectedDate);
    const startDate = canViewTeam ? range.startDate : range.startDate < threeMonthsAgo(kampalaWorkDate()) ? threeMonthsAgo(kampalaWorkDate()) : range.startDate;
    const endDate = range.endDate > kampalaWorkDate() ? kampalaWorkDate() : range.endDate;
    if (!canViewTeam && selectedDate < threeMonthsAgo(kampalaWorkDate())) {
      return NextResponse.json({ error: "Personal attendance history is available for the most recent three months only." }, { status: 403, headers: responseHeaders });
    }

    const absenceEndDate = addDays(kampalaWorkDate(), -1);
    const reconciliationStart = startDate <= absenceEndDate ? startDate : absenceEndDate;
    const reconciliationEnd = endDate < absenceEndDate ? endDate : absenceEndDate;
    if (reconciliationStart <= reconciliationEnd) {
      const { error: absenceError } = await access.supabase.rpc("record_attendance_absences", {
        requested_company_id: access.companyId,
        requested_start_date: reconciliationStart,
        requested_end_date: reconciliationEnd,
      });
      if (absenceError) {
        console.error("Attendance absence reconciliation failed", absenceError);
        return NextResponse.json({ error: "Unable to reconcile absent and leave days." }, { status: 500, headers: responseHeaders });
      }
    }

    const employeeIds = canViewTeam
      ? await access.supabase.from("company_memberships").select("user_id, status").eq("company_id", access.companyId).in("status", ["active", "disabled"])
      : { data: [{ user_id: access.userId, status: "active" }], error: null };
    if (employeeIds.error) {
      console.error("Attendance roster query failed", employeeIds.error);
      return NextResponse.json({ error: "Unable to load the company attendance roster." }, { status: 500, headers: responseHeaders });
    }

    const ids = (employeeIds.data ?? []).map((membership) => membership.user_id);
    const [profilesResult, attendanceResult] = await Promise.all([
      ids.length ? access.supabase.from("profiles").select("id, display_name").in("id", ids) : Promise.resolve({ data: [], error: null }),
      access.supabase.from("attendance_records")
        .select("id, employee_id, work_date, check_in_at, check_out_at, check_in_comment, check_out_comment, status, leave_request_id")
        .eq("company_id", access.companyId)
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date")
        .order("check_in_at"),
    ]);
    if (profilesResult.error || attendanceResult.error) {
      console.error("Attendance workspace query failed", profilesResult.error ?? attendanceResult.error);
      return NextResponse.json({ error: "Unable to load attendance records. Apply migrations 016 and 017 if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    const names = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
    const now = Date.now();
    return NextResponse.json({
      date: selectedDate,
      mode,
      range: { startDate, endDate },
      currentUserId: access.userId,
      employees: (employeeIds.data ?? []).map((membership) => ({
        id: membership.user_id,
        name: names.get(membership.user_id) || (membership.user_id === access.userId ? "You" : "Employee"),
        status: membership.status,
      })),
      records: (attendanceResult.data ?? []).map((record) => ({
        ...record,
        employee_name: names.get(record.employee_id) || (record.employee_id === access.userId ? "You" : "Employee"),
        worked_minutes: record.status !== "present" || !record.check_in_at
          ? 0
          : record.check_out_at
            ? Math.max(0, Math.floor((Date.parse(record.check_out_at) - Date.parse(record.check_in_at)) / 60000))
            : record.work_date === kampalaWorkDate()
              ? Math.max(0, Math.floor((now - Date.parse(record.check_in_at)) / 60000))
              : null,
      })),
      permissions: { canViewTeam, canClock },
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Attendance request failed", error);
    return NextResponse.json({ error: "Attendance is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    if (!await hasWorkforcePermission(access, "attendance.clock")) return NextResponse.json({ error: "You do not have permission to record attendance." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as { action?: unknown; comment?: unknown } | null;
    if (body?.action !== "check-in" && body?.action !== "check-out") {
      return NextResponse.json({ error: "Choose check-in or check-out." }, { status: 400, headers: responseHeaders });
    }
    const comment = typeof body.comment === "string" ? body.comment.trim() : "";
    if (!comment || comment.length > 1000) return NextResponse.json({ error: "Add a comment up to 1,000 characters." }, { status: 400, headers: responseHeaders });
    const { data, error } = await access.supabase.rpc("record_attendance_action", {
      requested_company_id: access.companyId,
      requested_action: body.action,
      requested_comment: comment,
    });
    if (error || !data) {
      if (error?.code === "23505" || error?.code === "P0002") return NextResponse.json({ error: error.message }, { status: 409, headers: responseHeaders });
      console.error("Attendance action failed", error);
      return NextResponse.json({ error: "Unable to update today's attendance." }, { status: 400, headers: responseHeaders });
    }
    return NextResponse.json({ record: data }, { headers: responseHeaders });
  } catch (error) {
    console.error("Attendance action request failed", error);
    return NextResponse.json({ error: "Attendance is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
