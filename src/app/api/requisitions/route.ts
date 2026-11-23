import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
const responseHeaders = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false
  const d = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value
}

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
    .select("company_id, branch_id, role_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  if (membershipError || !membership)
    return {
      error: "Active company membership not found.",
      status: 403 as const,
    }
  const { data: isMainBranch, error: branchError } = await supabase.rpc(
    "current_user_is_main_branch_user",
    {
      requested_company_id: membership.company_id,
    },
  )
  if (branchError || (!isMainBranch && !membership.branch_id))
    return {
      error: "Unable to verify your company branch.",
      status: 503 as const,
    }
  return {
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id ?? null,
    roleId: membership.role_id,
    isMainBranch: Boolean(isMainBranch),
  }
}

async function canCreateRequisitions(
  access: Awaited<ReturnType<typeof getAccess>>,
) {
  if ("error" in access) return false
  const [
    { data: role, error: roleError },
    { data: hasPermission, error: permissionError },
  ] = await Promise.all([
    access.supabase
      .from("company_roles")
      .select("name, is_system_default")
      .eq("id", access.roleId)
      .eq("company_id", access.companyId)
      .maybeSingle(),
    access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "requisitions.create",
    }),
  ])
  if (roleError || permissionError) throw roleError ?? permissionError
  return (
    role?.name.trim().toLocaleLowerCase() === "administration officer" &&
    role?.is_system_default === true &&
    Boolean(hasPermission)
  )
}

// GET /api/requisitions — list requisitions for the company
export async function GET(request: Request) {
  try {
    const access = await getAccess()
    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const url = new URL(request.url)
    const statusFilter = url.searchParams.get("status") ?? ""
    const myOnly = url.searchParams.get("mine") === "1"
    const expenseRequestNumber =
      url.searchParams.get("expenseRequestNumber")?.trim() ?? ""
    const [permissionResults, canCreate] = await Promise.all([
      Promise.all([
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.view",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.review",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.verify",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.authorize",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "expense_requests.edit",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "expense_requests.delete",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "expense_requests.initiate",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.items.create",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.items.edit",
        }),
        access.supabase.rpc("current_user_has_company_permission", {
          requested_company_id: access.companyId,
          requested_permission: "requisitions.items.delete",
        }),
      ]),
      canCreateRequisitions(access),
    ])
    if (permissionResults.some((result) => result.error)) {
      return NextResponse.json(
        { error: "Unable to verify requisition permissions." },
        { status: 503, headers: responseHeaders },
      )
    }
    const [
      canView,
      canReview,
      canVerify,
      canAuthorize,
      canEditExpenseRequests,
      canDeleteExpenseRequests,
      canInitiateExpenseRequestPermission,
      canCreateLinkedItems,
      canEditLinkedItems,
      canDeleteLinkedItems,
    ] = permissionResults.map((result) => Boolean(result.data))
    if (
      !canView &&
      !canCreate &&
      !canReview &&
      !canVerify &&
      !canAuthorize &&
      !canInitiateExpenseRequestPermission &&
      !canCreateLinkedItems &&
      !canEditLinkedItems &&
      !canDeleteLinkedItems
    ) {
      return NextResponse.json(
        { error: "You do not have permission to view requisitions." },
        { status: 403, headers: responseHeaders },
      )
    }

    let query = access.supabase
      .from("company_requisitions")
      .select(`
        id, requisition_number, title, department_name, currency_code,
        expense_category_id, expense_category_name,
        service_provider_name, due_date, notes, total_amount, status,
        amount_paid, payment_status,
        general_manager_status, general_manager_reviewed_at, general_manager_note,
        finance_status, finance_reviewed_at, finance_note,
        director_status, director_reviewed_at, director_note,
        source_expense_request_id, source_expense_request_number,
        requested_by_user_id, requested_by_name, initiated_by_user_id, initiated_at,
        created_by, created_at, updated_at
      `)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })
      .limit(200)

    if (statusFilter) query = query.eq("status", statusFilter)
    if (myOnly && canView) query = query.eq("created_by", access.userId)
    if (!access.isMainBranch) query = query.eq("branch_id", access.branchId!)
    if (!canView) {
      if (canCreateLinkedItems || canEditLinkedItems || canDeleteLinkedItems) {
        query = query.not("source_expense_request_id", "is", null)
      } else {
        query = query.eq("created_by", access.userId)
      }
    }

    const { data: requisitions, error } = await query
    if (error) {
      console.error("Requisitions query failed", error)
      return NextResponse.json(
        {
          error:
            "Unable to load requisitions. Apply migration 202610180001_requisitions.sql if setup is incomplete.",
        },
        { status: 500, headers: responseHeaders },
      )
    }

    let expenseRequests: Record<string, unknown>[] = []
    if (canView || canInitiateExpenseRequestPermission) {
      let expenseRequestQuery = access.supabase
        .from("expense_requests")
        .select(`
          id, requisition_id, serial_number, request_number, expense_name, requested_by_name,
          purpose, amount, due_date, expense_category_id, expense_category_name,
          request_comment, line_items, created_at, created_by, status,
          line_manager_reviewed_at, line_manager_comment, rejected_stage,
          requisition_number
        `)
        .eq("company_id", access.companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200)
      if (myOnly)
        if (canView)
          expenseRequestQuery = expenseRequestQuery.eq(
            "created_by",
            access.userId,
          )
      if (expenseRequestNumber)
        expenseRequestQuery = expenseRequestQuery.eq(
          "request_number",
          expenseRequestNumber,
        )
      if (!canView)
        expenseRequestQuery = expenseRequestQuery.eq(
          "status",
          "pending_administration_officer_initiation",
        )
      if (!access.isMainBranch && access.branchId)
        expenseRequestQuery = expenseRequestQuery.eq(
          "branch_id",
          access.branchId,
        )
      const { data: visibleRequests, error: pendingRequestError } =
        await expenseRequestQuery
      if (pendingRequestError) {
        console.error(
          "Requisition expense-request list failed",
          pendingRequestError,
        )
        return NextResponse.json(
          {
            error:
              "Unable to load expense requests in the requisition workflow.",
          },
          { status: 503, headers: responseHeaders },
        )
      }
      expenseRequests = visibleRequests ?? []
      const linkedRequisitionIds = [
        ...new Set(
          expenseRequests
            .map((request) => request.requisition_id)
            .filter((id): id is string => typeof id === "string"),
        ),
      ]
      if (linkedRequisitionIds.length > 0) {
        const { data: linkedRequisitions, error: linkedRequisitionError } =
          await access.supabase
            .from("company_requisitions")
            .select("id, requisition_number")
            .eq("company_id", access.companyId)
            .in("id", linkedRequisitionIds)
        if (linkedRequisitionError) {
          console.error(
            "Linked requisition number lookup failed",
            linkedRequisitionError,
          )
          return NextResponse.json(
            { error: "Unable to load requisition numbers." },
            { status: 503, headers: responseHeaders },
          )
        }
        const requisitionNumbers = new Map(
          (linkedRequisitions ?? []).map((requisition) => [
            requisition.id,
            requisition.requisition_number,
          ]),
        )
        expenseRequests = expenseRequests.map((request) => ({
          ...request,
          requisition_number:
            requisitionNumbers.get(
              typeof request.requisition_id === "string"
                ? request.requisition_id
                : "",
            ) ?? request.requisition_number,
        }))
      }
    }

    const sourceRequestIds = (requisitions ?? [])
      .map((requisition) => requisition.source_expense_request_id)
      .filter((id): id is string => Boolean(id))
    let requisitionsWithRequestMetadata = requisitions ?? []
    if (sourceRequestIds.length > 0) {
      const { data: sourceRequests, error: sourceRequestError } =
        await access.supabase
          .from("expense_requests")
          .select("id, serial_number, line_manager_reviewed_at, rejected_stage")
          .in("id", sourceRequestIds)
      if (sourceRequestError) {
        console.error(
          "Linked expense-request metadata query failed",
          sourceRequestError,
        )
        return NextResponse.json(
          { error: "Unable to load linked expense-request details." },
          { status: 503, headers: responseHeaders },
        )
      }
      const sourceById = new Map(
        (sourceRequests ?? []).map((request) => [request.id, request]),
      )
      requisitionsWithRequestMetadata = (requisitions ?? []).map(
        (requisition) => ({
          ...requisition,
          source_expense_request_serial_number:
            sourceById.get(requisition.source_expense_request_id ?? "")
              ?.serial_number ?? null,
          source_expense_request_line_manager_reviewed_at:
            sourceById.get(requisition.source_expense_request_id ?? "")
              ?.line_manager_reviewed_at ?? null,
          source_expense_request_rejected_stage:
            sourceById.get(requisition.source_expense_request_id ?? "")
              ?.rejected_stage ?? null,
        }),
      )
    }

    const visibleUserIds = new Set<string>()
    for (const requisition of requisitions ?? []) {
      if (requisition.created_by) visibleUserIds.add(requisition.created_by)
    }
    for (const expenseRequest of expenseRequests) {
      if (typeof expenseRequest.created_by === "string")
        visibleUserIds.add(expenseRequest.created_by)
    }
    const { data: creatorProfiles, error: creatorProfilesError } =
      visibleUserIds.size
        ? await access.supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", [...visibleUserIds])
        : { data: [], error: null }
    if (creatorProfilesError) {
      console.error("Requisition creator lookup failed", creatorProfilesError)
      return NextResponse.json(
        { error: "Unable to load requisition requester names." },
        { status: 503, headers: responseHeaders },
      )
    }
    const creatorNames = new Map(
      (creatorProfiles ?? []).map((profile) => [
        profile.id,
        profile.display_name,
      ]),
    )
    const expenseRequestsWithCreatorNames: Record<string, unknown>[] =
      expenseRequests.map((request) => ({
        ...request,
        created_by_name:
          typeof request.created_by === "string"
            ? (creatorNames.get(request.created_by) ?? "")
            : "",
      }))
    const requisitionsWithCreatorNames = requisitionsWithRequestMetadata.map(
      (requisition) => ({
        ...requisition,
        created_by_name: creatorNames.get(requisition.created_by) ?? "",
      }),
    )
    const linkedWorkflowIds = requisitionsWithCreatorNames
      .filter((requisition) => Boolean(requisition.source_expense_request_id))
      .map((requisition) => requisition.id)
    const standaloneWorkflowIds = requisitionsWithCreatorNames
      .filter((requisition) => !requisition.source_expense_request_id)
      .map((requisition) => requisition.id)
    const expenseWorkflowIds = expenseRequestsWithCreatorNames
      .filter((request) => !request.requisition_id)
      .map((request) => String(request.id))
    const [
      linkedWorkflowResult,
      standaloneWorkflowResult,
      expenseWorkflowResult,
    ] = await Promise.all([
      linkedWorkflowIds.length
        ? access.supabase.rpc("get_company_approval_workflow_states", {
            requested_company_id: access.companyId,
            requested_workflow_key: "linked_requisition",
            requested_subject_ids: linkedWorkflowIds,
          })
        : Promise.resolve({ data: [], error: null }),
      standaloneWorkflowIds.length
        ? access.supabase.rpc("get_company_approval_workflow_states", {
            requested_company_id: access.companyId,
            requested_workflow_key: "standalone_requisition",
            requested_subject_ids: standaloneWorkflowIds,
          })
        : Promise.resolve({ data: [], error: null }),
      expenseWorkflowIds.length
        ? access.supabase.rpc("get_company_approval_workflow_states", {
            requested_company_id: access.companyId,
            requested_workflow_key: "expense_request",
            requested_subject_ids: expenseWorkflowIds,
          })
        : Promise.resolve({ data: [], error: null }),
    ])
    if (
      linkedWorkflowResult.error ||
      standaloneWorkflowResult.error ||
      expenseWorkflowResult.error
    ) {
      console.error("Requisition workflow lookup failed", {
        linked: linkedWorkflowResult.error,
        standalone: standaloneWorkflowResult.error,
        expense: expenseWorkflowResult.error,
      })
      return NextResponse.json(
        { error: "Unable to load requisition approval workflows." },
        { status: 503, headers: responseHeaders },
      )
    }
    const workflowStates = [
      ...(Array.isArray(linkedWorkflowResult.data)
        ? linkedWorkflowResult.data
        : []),
      ...(Array.isArray(standaloneWorkflowResult.data)
        ? standaloneWorkflowResult.data
        : []),
      ...(Array.isArray(expenseWorkflowResult.data)
        ? expenseWorkflowResult.data
        : []),
    ] as Array<{ subjectId: string; workflowKey: string }>
    const workflowBySubject = new Map(
      workflowStates.map((state) => [
        `${state.workflowKey}:${state.subjectId}`,
        state,
      ]),
    )
    const requisitionsWithWorkflows = requisitionsWithCreatorNames.map(
      (requisition) => ({
        ...requisition,
        approval_workflow:
          workflowBySubject.get(
            `${
              requisition.source_expense_request_id
                ? "linked_requisition"
                : "standalone_requisition"
            }:${requisition.id}`,
          ) ?? null,
      }),
    )
    const expenseRequestsWithWorkflows: Record<string, unknown>[] =
      expenseRequestsWithCreatorNames.map((request) => ({
        ...request,
        approval_workflow:
          workflowBySubject.get(`expense_request:${request.id}`) ?? null,
      }))

    return NextResponse.json(
      {
        requisitions: requisitionsWithWorkflows,
        expenseRequests: expenseRequestsWithWorkflows,
        expenseRequestsToInitiate: canInitiateExpenseRequestPermission
          ? expenseRequestsWithWorkflows.filter(
              (request) =>
                request["status"] ===
                "pending_administration_officer_initiation",
            )
          : [],
        currentUserId: access.userId,
        permissions: {
          canCreate,
          canReview,
          canVerify,
          canAuthorize,
          canEditExpenseRequests,
          canDeleteExpenseRequests,
          canInitiateExpenseRequests: canInitiateExpenseRequestPermission,
          canCreateLinkedItems,
          canEditLinkedItems,
          canDeleteLinkedItems,
        },
      },
      { headers: responseHeaders },
    )
  } catch (err) {
    console.error("Requisitions GET failed", err)
    return NextResponse.json({ error: "Requisitions are unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

// POST /api/requisitions — create a requisition
export async function POST(request: Request) {
  try {
    const access = await getAccess()
    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })
    if (!(await canCreateRequisitions(access))) {
      return NextResponse.json(
        { error: "Only an Administration Officer can create requisitions." },
        { status: 403, headers: responseHeaders },
      )
    }

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null
    if (!body)
      return NextResponse.json({ error: "Provide requisition details." }, {
        status: 400,
        headers: responseHeaders,
      })

    const title = typeof body.title === "string" ? body.title.trim() : ""
    const departmentId = isUuid(body.departmentId) ? body.departmentId : null
    const currencyId = isUuid(body.currencyId) ? body.currencyId : null
    const serviceProviderId = isUuid(body.serviceProviderId)
      ? body.serviceProviderId
      : null
    const expenseCategoryId = isUuid(body.expenseCategoryId)
      ? body.expenseCategoryId
      : null
    const dueDate = isIsoDate(body.dueDate) ? body.dueDate : null
    const notes = typeof body.notes === "string" ? body.notes.trim() : ""
    const items = Array.isArray(body.items) ? body.items : []

    if (!title || title.length > 200)
      return NextResponse.json(
        { error: "Enter a requisition title (up to 200 characters)." },
        { status: 400, headers: responseHeaders },
      )
    if (!dueDate)
      return NextResponse.json({ error: "Enter a valid due date." }, {
        status: 400,
        headers: responseHeaders,
      })
    if (items.length === 0)
      return NextResponse.json({ error: "Add at least one line item." }, {
        status: 400,
        headers: responseHeaders,
      })

    for (const item of items) {
      if (!item || typeof item !== "object")
        return NextResponse.json({ error: "Invalid line item." }, {
          status: 400,
          headers: responseHeaders,
        })
      const desc =
        typeof (item as Record<string, unknown>).description === "string"
          ? String((item as Record<string, unknown>).description).trim()
          : ""
      const qty = Number((item as Record<string, unknown>).quantity)
      const rate = Number((item as Record<string, unknown>).rate)
      const catalogItemId = (item as Record<string, unknown>).catalog_item_id
      if (!desc)
        return NextResponse.json(
          { error: "Each item must have a description." },
          { status: 400, headers: responseHeaders },
        )
      if (!Number.isFinite(qty) || qty <= 0)
        return NextResponse.json(
          { error: "Each item must have a positive quantity." },
          { status: 400, headers: responseHeaders },
        )
      if (!Number.isFinite(rate) || rate < 0)
        return NextResponse.json(
          { error: "Each item must have a non-negative rate." },
          { status: 400, headers: responseHeaders },
        )
      if (
        catalogItemId !== undefined &&
        catalogItemId !== null &&
        catalogItemId !== "" &&
        !isUuid(catalogItemId)
      )
        return NextResponse.json(
          { error: "Select a valid company catalog item." },
          { status: 400, headers: responseHeaders },
        )
    }

    const admin = createAdminClient()
    if (!admin)
      return NextResponse.json(
        {
          error:
            "Requisition creation requires SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers: responseHeaders },
      )
    const { data: companySettings, error: settingsError } = await admin
      .from("companies")
      .select("expense_categories_enabled")
      .eq("id", access.companyId)
      .maybeSingle()
    if (settingsError || !companySettings) {
      console.error("Requisition settings lookup failed", settingsError)
      return NextResponse.json(
        { error: "Unable to verify company requisition settings." },
        { status: 503, headers: responseHeaders },
      )
    }
    if (companySettings.expense_categories_enabled && !expenseCategoryId)
      return NextResponse.json({ error: "Select an expense category." }, {
        status: 400,
        headers: responseHeaders,
      })
    let expenseCategory: { id: string } | null = null
    if (expenseCategoryId) {
      const { data, error: categoryError } = await admin
        .from("expense_categories")
        .select("id")
        .eq("id", expenseCategoryId)
        .eq("company_id", access.companyId)
        .eq("is_active", true)
        .maybeSingle()
      if (categoryError) {
        console.error(
          "Requisition expense category lookup failed",
          categoryError,
        )
        return NextResponse.json(
          { error: "Unable to verify the selected expense category." },
          { status: 503, headers: responseHeaders },
        )
      }
      if (!data)
        return NextResponse.json(
          { error: "Select an active expense category from this company." },
          { status: 400, headers: responseHeaders },
        )
      expenseCategory = data
    }

    // Call the security-definer RPC
    const { data, error } = await access.supabase.rpc("create_requisition", {
      p_company_id: access.companyId,
      p_title: title,
      p_department_id: departmentId,
      p_currency_id: currencyId,
      p_service_provider_id: serviceProviderId,
      p_due_date: dueDate,
      p_notes: notes,
      p_branch_id: access.branchId,
      p_expense_category_id: expenseCategory?.id ?? null,
      p_items: items.map((item) => ({
        description: String(
          (item as Record<string, unknown>).description ?? "",
        ).trim(),
        quantity: Number((item as Record<string, unknown>).quantity),
        rate: Number((item as Record<string, unknown>).rate),
        catalog_item_id:
          (item as Record<string, unknown>).catalog_item_id ?? null,
      })),
    })

    if (error) {
      if (error.code === "42501")
        return NextResponse.json({ error: error.message }, {
          status: 403,
          headers: responseHeaders,
        })
      if (error.code === "22023")
        return NextResponse.json({ error: error.message }, {
          status: 400,
          headers: responseHeaders,
        })
      console.error("Create requisition RPC failed", error)
      return NextResponse.json({ error: "Unable to create requisition." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    const result = data as {
      id?: string
      requisition_id?: string
      requisition_number?: string
    } | null
    const requisitionId = result?.id ?? result?.requisition_id
    const requisitionNumber = result?.requisition_number
    if (!requisitionId || !requisitionNumber)
      throw new Error("Requisition was created without an identifier.")

    return NextResponse.json({ requisitionId, requisitionNumber }, {
      status: 201,
      headers: responseHeaders,
    })
  } catch (err) {
    console.error("Requisitions POST failed", err)
    return NextResponse.json(
      { error: "Requisition creation is unavailable." },
      { status: 503, headers: responseHeaders },
    )
  }
}

// PUT /api/requisitions — verifier (finance) edits items at finance_review stage
export async function PUT(request: Request) {
  try {
    const access = await getAccess()
    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null
    if (!body || !isUuid(body.id))
      return NextResponse.json({ error: "Invalid request." }, {
        status: 400,
        headers: responseHeaders,
      })
    const { data: visibleRequisition, error: visibilityError } =
      await access.supabase
        .from("company_requisitions")
        .select("id, source_expense_request_id")
        .eq("id", body.id)
        .eq("company_id", access.companyId)
        .maybeSingle()
    if (visibilityError)
      return NextResponse.json(
        { error: "Unable to verify requisition branch access." },
        { status: 500, headers: responseHeaders },
      )
    if (!visibleRequisition)
      return NextResponse.json({ error: "Requisition not found." }, {
        status: 404,
        headers: responseHeaders,
      })

    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0)
      return NextResponse.json({ error: "Add at least one line item." }, {
        status: 400,
        headers: responseHeaders,
      })

    for (const item of items) {
      if (!item || typeof item !== "object")
        return NextResponse.json({ error: "Invalid line item." }, {
          status: 400,
          headers: responseHeaders,
        })
      const desc =
        typeof (item as Record<string, unknown>).description === "string"
          ? String((item as Record<string, unknown>).description).trim()
          : ""
      const qty = Number((item as Record<string, unknown>).quantity)
      const rate = Number((item as Record<string, unknown>).rate)
      const itemId = (item as Record<string, unknown>).id
      const catalogItemId = (item as Record<string, unknown>).catalog_item_id
      if (
        (itemId !== undefined && itemId !== null && !isUuid(itemId)) ||
        (catalogItemId !== undefined &&
          catalogItemId !== null &&
          !isUuid(catalogItemId))
      )
        return NextResponse.json({ error: "Invalid line item identifier." }, {
          status: 400,
          headers: responseHeaders,
        })
      if (!desc)
        return NextResponse.json(
          { error: "Each item must have a description." },
          { status: 400, headers: responseHeaders },
        )
      if (!Number.isFinite(qty) || qty <= 0)
        return NextResponse.json(
          { error: "Each item must have a positive quantity." },
          { status: 400, headers: responseHeaders },
        )
      if (!Number.isFinite(rate) || rate < 0)
        return NextResponse.json(
          { error: "Each item must have a non-negative rate." },
          { status: 400, headers: responseHeaders },
        )
    }

    if (visibleRequisition.source_expense_request_id) {
      const { data, error } = await access.supabase.rpc(
        "manage_linked_requisition_items",
        {
          requested_company_id: access.companyId,
          requested_requisition_id: body.id,
          requested_items: items.map((item) => {
            const lineItem = item as Record<string, unknown>
            return {
              id: lineItem.id ?? null,
              description: String(lineItem.description ?? "").trim(),
              quantity: Number(lineItem.quantity),
              rate: Number(lineItem.rate),
              catalog_item_id: lineItem.catalog_item_id ?? null,
            }
          }),
        },
      )

      if (error) {
        if (error.code === "42501")
          return NextResponse.json({ error: error.message }, {
            status: 403,
            headers: responseHeaders,
          })
        if (["22023", "P0002", "23503", "40001"].includes(error.code ?? ""))
          return NextResponse.json({ error: error.message }, {
            status: 400,
            headers: responseHeaders,
          })
        console.error("Linked requisition item update RPC failed", error)
        return NextResponse.json(
          { error: "Unable to update linked Expense Request items." },
          { status: 500, headers: responseHeaders },
        )
      }

      return NextResponse.json(
        {
          ok: true,
          totalAmount: (data as { total_amount: number })?.total_amount,
        },
        { headers: responseHeaders },
      )
    }

    const { data, error } = await access.supabase.rpc(
      "update_requisition_items_as_verifier",
      {
        p_company_id: access.companyId,
        p_requisition_id: body.id,
        p_items: items.map((item) => ({
          description: String(
            (item as Record<string, unknown>).description ?? "",
          ).trim(),
          quantity: Number((item as Record<string, unknown>).quantity),
          rate: Number((item as Record<string, unknown>).rate),
        })),
      },
    )

    if (error) {
      if (error.code === "42501")
        return NextResponse.json({ error: error.message }, {
          status: 403,
          headers: responseHeaders,
        })
      if (["22023", "P0002"].includes(error.code ?? ""))
        return NextResponse.json({ error: error.message }, {
          status: 400,
          headers: responseHeaders,
        })
      console.error("Verifier item update RPC failed", error)
      return NextResponse.json({ error: "Unable to update items." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    return NextResponse.json(
      {
        ok: true,
        totalAmount: (data as { total_amount: number })?.total_amount,
      },
      { headers: responseHeaders },
    )
  } catch (err) {
    console.error("Requisitions PUT failed", err)
    return NextResponse.json({ error: "Item update is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

// PATCH /api/requisitions — update a pending requisition (creator only)
export async function PATCH(request: Request) {
  try {
    const access = await getAccess()
    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null
    if (!body || !isUuid(body.id))
      return NextResponse.json({ error: "Invalid request." }, {
        status: 400,
        headers: responseHeaders,
      })
    const { data: visibleRequisition, error: visibilityError } =
      await access.supabase
        .from("company_requisitions")
        .select("id")
        .eq("id", body.id)
        .eq("company_id", access.companyId)
        .maybeSingle()
    if (visibilityError)
      return NextResponse.json(
        { error: "Unable to verify requisition branch access." },
        { status: 500, headers: responseHeaders },
      )
    if (!visibleRequisition)
      return NextResponse.json({ error: "Requisition not found." }, {
        status: 404,
        headers: responseHeaders,
      })

    const title = typeof body.title === "string" ? body.title.trim() : ""
    const departmentId = isUuid(body.departmentId) ? body.departmentId : null
    const currencyId = isUuid(body.currencyId) ? body.currencyId : null
    const serviceProviderId = isUuid(body.serviceProviderId)
      ? body.serviceProviderId
      : null
    const expenseCategoryId = isUuid(body.expenseCategoryId)
      ? body.expenseCategoryId
      : null
    const dueDate = isIsoDate(body.dueDate) ? body.dueDate : null
    const notes = typeof body.notes === "string" ? body.notes.trim() : ""
    const items = Array.isArray(body.items) ? body.items : []

    if (!title || title.length > 200)
      return NextResponse.json({ error: "Enter a requisition title." }, {
        status: 400,
        headers: responseHeaders,
      })
    if (!dueDate)
      return NextResponse.json({ error: "Enter a valid due date." }, {
        status: 400,
        headers: responseHeaders,
      })
    if (items.length === 0)
      return NextResponse.json({ error: "Add at least one line item." }, {
        status: 400,
        headers: responseHeaders,
      })
    for (const item of items) {
      if (!item || typeof item !== "object")
        return NextResponse.json({ error: "Invalid line item." }, {
          status: 400,
          headers: responseHeaders,
        })
      const line = item as Record<string, unknown>
      const description =
        typeof line.description === "string" ? line.description.trim() : ""
      const quantity = Number(line.quantity)
      const rate = Number(line.rate)
      const catalogItemId = line.catalog_item_id
      if (
        !description ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(rate) ||
        rate < 0
      )
        return NextResponse.json(
          {
            error:
              "Each item needs a description, positive quantity, and non-negative rate.",
          },
          { status: 400, headers: responseHeaders },
        )
      if (
        catalogItemId !== undefined &&
        catalogItemId !== null &&
        catalogItemId !== "" &&
        !isUuid(catalogItemId)
      )
        return NextResponse.json(
          { error: "Select a valid company catalog item." },
          { status: 400, headers: responseHeaders },
        )
    }

    const admin = createAdminClient()
    if (!admin)
      return NextResponse.json(
        {
          error:
            "Requisition updates require SUPABASE_SERVICE_ROLE_KEY in the server environment.",
        },
        { status: 503, headers: responseHeaders },
      )
    const { data: companySettings, error: settingsError } = await admin
      .from("companies")
      .select("expense_categories_enabled")
      .eq("id", access.companyId)
      .maybeSingle()
    if (settingsError || !companySettings) {
      console.error("Requisition settings lookup failed", settingsError)
      return NextResponse.json(
        { error: "Unable to verify company requisition settings." },
        { status: 503, headers: responseHeaders },
      )
    }
    if (companySettings.expense_categories_enabled && !expenseCategoryId)
      return NextResponse.json({ error: "Select an expense category." }, {
        status: 400,
        headers: responseHeaders,
      })
    let expenseCategory: { id: string } | null = null
    if (expenseCategoryId) {
      const { data, error: categoryError } = await admin
        .from("expense_categories")
        .select("id")
        .eq("id", expenseCategoryId)
        .eq("company_id", access.companyId)
        .eq("is_active", true)
        .maybeSingle()
      if (categoryError) {
        console.error(
          "Requisition expense category lookup failed",
          categoryError,
        )
        return NextResponse.json(
          { error: "Unable to verify the selected expense category." },
          { status: 503, headers: responseHeaders },
        )
      }
      if (!data)
        return NextResponse.json(
          { error: "Select an active expense category from this company." },
          { status: 400, headers: responseHeaders },
        )
      expenseCategory = data
    }

    const { data, error } = await access.supabase.rpc("update_requisition", {
      p_company_id: access.companyId,
      p_requisition_id: body.id,
      p_title: title,
      p_department_id: departmentId,
      p_currency_id: currencyId,
      p_service_provider_id: serviceProviderId,
      p_due_date: dueDate,
      p_notes: notes,
      p_expense_category_id: expenseCategory?.id ?? null,
      p_items: items.map((item) => ({
        description: String(
          (item as Record<string, unknown>).description ?? "",
        ).trim(),
        quantity: Number((item as Record<string, unknown>).quantity),
        rate: Number((item as Record<string, unknown>).rate),
        catalog_item_id:
          (item as Record<string, unknown>).catalog_item_id ?? null,
      })),
    })

    if (error) {
      if (error.code === "42501")
        return NextResponse.json({ error: error.message }, {
          status: 403,
          headers: responseHeaders,
        })
      if (error.code === "22023" || error.code === "P0002")
        return NextResponse.json({ error: error.message }, {
          status: 400,
          headers: responseHeaders,
        })
      console.error("Update requisition RPC failed", error)
      return NextResponse.json({ error: "Unable to update requisition." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    return NextResponse.json(
      {
        ok: true,
        totalAmount: (data as { total_amount: number })?.total_amount,
      },
      { headers: responseHeaders },
    )
  } catch (err) {
    console.error("Requisitions PATCH failed", err)
    return NextResponse.json({ error: "Requisition update is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}
