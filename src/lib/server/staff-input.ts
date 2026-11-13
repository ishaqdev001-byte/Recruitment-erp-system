export const staffStatuses = ["Active", "On Leave", "Inactive"] as const

export const staffPayTypes = ["payroll", "project", "no_payroll"] as const

export type StaffPayType = typeof staffPayTypes[number]

export type StaffInput = {
  name: string

  position: string

  status: typeof staffStatuses[number]

  dateJoined: string

  branchId: string | null

  linkedUserId: string | null

  payType: StaffPayType

  baseSalary: number

  weeklyTransportAllowance: number

  transportAccountId: string | null

  lineManagerStaffId: string | null
}

const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value)

export function parseStaffInput(
  body: Record<string, unknown>,
): StaffInput | null {
  const name = typeof body.name === "string" ? body.name.trim() : ""

  const position = typeof body.position === "string" ? body.position.trim() : ""

  const dateJoined = typeof body.dateJoined === "string" ? body.dateJoined : ""

  const branchId =
    typeof body.branchId === "string" && body.branchId ? body.branchId : null

  const status = body.status

  const payType = body.payType

  const baseSalary = Number(body.baseSalary ?? 0)

  const weeklyTransportAllowance = Number(body.weeklyTransportAllowance ?? 0)

  const linkedUserId =
    typeof body.linkedUserId === "string" && body.linkedUserId
      ? body.linkedUserId
      : null

  const transportAccountId =
    typeof body.transportAccountId === "string" && body.transportAccountId
      ? body.transportAccountId
      : null

  const lineManagerStaffId =
    typeof body.lineManagerStaffId === "string" && body.lineManagerStaffId
      ? body.lineManagerStaffId
      : null

  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(dateJoined) &&
    !Number.isNaN(Date.parse(`${dateJoined}T00:00:00`))

  if (
    !name ||
    name.length > 200 ||
    !position ||
    position.length > 150 ||
    !validDate ||
    !staffStatuses.includes(status as typeof staffStatuses[number]) ||
    !staffPayTypes.includes(payType as StaffPayType) ||
    !Number.isFinite(baseSalary) ||
    baseSalary < 0 ||
    baseSalary > 999999999999.99 ||
    !Number.isFinite(weeklyTransportAllowance) ||
    weeklyTransportAllowance < 0 ||
    weeklyTransportAllowance > 999999999999.99 ||
    (payType === "payroll" && baseSalary <= 0) ||
    (payType !== "payroll" &&
      (baseSalary !== 0 ||
        weeklyTransportAllowance !== 0 ||
        transportAccountId !== null)) ||
    (weeklyTransportAllowance > 0 &&
      (payType !== "payroll" || !transportAccountId)) ||
    (transportAccountId !== null && !isUuid(transportAccountId)) ||
    (branchId !== null && !isUuid(branchId)) ||
    (linkedUserId !== null && !isUuid(linkedUserId)) ||
    (lineManagerStaffId !== null && !isUuid(lineManagerStaffId))
  ) {
    return null
  }

  return {
    name,

    position,

    status: status as StaffInput["status"],

    dateJoined,

    branchId,

    linkedUserId,

    payType: payType as StaffPayType,

    baseSalary: Math.round(baseSalary * 100) / 100,

    weeklyTransportAllowance: Math.round(weeklyTransportAllowance * 100) / 100,

    transportAccountId:
      weeklyTransportAllowance > 0 ? transportAccountId : null,

    lineManagerStaffId,
  }
}
