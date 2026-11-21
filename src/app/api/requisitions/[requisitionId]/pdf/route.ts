import { NextResponse } from "next/server"

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

const pageWidth = 595.28

const pageHeight = 841.89

const margin = 48

const bottomMargin = 48

type DocumentAction = {
  label: string

  actor: string

  role: string

  action: string

  date: string | null

  notes: string
}

function cleanText(value: unknown) {
  return String(value ?? "")

    .replace(/[^\x20-\x7E]/g, " ")

    .trim()
}

function wrapText(
  value: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const words = cleanText(value).split(/\s+/).filter(Boolean)

  const lines: string[] = []

  let line = ""

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word

    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line)

      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)

  return lines.length ? lines : ["-"]
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"

  const date = new Date(value)

  return Number.isNaN(date.valueOf())
    ? cleanText(value)
    : date.toLocaleString("en-GB")
}

function formatAmount(value: number, currency: string) {
  return `${cleanText(currency) || "UGX"} ${Number(value || 0).toLocaleString(
    "en-UG",

    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`
}

async function embedLogo(
  pdf: PDFDocument,
  value: string,
): Promise<PDFImage | null> {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value)

  try {
    let mimeType: "image/png" | "image/jpeg"

    let bytes: Buffer

    if (match) {
      mimeType = match[1] === "png" ? "image/png" : "image/jpeg"

      bytes = Buffer.from(match[2], "base64")
    } else {
      const logoUrl = new URL(value)

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

      if (!supabaseUrl || logoUrl.origin !== new URL(supabaseUrl).origin)
        return null

      const response = await fetch(logoUrl, {
        redirect: "error",

        signal: AbortSignal.timeout(3000),
      })

      const contentType = response.headers.get("content-type")?.split(";")[0]

      const contentLength = Number(response.headers.get("content-length") ?? 0)

      if (
        !response.ok ||
        (contentType !== "image/png" && contentType !== "image/jpeg") ||
        contentLength > 2_000_000
      )
        return null

      const data = await response.arrayBuffer()

      if (data.byteLength > 2_000_000) return null

      mimeType = contentType

      bytes = Buffer.from(data)
    }

    if (bytes.byteLength > 2_000_000) return null

    return mimeType === "image/png"
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes)
  } catch {
    return null
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  )
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key
    ? createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null
}

export async function GET(
  request: Request,

  { params }: { params: Promise<{ requisitionId: string }> },
) {
  try {
    const { requisitionId } = await params

    if (!isUuid(requisitionId))
      return NextResponse.json(
        { error: "Provide a valid requisition ID." },

        { status: 400, headers: responseHeaders },
      )

    const supabase = await createSupabaseServerClient()

    const {
      data: { user },

      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user)
      return NextResponse.json(
        { error: "Authentication required." },

        { status: 401, headers: responseHeaders },
      )

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership)
      return NextResponse.json(
        { error: "Active company membership not found." },

        { status: 403, headers: responseHeaders },
      )

    const { data: canView, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",

      {
        requested_company_id: membership.company_id,

        requested_permission: "requisitions.view",
      },
    )

    if (permissionError) {
      console.error("Requisition PDF permission check failed", permissionError)

      return NextResponse.json(
        { error: "Unable to verify requisition permissions." },

        { status: 503, headers: responseHeaders },
      )
    }

    if (!canView)
      return NextResponse.json(
        { error: "You do not have permission to view requisitions." },
        { status: 403, headers: responseHeaders },
      )

    const admin = createAdminClient()
    if (!admin) {
      console.error(
        "Requisition PDF audit lookup requires the service role client.",
      )
      return NextResponse.json(
        { error: "Requisition document service is not configured." },
        { status: 503, headers: responseHeaders },
      )
    }

    const { data: requisition, error: requisitionError } = await supabase

      .from("company_requisitions")

      .select(`
        id, requisition_number, title, department_name, currency_code,
        expense_category_name, service_provider_name, due_date, notes,
        total_amount, amount_paid, payment_status, status, created_by,
        created_at, source_expense_request_id, source_expense_request_number,
        requested_by_user_id, requested_by_name, initiated_by_user_id, initiated_at
      `)

      .eq("id", requisitionId)

      .eq("company_id", membership.company_id)

      .maybeSingle()

    if (requisitionError) {
      console.error("Requisition PDF lookup failed", requisitionError)

      return NextResponse.json(
        { error: "Unable to load requisition details." },

        { status: 503, headers: responseHeaders },
      )
    }

    if (!requisition)
      return NextResponse.json(
        { error: "Requisition not found." },

        { status: 404, headers: responseHeaders },
      )

    if (
      requisition.status !== "approved" ||
      requisition.payment_status !== "paid" ||
      Number(requisition.amount_paid) < Number(requisition.total_amount)
    )
      return NextResponse.json(
        { error: "The requisition PDF is available only after full payment." },

        { status: 409, headers: responseHeaders },
      )

    const [
      companyResult,

      itemsResult,

      paymentsResult,

      creatorProfileResult,

      currentProfileResult,

      sourceRequestResult,

      historyResult,
    ] = await Promise.all([
      supabase

        .from("companies")

        .select(
          "name, logo_url, registration_number, country, city, office_address, phone, email, website",
        )

        .eq("id", membership.company_id)

        .maybeSingle(),

      supabase

        .from("company_requisition_items")

        .select("id, description, quantity, rate, total_amount, sort_order")

        .eq("company_id", membership.company_id)

        .eq("requisition_id", requisitionId)

        .order("sort_order"),

      supabase

        .from("requisition_payments")

        .select("id, amount, payment_date, reference, notes, recorded_by")

        .eq("company_id", membership.company_id)

        .eq("requisition_id", requisitionId)

        .order("payment_date"),

      admin
        .from("profiles")

        .select("display_name")

        .eq("id", requisition.created_by)

        .maybeSingle(),

      admin
        .from("profiles")

        .select("display_name")

        .eq("id", user.id)

        .maybeSingle(),

      requisition.source_expense_request_id
        ? supabase

            .from("expense_requests")

            .select(`
              id, request_number, created_by, line_manager_user_id,
              line_manager_reviewed_at, general_manager_user_id,
              general_manager_reviewed_at, finance_user_id, finance_verified_at,
              chairman_user_id, chairman_authorized_at, cashout_user_id,
              cashed_out_at
            `)

            .eq("id", requisition.source_expense_request_id)

            .eq("company_id", membership.company_id)

            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),

      admin
        .from("approval_history")

        .select(
          "stage, action, actor_id, actor_name, actor_role, notes, created_at",
        )

        .eq("company_id", membership.company_id)

        .eq(
          "request_id",

          requisition.source_expense_request_id ?? requisitionId,
        )

        .eq(
          "request_type",
          requisition.source_expense_request_id ? "expense" : "requisition",
        )

        .order("created_at"),
    ])

    if (
      companyResult.error ||
      !companyResult.data ||
      itemsResult.error ||
      paymentsResult.error ||
      creatorProfileResult.error ||
      currentProfileResult.error ||
      sourceRequestResult.error ||
      historyResult.error
    ) {
      console.error("Requisition PDF data lookup failed", {
        company: companyResult.error,

        items: itemsResult.error,

        payments: paymentsResult.error,

        creator: creatorProfileResult.error,

        currentUser: currentProfileResult.error,

        expenseRequest: sourceRequestResult.error,

        history: historyResult.error,
      })

      return NextResponse.json(
        { error: "Unable to load all requisition document details." },

        { status: 503, headers: responseHeaders },
      )
    }

    const actorIds = new Set<string>()

    for (const id of [
      requisition.requested_by_user_id,

      requisition.initiated_by_user_id,

      user.id,

      ...(paymentsResult.data ?? []).map((payment) => payment.recorded_by),

      sourceRequestResult.data?.created_by,

      sourceRequestResult.data?.line_manager_user_id,

      sourceRequestResult.data?.general_manager_user_id,

      sourceRequestResult.data?.finance_user_id,

      sourceRequestResult.data?.chairman_user_id,

      sourceRequestResult.data?.cashout_user_id,

      ...(historyResult.data ?? []).map((entry) => entry.actor_id),
    ]) {
      if (typeof id === "string") actorIds.add(id)
    }

    const { data: actorProfiles, error: actorProfilesError } = actorIds.size
      ? await admin
          .from("profiles")

          .select("id, display_name")

          .in("id", [...actorIds])
      : { data: [], error: null }

    if (actorProfilesError) {
      console.error("Requisition PDF actor lookup failed", actorProfilesError)

      return NextResponse.json(
        { error: "Unable to load requisition action-taker names." },

        { status: 503, headers: responseHeaders },
      )
    }

    const actorNames = new Map(
      (actorProfiles ?? []).map((profile) => [
        profile.id,

        cleanText(profile.display_name),
      ]),
    )

    const getActorName = (id: string | null | undefined, fallback = "") =>
      (id ? actorNames.get(id) : "") || cleanText(fallback) || "Not recorded"

    const actions: DocumentAction[] = (historyResult.data ?? []).map(
      (entry) => ({
        label: cleanText(entry.stage).replace(/_/g, " "),

        actor: getActorName(entry.actor_id, entry.actor_name),

        role: cleanText(entry.actor_role),

        action: cleanText(entry.action),

        date: entry.created_at,

        notes: cleanText(entry.notes),
      }),
    )

    if (!actions.length && sourceRequestResult.data) {
      const source = sourceRequestResult.data

      const fallbackActions: Array<{
        label: string

        id: string | null

        date: string | null
      }> = [
        {
          label: "Line manager review",

          id: source.line_manager_user_id,

          date: source.line_manager_reviewed_at,
        },

        {
          label: "General Manager review",

          id: source.general_manager_user_id,

          date: source.general_manager_reviewed_at,
        },

        {
          label: "Finance verification",

          id: source.finance_user_id,

          date: source.finance_verified_at,
        },

        {
          label: "Chairman authorization",

          id: source.chairman_user_id,

          date: source.chairman_authorized_at,
        },

        {
          label: "Cash-out",

          id: source.cashout_user_id,

          date: source.cashed_out_at,
        },
      ]

      for (const action of fallbackActions) {
        if (action.date)
          actions.push({
            label: action.label,

            actor: getActorName(action.id),

            role: "",

            action: "completed",

            date: action.date,

            notes: "",
          })
      }
    }

    for (const payment of paymentsResult.data ?? []) {
      actions.push({
        label: "Payment recorded",

        actor: getActorName(payment.recorded_by),

        role: "",

        action: "paid",

        date: payment.payment_date,

        notes: payment.reference || payment.notes || "",
      })
    }

    const pdf = await PDFDocument.create()

    pdf.setTitle(`Requisition ${requisition.requisition_number}`)

    pdf.setAuthor(companyResult.data.name || "Company")

    pdf.setSubject(cleanText(requisition.title))

    const regular = await pdf.embedFont(StandardFonts.Helvetica)

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

    const dark = rgb(0.12, 0.16, 0.19)

    const muted = rgb(0.38, 0.43, 0.47)

    const accent = rgb(0.05, 0.43, 0.48)

    const lightRule = rgb(0.84, 0.87, 0.89)

    const company = companyResult.data

    const logo = await embedLogo(pdf, company.logo_url ?? "")

    let page: PDFPage = pdf.addPage([pageWidth, pageHeight])

    let y = pageHeight - margin

    const drawWatermark = (target: PDFPage) => {
      if (!logo) return

      const dimensions = logo.scaleToFit(230, 230)

      target.drawImage(logo, {
        x: (pageWidth - dimensions.width) / 2,

        y: (pageHeight - dimensions.height) / 2,

        width: dimensions.width,

        height: dimensions.height,

        opacity: 0.1,
      })
    }

    const addPage = () => {
      page = pdf.addPage([pageWidth, pageHeight])

      drawWatermark(page)

      y = pageHeight - margin
    }

    const ensureSpace = (height: number) => {
      if (y - height < bottomMargin) addPage()
    }

    const drawWrapped = (
      text: string,

      width: number,

      font = regular,

      size = 9,

      color = dark,

      lineGap = 4,
    ) => {
      const lines = wrapText(text, font, size, width)

      const lineHeight = size + lineGap

      ensureSpace(lines.length * lineHeight)

      for (const line of lines) {
        page.drawText(line, { x: margin, y, size, font, color })

        y -= lineHeight
      }
    }

    const drawSectionHeading = (label: string) => {
      ensureSpace(28)

      y -= 10

      page.drawText(cleanText(label).toUpperCase(), {
        x: margin,

        y,

        size: 9,

        font: bold,

        color: muted,
      })

      y -= 12

      page.drawLine({
        start: { x: margin, y },

        end: { x: pageWidth - margin, y },

        thickness: 0.6,

        color: lightRule,
      })

      y -= 12
    }

    drawWatermark(page)

    if (logo) {
      const dimensions = logo.scaleToFit(70, 58)

      page.drawImage(logo, {
        x: margin,

        y: y - dimensions.height,

        width: dimensions.width,

        height: dimensions.height,
      })
    }

    const companyLines = [
      company.registration_number
        ? `Registration: ${company.registration_number}`
        : "",

      [company.office_address, company.city, company.country]

        .filter(Boolean)

        .join(", "),

      company.phone,

      company.email,

      company.website,
    ].filter(Boolean)

    let companyY = y - 10

    page.drawText(cleanText(company.name || "Company"), {
      x: 132,

      y: companyY,

      size: 14,

      font: bold,

      color: dark,
    })

    companyY -= 17

    for (const line of companyLines) {
      const lines = wrapText(line, regular, 8, 320)

      for (const wrappedLine of lines) {
        page.drawText(wrappedLine, {
          x: 132,

          y: companyY,

          size: 8,

          font: regular,

          color: muted,
        })

        companyY -= 11
      }
    }

    page.drawText("REQUISITION", {
      x: 395,

      y: y - 10,

      size: 17,

      font: bold,

      color: accent,
    })

    page.drawText(cleanText(requisition.requisition_number), {
      x: 395,

      y: y - 29,

      size: 10,

      font: bold,

      color: dark,
    })

    page.drawText(`Generated: ${formatDate(new Date().toISOString())}`, {
      x: 395,

      y: y - 45,

      size: 8,

      font: regular,

      color: muted,
    })

    y = Math.min(companyY, y - 76) - 16

    page.drawLine({
      start: { x: margin, y },

      end: { x: pageWidth - margin, y },

      thickness: 1,

      color: lightRule,
    })

    y -= 20

    drawWrapped(
      cleanText(requisition.title),
      pageWidth - margin * 2,
      bold,
      15,
      dark,
      5,
    )

    drawWrapped(
      `Expense Request: ${cleanText(requisition.source_expense_request_number) || "-"}`,

      pageWidth - margin * 2,

      regular,

      9,

      muted,
    )

    drawWrapped(
      `Category: ${cleanText(requisition.expense_category_name) || "-"}    Department: ${cleanText(requisition.department_name) || "-"}    Provider: ${cleanText(requisition.service_provider_name) || "-"}`,

      pageWidth - margin * 2,
    )

    drawWrapped(
      `Due date: ${formatDate(requisition.due_date)}    Status: Fully paid    Currency: ${cleanText(requisition.currency_code) || "UGX"}`,

      pageWidth - margin * 2,
    )

    drawWrapped(
      `Total: ${formatAmount(Number(requisition.total_amount), requisition.currency_code)}    Paid: ${formatAmount(Number(requisition.amount_paid), requisition.currency_code)}`,

      pageWidth - margin * 2,

      bold,
    )

    drawSectionHeading("Requester and initiation")

    drawWrapped(
      `Requested by: ${cleanText(requisition.requested_by_name) || getActorName(requisition.requested_by_user_id, creatorProfileResult.data?.display_name)}`,

      pageWidth - margin * 2,

      bold,
    )

    drawWrapped(
      `Created by: ${getActorName(requisition.created_by, creatorProfileResult.data?.display_name)}    Submitted: ${formatDate(requisition.created_at)}`,

      pageWidth - margin * 2,
    )

    drawWrapped(
      `Initiated by: ${getActorName(requisition.initiated_by_user_id)}    Initiated: ${formatDate(requisition.initiated_at)}`,

      pageWidth - margin * 2,
    )

    y -= 1

    drawWrapped(
      "Requester signature: __________________________________    Date: ______________",
      pageWidth - margin * 2,
      regular,
      8,
      muted,
    )

    drawWrapped(
      "Initiator signature: ___________________________________    Date: ______________",
      pageWidth - margin * 2,
      regular,
      8,
      muted,
    )

    drawSectionHeading("Line items")

    const drawItemsHeader = () => {
      page.drawText("DESCRIPTION", {
        x: margin,
        y,
        size: 8,
        font: bold,
        color: muted,
      })

      page.drawText("QTY", { x: 350, y, size: 8, font: bold, color: muted })

      page.drawText("UNIT RATE", {
        x: 395,
        y,
        size: 8,
        font: bold,
        color: muted,
      })

      page.drawText("TOTAL", { x: 485, y, size: 8, font: bold, color: muted })

      y -= 12

      page.drawLine({
        start: { x: margin, y },

        end: { x: pageWidth - margin, y },

        thickness: 0.6,

        color: lightRule,
      })

      y -= 13
    }

    drawItemsHeader()

    for (const item of itemsResult.data ?? []) {
      const descriptionLines = wrapText(item.description, regular, 8, 285)

      const rowHeight = Math.max(14, descriptionLines.length * 11)

      if (y - rowHeight < bottomMargin + 10) {
        addPage()

        drawItemsHeader()
      }

      descriptionLines.forEach((line, index) =>
        page.drawText(line, {
          x: margin,

          y: y - index * 11,

          size: 8,

          font: regular,

          color: dark,
        }),
      )

      page.drawText(String(item.quantity), {
        x: 350,

        y,

        size: 8,

        font: regular,

        color: dark,
      })

      page.drawText(
        formatAmount(Number(item.rate), requisition.currency_code),
        {
          x: 395,

          y,

          size: 8,

          font: regular,

          color: dark,
        },
      )

      page.drawText(
        formatAmount(Number(item.total_amount), requisition.currency_code),

        { x: 485, y, size: 8, font: regular, color: dark },
      )

      y -= rowHeight + 4
    }

    if (requisition.notes) {
      drawSectionHeading("Notes")

      drawWrapped(cleanText(requisition.notes), pageWidth - margin * 2)
    }

    if (paymentsResult.data?.length) {
      drawSectionHeading("Payment history")

      for (const payment of paymentsResult.data) {
        drawWrapped(
          `${formatDate(payment.payment_date)}  |  ${formatAmount(Number(payment.amount), requisition.currency_code)}  |  Recorded by: ${getActorName(payment.recorded_by)}${
            payment.reference ? `  |  Ref: ${cleanText(payment.reference)}` : ""
          }`,

          pageWidth - margin * 2,

          regular,

          8,
        )

        if (payment.notes)
          drawWrapped(
            `Notes: ${cleanText(payment.notes)}`,
            pageWidth - margin * 2 - 12,
            regular,
            8,
            muted,
          )
      }
    }

    drawSectionHeading("Approval and action history")

    if (actions.length) {
      for (const action of actions) {
        const roleText = action.role ? ` (${action.role})` : ""

        drawWrapped(
          `${action.label}: ${action.actor}${roleText} — ${action.action} — ${formatDate(action.date)}`,

          pageWidth - margin * 2,

          bold,

          8,
        )

        if (action.notes)
          drawWrapped(
            `Comment: ${action.notes}`,
            pageWidth - margin * 2 - 12,
            regular,
            8,
            muted,
          )

        drawWrapped(
          "Signature: ________________________________________    Date: ______________",
          pageWidth - margin * 2,
          regular,
          8,
          muted,
        )
      }
    } else {
      drawWrapped(
        "No approval actor history is available for this requisition.",
        pageWidth - margin * 2,
        regular,
        8,
        muted,
      )
    }

    drawSectionHeading("Document record")

    const currentUserName = getActorName(
      user.id,

      currentProfileResult.data?.display_name || user.email || "",
    )

    drawWrapped(
      `Generated by: ${currentUserName}    Date: ${formatDate(new Date().toISOString())}`,

      pageWidth - margin * 2,

      bold,
    )

    drawWrapped(
      "Generated-by signature: ______________________________    Date: ______________",
      pageWidth - margin * 2,
      regular,
      8,
      muted,
    )

    const isPrintRequest =
      new URL(request.url).searchParams.get("print") === "1"

    if (isPrintRequest) {
      drawWrapped(
        `Printed by: ${currentUserName}    Print requested: ${formatDate(new Date().toISOString())}`,

        pageWidth - margin * 2,

        bold,
      )

      drawWrapped(
        "Printed-by signature: _______________________________    Date: ______________",
        pageWidth - margin * 2,
        regular,
        8,
        muted,
      )
    }

    const bytes = await pdf.save()

    const safeFilename =
      cleanText(requisition.requisition_number).replace(/[^\w.-]+/g, "_") ||
      requisitionId

    return new Response(new Uint8Array(bytes), {
      headers: {
        ...responseHeaders,

        "Content-Type": "application/pdf",

        "Content-Disposition": `${
          isPrintRequest ? "inline" : "attachment"
        }; filename="${safeFilename}.pdf"`,
      },
    })
  } catch (error) {
    console.error("Requisition PDF request failed", error)

    return NextResponse.json(
      { error: "Unable to generate requisition PDF." },

      { status: 503, headers: responseHeaders },
    )
  }
}
