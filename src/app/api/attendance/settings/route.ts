import { NextResponse } from "next/server"

import { getCompanyChairmanHrAccess } from "@/lib/server/hr-profiles"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const defaultSchedule = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  is_open: weekday >= 1 && weekday <= 5,
  opens_at: weekday >= 1 && weekday <= 5 ? "09:00:00" : null,
  closes_at: weekday >= 1 && weekday <= 5 ? "17:00:00" : null,
}))

function isValidTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false
  const [hours, minutes] = value.split(":").map(Number)
  return hours <= 23 && minutes <= 59
}

export async function GET(request: Request) {
  try {
    const access = await getCompanyChairmanHrAccess(
      new URL(request.url).searchParams.get("companyId"),
    )
    if ("error" in access)
      return NextResponse.json(
        { error: access.error },
        { status: access.status, headers },
      )

    const [companyResult, settingsResult, scheduleResult, closuresResult] =
      await Promise.all([
        access.admin
          .from("companies")
          .select("country")
          .eq("id", access.companyId)
          .single(),
        access.admin
          .from("company_attendance_settings")
          .select("country_code")
          .eq("company_id", access.companyId)
          .maybeSingle(),
        access.admin
          .from("company_attendance_schedule")
          .select("weekday, is_open, opens_at, closes_at")
          .eq("company_id", access.companyId)
          .order("weekday"),
        access.admin
          .from("company_attendance_closures")
          .select("closed_date, name, closure_type")
          .eq("company_id", access.companyId)
          .order("closed_date"),
      ])

    const queryError =
      companyResult.error ??
      settingsResult.error ??
      scheduleResult.error ??
      closuresResult.error
    if (queryError) {
      console.error("Company attendance settings query failed:", queryError)
      return NextResponse.json(
        { error: "Unable to load attendance settings." },
        { status: 503, headers },
      )
    }
    if (!companyResult.data)
      return NextResponse.json(
        { error: "Company was not found." },
        { status: 404, headers },
      )

    return NextResponse.json(
      {
        countryName: companyResult.data.country ?? "",
        countryCode: settingsResult.data?.country_code ?? "",
        schedule:
          scheduleResult.data?.length === 7
            ? scheduleResult.data
            : defaultSchedule,
        closures: closuresResult.data ?? [],
      },
      { headers },
    )
  } catch (error) {
    console.error("Company attendance settings request failed:", error)
    return NextResponse.json(
      { error: "Attendance settings are unavailable." },
      { status: 503, headers },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          companyId?: unknown
          countryCode?: unknown
          schedule?: unknown
          closures?: unknown
        }
      | null
    const access = await getCompanyChairmanHrAccess(
      typeof body?.companyId === "string" ? body.companyId : null,
    )
    if ("error" in access)
      return NextResponse.json(
        { error: access.error },
        { status: access.status, headers },
      )

    const countryCode =
      typeof body?.countryCode === "string" ? body.countryCode : ""
    const schedule = body?.schedule
    const closures = body?.closures
    if (
      !/^[A-Z]{2}$/.test(countryCode) ||
      !Array.isArray(schedule) ||
      schedule.length !== 7 ||
      !Array.isArray(closures) ||
      closures.length > 500
    )
      return NextResponse.json(
        { error: "Choose a country and provide a complete weekly schedule." },
        { status: 400, headers },
      )

    const seenWeekdays = new Set<number>()
    const normalizedSchedule = []
    for (const day of schedule) {
      if (!day || typeof day !== "object")
        return NextResponse.json(
          { error: "The weekly schedule is invalid." },
          { status: 400, headers },
        )
      const item = day as Record<string, unknown>
      const weekday = item.weekday
      const isOpen = item.is_open
      const opensAt = item.opens_at
      const closesAt = item.closes_at
      if (
        typeof weekday !== "number" ||
        !Number.isInteger(weekday) ||
        weekday < 0 ||
        weekday > 6 ||
        seenWeekdays.has(weekday) ||
        typeof isOpen !== "boolean" ||
        (isOpen &&
          (!isValidTime(opensAt) ||
            !isValidTime(closesAt) ||
            opensAt >= closesAt)) ||
        (!isOpen && opensAt !== null && opensAt !== "" && opensAt !== undefined) ||
        (!isOpen && closesAt !== null && closesAt !== "" && closesAt !== undefined)
      )
        return NextResponse.json(
          { error: "Each open day needs valid opening and closing times." },
          { status: 400, headers },
        )
      seenWeekdays.add(weekday)
      normalizedSchedule.push({
        weekday,
        is_open: isOpen,
        opens_at: isOpen ? opensAt : null,
        closes_at: isOpen ? closesAt : null,
      })
    }

    const normalizedClosures: {
      closed_date: string
      name: string
      closure_type: "public_holiday" | "custom"
    }[] = []
    const seenDates = new Set<string>()
    for (const closure of closures) {
      if (!closure || typeof closure !== "object")
        return NextResponse.json(
          { error: "A closure entry is invalid." },
          { status: 400, headers },
        )
      const item = closure as Record<string, unknown>
      const date =
        typeof item.closed_date === "string" ? item.closed_date : ""
      const name = typeof item.name === "string" ? item.name.trim() : ""
      const closureType = item.closure_type
      const parsedDate = new Date(`${date}T00:00:00.000Z`)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(parsedDate.valueOf()) ||
        parsedDate.toISOString().slice(0, 10) !== date ||
        !name ||
        name.length > 200 ||
        (closureType !== "public_holiday" && closureType !== "custom") ||
        seenDates.has(date)
      )
        return NextResponse.json(
          { error: "Closures need a unique date, name, and valid type." },
          { status: 400, headers },
        )
      seenDates.add(date)
      normalizedClosures.push({
        closed_date: date,
        name,
        closure_type: closureType,
      })
    }

    const { error } = await access.admin.rpc(
      "save_company_attendance_settings",
      {
        requested_company_id: access.companyId,
        requested_country_code: countryCode,
        requested_schedule: normalizedSchedule,
        requested_closures: normalizedClosures,
      },
    )
    if (error) {
      console.error("Company attendance settings save failed:", error)
      return NextResponse.json(
        { error: "Unable to save attendance settings." },
        { status: 503, headers },
      )
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error("Company attendance settings update failed:", error)
    return NextResponse.json(
      { error: "Attendance settings are unavailable." },
      { status: 503, headers },
    )
  }
}
