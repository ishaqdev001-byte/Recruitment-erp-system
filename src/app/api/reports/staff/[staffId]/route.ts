import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const pageSize = 1000

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function loadAll<T>(
  queryPage: (
    from: number,

    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)

    if (error) throw error

    rows.push(...(data ?? []))

    if (!data || data.length < pageSize) return rows
  }
}

function displayStage(details: unknown) {
  if (
    details &&
    typeof details === "object" &&
    "stage" in details &&
    typeof details.stage === "string" &&
    details.stage.trim()
  ) {
    return details.stage.trim() === "Project Submission"
      ? "Submitted to Project"
      : details.stage.trim()
  }

  return "Registration"
}

export async function GET(
  _request: Request,

  context: { params: Promise<{ staffId: string }> },
) {
  try {
    const { staffId } = await context.params

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        staffId,
      )
    ) {
      return NextResponse.json({ error: "Staff member not found." }, {
        status: 404,

        headers,
      })
    }

    const supabase = await createSupabaseServerClient()

    const {
      data: { user },

      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,

        headers,
      })
    }

    const { data: membership, error: membershipError } = await supabase

      .from("company_memberships")

      .select("company_id, branch_id, role_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        {
          status: 403,

          headers,
        },
      )
    }

    const admin = createAdminClient()

    if (!admin) {
      return NextResponse.json(
        { error: "Staff case-handler reports are unavailable on this server." },

        { status: 503, headers },
      )
    }

    const [
      { data: company, error: companyError },

      { data: role, error: roleError },

      { data: canViewCandidates, error: candidatePermissionError },

      { data: canAssignCaseHandlers, error: handlerPermissionError },

      { data: canViewAllBranches, error: branchPermissionError },
    ] = await Promise.all([
      admin

        .from("companies")

        .select("primary_admin_user_id, case_handlers_enabled")

        .eq("id", membership.company_id)

        .maybeSingle(),

      admin

        .from("company_roles")

        .select("name")

        .eq("id", membership.role_id)

        .eq("company_id", membership.company_id)

        .maybeSingle(),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.view",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.case_handler.assign",
      }),

      supabase.rpc("current_user_is_main_branch_user", {
        requested_company_id: membership.company_id,
      }),
    ])

    if (
      companyError ||
      roleError ||
      candidatePermissionError ||
      handlerPermissionError ||
      branchPermissionError ||
      !company ||
      !role
    ) {
      console.error(
        "Staff case-handler access verification failed",

        companyError ??
          roleError ??
          candidatePermissionError ??
          handlerPermissionError ??
          branchPermissionError,
      )

      return NextResponse.json(
        { error: "Unable to verify staff case-handler access." },

        { status: 503, headers },
      )
    }

    if (!company.case_handlers_enabled) {
      return NextResponse.json(
        { error: "Case handlers are disabled for this company." },

        { status: 409, headers },
      )
    }

    const roleName = role.name.trim().toLocaleLowerCase()

    const isChairman =
      company.primary_admin_user_id === user.id ||
      roleName === "chairman" ||
      roleName === "company owner / primary administrator"

    if (!isChairman && (!canViewCandidates || !canAssignCaseHandlers)) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to view case-handler staff details.",
        },

        { status: 403, headers },
      )
    }

    const { data: staff, error: staffError } = await admin

      .from("company_staff_members")

      .select(
        "id, staff_id, name, position, phone, status, date_joined, date_of_birth, sex, marital_status, local_address, permanent_address, next_of_kin, next_of_kin_phone, emergency_contact_address, passport_number, passport_expiry, national_id_number, national_id_expiry, academic_qualifications, professional_qualifications, work_experience, languages, linked_user_id, branch_id",
      )

      .eq("company_id", membership.company_id)

      .eq("id", staffId)

      .eq("status", "Active")

      .maybeSingle()

    if (staffError) {
      console.error("Staff case-handler profile query failed", staffError)

      return NextResponse.json(
        { error: "Unable to load this staff member's KYC profile." },

        { status: 503, headers },
      )
    }

    if (!staff) {
      return NextResponse.json({ error: "Staff member not found." }, {
        status: 404,

        headers,
      })
    }

    if (
      !canViewAllBranches &&
      (!membership.branch_id || staff.branch_id !== membership.branch_id)
    ) {
      return NextResponse.json({ error: "Staff member not found." }, {
        status: 404,

        headers,
      })
    }

    const candidates = staff.linked_user_id
      ? await loadAll((from, to) =>
          admin

            .from("candidates")

            .select(
              "id, first_name, last_name, file_number, details, updated_at",
            )

            .eq("company_id", membership.company_id)

            .eq("case_handler_user_id", staff.linked_user_id!)

            .order("updated_at", { ascending: false })

            .order("id", { ascending: true })

            .range(from, to),
        )
      : []

    return NextResponse.json(
      {
        staff: {
          staffId: staff.staff_id,

          name: staff.name,

          position: staff.position,

          phone: staff.phone,

          dateJoined: staff.date_joined,

          dateOfBirth: staff.date_of_birth,

          sex: staff.sex,

          maritalStatus: staff.marital_status,

          localAddress: staff.local_address,

          permanentAddress: staff.permanent_address,

          nextOfKin: staff.next_of_kin,

          nextOfKinPhone: staff.next_of_kin_phone,

          emergencyContactAddress: staff.emergency_contact_address,

          passportNumber: staff.passport_number,

          passportExpiry: staff.passport_expiry,

          nationalIdNumber: staff.national_id_number,

          nationalIdExpiry: staff.national_id_expiry,

          academicQualifications: staff.academic_qualifications,

          professionalQualifications: staff.professional_qualifications,

          workExperience: staff.work_experience,

          languages: staff.languages,
        },

        candidates: candidates.map((candidate) => ({
          id: candidate.id,

          name: [candidate.first_name, candidate.last_name]
            .filter(Boolean)
            .join(" "),

          fileNumber: candidate.file_number,

          stage: displayStage(candidate.details),

          lastUpdatedAt: candidate.updated_at,
        })),
      },

      { headers },
    )
  } catch (error) {
    console.error("Staff case-handler report request failed", error)

    return NextResponse.json(
      { error: "Staff case-handler details are unavailable." },

      { status: 503, headers },
    )
  }
}
