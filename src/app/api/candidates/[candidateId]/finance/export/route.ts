import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { NextResponse } from "next/server"
import {
  loadCandidateFinance,
  type CandidateFinanceData,
} from "@/lib/server/candidate-finance"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

function safeText(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?")
}

function safeFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "candidate"
}

function financeRows(data: CandidateFinanceData) {
  return [
    ...data.invoices.map((invoice) => ({
      date: invoice.issued_at,
      type: "Invoice",
      description: invoice.description,
      method: "",
      amount: invoice.amount,
      reference: invoice.invoice_number,
      status: invoice.status,
    })),
    ...data.receipts.map((receipt) => ({
      date: receipt.received_at,
      type: receipt.category || "Candidate deposit",
      description: receipt.notes,
      method: receipt.payment_method,
      amount: receipt.amount,
      reference: receipt.receipt_number,
      status: "Received",
    })),
    ...data.payments.map((payment) => ({
      date: payment.paid_at,
      type: "Invoice payment",
      description: "",
      method: "",
      amount: payment.amount,
      reference:
        data.invoices.find((invoice) => invoice.id === payment.invoice_id)
          ?.invoice_number ?? payment.invoice_id,
      status: "Paid",
    })),
  ].sort((left, right) => right.date.localeCompare(left.date))
}

async function createExcel(data: CandidateFinanceData) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "RecruitOS"
  workbook.subject = `Candidate finance records for ${data.candidate.name}`
  workbook.title = `Candidate finance - ${data.candidate.fileNumber}`

  const summary = workbook.addWorksheet("Summary")
  summary.addRow(["Candidate Finance Records"])
  summary.addRow(["Candidate", data.candidate.name])
  summary.addRow(["File number", data.candidate.fileNumber])
  summary.addRow(["Exported", new Date().toISOString()])
  summary.addRow([])
  summary.addRow(["Total invoiced (UGX)", data.summary.totalInvoiced])
  summary.addRow(["Total deposited (UGX)", data.summary.totalDeposits])
  summary.addRow(["Total paid (UGX)", data.summary.totalPaid])
  summary.addRow(["Outstanding balance (UGX)", data.summary.outstandingBalance])
  summary.getRow(1).font = { bold: true, size: 16 }
  summary.getColumn(1).width = 32
  summary.getColumn(2).width = 36
  for (const rowNumber of [6, 7, 8, 9]) {
    summary.getCell(rowNumber, 2).numFmt = '"UGX" #,##0.00'
  }

  const transactions = workbook.addWorksheet("Transactions")
  transactions.addRow([
    "Date",
    "Type",
    "Description / notes",
    "Payment method",
    "Amount (UGX)",
    "Reference",
    "Status",
  ])
  transactions.getRow(1).font = { bold: true }
  transactions.columns = [
    { width: 22 },
    { width: 24 },
    { width: 48 },
    { width: 20 },
    { width: 20 },
    { width: 28 },
    { width: 18 },
  ]
  for (const row of financeRows(data)) {
    transactions.addRow([
      row.date ? new Date(row.date) : "",
      row.type,
      row.description,
      row.method,
      row.amount,
      row.reference,
      row.status,
    ])
  }
  transactions.autoFilter = {
    from: "A1",
    to: "G1",
  }
  transactions.getColumn(1).numFmt = "dd mmm yyyy"
  transactions.getColumn(5).numFmt = '"UGX" #,##0.00'
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

async function createPdf(data: CandidateFinanceData) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Candidate finance - ${data.candidate.fileNumber}`)
  pdf.setAuthor("RecruitOS")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const rows = financeRows(data)
  const columns = [
    { title: "DATE", x: 30, width: 70 },
    { title: "TYPE", x: 104, width: 105 },
    { title: "REFERENCE", x: 213, width: 115 },
    { title: "DESCRIPTION / NOTES", x: 332, width: 198 },
    { title: "METHOD", x: 534, width: 75 },
    { title: "AMOUNT (UGX)", x: 612, width: 93 },
    { title: "STATUS", x: 708, width: 104 },
  ]
  const pageWidth = 842
  const pageHeight = 595
  const rowsPerPage = 20
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage))

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const page = pdf.addPage([pageWidth, pageHeight])
    page.drawText("Candidate Finance Records", {
      x: 30,
      y: 565,
      size: 15,
      font: bold,
      color: rgb(0.12, 0.16, 0.19),
    })
    page.drawText(
      safeText(`${data.candidate.name} | File: ${data.candidate.fileNumber}`),
      { x: 30, y: 546, size: 9, font: regular, color: rgb(0.38, 0.43, 0.47) },
    )
    page.drawText(
      `Invoiced: UGX ${data.summary.totalInvoiced.toLocaleString("en-UG")}   Deposited: UGX ${data.summary.totalDeposits.toLocaleString("en-UG")}   Paid: UGX ${data.summary.totalPaid.toLocaleString("en-UG")}   Balance: UGX ${data.summary.outstandingBalance.toLocaleString("en-UG")}`,
      { x: 30, y: 528, size: 8, font: regular, color: rgb(0.12, 0.16, 0.19) },
    )
    page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
      x: 760,
      y: 565,
      size: 8,
      font: regular,
      color: rgb(0.38, 0.43, 0.47),
    })
    page.drawLine({
      start: { x: 30, y: 516 },
      end: { x: 812, y: 516 },
      thickness: 0.8,
      color: rgb(0.82, 0.85, 0.87),
    })
    for (const column of columns) {
      page.drawText(column.title, {
        x: column.x,
        y: 500,
        size: 6.5,
        font: bold,
        color: rgb(0.38, 0.43, 0.47),
      })
    }

    rows
      .slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage)
      .forEach((row, rowIndex) => {
        const y = 480 - rowIndex * 21
        const values = [
          row.date ? new Date(row.date).toLocaleDateString("en-GB") : "",
          row.type,
          row.reference,
          row.description,
          row.method,
          row.amount.toLocaleString("en-UG", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
          row.status,
        ]
        values.forEach((value, columnIndex) => {
          const column = columns[columnIndex]
          let text = safeText(value)
          while (
            text.length > 3 &&
            regular.widthOfTextAtSize(text, 6.5) > column.width
          )
            text = `${text.slice(0, -4)}...`
          page.drawText(text, {
            x: column.x,
            y,
            size: 6.5,
            font: regular,
            color: rgb(0.12, 0.16, 0.19),
          })
        })
        page.drawLine({
          start: { x: 30, y: y - 6 },
          end: { x: 812, y: y - 6 },
          thickness: 0.35,
          color: rgb(0.9, 0.91, 0.92),
        })
      })
  }
  return new Uint8Array(await pdf.save())
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const format = new URL(request.url).searchParams.get("format")
    if (format !== "excel" && format !== "pdf")
      return NextResponse.json(
        { error: "Select a valid export format." },
        { status: 400, headers: responseHeaders },
      )

    const { candidateId } = await params
    const result = await loadCandidateFinance(candidateId)
    if ("error" in result)
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: responseHeaders },
      )

    const safeCandidate = safeFilename(
      `${result.data.candidate.fileNumber}-${result.data.candidate.name}`,
    )
    const file =
      format === "excel"
        ? await createExcel(result.data)
        : await createPdf(result.data)
    return new Response(file, {
      headers: {
        ...responseHeaders,
        "Content-Disposition": `attachment; filename="candidate-finance-${safeCandidate}.${format === "excel" ? "xlsx" : "pdf"}"`,
        "Content-Type":
          format === "excel"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
      },
    })
  } catch (error) {
    console.error("Candidate finance export failed", error)
    return NextResponse.json(
      { error: "Unable to export candidate finance records." },
      { status: 503, headers: responseHeaders },
    )
  }
}
