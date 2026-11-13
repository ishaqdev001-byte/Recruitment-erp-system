import type { SupabaseClient } from "@supabase/supabase-js";

export type ApprovedUnpaidLeave = {
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
};

function getLeaveDays(
  startDate: string,
  endDate: string,
  recordedDays: number | null,
) {
  if (Number.isInteger(recordedDays) && Number(recordedDays) > 0) {
    return Number(recordedDays);
  }

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.floor((end - start) / 86_400_000) + 1
    : 0;
}

export async function loadApprovedUnpaidLeaves(
  admin: SupabaseClient,
  companyId: string,
  employeeIds: string[],
): Promise<ApprovedUnpaidLeave[]> {
  const uniqueEmployeeIds = [...new Set(employeeIds.filter(Boolean))];
  if (!uniqueEmployeeIds.length) return [];

  const { data, error } = await admin
    .from("leave_requests")
    .select("employee_id, leave_type, is_paid, start_date, end_date, days_count")
    .eq("company_id", companyId)
    .eq("status", "approved")
    .in("employee_id", uniqueEmployeeIds);
  if (error) throw error;

  return (data ?? [])
    .filter((request) =>
      typeof request.is_paid === "boolean"
        ? !request.is_paid
        : /unpaid/i.test(String(request.leave_type ?? "")),
    )
    .map((request) => ({
      employeeId: String(request.employee_id),
      startDate: String(request.start_date),
      endDate: String(request.end_date),
      days: getLeaveDays(
        String(request.start_date),
        String(request.end_date),
        typeof request.days_count === "number" ? request.days_count : null,
      ),
    }));
}

export function leaveCoversDate(
  leave: ApprovedUnpaidLeave,
  date: string,
) {
  return leave.startDate <= date && leave.endDate >= date;
}

export function leaveOverlapsPayPeriod(
  leave: ApprovedUnpaidLeave,
  payPeriod: string,
) {
  const monthStart = `${payPeriod.slice(0, 7)}-01`;
  const [year, month] = payPeriod.slice(0, 7).split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return leave.startDate <= monthEnd && leave.endDate >= monthStart;
}

export function unpaidLeaveBlocksPayPeriod(
  leave: ApprovedUnpaidLeave,
  payPeriod: string,
) {
  return leave.days > 6 && leaveOverlapsPayPeriod(leave, payPeriod);
}

export function getUnpaidLeavePayPeriods(leave: ApprovedUnpaidLeave) {
  const periods: string[] = [];
  const [startYear, startMonth] = leave.startDate.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = leave.endDate.slice(0, 7).split("-").map(Number);

  for (
    let month = startYear * 12 + startMonth - 1;
    month <= endYear * 12 + endMonth - 1;
    month += 1
  ) {
    const year = Math.floor(month / 12);
    const monthOfYear = (month % 12) + 1;
    periods.push(`${year}-${String(monthOfYear).padStart(2, "0")}-01`);
  }
  return periods;
}
