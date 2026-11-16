export type AttendanceScheduleDay = {
  weekday: number
  is_open: boolean
}

export type CompanyWorkCalendar = {
  schedule: AttendanceScheduleDay[]
  closureDates: string[]
}

export const DEFAULT_WORK_SCHEDULE: AttendanceScheduleDay[] = Array.from(
  { length: 7 },
  (_, weekday) => ({
    weekday,
    is_open: weekday >= 1 && weekday <= 5,
  }),
)

export function normalizeWorkSchedule(
  schedule: AttendanceScheduleDay[] | null | undefined,
): AttendanceScheduleDay[] {
  return schedule?.length === 7 ? schedule : DEFAULT_WORK_SCHEDULE
}

export function getCurrentPayPeriod(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`
}

export function getWorkingDaysInMonth(
  payPeriod: string,
  schedule: AttendanceScheduleDay[],
  closureDates: string[],
): number {
  const match = /^(\d{4})-(\d{2})-01$/.exec(payPeriod)
  if (!match) throw new Error("Pay period must be the first day of a month.")

  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12)
    throw new Error("Pay period must contain a valid month.")

  const openWeekdays = new Set(
    schedule
      .filter(
        (day) =>
          day.is_open &&
          Number.isInteger(day.weekday) &&
          day.weekday >= 0 &&
          day.weekday <= 6,
      )
      .map((day) => day.weekday),
  )
  if (!openWeekdays.size) return 0

  const closures = new Set(closureDates)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  let workingDays = 0

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day))
    const dateString = `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`
    if (openWeekdays.has(date.getUTCDay()) && !closures.has(dateString))
      workingDays += 1
  }

  return workingDays
}

export function calculateMonthlyTransportAllowance(
  weeklyAllowance: number,
  payPeriod: string,
  schedule: AttendanceScheduleDay[],
  closureDates: string[],
): number {
  const allowance = Number(weeklyAllowance)
  if (!Number.isFinite(allowance) || allowance <= 0) return 0

  const scheduledDaysPerWeek = new Set(
    schedule
      .filter(
        (day) =>
          day.is_open &&
          Number.isInteger(day.weekday) &&
          day.weekday >= 0 &&
          day.weekday <= 6,
      )
      .map((day) => day.weekday),
  ).size
  if (!scheduledDaysPerWeek) return 0

  const workingDays = getWorkingDaysInMonth(payPeriod, schedule, closureDates)
  return Math.round((allowance * workingDays * 100) / scheduledDaysPerWeek) / 100
}
