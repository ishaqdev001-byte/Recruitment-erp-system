import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { NextResponse } from "next/server"

import {
  getWorkforceAccess,
  hasWorkforcePermission,
  isIsoDate,
} from "@/lib/server/workforce"

export const runtime = "nodejs"

type ExportRow = {
  work_date: string
  employee_name: string
  check_in_at: string | null
  check_in_comment: string
  check_out_at: string | null
  check_out_comment: string
  worked_minutes: number | null
  status: "present" | "absent" | "leave" | "not_checked_in"
}

function safeText(value: unknown, limit = 1000) {
  return typeof value === "string" ? value.slice(0, limit) : ""
}

function formatTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Kampala",
      }).format(new Date(value))
    : ""
}

function formatWorkedMinutes(value: number | null) {
  if (value === null) return "Incomplete"
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}m`
}

function pdfSafeText(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?")
}

export async function POST(request: Request) {
  try {
    const access = await getWorkforceAccess()
    if ("error" in access)
      return NextResponse.json(
        { error: access.error },
        { status: access.status, headers: { "Cache-Control": "private, no-store" } },
      )

    const [companyResult, canViewReports] = await Promise.all([
      access.supabase
        .from("companies")
        .select("name, primary_admin_user_id")
        .eq("id", access.companyId)
        .maybeSingle(),
      hasWorkforcePermission(access, "attendance.view_reports"),
    ])
    if (companyResult.error) {
      console.error("Attendance export company lookup failed", companyResult.error)
      return NextResponse.json(
        { error: "Unable to verify attendance export access." },
        { status: 500, headers: { "Cache-Control": "private, no-store" } },
      )
    }
    if (
      !companyResult.data ||
      companyResult.data.primary_admin_user_id !== access.userId ||
      !canViewReports
    )
      return NextResponse.json(
        { error: "Only the company Chairman can export attendance reports." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      )

    const body = (await request.json().catch(() => null)) as
      | {
          format?: unknown
          mode?: unknown
          startDate?: unknown
          endDate?: unknown
          rows?: unknown
        }
      | null
    if (
      (body?.format !== "pdf" && body?.format !== "excel") ||
      (body.mode !== "daily" &&
        body.mode !== "weekly" &&
        body.mode !== "monthly") ||
      !isIsoDate(body.startDate) ||
      !isIsoDate(body.endDate) ||
      body.startDate > body.endDate ||
      !Array.isArray(body.rows) ||
      body.rows.length > 5000
    )
      return NextResponse.json(
        { error: "Provide a valid attendance report to export." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      )

    const rows: ExportRow[] = []
    for (const candidate of body.rows) {
      if (!candidate || typeof candidate !== "object")
        return NextResponse.json(
          { error: "An attendance report row is invalid." },
          { status: 400, headers: { "Cache-Control": "private, no-store" } },
        )
      const item = candidate as Record<string, unknown>
      if (
        !isIsoDate(item.work_date) ||
        item.work_date < body.startDate ||
        item.work_date > body.endDate ||
        (item.status !== "present" &&
          item.status !== "absent" &&
          item.status !== "leave" &&
          item.status !== "not_checked_in") ||
        (item.check_in_at !== null && typeof item.check_in_at !== "string") ||
        (item.check_out_at !== null && typeof item.check_out_at !== "string") ||
        (item.worked_minutes !== null &&
          (typeof item.worked_minutes !== "number" ||
            !Number.isFinite(item.worked_minutes) ||
            item.worked_minutes < 0))
      )
        return NextResponse.json(
          { error: "An attendance report row is invalid." },
          { status: 400, headers: { "Cache-Control": "private, no-store" } },
        )

      rows.push({
        work_date: item.work_date,
        employee_name: safeText(item.employee_name, 200),
        check_in_at: item.check_in_at,
        check_in_comment: safeText(item.check_in_comment),
        check_out_at: item.check_out_at,
        check_out_comment: safeText(item.check_out_comment),
        worked_minutes: item.worked_minutes,
        status: item.status,
      })
    }

    const rangeName = `${body.startDate}-${body.endDate}`
    if (body.format === "excel") {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = "RecruitOS"
      const worksheet = workbook.addWorksheet("Attendance")
      worksheet.addRow([companyResult.data.name || "Company Attendance"])
      worksheet.addRow([
        `${String(body.mode).toUpperCase()} report: ${body.startDate} to ${body.endDate} (Africa/Kampala)`,
      ])
      worksheet.addRow([
        "Date",
        "Employee",
        "Check in",
        "Check-in comment",
        "Check out",
        "Check-out comment",
        "Worked",
        "Status",
      ])
      worksheet.getRow(3).font = { bold: true }
      worksheet.columns = [
        { width: 14 },
        { width: 28 },
        { width: 12 },
        { width: 42 },
        { width: 12 },
        { width: 42 },
        { width: 14 },
        { width: 20 },
      ]
      for (const row of rows)
        worksheet.addRow([
          row.work_date,
          row.employee_name,
          formatTime(row.check_in_at),
          row.check_in_comment,
          formatTime(row.check_out_at),
          row.check_out_comment,
          formatWorkedMinutes(row.worked_minutes),
          row.status.replace(/_/g, " "),
        ])

      const file = await workbook.xlsx.writeBuffer()
      return new Response(new Uint8Array(file), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename="attendance-${rangeName}.xlsx"`,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      })
    }

    const pdf = await PDFDocument.create()
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica)
    const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold)
    const pageRows = 34
    const pageCount = Math.max(1, Math.ceil(rows.length / pageRows))
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const page = pdf.addPage([612, 792])
      const { height } = page.getSize()
      const draw = (
        text: string,
        x: number,
        y: number,
        size = 8,
        bold = false,
      ) =>
        page.drawText(pdfSafeText(text), {
          x,
          y,
          size,
          font: bold ? boldFont : regularFont,
          color: rgb(0.12, 0.16, 0.22),
          maxWidth: 540,
        })

      draw(companyResult.data.name || "Company Attendance", 36, height - 42, 16, true)
      draw(
        `${String(body.mode).toUpperCase()} attendance: ${body.startDate} to ${body.endDate} (Africa/Kampala)`,
        36,
        height - 62,
        9,
      )
      const headerY = height - 96
      draw("Date", 36, headerY, 8, true)
      draw("Employee", 102, headerY, 8, true)
      draw("Check in", 292, headerY, 8, true)
      draw("Check out", 350, headerY, 8, true)
      draw("Worked", 414, headerY, 8, true)
      draw("Status", 474, headerY, 8, true)
      page.drawLine({
        start: { x: 36, y: headerY - 5 },
        end: { x: 576, y: headerY - 5 },
        thickness: 0.6,
        color: rgb(0.7, 0.73, 0.77),
      })

      const pageRowsData = rows.slice(
        pageIndex * pageRows,
        (pageIndex + 1) * pageRows,
      )
      pageRowsData.forEach((row, rowIndex) => {
        const y = headerY - 22 - rowIndex * 17
        draw(row.work_date, 36, y)
        draw(row.employee_name.slice(0, 30), 102, y)
        draw(formatTime(row.check_in_at), 292, y)
        draw(formatTime(row.check_out_at), 350, y)
        draw(formatWorkedMinutes(row.worked_minutes), 414, y)
        draw(row.status.replace(/_/g, " "), 474, y)
      })
      if (rows.length === 0)
        draw("No attendance records in this period.", 36, headerY - 28, 9)
      draw(`Page ${pageIndex + 1} of ${pageCount}`, 500, 24, 8)
    }

    return new Response(new Uint8Array(await pdf.save()), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="attendance-${rangeName}.pdf"`,
        "Content-Type": "application/pdf",
      },
    })
  } catch (error) {
    console.error("Attendance report export failed", error)
    return NextResponse.json(
      { error: "Unable to export the attendance report." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    )
  }
}
