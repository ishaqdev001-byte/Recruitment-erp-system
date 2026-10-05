import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthorizedCompany(permission: "users.view" | "users.edit") {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) return { error: "You do not have permission to manage company users.", status: 403 as const };

  return { companyId: membership.company_id, userId: user.id };
}

export async function GET() {
  try {
    const access = await getAuthorizedCompany("users.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the Next.js server to enable user management." }, { status: 503, headers: responseHeaders });

    const [rolesResult, membershipsResult, permissionsResult, companyResult] = await Promise.all([
      admin.from("company_roles").select("id, name, description, created_at").eq("company_id", access.companyId).order("name"),
      admin.from("company_memberships").select("user_id, status, role_id, role:company_roles(name)").eq("company_id", access.companyId).order("created_at"),
      admin.from("permissions").select("code, description").order("code"),
      admin.from("companies").select("primary_admin_user_id").eq("id", access.companyId).single(),
    ]);
    if (rolesResult.error || membershipsResult.error || permissionsResult.error || companyResult.error) {
      console.error("Workspace user management query failed", rolesResult.error ?? membershipsResult.error ?? permissionsResult.error ?? companyResult.error);
      return NextResponse.json({ error: "Unable to load company users and roles." }, { status: 500, headers: responseHeaders });
    }

    const userIds = (membershipsResult.data ?? []).map((membership) => membership.user_id);
    const [{ data: profiles }, { data: authUsers, error: authUsersError }, { data: rolePermissions, error: rolePermissionsError }] = await Promise.all([
      userIds.length ? admin.from("profiles").select("id, display_name, phone, branch").in("id", userIds) : Promise.resolve({ data: [] as { id: string; display_name: string; phone: string; branch: string }[] }),
      admin.auth.admin.listUsers({ perPage: 1000 }),
      rolesResult.data?.length
        ? admin.from("role_permissions").select("role_id, permission_code").eq("company_id", access.companyId)
        : Promise.resolve({ data: [] as { role_id: string; permission_code: string }[], error: null }),
    ]);
    if (authUsersError || rolePermissionsError) {
      console.error("Workspace user details query failed", authUsersError ?? rolePermissionsError);
      return NextResponse.json({ error: "Unable to load user details." }, { status: 500, headers: responseHeaders });
    }

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    const authUserById = new Map((authUsers?.users ?? []).map((authUser) => [authUser.id, authUser]));
    const roleNameById = new Map((rolesResult.data ?? []).map((roleRecord) => [roleRecord.id, roleRecord.name]));
    const users = (membershipsResult.data ?? []).map((membership) => {
      const authUser = authUserById.get(membership.user_id);
      const joinedRole = membership.role as unknown as { name: string } | { name: string }[] | null;
      const role = Array.isArray(joinedRole) ? joinedRole[0]?.name : joinedRole?.name;
      return {
        id: membership.user_id,
        name: profileById.get(membership.user_id)?.display_name || String(authUser?.user_metadata?.full_name ?? "User"),
        email: authUser?.email ?? "",
        phone: profileById.get(membership.user_id)?.phone ?? "",
        branch: profileById.get(membership.user_id)?.branch ?? "",
        roleId: membership.role_id,
        role: role ?? roleNameById.get(membership.role_id) ?? "Unknown role",
        status: membership.status === "disabled" ? "disabled" : authUser?.confirmed_at ? membership.status : "invited",
        isPrimaryAdmin: membership.user_id === companyResult.data.primary_admin_user_id,
      };
    });

    return NextResponse.json({
      users,
      roles: rolesResult.data ?? [],
      permissions: permissionsResult.data ?? [],
      rolePermissions: rolePermissions ?? [],
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Workspace users request failed", error);
    return NextResponse.json({ error: "User management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAuthorizedCompany("users.edit");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the Next.js server to enable user management." }, { status: 503, headers: responseHeaders });

    const body = await request.json() as Record<string, unknown>;
    const lifecycleActions = new Set(["change-role", "set-status", "revoke-invite", "delete-user"]);
    if (typeof body.action === "string" && lifecycleActions.has(body.action)) {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) return NextResponse.json({ error: "Select a company user." }, { status: 400, headers: responseHeaders });
      if (userId === access.userId) return NextResponse.json({ error: "You cannot change or remove your own company access." }, { status: 400, headers: responseHeaders });

      const { data: membership, error: membershipError } = await admin
        .from("company_memberships")
        .select("user_id, status, role_id, role:company_roles(name)")
        .eq("company_id", access.companyId)
        .eq("user_id", userId)
        .maybeSingle();
      if (membershipError || !membership) return NextResponse.json({ error: "User is not a member of this company." }, { status: 404, headers: responseHeaders });
      const { data: company, error: companyError } = await admin.from("companies").select("primary_admin_user_id").eq("id", access.companyId).single();
      if (companyError) return NextResponse.json({ error: "Unable to verify protected company users." }, { status: 500, headers: responseHeaders });
      const targetRole = membership.role as unknown as { name: string } | { name: string }[] | null;
      const targetRoleName = Array.isArray(targetRole) ? targetRole[0]?.name : targetRole?.name;
      if (userId === company.primary_admin_user_id || targetRoleName === "Company Owner / Primary Administrator" || targetRoleName === "Primary Administrator") {
        return NextResponse.json({ error: "The primary company administrator account is protected from user-management actions." }, { status: 403, headers: responseHeaders });
      }

      if (body.action === "change-role") {
        const roleId = typeof body.roleId === "string" ? body.roleId : "";
        if (!roleId) return NextResponse.json({ error: "Select a role." }, { status: 400, headers: responseHeaders });
        const { data: role, error: roleError } = await admin.from("company_roles").select("id").eq("id", roleId).eq("company_id", access.companyId).maybeSingle();
        if (roleError || !role) return NextResponse.json({ error: "Selected role does not belong to this company." }, { status: 400, headers: responseHeaders });
        const { error } = await admin.from("company_memberships").update({ role_id: roleId }).eq("company_id", access.companyId).eq("user_id", userId);
        if (error) return NextResponse.json({ error: "Unable to change the user's role." }, { status: 500, headers: responseHeaders });
        return NextResponse.json({ success: true }, { headers: responseHeaders });
      }

      if (body.action === "set-status") {
        const status = body.status;
        if (status !== "active" && status !== "disabled") return NextResponse.json({ error: "Choose active or disabled status." }, { status: 400, headers: responseHeaders });
        const { error } = await admin.from("company_memberships").update({ status }).eq("company_id", access.companyId).eq("user_id", userId);
        if (error) return NextResponse.json({ error: "Unable to update the user's status." }, { status: 500, headers: responseHeaders });
        return NextResponse.json({ success: true }, { headers: responseHeaders });
      }

      const { data: otherMemberships, error: otherMembershipsError } = await admin
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", userId)
        .neq("company_id", access.companyId);
      if (otherMembershipsError) return NextResponse.json({ error: "Unable to verify the user's other company access." }, { status: 500, headers: responseHeaders });

      if (body.action === "revoke-invite") {
        const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
        if (authUserError || !authUser.user) return NextResponse.json({ error: "Unable to find the invited account." }, { status: 404, headers: responseHeaders });
        if (authUser.user.confirmed_at) return NextResponse.json({ error: "This user has already accepted the invitation." }, { status: 409, headers: responseHeaders });
      }

      if (!otherMemberships?.length) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return NextResponse.json({ error: "Unable to delete the user's account." }, { status: 500, headers: responseHeaders });
      } else {
        const { error } = await admin.from("company_memberships").delete().eq("company_id", access.companyId).eq("user_id", userId);
        if (error) return NextResponse.json({ error: body.action === "revoke-invite" ? "Unable to revoke the company invitation." : "Unable to remove the user from this company." }, { status: 500, headers: responseHeaders });
      }

      return NextResponse.json({ success: true }, { headers: responseHeaders });
    }

    if (body.action === "create-role") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const requestedPermissions = Array.isArray(body.permissions) ? body.permissions.filter((value): value is string => typeof value === "string") : [];
      if (!name || name.length > 100) return NextResponse.json({ error: "Role name must be between 1 and 100 characters." }, { status: 400, headers: responseHeaders });
      if (!description || description.length > 1000) return NextResponse.json({ error: "Role duties must be between 1 and 1,000 characters." }, { status: 400, headers: responseHeaders });

      const { data: catalog } = await admin.from("permissions").select("code");
      const allowedPermissions = new Set((catalog ?? []).map((permission) => permission.code));
      if (requestedPermissions.some((permission) => !allowedPermissions.has(permission))) {
        return NextResponse.json({ error: "One or more selected permissions are invalid." }, { status: 400, headers: responseHeaders });
      }

      const { data: role, error: roleError } = await admin
        .from("company_roles")
        .insert({ company_id: access.companyId, name, description })
        .select("id, name, description, created_at")
        .single();
      if (roleError || !role) {
        return NextResponse.json({ error: roleError?.code === "23505" ? "A role with that name already exists." : "Unable to create role." }, { status: 400, headers: responseHeaders });
      }

      if (requestedPermissions.length) {
        const { error } = await admin.from("role_permissions").insert(requestedPermissions.map((permission_code) => ({
          role_id: role.id,
          company_id: access.companyId,
          permission_code,
        })));
        if (error) {
          await admin.from("company_roles").delete().eq("id", role.id).eq("company_id", access.companyId);
          return NextResponse.json({ error: "Unable to save role permissions." }, { status: 500, headers: responseHeaders });
        }
      }

      return NextResponse.json({ role }, { status: 201, headers: responseHeaders });
    }

    if (body.action === "invite-user") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      const branch = typeof body.branch === "string" ? body.branch.trim() : "";
      const roleId = typeof body.roleId === "string" ? body.roleId : "";
      if (!name || name.length > 200 || !/^\S+@\S+\.\S+$/.test(email) || !roleId || phone.length > 100 || branch.length > 200) {
        return NextResponse.json({ error: "Enter a valid name, email, role, phone, and branch." }, { status: 400, headers: responseHeaders });
      }

      const { data: role, error: roleError } = await admin.from("company_roles").select("id, name").eq("id", roleId).eq("company_id", access.companyId).maybeSingle();
      if (roleError || !role) return NextResponse.json({ error: "Selected role does not belong to this company." }, { status: 400, headers: responseHeaders });
      if (role.name === "Company Owner / Primary Administrator" || role.name === "Primary Administrator") {
        return NextResponse.json({ error: "The primary administrator role is reserved for the protected company user." }, { status: 400, headers: responseHeaders });
      }

      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name } });
      if (inviteError || !inviteData.user) {
        return NextResponse.json({ error: inviteError?.message ?? "Unable to send invitation." }, { status: 400, headers: responseHeaders });
      }

      const userId = inviteData.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({ id: userId, display_name: name, phone, branch });
      const { error: membershipError } = profileError ? { error: profileError } : await admin.from("company_memberships").insert({
        company_id: access.companyId,
        user_id: userId,
        role_id: roleId,
        status: "active",
      });
      if (membershipError) {
        await admin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: "Invitation was created but could not be assigned to the company role." }, { status: 500, headers: responseHeaders });
      }

      return NextResponse.json({ user: { id: userId, name, email, phone, branch, roleId, status: "invited" } }, { status: 201, headers: responseHeaders });
    }

    return NextResponse.json({ error: "Unsupported user management action." }, { status: 400, headers: responseHeaders });
  } catch (error) {
    console.error("Workspace user management update failed", error);
    return NextResponse.json({ error: "Unable to save user management changes." }, { status: 503, headers: responseHeaders });
  }
}