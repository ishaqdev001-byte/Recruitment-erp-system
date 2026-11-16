import type { SupabaseClient } from "@supabase/supabase-js"
import {
  normalizeWorkSchedule,
  type CompanyWorkCalendar,
} from "@/lib/payroll/transport-allowance"

export async function loadCompanyWorkCalendar(
  admin: SupabaseClient,
  companyId: string,
): Promise<CompanyWorkCalendar> {
  const [scheduleResult, closuresResult] = await Promise.all([
    admin
      .from("company_attendance_schedule")
      .select("weekday, is_open")
      .eq("company_id", companyId)
      .order("weekday"),
    admin
      .from("company_attendance_closures")
      .select("closed_date")
      .eq("company_id", companyId)
      .order("closed_date"),
  ])

  if (scheduleResult.error || closuresResult.error)
    throw scheduleResult.error ?? closuresResult.error

  return {
    schedule: normalizeWorkSchedule(scheduleResult.data),
    closureDates: (closuresResult.data ?? []).map((closure) =>
      String(closure.closed_date),
    ),
  }
}
