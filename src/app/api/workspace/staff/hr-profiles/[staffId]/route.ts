import { NextResponse } from "next/server"

import { getCompanyChairmanHrAccess } from "@/lib/server/hr-profiles"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

export async function GET(
  request: Request,
  context: { params: Promise<{ staffId: string }> },
) {
  const access = await getCompanyChairmanHrAccess(
    new URL(request.url).searchParams.get("companyId"),
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
      "id, staff_id, name, position, phone, status, date_joined, date_of_birth, sex, local_address, permanent_address, next_of_kin, next_of_kin_phone, emergency_contact_address, passport_number, passport_expiry, national_id_number, national_id_expiry, academic_qualifications, professional_qualifications, work_experience, languages, has_criminal_record, criminal_case_type, criminal_case_year, criminal_case_status, marital_status, bio, branch_id",
    )

    .eq("company_id", access.companyId)

    .eq("id", staffId)

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

  const [
    { data: branch, error: branchError },
    { data: documents, error: documentsError },
  ] = await Promise.all([
    staff.branch_id
      ? access.admin
          .from("company_branches")

          .select("name")

          .eq("company_id", access.companyId)

          .eq("id", staff.branch_id)

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
  ])

  if (branchError || documentsError) {
    console.error(
      "Chairman HR profile related-data query failed:",
      branchError ?? documentsError,
    )

    return NextResponse.json({ error: "Unable to load HR profile details." }, {
      status: 503,
      headers,
    })
  }

  return NextResponse.json(
    {
      staff,
      branchName: branch?.name ?? "Unassigned",
      documents: documents ?? [],
    },
    { headers },
  )
}
