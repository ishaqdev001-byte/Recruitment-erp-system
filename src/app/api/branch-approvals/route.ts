import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const REQUEST_TYPES = new Set(["requisition", "expense", "candidate_advance", "document_request", "medical_request", "custom"]);

async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, branch_id, role_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const admin = createAdminClient();
  if (!admin) return { error: "SUPABASE_SERVICE_ROLE_KEY is required.", status: 503 as const };

  const [{ data: role }, { data: isMainBranch }, canViewResult, canManageResult] = await Promise.all([
    admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
    supabase.rpc("current_user_is_main_branch_user", { requested_company_id: membership.company_id }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "approvals.view" }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "approvals.manage" }),
  ]);

  if (isMainBranch?.error) console.error("Main branch check failed", isMainBranch.error);
  if (canViewResult.error) console.error("Approval view permission check failed", canViewResult.error);
  if (canManageResult.error) console.error("Approval manage permission check failed", canManageResult.error);

  if (!canViewResult?.data && !canManageResult?.data) {
    return { error: "You do not have permission to view approvals.", status: 403 as const };
  }

  return {
    admin,
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id,
    roleName: (role?.name as string) ?? "",
    isMainBranch: isMainBranch?.data !== null && isMainBranch?.data !== undefined
      ? Boolean(isMainBranch.data)
      : membership.branch_id == null,
    canManage: Boolean(canManageResult?.data),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/branch-approvals — list approval requests
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "all"; // all, pending, mine, my-level

    let query = access.admin
      .from("branch_approval_requests")
      .select(`
        id, company_id, branch_id, request_type, title, description, amount,
        reference_id, reference_type, metadata, status, current_level,
        submitted_by, submitted_at, final_decision_at, final_decision_by, final_notes,
        created_at,
        branch:company_branches!inner(name, code, is_main_branch)
      `)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false });

    // Branch-scoped filtering
    if (!access.isMainBranch) {
      query = query.eq("branch_id", access.branchId ?? "");
    }

    const { data: requests, error: reqError } = await query.limit(200);
    if (reqError) {
      console.error("Approval list failed", reqError);
      return NextResponse.json({ error: "Unable to load approvals." }, { status: 500, headers });
    }

    // Fetch steps for all returned requests
    const requestIds = (requests ?? []).map((r) => r.id);
    let stepsMap = new Map<string, Array<{ level: string; level_order: number; approver_role: string; decision: string; decision_notes: string; decided_at: string | null }>>();
    if (requestIds.length) {
      const { data: steps } = await access.admin
        .from("branch_approval_steps")
        .select("id, request_id, level, level_order, approver_role, approver_id, decision, decision_notes, decided_at")
        .in("request_id", requestIds)
        .order("level_order");
      for (const s of steps ?? []) {
        const arr = stepsMap.get(s.request_id as string) ?? [];
        arr.push(s);
        stepsMap.set(s.request_id as string, arr);
      }
    }

    // Fetch submitter names
    const submitterIds = [...new Set((requests ?? []).map((r) => r.submitted_by))];
    const submitterNames = new Map<string, string>();
    if (submitterIds.length) {
      const { data: profiles } = await access.admin.from("profiles").select("id, display_name").in("id", submitterIds);
      for (const p of profiles ?? []) submitterNames.set(p.id, p.display_name);
    }

    // Apply client-side filters
    let filtered = requests ?? [];
    if (filter === "pending") {
      filtered = filtered.filter((r) => r.status === "pending");
    } else if (filter === "mine") {
      filtered = filtered.filter((r) => r.submitted_by === access.userId);
    } else if (filter === "my-level") {
      // Show requests at the user's approval level
      const levelMap: Record<string, string> = {
        "Branch Manager": "branch_manager",
        "Supervisor": "supervisor",
        "General Manager": "general_manager",
        "Chairman": "ceo",
        "CEO": "ceo",
      };
      const myLevel = levelMap[access.roleName];
      if (myLevel) {
        filtered = filtered.filter((r) => r.status === "pending" && r.current_level === myLevel);
      } else {
        filtered = filtered.filter((r) => r.status === "pending");
      }
    }

    const result = filtered.map((r) => {
      const branch = r.branch as unknown as { name: string; code: string; is_main_branch: boolean } | { name: string; code: string; is_main_branch: boolean }[] | null;
      const branchInfo = Array.isArray(branch) ? branch[0] : branch;
      return {
        id: r.id,
        requestType: r.request_type,
        title: r.title,
        description: r.description,
        amount: r.amount !== null ? Number(r.amount) : null,
        referenceId: r.reference_id,
        referenceType: r.reference_type,
        status: r.status,
        currentLevel: r.current_level,
        submittedBy: r.submitted_by,
        submittedByName: submitterNames.get(r.submitted_by) ?? "Unknown",
        submittedAt: r.submitted_at,
        branchName: branchInfo?.name ?? "Unknown",
        branchCode: branchInfo?.code ?? "",
        isMainBranch: branchInfo?.is_main_branch ?? false,
        finalDecisionAt: r.final_decision_at,
        finalNotes: r.final_notes,
        steps: (stepsMap.get(r.id) ?? []).map((s) => ({
          level: s.level,
          levelOrder: s.level_order,
          approverRole: s.approver_role,
          decision: s.decision,
          decisionNotes: s.decision_notes,
          decidedAt: s.decided_at,
        })),
      };
    });

    // Stats
    const all = requests ?? [];
    return NextResponse.json({
      requests: result,
      stats: {
        total: all.length,
        pending: all.filter((r) => r.status === "pending").length,
        approved: all.filter((r) => r.status === "approved").length,
        rejected: all.filter((r) => r.status === "rejected").length,
      },
      canManage: access.canManage,
      roleName: access.roleName,
      isMainBranch: access.isMainBranch,
    }, { headers });
  } catch (error) {
    console.error("Approvals GET failed", error);
    return NextResponse.json({ error: "Approval management is unavailable." }, { status: 503, headers });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/branch-approvals — submit, approve, reject, withdraw
// ═══════════════════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    const action = typeof body.action === "string" ? body.action : "";

    // ── submit-request ──────────────────────────────────────────────────────
    if (action === "submit-request") {
      if (!access.canManage) return NextResponse.json({ error: "You do not have permission to submit approval requests." }, { status: 403, headers });

      const requestType = typeof body.requestType === "string" ? body.requestType : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 4000) : "";
      const amount = typeof body.amount === "number" ? body.amount : null;
      const referenceId = typeof body.referenceId === "string" && isUuid(body.referenceId) ? body.referenceId : null;
      const referenceType = typeof body.referenceType === "string" ? body.referenceType : null;

      if (!REQUEST_TYPES.has(requestType)) return NextResponse.json({ error: "Invalid request type." }, { status: 400, headers });
      if (!title || title.length > 200) return NextResponse.json({ error: "Title must be between 1 and 200 characters." }, { status: 400, headers });

      // Use the user's branch, or main branch if they're on the main branch
      let branchId = access.branchId;
      if (!branchId) {
        const { data: mainBranch } = await access.admin.from("company_branches")
          .select("id").eq("company_id", access.companyId).eq("is_main_branch", true).maybeSingle();
        branchId = mainBranch?.id ?? null;
      }
      if (!branchId) return NextResponse.json({ error: "No branch found to submit from." }, { status: 400, headers });

      const { data, error } = await access.admin.from("branch_approval_requests").insert({
        company_id: access.companyId,
        branch_id: branchId,
        request_type: requestType,
        title,
        description,
        amount,
        reference_id: referenceId,
        reference_type: referenceType,
        submitted_by: access.userId,
      }).select("id, status, current_level").single();

      if (error || !data) {
        console.error("Approval request submit failed", error);
        return NextResponse.json({ error: "Unable to submit approval request." }, { status: 500, headers });
      }

      return NextResponse.json({ request: data }, { status: 201, headers });
    }

    // ── approve ──────────────────────────────────────────────────────────────
    if (action === "approve") {
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
      if (!isUuid(requestId)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

      const { data: result, error } = await access.supabase.rpc("advance_approval_chain", {
        p_request_id: requestId,
        p_company_id: access.companyId,
        p_decision: "approved",
        p_notes: notes,
        p_approver_id: access.userId,
      });

      if (error) {
        console.error("Approve failed", error);
        return NextResponse.json({ error: "Unable to approve request." }, { status: 500, headers });
      }

      const resultObj = result as Record<string, unknown> | null;
      if (resultObj?.error) return NextResponse.json({ error: resultObj.error }, { status: 403, headers });

      return NextResponse.json({ result: resultObj }, { headers });
    }

    // ── reject ───────────────────────────────────────────────────────────────
    if (action === "reject") {
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
      if (!isUuid(requestId)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

      const { data: result, error } = await access.supabase.rpc("advance_approval_chain", {
        p_request_id: requestId,
        p_company_id: access.companyId,
        p_decision: "rejected",
        p_notes: notes,
        p_approver_id: access.userId,
      });

      if (error) {
        console.error("Reject failed", error);
        return NextResponse.json({ error: "Unable to reject request." }, { status: 500, headers });
      }

      const resultObj = result as Record<string, unknown> | null;
      if (resultObj?.error) return NextResponse.json({ error: resultObj.error }, { status: 403, headers });

      return NextResponse.json({ result: resultObj }, { headers });
    }

    // ── withdraw ────────────────────────────────────────────────────────────
    if (action === "withdraw") {
      const requestId = typeof body.requestId === "string" ? body.requestId : "";
      if (!isUuid(requestId)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });

      const { data: existing } = await access.admin.from("branch_approval_requests")
        .select("submitted_by, status").eq("id", requestId).eq("company_id", access.companyId).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Request not found." }, { status: 404, headers });
      if (existing.submitted_by !== access.userId) return NextResponse.json({ error: "You can only withdraw your own requests." }, { status: 403, headers });
      if (existing.status !== "pending") return NextResponse.json({ error: "This request has already been decided." }, { status: 409, headers });

      const { error } = await access.admin.from("branch_approval_requests")
        .update({ status: "withdrawn" }).eq("id", requestId).eq("company_id", access.companyId);

      if (error) return NextResponse.json({ error: "Unable to withdraw request." }, { status: 500, headers });

      // Skip remaining steps
      await access.admin.from("branch_approval_steps")
        .update({ decision: "skipped" })
        .eq("request_id", requestId).eq("company_id", access.companyId).eq("decision", "pending");

      return NextResponse.json({ ok: true }, { headers });
    }

    return NextResponse.json({ error: "Unknown approval action." }, { status: 400, headers });
  } catch (error) {
    console.error("Approvals POST failed", error);
    return NextResponse.json({ error: "Approval management is unavailable." }, { status: 503, headers });
  }
}
