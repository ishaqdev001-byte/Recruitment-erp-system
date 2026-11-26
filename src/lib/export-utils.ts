import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib"
import ExcelJS from "exceljs"

export interface ExportConfig {
  format: "excel" | "pdf"
  tableName: string
  fileName: string
  headers: string[]
  rows: (string | number)[][]
  companyName: string
  companyDetails?: {
    registrationNumber?: string
    city?: string
    country?: string
    officeAddress?: string
    phone?: string
    email?: string
    website?: string
  }
  filterSummary: string
  exportedByName: string
  exportDate?: Date
}

function buildCompanyExportDetails(
  companyName: string,
  details?: ExportConfig["companyDetails"],
): string {
  const parts = [
    companyName,
    details?.registrationNumber ? `Registration: ${details.registrationNumber}` : "",
    [details?.city, details?.country].filter(Boolean).join(", "),
    details?.officeAddress,
    details?.phone ? `Phone: ${details.phone}` : "",
    details?.email ? `Email: ${details.email}` : "",
    details?.website ? `Website: ${details.website}` : "",
  ]
  return parts.filter(Boolean).join(" | ")
}

export async function exportToExcel(config: ExportConfig): Promise<void> {
  const exportDate = config.exportDate || new Date()
  const fileDate = exportDate.toISOString().slice(0, 10)
  const exportedAt = exportDate.toLocaleString()
  const footerText = `Exported by: ${config.exportedByName} | Exported: ${exportedAt}`
  const companyExportDetails = buildCompanyExportDetails(config.companyName, config.companyDetails)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = config.exportedByName
  workbook.created = exportDate

  const worksheet = workbook.addWorksheet("Export")
  worksheet.headerFooter.oddHeader = "&C&B&14COMPANY CONFIDENTIAL"
  worksheet.headerFooter.oddFooter = `&L${footerText.replace(/&/g, "&&")}&C${config.companyName.replace(/&/g, "&&")}&RPage &P of &N`

  // Title
  worksheet.addRow([config.tableName])
  worksheet.addRow([companyExportDetails])
  worksheet.addRow([`Table: ${config.tableName} | Filters: ${config.filterSummary}`])
  worksheet.addRow([footerText])
  worksheet.addRow(["COMPANY CONFIDENTIAL"])

  // Headers
  worksheet.addRow(config.headers)

  // Format rows
  worksheet.getRow(1).font = { bold: true, size: 16 }
  worksheet.getRow(5).font = { bold: true, color: { argb: "FF9A3412" } }
  worksheet.getRow(6).font = { bold: true }

  // Set column widths
  const columnCount = config.headers.length
  const defaultWidth = Math.min(30, Math.max(12, 100 / columnCount))
  worksheet.columns = Array(columnCount).fill({ width: defaultWidth })

  // Header styling
  worksheet.getRow(6).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE9EEF5" },
    }
  })

  // Auto filter
  worksheet.autoFilter = {
    from: { row: 6, column: 1 },
    to: { row: 6, column: config.headers.length },
  }

  // Freeze header rows
  worksheet.views = [{ state: "frozen", ySplit: 6 }]

  // Add data rows
  config.rows.forEach((row) => worksheet.addRow(row))

  // Add footer
  worksheet.addRow([])
  worksheet.addRow([footerText])
  worksheet.addRow([companyExportDetails])

  // Download
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer())
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `${config.fileName}-${fileDate}.xlsx`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function exportToPdf(config: ExportConfig): Promise<void> {
  const exportDate = config.exportDate || new Date()
  const exportedAt = exportDate.toLocaleString()
  const footerText = `Exported by: ${config.exportedByName} | Exported: ${exportedAt}`
  const companyExportDetails = buildCompanyExportDetails(config.companyName, config.companyDetails)

  const pdf = await PDFDocument.create()
  pdf.setTitle(config.tableName)
  pdf.setAuthor(config.exportedByName)

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Helper function to sanitize text
  const pdfSafeText = (value: string | number) =>
    String(value).replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "?")

  // Helper function to wrap text
  const wrapText = (value: string, maxWidth: number, size: number) => {
    const lines: string[] = []
    let line = ""
    for (const word of pdfSafeText(value).split(" ")) {
      const nextLine = line ? `${line} ${word}` : word
      if (line && regular.widthOfTextAtSize(nextLine, size) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = nextLine
      }
    }
    if (line) lines.push(line)
    return lines
  }

  const pageWidth = 842
  const pageHeight = 595
  const margin = 24
  const usableWidth = pageWidth - margin * 2

  // Calculate column widths
  const columnCount = config.headers.length
  const columnWidth = usableWidth / columnCount

  // Create columns
  const columns = config.headers.map((title, index) => ({
    title,
    x: margin + index * columnWidth,
    width: columnWidth,
  }))

  // Build company and filter info
  const companyLines = wrapText(companyExportDetails, usableWidth, 7)
  const filterLines = wrapText(
    `Table: ${config.tableName} | Filters: ${config.filterSummary}`,
    usableWidth,
    7,
  )

  // Start first page
  let page = pdf.addPage([pageWidth, pageHeight])
  let yPosition = pageHeight - margin

  // Add title
  page.drawText(config.tableName, {
    x: margin,
    y: yPosition,
    size: 18,
    font: bold,
    color: rgb(0, 0, 0),
  })
  yPosition -= 25

  // Add company details
  for (const line of companyLines) {
    if (yPosition < margin + 100) {
      page = pdf.addPage([pageWidth, pageHeight])
      yPosition = pageHeight - margin
    }
    page.drawText(line, {
      x: margin,
      y: yPosition,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    })
    yPosition -= 10
  }

  yPosition -= 10

  // Add filter info
  for (const line of filterLines) {
    if (yPosition < margin + 100) {
      page = pdf.addPage([pageWidth, pageHeight])
      yPosition = pageHeight - margin
    }
    page.drawText(line, {
      x: margin,
      y: yPosition,
      size: 7,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    })
    yPosition -= 10
  }

  yPosition -= 15

  // Add headers
  const headerHeight = 20
  if (yPosition < margin + 150) {
    page = pdf.addPage([pageWidth, pageHeight])
    yPosition = pageHeight - margin
  }

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]
    page.drawText(col.title, {
      x: col.x,
      y: yPosition - headerHeight / 2,
      size: 8,
      font: bold,
      color: rgb(1, 1, 1),
    })
  }

  // Header background
  page.drawRectangle({
    x: margin,
    y: yPosition - headerHeight,
    width: usableWidth,
    height: headerHeight,
    color: rgb(0.92, 0.93, 0.96),
    opacity: 0.5,
  })

  yPosition -= headerHeight + 10

  // Add data rows
  const rowHeight = 14
  for (const row of config.rows) {
    if (yPosition < margin + 50) {
      page = pdf.addPage([pageWidth, pageHeight])
      yPosition = pageHeight - margin

      // Re-add headers on new page
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        page.drawText(col.title, {
          x: col.x,
          y: yPosition - headerHeight / 2,
          size: 8,
          font: bold,
          color: rgb(1, 1, 1),
        })
      }
      page.drawRectangle({
        x: margin,
        y: yPosition - headerHeight,
        width: usableWidth,
        height: headerHeight,
        color: rgb(0.92, 0.93, 0.96),
        opacity: 0.5,
      })
      yPosition -= headerHeight + 10
    }

    for (let i = 0; i < row.length; i++) {
      const col = columns[i]
      const cellText = pdfSafeText(row[i])
      page.drawText(cellText, {
        x: col.x,
        y: yPosition - rowHeight / 2,
        size: 7,
        font: regular,
        color: rgb(0, 0, 0),
      })
    }
    yPosition -= rowHeight
  }

  // Add watermark to all pages
  for (let i = 0; i < pdf.getPageCount(); i++) {
    const pageToWatermark = pdf.getPage(i)
    pageToWatermark.drawText("COMPANY CONFIDENTIAL", {
      x: pageWidth / 2 - 150,
      y: pageHeight / 2,
      size: 60,
      font: bold,
      angle: degrees(-45),
      opacity: 0.1,
      color: rgb(0.5, 0.5, 0.5),
    })
  }

  // Save and download
  const pdfBytes = await pdf.save()
  const blob = new Blob([pdfBytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  const fileDate = exportDate.toISOString().slice(0, 10)
  anchor.download = `${config.fileName}-${fileDate}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
