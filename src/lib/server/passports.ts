import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PassportAccess =
  | {
      supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
      companyId: string;
      userId: string;
      canManageStatus: boolean;
    }
  | { error: string; status: 401 | 403 | 503 };

export async function getPassportAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, role_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    console.error("Passport membership lookup failed", membershipError);
    return { error: "Unable to verify passport access.", status: 503 as const };
  }
  if (!membership) return { error: "Active company membership not found.", status: 403 as const };
  const [roleResult, companyResult] = await Promise.all([
    supabase.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
    supabase.from("companies").select("primary_admin_user_id").eq("id", membership.company_id).maybeSingle(),
  ]);
  if (roleResult.error || companyResult.error || !roleResult.data || !companyResult.data) {
    console.error("Passport status role lookup failed", roleResult.error ?? companyResult.error);
    return { error: "Unable to verify passport status access.", status: 503 as const };
  }
  const roleName = roleResult.data?.name?.trim().toLocaleLowerCase() ?? "";
  const canManageStatus = companyResult.data?.primary_admin_user_id === user.id
    || ["chairman", "company owner / primary administrator", "general manager", "supervisor"].includes(roleName);
  return { supabase, companyId: membership.company_id, userId: user.id, canManageStatus };
}

export async function hasPassportPermission(access: PassportAccess, permission: "passport.view" | "passport.edit") {
  if ("error" in access) return false;
  const { data, error } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: permission,
  });
  if (error) {
    console.error("Passport permission lookup failed", error);
    throw new Error("Unable to verify passport permissions.");
  }
  return Boolean(data);
}