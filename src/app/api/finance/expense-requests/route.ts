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
] as const

type ExpenseRequestAction =
  | "general_manager_approve"
  | "general_manager_reject"
  | "finance_verify"
  | "finance_reject"
  | "chairman_authorize"
  | "chairman_reject"
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

  const [{ data: role, error: roleError }, { data: isMainBranch, error: branchError }, permissionResults] =
    await Promise.all([
      supabase
        .from("company_roles")
        .select("name, is_system_default")
        .eq("id", membership.role_id)
        .eq("company_id", membership.company_id)
        .maybeSingle(),
      supabase.rpc("current_user_is_main_branch_user", {
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

  if (roleError || branchError || permissionResults.some((result) => result.error))
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

export async function GET() {
  try {
    const access = await getAccess()
    if ("error" in access)
      return NextResponse.json(
        { error: access.error },
        { status: access.status, headers },
      )

    const canCreate =
      access.permissions["expense_requests.create"] &&
      access.roleName === "Administration Officer" &&
      access.isSystemDefault
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
      access.permissions["expense_requests.view"] ||
      canReview ||
      canVerify ||
      canAuthorize ||
      canCashout

    if (!canView && !canCreate && !canReview && !canVerify && !canAuthorize && !canCashout)
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
    if (!access.isMainBranch && access.branchId)
      query = query.eq("branch_id", access.branchId)
    if (!canView) query = query.eq("created_by", access.userId)

    const { data: requests, error } = await query
    if (error) {
      console.error("Expense request list failed", error)
      return NextResponse.json(
        { error: "Unable to load expense requests. Apply the expense requests migration first." },
        { status: 503, headers },
      )
    }

    return NextResponse.json(
      {
        requests: requests ?? [],
        permissions: {
          canView,
          canCreate,
          canReview,
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
        access.roleName !== "Administration Officer" ||
        !access.isSystemDefault ||
        !access.permissions["expense_requests.create"]
      )
        return NextResponse.json(
          { error: "Only the Administration Officer can create expense requests." },
          { status: 403, headers },
        )

      const expenseName = typeof body.expenseName === "string" ? body.expenseName.trim() : ""
      const requestedBy = typeof body.requestedBy === "string" ? body.requestedBy.trim() : ""
      const purpose = typeof body.purpose === "string" ? body.purpose.trim() : ""
      const comment = typeof body.comment === "string" ? body.comment.trim() : ""
      const dueDate = typeof body.dueDate === "string" ? body.dueDate : ""
      const amount = Number(body.amount)
      if (
        !expenseName ||
        expenseName.length > 200 ||
        !requestedBy ||
        requestedBy.length > 200 ||
        !purpose ||
        purpose.length > 2000 ||
        !comment ||
        comment.length > 2000 ||
        !isIsoDate(dueDate) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > 999999999999.99
      )
        return NextResponse.json(
          { error: "Enter a valid expense name, requester, purpose, amount, due date, and comment." },
          { status: 400, headers },
        )

      const { data, error } = await access.supabase.rpc("submit_expense_request", {
        requested_company_id: access.companyId,
        requested_expense_name: expenseName,
        requested_by_name: requestedBy,
        requested_purpose: purpose,
        requested_amount: amount,
        requested_due_date: dueDate,
        requested_comment: comment,
      })
      if (error) {
        console.error("Expense request creation failed", error)
        return NextResponse.json(
          { error: error.message || "Unable to submit the expense request." },
          { status: actionErrorStatus(error.code), headers },
        )
      }
      return NextResponse.json({ request: data?.[0] ?? null }, { status: 201, headers })
    }

    const actions = new Set<ExpenseRequestAction>([
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
    const { data, error } = await access.supabase.rpc("transition_expense_request", {
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
