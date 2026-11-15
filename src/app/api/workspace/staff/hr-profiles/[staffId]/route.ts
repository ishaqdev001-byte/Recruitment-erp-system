import { NextResponse } from "next/server"

import { getCompanyChairmanHrAccess } from "@/lib/server/hr-profiles"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

export async function GET(
  request: Request,
  context: { params: Promise<{ staffId: string }> },
) {
  const companyId = new URL(request.url).searchParams.get("companyId")
  const access = await getCompanyChairmanHrAccess(
    companyId,
  )

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, {
      status: access.status,
      headers,
    })
  }

  const { staffId } = await context.params

  const { data: staff, error: staffError } = await access.admin

    .from("company_staff_members")

    .select(
      "id, staff_id, name, position, phone, status, date_joined, date_of_birth, sex, local_address, permanent_address, next_of_kin, next_of_kin_phone, emergency_contact_address, passport_number, passport_expiry, national_id_number, national_id_expiry, academic_qualifications, professional_qualifications, work_experience, languages, has_criminal_record, criminal_case_type, criminal_case_year, criminal_case_status, marital_status, bio, branch_id, linked_user_id, line_manager_staff_id",
    )

    .eq("company_id", access.companyId)

    .eq("id", staffId)

    .eq("status", "Active")

    .maybeSingle()

  if (staffError) {
    console.error("Chairman HR profile query failed:", staffError)

    return NextResponse.json({ error: "Unable to load this HR profile." }, {
      status: 503,
      headers,
    })
  }

  if (!staff) {
    return NextResponse.json({ error: "HR profile not found." }, {
      status: 404,
      headers,
    })
  }

  const photoOnly = new URL(request.url).searchParams.get("photo") === "1"
  if (photoOnly) {
    if (!staff.linked_user_id) {
      return new Response("Profile photo not found.", { status: 404, headers })
    }

    const { data: profile, error: profileError } = await access.admin
      .from("profiles")
      .select("avatar_url")
      .eq("id", staff.linked_user_id)
      .maybeSingle()
    if (profileError) {
      console.error("Chairman HR profile photo lookup failed:", profileError)
      return new Response("Unable to load profile photo.", { status: 503, headers })
    }
    if (!profile?.avatar_url) {
      return new Response("Profile photo not found.", { status: 404, headers })
    }

    const { data: photo, error: photoError } = await access.admin.storage
      .from("profile-photos")
      .download(`${staff.linked_user_id}/avatar`)
    if (photoError || !photo) {
      console.error("Chairman HR profile photo download failed:", photoError)
      return new Response("Unable to load profile photo.", { status: 503, headers })
    }

    return new Response(photo, {
      headers: {
        ...headers,
        "Content-Type": photo.type || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

  const [
    { data: branch, error: branchError },
    { data: lineManager, error: managerError },
    { data: documents, error: documentsError },
    { data: profile, error: profileError },
    { data: payslips, error: payslipsError },
  ] = await Promise.all([
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

    access.admin
      .from("company_staff_documents")

      .select(
        "id, document_type, file_name, file_type, mime_type, file_size, created_at",
      )

      .eq("company_id", access.companyId)

      .eq("staff_member_id", staff.id)

      .order("created_at", { ascending: false }),

    staff.linked_user_id
      ? access.admin
          .from("profiles")
          .select("avatar_url")
          .eq("id", staff.linked_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    access.admin
      .from("company_staff_paychecks")
      .select("id, pay_period, payment_date, payment_reference, net_amount")
      .eq("company_id", access.companyId)
      .eq("staff_member_id", staff.id)
      .order("pay_period", { ascending: false })
      .order("payment_date", { ascending: false }),
  ])

  if (
    branchError ||
    managerError ||
    documentsError ||
    profileError ||
    payslipsError
  ) {
    console.error(
      "Chairman HR profile related-data query failed:",
      branchError ??
        managerError ??
        documentsError ??
        profileError ??
        payslipsError,
    )

    return NextResponse.json({ error: "Unable to load HR profile details." }, {
      status: 503,
      headers,
    })
  }

  const publicStaff = { ...staff }
  delete publicStaff.linked_user_id
  delete publicStaff.line_manager_staff_id

  return NextResponse.json(
    {
      staff: publicStaff,
      branchName: branch?.name ?? "Unassigned",
      lineManagerName: lineManager
        ? `${lineManager.staff_id} — ${lineManager.name}`
        : "Not assigned",
      profilePhotoUrl: profile?.avatar_url
        ? `/api/workspace/staff/hr-profiles/${encodeURIComponent(staff.id)}?companyId=${encodeURIComponent(access.companyId)}&photo=1`
        : null,
      payslips: (payslips ?? []).map((payslip) => ({
        ...payslip,
        payslipUrl: `/api/paychecks/${encodeURIComponent(payslip.id)}/payslip`,
      })),
      documents: documents ?? [],
    },
    { headers },
  )
}
