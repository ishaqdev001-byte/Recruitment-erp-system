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

  // Fetch role, company info, and permissions in parallel.
  // Use safe fallbacks so that missing RPCs (pre-migration) don't crash.
  const [roleResult, companyResult, canManageResult, canViewResult, isMainBranchResult] = await Promise.all([
    admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
    admin.from("companies").select("primary_admin_user_id, name").eq("id", membership.company_id).maybeSingle(),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "branches.manage" }).then((r) => r).catch(() => ({ data: false, error: null })),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "branches.view" }).then((r) => r).catch(() => ({ data: false, error: null })),
    supabase.rpc("current_user_is_main_branch_user", { requested_company_id: membership.company_id }).then((r) => r).catch(() => ({ data: null, error: null })),
  ]);

  const roleName = (roleResult.data?.name as string) ?? "";
  const isOwner = companyResult.data?.primary_admin_user_id === user.id;
  const canManageBranches = isOwner || Boolean(canManageResult?.data);
  const canViewBranches = isOwner || Boolean(canViewResult?.data) || canManageBranches;

  if (!canViewBranches) return { error: "You do not have permission to view branches.", status: 403 as const };

  // Fall back to checking if the user's branch_id is null (= main branch)
  // when the RPC doesn't exist yet (pre-migration state).
  let isMainBranch: boolean;
  if (isMainBranchResult?.data !== null && isMainBranchResult?.data !== undefined) {
    isMainBranch = Boolean(isMainBranchResult.data);
  } else {
    // Pre-migration fallback: no branch_id means they're on the main branch
    isMainBranch = membership.branch_id == null;
  }

  return {
    admin,
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    roleName,
    isMainBranch,
    canManageBranches,
    companyName: companyResult.data?.name ?? "",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/branches — list branches
// ═══════════════════════════════════════════════════════════════════════════════
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data: branches, error: branchError } = await access.admin
      .from("company_branches")
      .select("id, company_id, name, code, is_main_branch, address, phone, manager_user_id, status, created_at")
      .eq("company_id", access.companyId)
      .order("is_main_branch", { ascending: false })
      .order("name");

    if (branchError) {
      console.error("Branch list failed", branchError);
      return NextResponse.json({ error: "Unable to load branches." }, { status: 500, headers });
    }

    // Get member counts per branch
    const { data: memberships } = await access.admin
      .from("company_memberships")
      .select("branch_id, user_id")
      .eq("company_id", access.companyId)
      .eq("status", "active");

    const memberCounts = new Map<string, number>();
    for (const m of memberships ?? []) {
      const key = m.branch_id ?? "__main__";
      memberCounts.set(key, (memberCounts.get(key) ?? 0) + 1);
    }

    // Get manager names
    const managerIds = [...new Set((branches ?? []).map((b) => b.manager_user_id).filter((id): id is string => Boolean(id)))];
    const managerNames = new Map<string, string>();
    if (managerIds.length) {
      const { data: profiles } = await access.admin.from("profiles").select("id, display_name").in("id", managerIds);
      for (const p of profiles ?? []) managerNames.set(p.id, p.display_name);
    }

    const result = (branches ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      isMainBranch: b.is_main_branch,
      address: b.address,
      phone: b.phone,
      managerUserId: b.manager_user_id,
      managerName: b.manager_user_id ? managerNames.get(b.manager_user_id) ?? "Unknown" : null,
      memberCount: memberCounts.get(b.id) ?? 0,
      status: b.status,
    }));

    // Also return the current user's branch info — safe fallback if RPC not yet available
    let myBranchId: string | null = null;
    try {
      const { data } = await access.supabase.rpc("current_user_branch_id", { requested_company_id: access.companyId });
      myBranchId = (data as string | null) ?? null;
    } catch {
      // RPC not yet available (migration pending) — leave as null
    }

    return NextResponse.json({
      branches: result,
      myBranchId: myBranchId ?? null,
      isMainBranchUser: access.isMainBranch,
      canManage: access.canManageBranches,
    }, { headers });
  } catch (error) {
    console.error("Branches GET failed", error);
    return NextResponse.json({ error: "Branch management is unavailable." }, { status: 503, headers });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/branches — create branch, update branch, assign member, deactivate
// ═══════════════════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    if (!access.canManageBranches) {
      return NextResponse.json({ error: "You do not have permission to manage branches." }, { status: 403, headers });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers });
    const action = typeof body.action === "string" ? body.action : "";

    // ── create-branch ──────────────────────────────────────────────────────
    if (action === "create-branch") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
      const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 60) : "";
      const managerUserId = typeof body.managerUserId === "string" && isUuid(body.managerUserId) ? body.managerUserId : null;

      if (!name || name.length > 120) return NextResponse.json({ error: "Branch name must be between 1 and 120 characters." }, { status: 400, headers });
      if (!code || code.length > 20) return NextResponse.json({ error: "Branch code must be between 1 and 20 characters." }, { status: 400, headers });

      const { data, error } = await access.admin.from("company_branches").insert({
        company_id: access.companyId,
        name,
        code,
        address,
        phone,
        manager_user_id: managerUserId,
        is_main_branch: false,
        created_by: access.userId,
      }).select("id, name, code, status").single();

      if (error?.code === "23505") return NextResponse.json({ error: "A branch with that name or code already exists." }, { status: 409, headers });
      if (error || !data) return NextResponse.json({ error: "Unable to create branch." }, { status: 500, headers });

      return NextResponse.json({ branch: data }, { status: 201, headers });
    }

    // ── update-branch ───────────────────────────────────────────────────────
    if (action === "update-branch") {
      const branchId = typeof body.branchId === "string" ? body.branchId : "";
      if (!isUuid(branchId)) return NextResponse.json({ error: "Select a branch." }, { status: 400, headers });

      const { data: existing } = await access.admin.from("company_branches")
        .select("id, is_main_branch").eq("id", branchId).eq("company_id", access.companyId).maybeSingle();
      if (!existing) return NextResponse.json({ error: "Branch not found." }, { status: 404, headers });

      const updates: Record<string, unknown> = {};
      if (typeof body.name === "string") updates.name = body.name.trim().slice(0, 120);
      if (typeof body.code === "string") updates.code = body.code.trim().toUpperCase().slice(0, 20);
      if (typeof body.address === "string") updates.address = body.address.trim().slice(0, 500);
      if (typeof body.phone === "string") updates.phone = body.phone.trim().slice(0, 60);
      if (typeof body.managerUserId === "string") updates.manager_user_id = isUuid(body.managerUserId) ? body.managerUserId : null;
      if (typeof body.status === "string" && ["active", "inactive"].includes(body.status)) updates.status = body.status;

      // Main branch name and code are protected
      if (existing.is_main_branch && (updates.name || updates.code)) {
        return NextResponse.json({ error: "The Main Branch name and code cannot be changed." }, { status: 403, headers });
      }

      if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update." }, { status: 400, headers });

      const { data, error } = await access.admin.from("company_branches").update(updates)
        .eq("id", branchId).eq("company_id", access.companyId)
        .select("id, name, code, status").single();

      if (error?.code === "23505") return NextResponse.json({ error: "A branch with that name or code already exists." }, { status: 409, headers });
      if (error || !data) return NextResponse.json({ error: "Unable to update branch." }, { status: 500, headers });

      return NextResponse.json({ branch: data }, { headers });
    }

    // ── set-member-branch ───────────────────────────────────────────────────
    if (action === "set-member-branch") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      const branchId = typeof body.branchId === "string" ? body.branchId : null;

      if (!isUuid(userId)) return NextResponse.json({ error: "Select a user." }, { status: 400, headers });
      if (branchId !== null && !isUuid(branchId)) return NextResponse.json({ error: "Invalid branch." }, { status: 400, headers });

      // Verify the branch belongs to this company (or null for main)
      if (branchId) {
        const { data: branch } = await access.admin.from("company_branches")
          .select("id").eq("id", branchId).eq("company_id", access.companyId).maybeSingle();
        if (!branch) return NextResponse.json({ error: "Branch not found in this company." }, { status: 400, headers });
      }

      // Prevent changing the chairman's branch
      const { data: targetMembership } = await access.admin.from("company_memberships")
        .select("user_id, role:company_roles!inner(name)")
        .eq("company_id", access.companyId).eq("user_id", userId).maybeSingle();
      if (targetMembership) {
        const roleValue = targetMembership.role as unknown as { name: string } | { name: string }[] | null;
        const targetRoleName = Array.isArray(roleValue) ? roleValue[0]?.name : roleValue?.name;
        if (targetRoleName === "Chairman") {
          return NextResponse.json({ error: "The Chairman is always on the Main Branch." }, { status: 403, headers });
        }
      }

      const { error } = await access.admin.from("company_memberships")
        .update({ branch_id: branchId })
        .eq("company_id", access.companyId)
        .eq("user_id", userId);

      if (error) return NextResponse.json({ error: "Unable to assign branch." }, { status: 500, headers });
      return NextResponse.json({ ok: true }, { headers });
    }

    // ── deactivate-branch ────────────────────────────────────────────────────
    if (action === "deactivate-branch") {
      const branchId = typeof body.branchId === "string" ? body.branchId : "";
      if (!isUuid(branchId)) return NextResponse.json({ error: "Select a branch." }, { status: 400, headers });

      const { data: branch } = await access.admin.from("company_branches")
        .select("id, is_main_branch").eq("id", branchId).eq("company_id", access.companyId).maybeSingle();
      if (!branch) return NextResponse.json({ error: "Branch not found." }, { status: 404, headers });
      if (branch.is_main_branch) return NextResponse.json({ error: "The Main Branch cannot be deactivated." }, { status: 403, headers });

      // Reassign all members to the main branch
      const { data: mainBranch } = await access.admin.from("company_branches")
        .select("id").eq("company_id", access.companyId).eq("is_main_branch", true).maybeSingle();

      if (mainBranch) {
        await access.admin.from("company_memberships")
          .update({ branch_id: mainBranch.id })
          .eq("company_id", access.companyId)
          .eq("branch_id", branchId);
      }

      const { error } = await access.admin.from("company_branches")
        .update({ status: "inactive" })
        .eq("id", branchId).eq("company_id", access.companyId);

      if (error) return NextResponse.json({ error: "Unable to deactivate branch." }, { status: 500, headers });
      return NextResponse.json({ ok: true }, { headers });
    }

    return NextResponse.json({ error: "Unknown branch action." }, { status: 400, headers });
  } catch (error) {
    console.error("Branches POST failed", error);
    return NextResponse.json({ error: "Branch management is unavailable." }, { status: 503, headers });
  }
}
