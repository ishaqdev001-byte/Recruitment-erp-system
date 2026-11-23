import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const permissionCodes = [
  "expense_requests.view",

  "expense_requests.create",

  "expense_requests.review",

  "expense_requests.verify",

  "expense_requests.authorize",

  "expense_requests.cashout",

  "expense_requests.initiate",

  "expense_requests.edit",

  "expense_requests.delete",
] as const

const requestAccessPermissionCodes = [
  "expense_requests.view",

  "expense_requests.create",

  "expense_requests.review",

  "expense_requests.verify",

  "expense_requests.authorize",

  "expense_requests.cashout",
] as const

type ExpenseRequestAction = "general_manager_approve" | "general_manager_reject" | "finance_verify" | "finance_reject" | "chairman_authorize" | "chairman_reject" | "line_manager_approve" | "line_manager_reject" | "initiate_requisition" | "cashout" | "edit" | "delete"

async function getAccess() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id, role_id, branch_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError || !membership)
    return {
      error: "Active company membership not found.",
      status: 403 as const,
    }

  const [
    { data: role, error: roleError },

    { data: isMainBranch, error: branchError },

    { data: isLinkedStaff, error: staffStatusError },

    permissionResults,
  ] = await Promise.all([
    supabase

      .from("company_roles")

      .select("name")

      .eq("id", membership.role_id)

      .eq("company_id", membership.company_id)

      .maybeSingle(),

    supabase.rpc("current_user_is_main_branch_user", {
      requested_company_id: membership.company_id,
    }),

    supabase.rpc("current_user_is_linked_company_staff", {
      requested_company_id: membership.company_id,
    }),

    Promise.all(
      permissionCodes.map((requestedPermission) =>
        supabase.rpc("current_user_has_company_permission", {
          requested_company_id: membership.company_id,

          requested_permission: requestedPermission,
        }),
      ),
    ),
  ])

  if (
    roleError ||
    branchError ||
    staffStatusError ||
    permissionResults.some((result) => result.error)
  )
    return {
      error: "Unable to verify expense-request access.",
      status: 503 as const,
    }

  if (!role) return { error: "Company role not found.", status: 403 as const }

  const permissions = Object.fromEntries(
    permissionCodes.map((code, index) => [
      code,
      Boolean(permissionResults[index].data),
    ]),
  ) as Record<typeof permissionCodes[number], boolean>

  return {
    supabase,

    companyId: membership.company_id,

    userId: user.id,

    branchId: membership.branch_id,

    isMainBranch: Boolean(isMainBranch),

    isLinkedStaff: Boolean(isLinkedStaff),

    roleName: role.name,

    permissions,
  }
}

function actionErrorStatus(code?: string) {
  if (code === "42501") return 403

  if (code === "22023") return 400

  if (code === "P0002") return 409

  return 500
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const parsed = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers },
      )

    const isAdministrationOfficer =
      access.roleName.trim().toLowerCase() === "administration officer"

    const canReviewLineManager =
      access.isLinkedStaff && !isAdministrationOfficer

    const canReview =
      access.permissions["expense_requests.review"] &&
      access.roleName === "General Manager"

    const canVerify =
      access.permissions["expense_requests.verify"] &&
      ["Finance Manager", "Finance Officer", "Finance User"].includes(
        access.roleName,
      )

    const canAuthorize =
      access.permissions["expense_requests.authorize"] &&
      (access.roleName === "Chairman" ||
        access.roleName === "Company Owner / Primary Administrator")

    const canCashout =
      access.permissions["expense_requests.cashout"] &&
      access.roleName === "Finance Manager"

    const canView =
      !isAdministrationOfficer &&
      requestAccessPermissionCodes.some(
        (permission) => access.permissions[permission],
      )

    const canCreate =
      !isAdministrationOfficer && (canView || canReviewLineManager)

    if (
      !canView &&
      !canCreate &&
      !canReviewLineManager &&
      !canReview &&
      !canVerify &&
      !canAuthorize &&
      !canCashout
    )
      return NextResponse.json(
        { error: "You do not have permission to access expense requests." },

        { status: 403, headers },
      )

    let query = access.supabase

      .from("expense_requests")

      .select("*")

      .eq("company_id", access.companyId)

      .is("deleted_at", null)

      .order("created_at", { ascending: false })

      .limit(200)

    if (
      !access.isMainBranch &&
      access.branchId &&
      (canView || !access.isLinkedStaff)
    )
      query = query.eq("branch_id", access.branchId)

    const { data: requests, error } = await query

    if (error) {
      console.error("Expense request list failed", error)

      const migrationMissing =
        error.code === "42P01" || error.code === "PGRST205"

      return NextResponse.json(
        {
          error: migrationMissing
            ? "Expense-request data is unavailable. Apply the expense requests migration first."
            : "Unable to load expense requests. Please try again or contact an administrator.",
        },

        { status: 503, headers },
      )
    }

    const creatorIds = [
      ...new Set((requests ?? []).map((request) => request.created_by)),
    ]
    const { data: creatorProfiles, error: creatorProfilesError } =
      creatorIds.length
        ? await access.supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", creatorIds)
        : { data: [], error: null }
    if (creatorProfilesError) {
      console.error(
        "Expense request creator lookup failed",
        creatorProfilesError,
      )
      return NextResponse.json(
        { error: "Unable to load expense request creator names." },
        { status: 503, headers },
      )
    }
    const creatorNames = new Map(
      (creatorProfiles ?? []).map((profile) => [
        profile.id,
        profile.display_name,
      ]),
    )
    const requestsWithCreatorNames = (requests ?? []).map((request) => ({
      ...request,
      created_by_name: creatorNames.get(request.created_by) ?? "",
    }))
    const uninitiatedRequestIds = requestsWithCreatorNames
      .filter((request) => !request.requisition_id)
      .map((request) => request.id)
    const linkedRequisitionIds = requestsWithCreatorNames
      .map((request) => request.requisition_id)
      .filter((id): id is string => typeof id === "string")
    const [expenseWorkflowResult, linkedWorkflowResult] = await Promise.all([
      uninitiatedRequestIds.length
        ? access.supabase.rpc("get_company_approval_workflow_states", {
            requested_company_id: access.companyId,
            requested_workflow_key: "expense_request",
            requested_subject_ids: uninitiatedRequestIds,
          })
        : Promise.resolve({ data: [], error: null }),
      linkedRequisitionIds.length
        ? access.supabase.rpc("get_company_approval_workflow_states", {
            requested_company_id: access.companyId,
            requested_workflow_key: "linked_requisition",
            requested_subject_ids: linkedRequisitionIds,
          })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (expenseWorkflowResult.error || linkedWorkflowResult.error) {
      console.error("Expense request workflow lookup failed", {
        expenseWorkflow: expenseWorkflowResult.error,
        linkedWorkflow: linkedWorkflowResult.error,
      })
      return NextResponse.json(
        { error: "Unable to load request approval workflows." },
        { status: 503, headers },
      )
    }
    const workflowStates = [
      ...(Array.isArray(expenseWorkflowResult.data)
        ? expenseWorkflowResult.data
        : []),
      ...(Array.isArray(linkedWorkflowResult.data)
        ? linkedWorkflowResult.data
        : []),
    ] as Array<{ subjectId: string; workflowKey: string }>
    const workflowBySubject = new Map(
      workflowStates.map((state) => [
        `${state.workflowKey}:${state.subjectId}`,
        state,
      ]),
    )
    const requestsWithWorkflow = requestsWithCreatorNames.map((request) => ({
      ...request,
      approval_workflow:
        workflowBySubject.get(
          request.requisition_id
            ? `linked_requisition:${request.requisition_id}`
            : `expense_request:${request.id}`,
        ) ?? null,
    }))

    return NextResponse.json(
      {
        requests: requestsWithWorkflow,

        currentUserId: access.userId,

        permissions: {
          canView,

          canCreate,

          canReview,

          canReviewLineManager,

          canVerify,

          canAuthorize,

          canCashout,
        },
      },

      { headers },
    )
  } catch (error) {
    console.error("Expense request access failed", error)

    return NextResponse.json(
      { error: "Expense requests are temporarily unavailable." },

      { status: 500, headers },
    )
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers },
      )

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    if (!body || typeof body.action !== "string")
      return NextResponse.json(
        { error: "Choose an expense-request action." },

        { status: 400, headers },
      )

    if (body.action === "create") {
      const hasExpenseRequestAccess =
        access.isLinkedStaff ||
        requestAccessPermissionCodes.some(
          (permission) => access.permissions[permission],
        )

      if (
        access.roleName.trim().toLowerCase() === "administration officer" ||
        !hasExpenseRequestAccess
      )
        return NextResponse.json(
          { error: "You do not have permission to create expense requests." },

          { status: 403, headers },
        )

      const expenseName =
        typeof body.expenseName === "string" ? body.expenseName.trim() : ""

      const purpose =
        typeof body.purpose === "string" ? body.purpose.trim() : ""

      const comment =
        typeof body.comment === "string" ? body.comment.trim() : ""

      const dueDate = typeof body.dueDate === "string" ? body.dueDate : ""

      const expenseCategoryId = isUuid(body.expenseCategoryId)
        ? body.expenseCategoryId
        : null

      const items = Array.isArray(body.items) ? body.items : []

      if (
        !expenseName ||
        expenseName.length > 200 ||
        !purpose ||
        purpose.length > 2000 ||
        !comment ||
        comment.length > 2000 ||
        !isIsoDate(dueDate) ||
        items.length === 0 ||
        items.length > 50
      )
        return NextResponse.json(
          {
            error:
              "Enter an expense name, purpose, due date, comment, and at least one line item.",
          },

          { status: 400, headers },
        )

      const normalizedItems: {
        description: string
        quantity: number
        rate: number
        catalog_item_id: string | null
      }[] = []

      for (const item of items) {
        if (!item || typeof item !== "object")
          return NextResponse.json({ error: "Each line item must be valid." }, {
            status: 400,

            headers,
          })

        const line = item as Record<string, unknown>

        const description =
          typeof line.description === "string" ? line.description.trim() : ""

        const quantity = Number(line.quantity)
        const rate = Number(line.rate)
        const catalogItemId =
          line.catalog_item_id === null ||
          line.catalog_item_id === undefined ||
          line.catalog_item_id === ""
            ? null
            : isUuid(line.catalog_item_id)
              ? line.catalog_item_id
              : undefined

        if (
          !description ||
          description.length > 200 ||
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(rate) ||
          rate <= 0 ||
          catalogItemId === undefined ||
          "unitRate" in line ||
          "amount" in line
        )
          return NextResponse.json(
            {
              error:
                "Each item needs a description, positive quantity, and positive unit rate.",
            },
            { status: 400, headers },
          )

        normalizedItems.push({
          description,
          quantity,
          rate,
          catalog_item_id: catalogItemId,
        })
      }

      const { data, error } = await access.supabase.rpc(
        "submit_priced_expense_request_with_items",
        {
          requested_company_id: access.companyId,

          requested_expense_name: expenseName,

          requested_purpose: purpose,

          requested_expense_category_id: expenseCategoryId,

          requested_due_date: dueDate,

          requested_comment: comment,

          requested_items: normalizedItems,
        },
      )

      if (error) {
        console.error("Expense request creation failed", error)

        return NextResponse.json(
          { error: error.message || "Unable to submit the expense request." },

          { status: actionErrorStatus(error.code), headers },
        )
      }

      return NextResponse.json({ request: data }, { status: 201, headers })
    }

    const actions = new Set<ExpenseRequestAction>([
      "line_manager_approve",

      "line_manager_reject",

      "initiate_requisition",

      "general_manager_approve",

      "general_manager_reject",

      "finance_verify",

      "finance_reject",

      "chairman_authorize",

      "chairman_reject",

      "cashout",

      "edit",

      "delete",
    ])

    if (!actions.has(body.action as ExpenseRequestAction))
      return NextResponse.json(
        { error: "Choose a valid expense-request action." },

        { status: 400, headers },
      )

    if (body.action !== "edit" && body.action !== "delete")
      return NextResponse.json(
        {
          error:
            "Approval actions must use the company-configured approval workflow.",
        },
        { status: 409, headers },
      )

    const requestId = typeof body.requestId === "string" ? body.requestId : ""

    if (!isUuid(requestId))
      return NextResponse.json(
        { error: "Select a valid expense request." },

        { status: 400, headers },
      )

    if (body.action === "edit" || body.action === "delete") {
      const requiredPermission =
        body.action === "edit"
          ? "expense_requests.edit"
          : "expense_requests.delete"

      if (!access.permissions[requiredPermission])
        return NextResponse.json(
          {
            error: `You do not have permission to ${body.action} expense requests.`,
          },

          { status: 403, headers },
        )

      if (body.action === "delete") {
        const { data, error } = await access.supabase.rpc(
          "delete_expense_request_before_initiation",

          { requested_request_id: requestId },
        )

        if (error) {
          console.error("Expense request deletion failed", error)

          return NextResponse.json(
            { error: error.message || "Unable to delete the expense request." },

            { status: actionErrorStatus(error.code), headers },
          )
        }

        return NextResponse.json({ success: true, request: data }, { headers })
      }

      const expenseName =
        typeof body.expenseName === "string" ? body.expenseName.trim() : ""

      const purpose =
        typeof body.purpose === "string" ? body.purpose.trim() : ""

      const comment =
        typeof body.comment === "string" ? body.comment.trim() : ""

      const dueDate = typeof body.dueDate === "string" ? body.dueDate : ""

      const expenseCategoryId = isUuid(body.expenseCategoryId)
        ? body.expenseCategoryId
        : null

      const items = Array.isArray(body.items) ? body.items : []

      if (
        !expenseName ||
        expenseName.length > 200 ||
        !purpose ||
        purpose.length > 2000 ||
        !comment ||
        comment.length > 2000 ||
        !isIsoDate(dueDate) ||
        items.length === 0 ||
        items.length > 50
      )
        return NextResponse.json(
          {
            error:
              "Enter a valid expense name, purpose, due date, comment, and line items.",
          },

          { status: 400, headers },
        )

      const normalizedItems: {
        description: string
        quantity: number
        rate: number
        catalog_item_id: string | null
      }[] = []

      for (const item of items) {
        if (!item || typeof item !== "object")
          return NextResponse.json(
            { error: "Each line item must be valid." },

            { status: 400, headers },
          )

        const line = item as Record<string, unknown>

        const description =
          typeof line.description === "string" ? line.description.trim() : ""

        const quantity = Number(line.quantity)
        const rate = Number(line.rate)
        const catalogItemId =
          line.catalog_item_id === null ||
          line.catalog_item_id === undefined ||
          line.catalog_item_id === ""
            ? null
            : isUuid(line.catalog_item_id)
              ? line.catalog_item_id
              : undefined

        if (
          !description ||
          description.length > 200 ||
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(rate) ||
          rate <= 0 ||
          catalogItemId === undefined ||
          "unitRate" in line ||
          "amount" in line
        )
          return NextResponse.json(
            {
              error:
                "Each item needs a description, positive quantity, and positive unit rate.",
            },

            { status: 400, headers },
          )

        normalizedItems.push({
          description,
          quantity,
          rate,
          catalog_item_id: catalogItemId,
        })
      }

      const { data, error } = await access.supabase.rpc(
        "update_priced_expense_request_before_initiation",

        {
          requested_request_id: requestId,

          requested_expense_name: expenseName,

          requested_purpose: purpose,

          requested_expense_category_id: expenseCategoryId,

          requested_due_date: dueDate,

          requested_comment: comment,

          requested_items: normalizedItems,
        },
      )

      if (error) {
        console.error("Expense request update failed", error)

        return NextResponse.json(
          { error: error.message || "Unable to update the expense request." },

          { status: actionErrorStatus(error.code), headers },
        )
      }

      return NextResponse.json({ success: true, request: data }, { headers })
    }

    if (
      body.action === "initiate_requisition" &&
      !access.permissions["expense_requests.initiate"]
    )
      return NextResponse.json(
        {
          error: "You do not have permission to initiate approved requests.",
        },

        { status: 403, headers },
      )

    if (
      ["line_manager_approve", "line_manager_reject"].includes(body.action) &&
      !access.isLinkedStaff &&
      !(
        access.roleName === "General Manager" &&
        access.permissions["expense_requests.review"]
      )
    )
      return NextResponse.json(
        {
          error:
            "Only the assigned line manager or General Manager fallback can review this request.",
        },

        { status: 403, headers },
      )

    if (
      body.action === "cashout" &&
      (access.roleName !== "Finance Manager" ||
        !access.permissions["expense_requests.cashout"])
    )
      return NextResponse.json(
        {
          error:
            "Only a Finance Manager with cash-out permission can pay an authorized expense request.",
        },

        { status: 403, headers },
      )

    const comment = typeof body.comment === "string" ? body.comment.trim() : ""

    if (!comment || comment.length > 2000)
      return NextResponse.json(
        { error: "Add a comment for this expense-request stage." },

        { status: 400, headers },
      )

    let unitRates: number[] | null = null

    if (body.action === "initiate_requisition") {
      const requestedRates = Array.isArray(body.unitRates) ? body.unitRates : []

      if (
        requestedRates.length === 0 ||
        requestedRates.length > 50 ||
        requestedRates.some((value) => {
          const rate = Number(value)

          return !Number.isFinite(rate) || rate <= 0 || rate > 999999999
        })
      )
        return NextResponse.json(
          {
            error:
              "Enter a positive unit rate for every item before initiating the requisition.",
          },

          { status: 400, headers },
        )

      unitRates = requestedRates.map(Number)
    }

    const accountId = typeof body.accountId === "string" ? body.accountId : null

    const paymentMethod =
      typeof body.paymentMethod === "string" ? body.paymentMethod : null

    const usesStaffWorkflow = [
      "line_manager_approve",

      "line_manager_reject",

      "initiate_requisition",
    ].includes(body.action)

    const { data, error } = usesStaffWorkflow
      ? body.action === "initiate_requisition"
        ? await access.supabase.rpc("initiate_expense_request_requisition", {
            requested_request_id: requestId,

            requested_comment: comment,

            requested_unit_rates: unitRates,
          })
        : await access.supabase.rpc("transition_staff_expense_request", {
            requested_request_id: requestId,

            requested_action: body.action,

            requested_comment: comment,
          })
      : await access.supabase.rpc("transition_expense_request", {
          requested_request_id: requestId,

          requested_action: body.action,

          requested_comment: comment,

          requested_account_id: accountId,

          requested_payment_method: paymentMethod,
        })

    if (error) {
      console.error("Expense request transition failed", error)

      return NextResponse.json(
        { error: error.message || "Unable to update the expense request." },

        { status: actionErrorStatus(error.code), headers },
      )
    }

    return NextResponse.json({ success: true, request: data }, { headers })
  } catch (error) {
    console.error("Expense request action failed", error)

    return NextResponse.json(
      { error: "Unable to process the expense request." },

      { status: 500, headers },
    )
  }
}
