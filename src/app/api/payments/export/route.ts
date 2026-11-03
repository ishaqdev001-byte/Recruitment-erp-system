import ExcelJS from "exceljs"

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

import { NextResponse } from "next/server"

import { getInvoiceAccess } from "@/lib/server/invoices"

import { loadPaymentLedger } from "@/lib/server/payment-ledger"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function pdfSafeText(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?")
}

export async function GET(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.view")

    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })
    }

    const { searchParams } = new URL(request.url)

    const format = searchParams.get("format")

    const projectId = searchParams.get("projectId") ?? "all"

    if (
      (format !== "pdf" && format !== "excel") ||
      (projectId !== "all" && !uuidPattern.test(projectId))
    ) {
      return NextResponse.json(
        { error: "Select a valid export format and project." },
        { status: 400, headers: responseHeaders },
      )
    }

    const ledger = await loadPaymentLedger(access)

    const project =
      projectId === "all"
        ? null
        : ledger.projects.find((item) => item.id === projectId)

    if (projectId !== "all" && !project) {
      return NextResponse.json(
        { error: "The selected project is unavailable." },
        { status: 404, headers: responseHeaders },
      )
    }

    const transactions = ledger.transactions.filter(
      (item) => projectId === "all" || item.projectId === projectId,
    )

    const safeProject =
      project?.name
        .replace(/[^a-z0-9-]+/gi, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "all-projects"

    const filePrefix = `payments-${safeProject}`

    const rows = transactions.map((item) => [
      new Date(item.receivedAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
      }),

      item.reference,

      item.receivedFrom,

      item.category,

      item.projectName ?? "",

      item.amount,

      item.paymentMethod,

      item.externalReference,

      item.invoiceNumber ?? "",

      item.notes,
    ])

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook()

      workbook.creator = "RecruitOS"

      const worksheet = workbook.addWorksheet("Payments")

      worksheet.addRow(["Payments & Deposits"])

      worksheet.addRow([project ? `Project: ${project.name}` : "All projects"])

      worksheet.addRow([
        "Received (Kampala)",
        "Receipt",
        "Received from",
        "Category",
        "Project",
        "Amount (UGX)",
        "Method",
        "Reference",
        "Invoice",
        "Notes",
      ])

      worksheet.getRow(3).font = { bold: true }

      worksheet.columns = [
        { width: 23 },
        { width: 24 },
        { width: 28 },
        { width: 22 },
        { width: 28 },

        { width: 18 },
        { width: 18 },
        { width: 24 },
        { width: 20 },
        { width: 42 },
      ]

      rows.forEach((row) => worksheet.addRow(row))

      worksheet.autoFilter = { from: "A3", to: "J3" }

      const file = await workbook.xlsx.writeBuffer()

      return new Response(new Uint8Array(file), {
        headers: {
          ...responseHeaders,

          "Content-Disposition": `attachment; filename="${filePrefix}.xlsx"`,

          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      })
    }

    const pageWidth = 842

    const pageHeight = 595

    const pdf = await PDFDocument.create()

    pdf.setTitle(`Payments and deposits - ${project?.name ?? "all projects"}`)

    pdf.setAuthor("RecruitOS")

    const regular = await pdf.embedFont(StandardFonts.Helvetica)

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const columns = [
      { title: "RECEIVED", x: 36, width: 105 },

      { title: "RECEIPT", x: 144, width: 93 },

      { title: "RECEIVED FROM", x: 241, width: 125 },

      { title: "PROJECT", x: 369, width: 145 },

      { title: "REFERENCE", x: 517, width: 105 },

      { title: "AMOUNT (UGX)", x: 630, width: 176 },
    ]

    const rowsPerPage = 21

    const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const page = pdf.addPage([pageWidth, pageHeight])

      page.drawText("Payments & Deposits", {
        x: 36,
        y: 558,
        size: 16,
        font: bold,
        color: rgb(0.12, 0.16, 0.19),
      })

      page.drawText(
        project ? `Project: ${pdfSafeText(project.name)}` : "All projects",
        { x: 36, y: 538, size: 9, font: regular, color: rgb(0.38, 0.43, 0.47) },
      )

      page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
        x: 748,
        y: 558,
        size: 8,
        font: regular,
        color: rgb(0.38, 0.43, 0.47),
      })

      page.drawLine({
        start: { x: 36, y: 526 },
        end: { x: 806, y: 526 },
        thickness: 0.8,
        color: rgb(0.82, 0.85, 0.87),
      })

      for (const column of columns) {
        page.drawText(column.title, {
          x: column.x,
          y: 511,
          size: 7,
          font: bold,
          color: rgb(0.38, 0.43, 0.47),
        })
      }

      const pageRows = rows.slice(
        pageIndex * rowsPerPage,
        (pageIndex + 1) * rowsPerPage,
      )

      pageRows.forEach((row, rowIndex) => {
        const y = 492 - rowIndex * 21

        const values = [
          String(row[0]),
          String(row[1]),
          String(row[2]),
          String(row[4]),
          String(row[7]),
          Number(row[5]).toLocaleString("en-UG"),
        ]

        values.forEach((value, columnIndex) => {
          const column = columns[columnIndex]

          let text = pdfSafeText(value)

          while (
            text.length > 3 &&
            regular.widthOfTextAtSize(text, 7) > column.width
          )
            text = `${text.slice(0, -4)}...`

          page.drawText(text, {
            x: column.x,
            y,
            size: 7,
            font: regular,
            color: rgb(0.12, 0.16, 0.19),
          })
        })

        page.drawLine({
          start: { x: 36, y: y - 6 },
          end: { x: 806, y: y - 6 },
          thickness: 0.35,
          color: rgb(0.9, 0.91, 0.92),
        })
      })

      page.drawText(
        `Total: UGX ${transactions.reduce((sum, item) => sum + item.amount, 0).toLocaleString("en-UG")}`,
        {
          x: 630,
          y: 34,
          size: 9,
          font: bold,
          color: rgb(0.12, 0.16, 0.19),
        },
      )
    }

    const file = await pdf.save()

    return new Response(new Uint8Array(file), {
      headers: {
        ...responseHeaders,

        "Content-Disposition": `attachment; filename="${filePrefix}.pdf"`,

        "Content-Type": "application/pdf",
      },
    })
  } catch (error) {
    console.error("Payments export request failed", error)

    return NextResponse.json(
      { error: "Unable to export payments and deposits." },
      { status: 503, headers: responseHeaders },
    )
  }
}
