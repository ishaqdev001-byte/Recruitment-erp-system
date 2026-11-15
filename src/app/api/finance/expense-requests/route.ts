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
] as const

type ExpenseRequestAction =
  | "general_manager_approve"
  | "general_manager_reject"
  | "finance_verify"
  | "finance_reject"
  | "chairman_authorize"
  | "chairman_reject"
  | "line_manager_approve"
  | "line_manager_reject"
  | "initiate_requisition"
  | "cashout"

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
    return { error: "Active company membership not found.", status: 403 as const }

  const [
    { data: role, error: roleError },
    { data: isMainBranch, error: branchError },
    { data: isLinkedStaff, error: staffStatusError },
    permissionResults,
  ] = await Promise.all([
    supabase
      .from("company_roles")
      .select("name, is_system_default")
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
    return { error: "Unable to verify expense-request access.", status: 503 as const }
  if (!role)
    return { error: "Company role not found.", status: 403 as const }

  const permissions = Object.fromEntries(
    permissionCodes.map((code, index) => [code, Boolean(permissionResults[index].data)]),
  ) as Record<(typeof permissionCodes)[number], boolean>

  return {
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id,
    isMainBranch: Boolean(isMainBranch),
    isLinkedStaff: Boolean(isLinkedStaff),
    roleName: role.name,
    isSystemDefault: role.is_system_default,
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
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
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
      access.roleName === "Administration Officer"
    const canCreate = access.isLinkedStaff && !isAdministrationOfficer
    const canReviewLineManager = access.isLinkedStaff && !isAdministrationOfficer
    const canReview =
      access.permissions["expense_requests.review"] &&
      access.roleName === "General Manager"
    const canVerify =
      access.permissions["expense_requests.verify"] &&
      ["Finance Manager", "Finance Officer", "Finance User"].includes(access.roleName)
    const canAuthorize =
      access.permissions["expense_requests.authorize"] &&
      (access.roleName === "Chairman" ||
        access.roleName === "Company Owner / Primary Administrator")
    const canCashout =
      access.permissions["expense_requests.cashout"] &&
      access.roleName === "Finance Manager"
    const canView =
      !isAdministrationOfficer &&
      (access.permissions["expense_requests.view"] ||
        canReview ||
        canVerify ||
        canAuthorize ||
        canCashout)

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
      .order("created_at", { ascending: false })
      .limit(200)
    if (!access.isMainBranch && access.branchId && (canView || !access.isLinkedStaff))
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

    return NextResponse.json(
      {
        requests: requests ?? [],
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

    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body || typeof body.action !== "string")
      return NextResponse.json(
        { error: "Choose an expense-request action." },
        { status: 400, headers },
      )

    if (body.action === "create") {
      if (
        !access.isLinkedStaff ||
        access.roleName === "Administration Officer"
      )
        return NextResponse.json(
          { error: "Only active linked company staff may submit expense requests." },
          { status: 403, headers },
        )

      const expenseName = typeof body.expenseName === "string" ? body.expenseName.trim() : ""
      const purpose = typeof body.purpose === "string" ? body.purpose.trim() : ""
      const comment = typeof body.comment === "string" ? body.comment.trim() : ""
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
        !expenseCategoryId ||
        items.length === 0 ||
        items.length > 50
      )
        return NextResponse.json(
          { error: "Enter an expense name, purpose, category, due date, comment, and at least one line item." },
          { status: 400, headers },
        )

      const normalizedItems: { description: string; quantity: number; rate: number }[] = []
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
        if (
          !description ||
          description.length > 200 ||
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(rate) ||
          rate < 0
        )
          return NextResponse.json({
            error: "Each item needs a description, positive quantity, and non-negative rate.",
          }, { status: 400, headers })
        normalizedItems.push({ description, quantity, rate })
      }

      const total = normalizedItems.reduce(
        (sum, item) => sum + item.quantity * item.rate,
        0,
      )
      if (!Number.isFinite(total) || total <= 0 || total > 999999999999.99)
        return NextResponse.json(
          { error: "Line items must total an amount greater than zero and within the supported limit." },
          { status: 400, headers },
        )

      const { data, error } = await access.supabase.rpc("submit_staff_expense_request", {
        requested_company_id: access.companyId,
        requested_expense_name: expenseName,
        requested_purpose: purpose,
        requested_expense_category_id: expenseCategoryId,
        requested_due_date: dueDate,
        requested_comment: comment,
        requested_items: normalizedItems,
      })
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
    ])
    if (!actions.has(body.action as ExpenseRequestAction))
      return NextResponse.json(
        { error: "Choose a valid expense-request action." },
        { status: 400, headers },
      )
    if (
      body.action === "initiate_requisition" &&
      (access.roleName !== "Administration Officer" ||
        !access.isSystemDefault ||
        !access.permissions["expense_requests.initiate"])
    )
      return NextResponse.json(
        { error: "Only the Administration Officer can initiate approved requests." },
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
        { error: "Only the assigned line manager or General Manager fallback can review this request." },
        { status: 403, headers },
      )
    if (
      body.action === "cashout" &&
      (access.roleName !== "Finance Manager" ||
        !access.permissions["expense_requests.cashout"])
    )
      return NextResponse.json(
        { error: "Only a Finance Manager with cash-out permission can pay an authorized expense request." },
        { status: 403, headers },
      )

    const requestId = typeof body.requestId === "string" ? body.requestId : ""
    const comment = typeof body.comment === "string" ? body.comment.trim() : ""
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))
      return NextResponse.json(
        { error: "Select a valid expense request." },
        { status: 400, headers },
      )
    if (!comment || comment.length > 2000)
      return NextResponse.json(
        { error: "Add a comment for this expense-request stage." },
        { status: 400, headers },
      )

    const accountId = typeof body.accountId === "string" ? body.accountId : null
    const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : null
    const usesStaffWorkflow = [
      "line_manager_approve",
      "line_manager_reject",
      "initiate_requisition",
    ].includes(body.action)
    const { data, error } = usesStaffWorkflow
      ? await access.supabase.rpc("transition_staff_expense_request", {
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
