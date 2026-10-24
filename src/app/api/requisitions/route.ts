import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id, branch_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: "Active company membership not found.", status: 403 as const };
  return { supabase, companyId: membership.company_id, userId: user.id, branchId: membership.branch_id ?? null };
}

async function insertNotification(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  requisitionId: string,
  recipientId: string,
  stage: string,
  title: string,
  body: string,
) {
  if (!admin) return;
  await admin.from("requisition_notifications").insert({
    company_id: companyId,
    requisition_id: requisitionId,
    recipient_id: recipientId,
    stage,
    title,
    body,
  }).then(({ error }) => {
    if (error) console.error("Requisition notification insert failed", error);
  });
}

async function notifyUsersWithPermission(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  requisitionId: string,
  permissionCode: string,
  stage: string,
  title: string,
  body: string,
) {
  if (!admin) return;
  // Find all active members with the required permission via role_permissions
  const { data: permUsers, error } = await admin
    .from("role_permissions")
    .select("company_id, company_roles(company_id, company_memberships(user_id, status))")
    .eq("company_id", companyId)
    .eq("permission_code", permissionCode);

  if (error || !permUsers || permUsers.length === 0) return;

  const userIds = new Set<string>();
  
  for (const row of permUsers) {
    // Handle different possible response structures
    const roles = (row as any).company_roles;
    if (!roles) continue;
    
    // If roles is an array of roles
    if (Array.isArray(roles)) {
      for (const role of roles) {
        const memberships = role?.company_memberships;
        if (Array.isArray(memberships)) {
          for (const m of memberships) {
            if (m?.status === "active" && m?.user_id) {
              userIds.add(m.user_id);
            }
          }
        }
      }
    } else if (typeof roles === "object") {
      // If roles is a single object
      const memberships = roles.company_memberships;
      if (Array.isArray(memberships)) {
        for (const m of memberships) {
          if (m?.status === "active" && m?.user_id) {
            userIds.add(m.user_id);
          }
        }
      }
    }
  }

  for (const uid of userIds) {
    await insertNotification(admin, companyId, requisitionId, uid, stage, title, body);
  }
}

// GET /api/requisitions — list requisitions for the company
export async function GET(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status") ?? "";
    const myOnly = url.searchParams.get("mine") === "1";

    let query = access.supabase
      .from("company_requisitions")
      .select(`
        id, requisition_number, title, department_name, currency_code,
        service_provider_name, due_date, notes, total_amount, status,
        amount_paid, payment_status,
        general_manager_status, general_manager_reviewed_at, general_manager_note,
        finance_status, finance_reviewed_at, finance_note,
        director_status, director_reviewed_at, director_note,
        created_by, created_at, updated_at
      `)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter) query = query.eq("status", statusFilter);
    if (myOnly) query = query.eq("created_by", access.userId);
    // Branch-scoped: non-main-branch users see only their branch's requisitions
    if (access.branchId) query = query.eq("branch_id", access.branchId);

    const { data: requisitions, error } = await query;
    if (error) {
      console.error("Requisitions query failed", error);
      return NextResponse.json({ error: "Unable to load requisitions. Apply migration 202610180001_requisitions.sql if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    // Check permissions with error handling
    const permissionResults = await Promise.allSettled([
      access.supabase.rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "requisitions.create" }),
      access.supabase.rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "requisitions.review" }),
      access.supabase.rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "requisitions.verify" }),
      access.supabase.rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "requisitions.authorize" }),
    ]);

    const getPermissionResult = (result: PromiseSettledResult<any>): boolean => {
      if (result.status === "rejected") return false;
      if (result.value?.error) return false;
      return Boolean(result.value?.data ?? false);
    };

    return NextResponse.json({
      requisitions: Array.isArray(requisitions) ? requisitions : [],
      currentUserId: access.userId,
      permissions: {
        canCreate: getPermissionResult(permissionResults[0]),
        canReview: getPermissionResult(permissionResults[1]),
        canVerify: getPermissionResult(permissionResults[2]),
        canAuthorize: getPermissionResult(permissionResults[3]),
      },
    }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisitions GET failed", err);
    return NextResponse.json({ error: "Requisitions are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// POST /api/requisitions — create a requisition
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Provide requisition details." }, { status: 400, headers: responseHeaders });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const departmentId = isUuid(body.departmentId) ? body.departmentId : null;
    const currencyId = isUuid(body.currencyId) ? body.currencyId : null;
    const serviceProviderId = isUuid(body.serviceProviderId) ? body.serviceProviderId : null;
    const dueDate = isIsoDate(body.dueDate) ? body.dueDate : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const items = Array.isArray(body.items) ? body.items : [];

    if (!title || title.length > 200) return NextResponse.json({ error: "Enter a requisition title (up to 200 characters)." }, { status: 400, headers: responseHeaders });
    if (!dueDate) return NextResponse.json({ error: "Enter a valid due date." }, { status: 400, headers: responseHeaders });
    if (items.length === 0) return NextResponse.json({ error: "Add at least one line item." }, { status: 400, headers: responseHeaders });

    for (const item of items) {
      if (!item || typeof item !== "object") return NextResponse.json({ error: "Invalid line item." }, { status: 400, headers: responseHeaders });
      const desc = typeof (item as Record<string, unknown>).description === "string" ? String((item as Record<string, unknown>).description).trim() : "";
      const qty = Number((item as Record<string, unknown>).quantity);
      const rate = Number((item as Record<string, unknown>).rate);
      if (!desc) return NextResponse.json({ error: "Each item must have a description." }, { status: 400, headers: responseHeaders });
      if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "Each item must have a positive quantity." }, { status: 400, headers: responseHeaders });
      if (!Number.isFinite(rate) || rate < 0) return NextResponse.json({ error: "Each item must have a non-negative rate." }, { status: 400, headers: responseHeaders });
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
      p_items: JSON.stringify(items.map((item) => ({
        description: String((item as Record<string, unknown>).description ?? "").trim(),
        quantity: Number((item as Record<string, unknown>).quantity),
        rate: Number((item as Record<string, unknown>).rate),
      }))),
    });

    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
      if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
      console.error("Create requisition RPC failed", error);
      return NextResponse.json({ error: "Unable to create requisition." }, { status: 500, headers: responseHeaders });
    }

    const result = data as { requisition_id: string; requisition_number: string };

    // Notify GM-level users that a new requisition awaits review
    const admin = createAdminClient();
    await notifyUsersWithPermission(
      admin,
      access.companyId,
      result.requisition_id,
      "requisitions.review",
      "created",
      "New requisition awaiting your review",
      `Requisition ${result.requisition_number} — "${title}" has been submitted and is awaiting General Manager review.`,
    );

    return NextResponse.json({ requisitionId: result.requisition_id, requisitionNumber: result.requisition_number }, { status: 201, headers: responseHeaders });
  } catch (err) {
    console.error("Requisitions POST failed", err);
    return NextResponse.json({ error: "Requisition creation is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PUT /api/requisitions — verifier (finance) edits items at finance_review stage
export async function PUT(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ error: "Add at least one line item." }, { status: 400, headers: responseHeaders });

    for (const item of items) {
      if (!item || typeof item !== "object") return NextResponse.json({ error: "Invalid line item." }, { status: 400, headers: responseHeaders });
      const desc = typeof (item as Record<string, unknown>).description === "string" ? String((item as Record<string, unknown>).description).trim() : "";
      const qty = Number((item as Record<string, unknown>).quantity);
      const rate = Number((item as Record<string, unknown>).rate);
      if (!desc) return NextResponse.json({ error: "Each item must have a description." }, { status: 400, headers: responseHeaders });
      if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "Each item must have a positive quantity." }, { status: 400, headers: responseHeaders });
      if (!Number.isFinite(rate) || rate < 0) return NextResponse.json({ error: "Each item must have a non-negative rate." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.rpc("update_requisition_items_as_verifier", {
      p_company_id: access.companyId,
      p_requisition_id: body.id,
      p_items: JSON.stringify(items.map((item) => ({
        description: String((item as Record<string, unknown>).description ?? "").trim(),
        quantity: Number((item as Record<string, unknown>).quantity),
        rate: Number((item as Record<string, unknown>).rate),
      }))),
    });

    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
      if (["22023", "P0002"].includes(error.code ?? "")) return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
      console.error("Verifier item update RPC failed", error);
      return NextResponse.json({ error: "Unable to update items." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json({ ok: true, totalAmount: (data as { total_amount: number })?.total_amount }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisitions PUT failed", err);
    return NextResponse.json({ error: "Item update is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PATCH /api/requisitions — update a pending requisition (creator only)
export async function PATCH(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const departmentId = isUuid(body.departmentId) ? body.departmentId : null;
    const currencyId = isUuid(body.currencyId) ? body.currencyId : null;
    const serviceProviderId = isUuid(body.serviceProviderId) ? body.serviceProviderId : null;
    const dueDate = isIsoDate(body.dueDate) ? body.dueDate : null;
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const items = Array.isArray(body.items) ? body.items : [];

    if (!title || title.length > 200) return NextResponse.json({ error: "Enter a requisition title." }, { status: 400, headers: responseHeaders });
    if (!dueDate) return NextResponse.json({ error: "Enter a valid due date." }, { status: 400, headers: responseHeaders });
    if (items.length === 0) return NextResponse.json({ error: "Add at least one line item." }, { status: 400, headers: responseHeaders });

    const { data, error } = await access.supabase.rpc("update_requisition", {
      p_company_id: access.companyId,
      p_requisition_id: body.id,
      p_title: title,
      p_department_id: departmentId,
      p_currency_id: currencyId,
      p_service_provider_id: serviceProviderId,
      p_due_date: dueDate,
      p_notes: notes,
      p_items: JSON.stringify(items.map((item) => ({
        description: String((item as Record<string, unknown>).description ?? "").trim(),
        quantity: Number((item as Record<string, unknown>).quantity),
        rate: Number((item as Record<string, unknown>).rate),
      }))),
    });

    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
      if (error.code === "22023" || error.code === "P0002") return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
      console.error("Update requisition RPC failed", error);
      return NextResponse.json({ error: "Unable to update requisition." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json({ ok: true, totalAmount: (data as { total_amount: number })?.total_amount }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisitions PATCH failed", err);
    return NextResponse.json({ error: "Requisition update is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
