import { NextResponse } from "next/server"

import { createClient } from "@supabase/supabase-js"

import {
  getWorkforceAccess,
  hasWorkforcePermission,
  isIsoDate,
} from "@/lib/server/workforce"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// GET /api/leave — list leave requests + balances for current user

export async function GET() {
  try {
    const access = await getWorkforceAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const [canViewTeam, canCreate, canManage] = await Promise.all([
      hasWorkforcePermission(access, "leave.view"),

      hasWorkforcePermission(access, "leave.create"),

      hasWorkforcePermission(access, "leave.manage"),
    ])

    const { data: canFinalize } = await access.supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: access.companyId,

        requested_permission: "leave.finalize",
      },
    )

    if (!canViewTeam && !canCreate && !canManage) {
      return NextResponse.json(
        { error: "You do not have permission to view leave requests." },
        { status: 403, headers: responseHeaders },
      )
    }

    const select = [
      "id",
      "employee_id",
      "leave_type",
      "leave_type_id",
      "start_date",
      "end_date",

      "days_count",
      "is_paid",
      "reason",
      "status",

      "supervisor_status",
      "supervisor_note",
      "supervisor_id",
      "supervisor_reviewed_at",

      "manager_status",
      "manager_note",
      "manager_id",
      "manager_reviewed_at",

      "final_status",
      "final_note",
      "final_reviewer_id",
      "final_reviewed_at",

      "review_note",
      "reviewed_by",
      "reviewed_at",
      "created_at",
    ].join(", ")

    const query = access.supabase

      .from("leave_requests")

      .select(select)

      .eq("company_id", access.companyId)

      .order("created_at", { ascending: false })

    const { data: rawRequests, error } = await query

    if (error) {
      console.error("Leave requests query failed", error)

      return NextResponse.json({ error: "Unable to load leave requests." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    const requests = (rawRequests ??
      []) as unknown as Array<Record<string, unknown>>

    const requestIds = requests.map((leaveRequest) => String(leaveRequest.id))

    const workflowResult = requestIds.length
      ? await access.supabase.rpc("get_company_approval_workflow_states", {
          requested_company_id: access.companyId,

          requested_workflow_key: "leave",

          requested_subject_ids: requestIds,
        })
      : { data: [], error: null }

    if (workflowResult.error) {
      console.error("Leave workflow lookup failed", workflowResult.error)

      return NextResponse.json(
        { error: "Unable to load leave approval workflows." },

        { status: 503, headers: responseHeaders },
      )
    }

    const workflowBySubject = new Map(
      (Array.isArray(workflowResult.data) ? workflowResult.data : []).map(
        (state: { subjectId: string }) => [state.subjectId, state],
      ),
    )

    // Resolve display names

    const allUserIds = new Set<string>()

    for (const req of requests) {
      if (req.employee_id) allUserIds.add(req.employee_id as string)

      if (req.supervisor_id) allUserIds.add(req.supervisor_id as string)

      if (req.manager_id) allUserIds.add(req.manager_id as string)

      if (req.final_reviewer_id) allUserIds.add(req.final_reviewer_id as string)
    }

    const { data: profiles } = allUserIds.size
      ? await access.supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", [...allUserIds])
      : { data: [] }

    const names = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name as string]),
    )

    const resolveName = (id: string | null | undefined) =>
      !id ? "" : id === access.userId ? "You" : names.get(id) || "Team member"

    // Load leave types for name resolution

    const { data: leaveTypes } = await access.supabase

      .from("company_leave_types")

      .select("id, name")

      .eq("company_id", access.companyId)

    const leaveTypeNames = new Map(
      (leaveTypes ?? []).map((lt) => [lt.id, lt.name as string]),
    )

    // Load balances for the current user

    const currentYear = new Date().getFullYear()

    const { data: balances } = await access.supabase

      .from("leave_balances")

      .select("leave_type_id, year, days_allocated, days_used")

      .eq("company_id", access.companyId)

      .eq("user_id", access.userId)

      .eq("year", currentYear)

    return NextResponse.json(
      {
        requests: requests.map((req) => ({
          ...req,

          leave_type_name: req.leave_type_id
            ? leaveTypeNames.get(req.leave_type_id as string) ||
              req.leave_type ||
              ""
            : req.leave_type || "",

          employee_name: resolveName(req.employee_id as string | null),

          supervisor_name: resolveName(req.supervisor_id as string | null),

          manager_name: resolveName(req.manager_id as string | null),

          final_reviewer_name: resolveName(
            req.final_reviewer_id as string | null,
          ),

          reviewer_name: resolveName(req.reviewed_by as string | null),

          approval_workflow: workflowBySubject.get(String(req.id)) ?? null,
        })),

        balances: balances ?? [],

        leaveTypes: leaveTypes ?? [],

        permissions: {
          canViewTeam,

          canCreate,

          canManage,

          canFinalize: Boolean(canFinalize),
        },
      },
      { headers: responseHeaders },
    )
  } catch (err) {
    console.error("Leave requests GET failed", err)

    return NextResponse.json({ error: "Leave management is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

// POST /api/leave — submit a new leave request

export async function POST(request: Request) {
  try {
    const access = await getWorkforceAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    if (!(await hasWorkforcePermission(access, "leave.create"))) {
      return NextResponse.json(
        { error: "You do not have permission to submit leave requests." },
        { status: 403, headers: responseHeaders },
      )
    }

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body)
      return NextResponse.json(
        { error: "Enter valid leave request details." },
        { status: 400, headers: responseHeaders },
      )

    const leaveTypeId =
      typeof body.leaveTypeId === "string" ? body.leaveTypeId.trim() : ""

    const startDate = body.startDate

    const endDate = body.endDate

    const reason = typeof body.reason === "string" ? body.reason.trim() : ""

    if (!isUuid(leaveTypeId))
      return NextResponse.json({ error: "Choose a valid leave type." }, {
        status: 400,
        headers: responseHeaders,
      })

    if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate)
      return NextResponse.json(
        {
          error:
            "Enter a valid date range (start date must be on or before end date).",
        },
        { status: 400, headers: responseHeaders },
      )

    if (!reason || reason.length > 2000)
      return NextResponse.json(
        { error: "Enter a reason (up to 2,000 characters)." },
        { status: 400, headers: responseHeaders },
      )

    // Verify the leave type exists and is active for this company

    const { data: leaveTypeRow } = await access.supabase

      .from("company_leave_types")

      .select("id, name, days_per_year")

      .eq("id", leaveTypeId)

      .eq("company_id", access.companyId)

      .eq("is_active", true)

      .maybeSingle()

    if (!leaveTypeRow)
      return NextResponse.json(
        { error: "The selected leave type is not available." },
        { status: 400, headers: responseHeaders },
      )

    const days =
      Math.floor(
        (Date.parse(`${endDate as string}T00:00:00Z`) -
          Date.parse(`${startDate as string}T00:00:00Z`)) /
          86400000,
      ) + 1

    // Check balance if one exists

    const year = new Date(`${startDate as string}T00:00:00Z`).getUTCFullYear()

    const { data: balance } = await access.supabase

      .from("leave_balances")

      .select("days_allocated, days_used")

      .eq("company_id", access.companyId)

      .eq("user_id", access.userId)

      .eq("leave_type_id", leaveTypeId)

      .eq("year", year)

      .maybeSingle()

    if (balance) {
      const remaining = balance.days_allocated - balance.days_used

      if (days > remaining) {
        return NextResponse.json(
          {
            error: `You only have ${remaining} day${
              remaining !== 1 ? "s" : ""
            } remaining for ${leaveTypeRow.name} in ${year}.`,
          },
          { status: 400, headers: responseHeaders },
        )
      }
    }

    const admin = createAdminClient()

    // Auto-provision balance if not yet created

    if (!balance && admin) {
      await admin.rpc("ensure_leave_balance", {
        p_company_id: access.companyId,

        p_user_id: access.userId,

        p_leave_type_id: leaveTypeId,

        p_year: year,
      })
    }

    const { data: req, error } = await access.supabase

      .from("leave_requests")

      .insert({
        company_id: access.companyId,

        employee_id: access.userId,

        leave_type: leaveTypeRow.name,

        leave_type_id: leaveTypeId,

        start_date: startDate,

        end_date: endDate,

        reason,

        status: "pending",
      })

      .select(
        "id, employee_id, leave_type, leave_type_id, start_date, end_date, days_count, is_paid, reason, status, supervisor_status, manager_status, final_status, created_at",
      )

      .single()

    if (error || !req) {
      console.error("Leave request insert failed", error)

      return NextResponse.json({ error: "Unable to submit leave request." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    return NextResponse.json(
      {
        request: {
          ...req,

          leave_type_name: leaveTypeRow.name,

          employee_name: "You",

          supervisor_name: "",

          manager_name: "",

          final_reviewer_name: "",

          reviewer_name: "",
        },
      },
      { status: 201, headers: responseHeaders },
    )
  } catch (err) {
    console.error("Leave request POST failed", err)

    return NextResponse.json({ error: "Leave management is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

// PATCH /api/leave — advance a leave request through the approval chain

export async function PATCH(request: Request) {
  try {
    const access = await getWorkforceAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const parsedBody = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!parsedBody)
      return NextResponse.json({ error: "Provide approval details." }, {
        status: 400,
        headers: responseHeaders,
      })

    const body: Record<string, unknown> = parsedBody

    const leaveId =
      typeof body.leaveId === "string" ? body.leaveId : ""

    if (
      body.workflowKey === "leave" &&
      isUuid(typeof body.subjectId === "string" ? body.subjectId : leaveId)
    ) {
      const { data: updated, error } = await access.supabase.rpc(
        "advance_company_approval_workflow",

        {
          requested_company_id: access.companyId,

          requested_workflow_key: "leave",

          requested_subject_id:
            typeof body.subjectId === "string" ? body.subjectId : leaveId,

          requested_decision: body.decision,

          requested_note: typeof body.note === "string" ? body.note : "",
        },
      )

      if (error) {
        if (error.code === "42501")
          return NextResponse.json(
            { error: error.message },

            { status: 403, headers: responseHeaders },
          )

        if (["22023", "P0002"].includes(error.code ?? ""))
          return NextResponse.json(
            { error: error.message },

            { status: 409, headers: responseHeaders },
          )

        console.error("Leave workflow decision failed", error)

        return NextResponse.json(
          { error: "Unable to process the leave decision." },

          { status: 500, headers: responseHeaders },
        )
      }

      return NextResponse.json({ result: updated }, {
        headers: responseHeaders,
      })
    }

    return NextResponse.json(
      {
        error:
          "Leave approval actions must use the company-configured approval workflow.",
      },

      { status: 409, headers: responseHeaders },
    )

  } catch (err) {
    console.error("Leave PATCH failed", err)

    return NextResponse.json({ error: "Leave management is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}
