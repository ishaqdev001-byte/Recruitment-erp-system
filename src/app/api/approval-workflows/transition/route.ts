import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }
const workflowKeys = new Set([
  "expense_request",
  "linked_requisition",
  "standalone_requisition",
  "leave",
])

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers },
      )

    const body = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null
    if (
      !body ||
      typeof body.workflowKey !== "string" ||
      !workflowKeys.has(body.workflowKey) ||
      !isUuid(body.subjectId) ||
      typeof body.decision !== "string" ||
      !["approved", "rejected", "completed"].includes(body.decision) ||
      (body.note !== undefined &&
        (typeof body.note !== "string" || body.note.length > 2000)) ||
      (body.accountId !== undefined &&
        body.accountId !== null &&
        !isUuid(body.accountId)) ||
      (body.paymentMethod !== undefined &&
        body.paymentMethod !== null &&
        typeof body.paymentMethod !== "string") ||
      (body.unitRates !== undefined &&
        (!Array.isArray(body.unitRates) ||
          body.unitRates.length < 1 ||
          body.unitRates.length > 50 ||
          body.unitRates.some(
            (rate: unknown) =>
              typeof rate !== "number" ||
              !Number.isFinite(rate) ||
              rate <= 0 ||
              rate > 999999999999.99,
          )))
    )
      return NextResponse.json(
        { error: "Provide valid approval workflow action details." },
        { status: 400, headers },
      )

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle()
    if (membershipError || !membership) {
      if (membershipError)
        console.error("Workflow action membership lookup failed", membershipError)
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: membershipError ? 503 : 403, headers },
      )
    }

    const { data, error } = await supabase.rpc(
      "advance_company_approval_workflow",
      {
        requested_company_id: membership.company_id,
        requested_workflow_key: body.workflowKey,
        requested_subject_id: body.subjectId,
        requested_decision: body.decision,
        requested_note: typeof body.note === "string" ? body.note : "",
        requested_account_id: isUuid(body.accountId) ? body.accountId : null,
        requested_payment_method:
          typeof body.paymentMethod === "string" ? body.paymentMethod : null,
        requested_unit_rates: Array.isArray(body.unitRates)
          ? body.unitRates
          : null,
      },
    )
    if (error) {
      if (error.code === "42501")
        return NextResponse.json(
          { error: error.message },
          { status: 403, headers },
        )
      if (["22023", "P0002"].includes(error.code ?? ""))
        return NextResponse.json(
          { error: error.message },
          { status: 409, headers },
        )
      console.error("Workflow action failed", error)
      return NextResponse.json(
        { error: "Unable to process this approval workflow action." },
        { status: 500, headers },
      )
    }

    return NextResponse.json({ result: data }, { headers })
  } catch (error) {
    console.error("Workflow action route failed", error)
    return NextResponse.json(
      { error: "Approval workflow is temporarily unavailable." },
      { status: 503, headers },
    )
  }
}
