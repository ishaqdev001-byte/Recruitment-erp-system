import ExcelJS from "exceljs"

import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"

import { NextResponse } from "next/server"

import type { SupabaseClient } from "@supabase/supabase-js"

import { getCompanyChairmanHrAccess } from "@/lib/server/hr-profiles"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const columns = [
  { header: "Staff ID", key: "staffId", width: 18 },

  { header: "Full name", key: "name", width: 30 },

  { header: "Branch", key: "branch", width: 28 },

  { header: "Date joined", key: "dateJoined", width: 18 },

  { header: "Position", key: "position", width: 30 },
]

type StaffSummary = {
  id: string

  staffId: string

  name: string

  position: string

  dateJoined: string

  branchName: string
}

async function loadStaff(companyId: string, admin: SupabaseClient) {
  const [
    { data: staff, error: staffError },
    { data: branches, error: branchesError },
  ] = await Promise.all([
    admin
      .from("company_staff_members")

      .select("id, staff_id, name, position, date_joined, branch_id")

      .eq("company_id", companyId)

      .order("name"),

    admin
      .from("company_branches")

      .select("id, name")

      .eq("company_id", companyId),
  ])

  if (staffError || branchesError) throw staffError ?? branchesError

  const branchNames = new Map(
    (branches ?? []).map((branch) => [branch.id, branch.name]),
  )

  return (staff ?? []).map((record) => ({
    id: record.id,

    staffId: record.staff_id,

    name: record.name,

    position: record.position,

    dateJoined: record.date_joined,

    branchName: branchNames.get(record.branch_id) ?? "Unassigned",
  })) satisfies StaffSummary[]
}

function filenameResponse(
  body: BodyInit,
  contentType: string,
  filename: string,
) {
  return new NextResponse(body, {
    headers: {
      ...headers,

      "Content-Type": contentType,

      "Content-Disposition": `attachment; filename="${filename}"`,

      "X-Content-Type-Options": "nosniff",
    },
  })
}

function toArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength)

  new Uint8Array(buffer).set(bytes)

  return buffer
}

async function createExcel(staff: StaffSummary[]) {
  const workbook = new ExcelJS.Workbook()

  workbook.creator = "Kilax Smart Recruit"

  workbook.created = new Date()

  const worksheet = workbook.addWorksheet("HR Profiles", {
    pageSetup: {
      paperSize: 9,

      orientation: "landscape",

      fitToPage: true,

      fitToWidth: 1,

      fitToHeight: 0,

      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.4,
        bottom: 0.4,
        header: 0.15,
        footer: 0.15,
      },
    },
  })

  worksheet.columns = columns

  worksheet.addRows(
    staff.map((record) => ({
      staffId: record.staffId,

      name: record.name,

      branch: record.branchName,

      dateJoined: record.dateJoined,

      position: record.position,
    })),
  )

  worksheet.views = [{ state: "frozen", ySplit: 1 }]

  worksheet.autoFilter = { from: "A1", to: "E1" }

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }

  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4ED8" },
  }

  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 24 : 20

    row.alignment = { vertical: "middle", wrapText: true }
  })

  const buffer = await workbook.xlsx.writeBuffer()

  return toArrayBuffer(new Uint8Array(buffer))
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean)

  if (!words.length) return [""]

  const lines: string[] = []

  let line = ""

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word

    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line)

      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)

  return lines
}

async function createPdf(staff: StaffSummary[]) {
  const pdf = await PDFDocument.create()

  const regular = await pdf.embedFont(StandardFonts.Helvetica)

  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageSize: [number, number] = [842, 595]

  const margin = 24

  const widths = [78, 160, 160, 100, pageSize[0] - margin * 2 - 498]

  const headings = [
    "Staff ID",
    "Full name",
    "Branch",
    "Date joined",
    "Position",
  ]

  const fontSize = 8

  const lineHeight = 10

  const bottom = margin

  let page = pdf.addPage(pageSize)

  let y = pageSize[1] - margin

  const xStart = margin

  const drawHeader = () => {
    page.drawText("HR Profiles", {
      x: margin,

      y,

      size: 15,

      font: bold,

      color: rgb(0.08, 0.12, 0.2),
    })

    y -= 25

    page.drawText(`${staff.length} staff records`, {
      x: margin,

      y,

      size: 8,

      font: regular,

      color: rgb(0.35, 0.39, 0.46),
    })

    y -= 17

    page.drawRectangle({
      x: margin,

      y: y - 5,

      width: pageSize[0] - margin * 2,

      height: 18,

      color: rgb(0.11, 0.31, 0.78),
    })

    let x = margin

    headings.forEach((heading, index) => {
      page.drawText(heading, {
        x: x + 5,

        y: y + 1,

        size: fontSize,

        font: bold,

        color: rgb(1, 1, 1),
      })

      x += widths[index]
    })

    y -= 19
  }

  drawHeader()

  for (const [index, record] of staff.entries()) {
    const values = [
      record.staffId,
      record.name,
      record.branchName,
      record.dateJoined,
      record.position,
    ]

    const cellLines = values.map((value, index) =>
      wrapText(value || "-", regular, fontSize, widths[index] - 10),
    )

    const rowHeight = Math.max(
      20,
      ...cellLines.map((lines) => lines.length * lineHeight + 8),
    )

    if (y - rowHeight < bottom) {
      page = pdf.addPage(pageSize)

      y = pageSize[1] - margin

      drawHeader()
    }

    if (index % 2 === 0) {
      page.drawRectangle({
        x: margin,

        y: y - rowHeight + 3,

        width: pageSize[0] - margin * 2,

        height: rowHeight,

        color: rgb(0.95, 0.96, 0.98),
      })
    }

    let x = xStart

    cellLines.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: x + 5,

          y: y - 9 - lineIndex * lineHeight,

          size: fontSize,

          font: regular,

          color: rgb(0.12, 0.15, 0.2),
        })
      })

      x += widths[index]
    })

    y -= rowHeight
  }

  if (!staff.length) {
    page.drawText("No staff profiles are available.", {
      x: margin,

      y: y - 5,

      size: 9,

      font: regular,

      color: rgb(0.35, 0.39, 0.46),
    })
  }

  return toArrayBuffer(await pdf.save())
}

export async function GET(request: Request) {
  const access = await getCompanyChairmanHrAccess(
    new URL(request.url).searchParams.get("companyId"),
  );

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, {
      status: access.status,
      headers,
    })
  }

  try {
    const staff = await loadStaff(access.companyId, access.admin)

    const format = new URL(request.url).searchParams.get("format")

    if (format === "xlsx") {
      return filenameResponse(
        await createExcel(staff),

        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

        "hr-profiles.xlsx",
      )
    }

    if (format === "pdf") {
      return filenameResponse(
        await createPdf(staff),
        "application/pdf",
        "hr-profiles.pdf",
      )
    }

    return NextResponse.json({ staff }, { headers })
  } catch (error) {
    console.error("Chairman HR profiles request failed:", error)

    return NextResponse.json({ error: "Unable to load HR profiles." }, {
      status: 503,
      headers,
    })
  }
}
