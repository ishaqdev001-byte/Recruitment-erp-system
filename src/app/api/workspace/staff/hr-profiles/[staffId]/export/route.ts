import { fileTypeFromBuffer } from "file-type"
import { NextResponse } from "next/server"
import {
  degrees,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib"
import type { SupabaseClient } from "@supabase/supabase-js"
import { getCompanyChairmanHrAccess } from "@/lib/server/hr-profiles"
import { downloadCompanyDriveFile } from "@/lib/storage/interserver"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }
const pageSize: [number, number] = [612, 792]
const profilePhotoBucket = "profile-photos"
const maxPhotoSize = 5 * 1024 * 1024

type ExportCompany = {
  name: string
  logo_url: string | null
  registration_number: string | null
  office_address: string | null
  city: string | null
  country: string | null
  phone: string | null
  email: string | null
  website: string | null
}

function safeText(value: unknown, limit = 1200) {
  if (value === null || value === undefined || value === "") return "Not provided"
  return String(value)
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit)
}

function wrapText(value: string, font: PDFFont, size: number, width: number) {
  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && font.widthOfTextAtSize(candidate, size) > width) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ["Not provided"]
}

function asRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : []
}

async function embedCompanyLogo(pdf: PDFDocument, value: string | null) {
  if (!value) return null
  const inlineImage = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
    value,
  )
  let mimeType: "image/png" | "image/jpeg"
  let bytes: Buffer
  if (inlineImage) {
    mimeType = inlineImage[1] === "png" ? "image/png" : "image/jpeg"
    bytes = Buffer.from(inlineImage[2], "base64")
  } else {
    const logoUrl = new URL(value)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl || logoUrl.origin !== new URL(supabaseUrl).origin) {
      throw new Error("The company logo is not available from approved storage.")
    }
    const response = await fetch(logoUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(3000),
    })
    const contentType = response.headers.get("content-type")?.split(";")[0]
    if (
      !response.ok ||
      (contentType !== "image/png" && contentType !== "image/jpeg")
    ) {
      throw new Error("The company logo could not be loaded.")
    }
    const imageBytes = await response.arrayBuffer()
    if (imageBytes.byteLength > 2_000_000) {
      throw new Error("The company logo is too large to include in the report.")
    }
    mimeType = contentType
    bytes = Buffer.from(imageBytes)
  }
  if (!bytes.byteLength || bytes.byteLength > 2_000_000) {
    throw new Error("The company logo is too large or invalid.")
  }
  const detectedType = await fileTypeFromBuffer(bytes)
  if (detectedType?.mime !== mimeType) {
    throw new Error("The company logo format is invalid.")
  }
  return mimeType === "image/png"
    ? pdf.embedPng(bytes)
    : pdf.embedJpg(bytes)
}

async function embedProfilePhoto(
  pdf: PDFDocument,
  admin: SupabaseClient,
  linkedUserId: string | null,
  hasProfilePhoto: boolean,
  override: FormDataEntryValue | null,
) {
  if (!hasProfilePhoto || !linkedUserId) return null
  const { data: photo, error: photoError } = await admin.storage
    .from(profilePhotoBucket)
    .download(`${linkedUserId}/avatar`)
  if (photoError || !photo) {
    console.error("Chairman HR export profile photo download failed:", photoError)
    throw new Error("The staff member's profile photo could not be loaded.")
  }

  const originalBytes = Buffer.from(await photo.arrayBuffer())
  if (originalBytes.byteLength > maxPhotoSize) {
    throw new Error("The staff member's profile photo is too large.")
  }
  const detectedType = await fileTypeFromBuffer(originalBytes)
  let bytes = originalBytes
  let mimeType = detectedType?.mime

  if (mimeType === "image/webp") {
    if (!(override instanceof File)) {
      throw new Error("The profile photo could not be prepared for PDF export.")
    }
    bytes = Buffer.from(await override.arrayBuffer())
    if (bytes.byteLength > maxPhotoSize) {
      throw new Error("The prepared profile photo is too large.")
    }
    const convertedType = await fileTypeFromBuffer(bytes)
    if (convertedType?.mime !== "image/png") {
      throw new Error("The prepared profile photo must be a PNG image.")
    }
    mimeType = convertedType.mime
  } else if (override instanceof File) {
    throw new Error("The supplied photo does not match the stored profile photo.")
  }

  if (mimeType === "image/png") return pdf.embedPng(bytes)
  if (mimeType === "image/jpeg") return pdf.embedJpg(bytes)
  throw new Error("The staff member's profile photo format is not supported.")
}

export async function POST(
  request: Request,
  context: { params: Promise<{ staffId: string }> },
) {
  const access = await getCompanyChairmanHrAccess(
    new URL(request.url).searchParams.get("companyId"),
  )
  if ("error" in access) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status, headers: responseHeaders },
    )
  }

  const { staffId } = await context.params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(staffId)) {
    return NextResponse.json(
      { error: "HR profile not found." },
      { status: 404, headers: responseHeaders },
    )
  }

  try {
    const formData = await request.formData()
    const photoOverride = formData.get("photo")
    if (photoOverride !== null && !(photoOverride instanceof File)) {
      return NextResponse.json(
        { error: "The profile photo upload is invalid." },
        { status: 400, headers: responseHeaders },
      )
    }

    const { data: staff, error: staffError } = await access.admin
      .from("company_staff_members")
      .select(
        "id, staff_id, name, position, phone, status, date_joined, date_of_birth, sex, marital_status, local_address, permanent_address, next_of_kin, next_of_kin_phone, emergency_contact_address, passport_number, passport_expiry, national_id_number, national_id_expiry, academic_qualifications, professional_qualifications, work_experience, languages, has_criminal_record, criminal_case_type, criminal_case_year, criminal_case_status, bio, branch_id, line_manager_staff_id, linked_user_id",
      )
      .eq("company_id", access.companyId)
      .eq("id", staffId)
      .eq("status", "Active")
      .maybeSingle()
    if (staffError) throw staffError
    if (!staff) {
      return NextResponse.json(
        { error: "Active staff HR profile not found." },
        { status: 404, headers: responseHeaders },
      )
    }

    const [
      { data: company, error: companyError },
      { data: branch, error: branchError },
      { data: manager, error: managerError },
      { data: profile, error: profileError },
      { data: documents, error: documentsError },
      { data: paychecks, error: paychecksError },
      { data: extractorProfile, error: extractorProfileError },
    ] = await Promise.all([
      access.admin
        .from("companies")
        .select(
          "name, logo_url, registration_number, office_address, city, country, phone, email, website",
        )
        .eq("id", access.companyId)
        .maybeSingle(),
      staff.branch_id
        ? access.admin
            .from("company_branches")
            .select("name")
            .eq("company_id", access.companyId)
            .eq("id", staff.branch_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      staff.line_manager_staff_id
        ? access.admin
            .from("company_staff_members")
            .select("staff_id, name")
            .eq("company_id", access.companyId)
            .eq("id", staff.line_manager_staff_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      staff.linked_user_id
        ? access.admin
            .from("profiles")
            .select("avatar_url")
            .eq("id", staff.linked_user_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      access.admin
        .from("company_staff_documents")
        .select("document_type, file_name, file_size, created_at")
        .eq("company_id", access.companyId)
        .eq("staff_member_id", staff.id)
        .order("created_at", { ascending: false }),
      access.admin
        .from("company_staff_paychecks")
        .select(
          "id, pay_period, payment_date, payment_reference, net_amount, payslip_path",
        )
        .eq("company_id", access.companyId)
        .eq("staff_member_id", staff.id)
        .order("pay_period", { ascending: false })
        .order("payment_date", { ascending: false }),
      access.admin
        .from("profiles")
        .select("display_name")
        .eq("id", access.userId)
        .maybeSingle(),
    ])
    if (
      companyError ||
      branchError ||
      managerError ||
      profileError ||
      documentsError ||
      paychecksError ||
      extractorProfileError
    ) {
      throw (
        companyError ??
        branchError ??
        managerError ??
        profileError ??
        documentsError ??
        paychecksError ??
        extractorProfileError
      )
    }
    if (!company) throw new Error("Company details are unavailable.")

    const roleResult = access.roleId
      ? await access.admin
          .from("company_roles")
          .select("name")
          .eq("company_id", access.companyId)
          .eq("id", access.roleId)
          .maybeSingle()
      : { data: null, error: null }
    if (roleResult.error) throw roleResult.error

    const companyInfo = company as ExportCompany
    const pdf = await PDFDocument.create()
    const regular = await pdf.embedFont(StandardFonts.Helvetica)
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
    const logo = await embedCompanyLogo(pdf, companyInfo.logo_url)
    const profilePhoto = await embedProfilePhoto(
      pdf,
      access.admin,
      staff.linked_user_id,
      Boolean(profile?.avatar_url),
      photoOverride,
    )
    pdf.setTitle(`HR profile ${staff.staff_id}`)
    pdf.setAuthor(companyInfo.name || "Company")
    pdf.setSubject(`Staff HR profile for ${staff.name}`)

    const location = [
      companyInfo.office_address,
      companyInfo.city,
      companyInfo.country,
    ]
      .filter(Boolean)
      .join(", ")
    const companyLines = [
      companyInfo.registration_number
        ? `Registration: ${companyInfo.registration_number}`
        : "",
      location,
      companyInfo.phone ? `Phone: ${companyInfo.phone}` : "",
      companyInfo.email ? `Email: ${companyInfo.email}` : "",
      companyInfo.website ? `Website: ${companyInfo.website}` : "",
    ].filter(Boolean)
    const muted = rgb(0.37, 0.42, 0.47)
    const dark = rgb(0.12, 0.16, 0.2)
    let page = pdf.addPage(pageSize)
    let y = 660
    const drawCompanyHeader = (target: PDFPage) => {
      if (logo) {
        const dimensions = logo.scale(
          Math.min(1, 62 / logo.width, 48 / logo.height),
        )
        target.drawImage(logo, {
          x: 40,
          y: 731,
          width: dimensions.width,
          height: dimensions.height,
        })
      }
      target.drawText(safeText(companyInfo.name, 120), {
        x: 116,
        y: 758,
        size: 15,
        font: bold,
        color: dark,
        maxWidth: 450,
      })
      const shortInfo = companyLines.join(" | ")
      const shortInfoLines = wrapText(shortInfo || "Company information", regular, 7, 450)
      shortInfoLines.slice(0, 3).forEach((line, index) => {
        target.drawText(line, {
          x: 116,
          y: 743 - index * 10,
          size: 7,
          font: regular,
          color: muted,
        })
      })
      target.drawLine({
        start: { x: 40, y: 718 },
        end: { x: 572, y: 718 },
        thickness: 0.8,
        color: rgb(0.78, 0.82, 0.86),
      })
      target.drawText("STAFF HR PROFILE", {
        x: 40,
        y: 695,
        size: 12,
        font: bold,
        color: dark,
      })
    }
    drawCompanyHeader(page)

    if (profilePhoto) {
      const dimensions = profilePhoto.scale(
        Math.min(1, 135 / profilePhoto.width, 165 / profilePhoto.height),
      )
      page.drawImage(profilePhoto, {
        x: 40,
        y: 480,
        width: dimensions.width,
        height: dimensions.height,
      })
    } else {
      page.drawText("No profile photo uploaded", {
        x: 40,
        y: 590,
        size: 9,
        font: regular,
        color: muted,
      })
    }

    const summary = [
      ["Full name", staff.name],
      ["Staff ID", staff.staff_id],
      ["Position", staff.position],
      ["Branch", branch?.name ?? "Unassigned"],
      [
        "Line manager",
        manager ? `${manager.staff_id} — ${manager.name}` : "Not assigned",
      ],
      ["Phone", staff.phone],
      ["Date joined", staff.date_joined],
    ]
    summary.forEach(([label, value], index) => {
      page.drawText(`${label}: ${safeText(value)}`, {
        x: 205,
        y: 665 - index * 20,
        size: 9,
        font: index < 3 ? bold : regular,
        color: dark,
        maxWidth: 350,
      })
    })
    y = 455

    const addReportPage = () => {
      page = pdf.addPage(pageSize)
      drawCompanyHeader(page)
      y = 670
    }
    const addSection = (title: string) => {
      if (y < 78) addReportPage()
      y -= 3
      page.drawText(safeText(title, 100), {
        x: 40,
        y,
        size: 10,
        font: bold,
        color: rgb(0.05, 0.43, 0.48),
      })
      y -= 16
    }
    const addField = (label: string, value: unknown) => {
      const lines = wrapText(
        `${label}: ${safeText(value)}`,
        regular,
        8,
        532,
      )
      for (const line of lines) {
        if (y < 52) addReportPage()
        page.drawText(line, {
          x: 40,
          y,
          size: 8,
          font: regular,
          color: dark,
        })
        y -= 11
      }
      y -= 2
    }

    addSection("Company information")
    addField("Company name", companyInfo.name)
    addField("Registration", companyInfo.registration_number)
    addField("Location", location)
    addField("Contact phone", companyInfo.phone)
    addField("Contact email", companyInfo.email)
    addField("Website", companyInfo.website)

    addSection("Employment and personal details")
    addField("Employment status", staff.status)
    addField("Date of birth", staff.date_of_birth)
    addField("Sex", staff.sex)
    addField("Marital status", staff.marital_status)
    addField("Local address", staff.local_address)
    addField("Permanent address", staff.permanent_address)
    addField("Next of kin", staff.next_of_kin)
    addField("Next-of-kin phone", staff.next_of_kin_phone)
    addField("Emergency contact address", staff.emergency_contact_address)

    addSection("Identification")
    addField("Passport number", staff.passport_number)
    addField("Passport expiry", staff.passport_expiry)
    addField("National ID number", staff.national_id_number)
    addField("National ID expiry", staff.national_id_expiry)
    addField(
      "Criminal record declared",
      staff.has_criminal_record ? "Yes" : "No",
    )
    addField("Criminal case type", staff.criminal_case_type)
    addField("Criminal case year", staff.criminal_case_year)
    addField("Criminal case status", staff.criminal_case_status)
    addField("Languages", Array.isArray(staff.languages) ? staff.languages.join(", ") : "")
    addField("Staff bio", staff.bio)

    addSection("Academic qualifications")
    const academicQualifications = asRecords(staff.academic_qualifications)
    if (!academicQualifications.length) addField("Qualifications", "None provided")
    academicQualifications.forEach((item, index) =>
      addField(
        `Qualification ${index + 1}`,
        `${safeText(item.qualification)} · ${safeText(item.institution)} · ${safeText(item.year)}`,
      ),
    )

    addSection("Professional qualifications")
    const professionalQualifications = asRecords(
      staff.professional_qualifications,
    )
    if (!professionalQualifications.length) addField("Qualifications", "None provided")
    professionalQualifications.forEach((item, index) =>
      addField(
        `Qualification ${index + 1}`,
        `${safeText(item.qualification)} · ${safeText(item.institution)} · ${safeText(item.year)}`,
      ),
    )

    addSection("Employment experience")
    const workExperience = asRecords(staff.work_experience)
    if (!workExperience.length) addField("Experience", "None provided")
    workExperience.forEach((item, index) =>
      addField(
        `Experience ${index + 1}`,
        [
          item.position,
          item.employer,
          item.location,
          item.startDate,
          item.endDate,
          item.responsibilities,
        ]
          .map((value) => safeText(value))
          .join(" · "),
      ),
    )

    addSection("Personal documents")
    if (!documents?.length) addField("Documents", "None uploaded")
    for (const document of documents ?? []) {
      addField(
        document.document_type.replace(/_/g, " "),
        `${document.file_name} (${(document.file_size / 1024 / 1024).toFixed(2)} MB)`,
      )
    }

    addSection("Previous monthly paychecks")
    if (!paychecks?.length) addField("Paychecks", "No captured payslips")
    for (const paycheck of paychecks ?? []) {
      addField(
        `${String(paycheck.pay_period).slice(0, 7)} paycheck`,
        `Number ${paycheck.payment_reference || "—"} · Payslip ID ${paycheck.id} · Payment date ${paycheck.payment_date || "—"} · Net pay UGX ${Number(paycheck.net_amount).toLocaleString("en-UG")}`,
      )
    }

    for (const paycheck of paychecks ?? []) {
      if (!paycheck.payslip_path) {
        throw new Error(
          `The saved payslip for ${String(paycheck.pay_period).slice(0, 7)} is unavailable.`,
        )
      }
      const payslipBytes = await downloadCompanyDriveFile(paycheck.payslip_path)
      const payslipPdf = await PDFDocument.load(payslipBytes)
      const pages = await pdf.copyPages(payslipPdf, payslipPdf.getPageIndices())
      pages.forEach((payslipPage) => pdf.addPage(payslipPage))
    }

    const extractedBy = safeText(
      extractorProfile?.display_name || "Company Chairman",
      80,
    )
    const extractorPosition = safeText(roleResult.data?.name || "Chairman", 60)
    const staffIdentity = `${safeText(staff.name, 80)} · ${safeText(staff.position, 60)}`
    const pages = pdf.getPages()
    pages.forEach((target, index) => {
      const { width, height } = target.getSize()
      target.drawText(safeText(companyInfo.name, 50), {
        x: Math.max(50, width * 0.16),
        y: height * 0.45,
        size: Math.min(30, width * 0.05),
        font: bold,
        color: rgb(0.89, 0.91, 0.93),
        opacity: 0.32,
        rotate: degrees(35),
        maxWidth: width * 0.7,
      })
      target.drawText(
        `Extracted by ${extractedBy}, ${extractorPosition} | Record: ${staffIdentity} | Page ${index + 1} of ${pages.length}`,
        {
          x: 40,
          y: 22,
          size: 6,
          font: regular,
          color: muted,
          maxWidth: width - 80,
        },
      )
    })

    const file = new Uint8Array(await pdf.save())
    const safeStaffId = String(staff.staff_id).replace(/[^a-zA-Z0-9._-]/g, "-")
    return new Response(file, {
      headers: {
        ...responseHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="hr-profile-${safeStaffId}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Chairman HR profile export failed:", error)
    return NextResponse.json(
      { error: "Unable to export this HR profile and payslips." },
      { status: 503, headers: responseHeaders },
    )
  }
}
