import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DriveCategory = "shared" | "finance";
export type DriveAction = "view" | "create" | "edit" | "move" | "delete";
export type DriveSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type DriveAccess =
  | { supabase: DriveSupabase; companyId: string; companyName: string; userId: string; userName: string; userEmail: string }
  | { error: string; status: 401 | 403 };

export async function getDriveAccess(): Promise<DriveAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 };

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { data: company } = await supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle();
  const userName = String(profile?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User").trim();
  return { supabase, companyId: membership.company_id, companyName: company?.name ?? "Company", userId: user.id, userName, userEmail: user.email ?? "" };
}

export async function canAccessDriveCategory(access: DriveAccess, category: DriveCategory, action: DriveAction, creatorId?: string | null) {
  if ("error" in access) return false;
  const { data, error } = await access.supabase.rpc("can_access_company_drive", {
    requested_company_id: access.companyId,
    requested_category: category,
    requested_action: action,
    requested_creator_id: creatorId ?? null,
  });
  return !error && Boolean(data);
}

export async function drivePermissions(access: DriveAccess, category: DriveCategory) {
  if ("error" in access) return { canUpload: false, canEdit: false, canMove: false, canDeleteAny: false, canManage: false };
  const [canUpload, canEdit, canMove, canDeleteAny, canManage] = await Promise.all([
    canAccessDriveCategory(access, category, "create"),
    canAccessDriveCategory(access, category, "edit"),
    canAccessDriveCategory(access, category, "move"),
    access.supabase.rpc("is_company_drive_admin", { requested_company_id: access.companyId }).then(({ data, error }) => !error && Boolean(data)),
    access.supabase.rpc("is_company_drive_finance_user", { requested_company_id: access.companyId }).then(({ data, error }) => !error && Boolean(data)),
  ]);
  return { canUpload, canEdit, canMove, canDeleteAny, canManage };
}

export async function getDriveActorNames(access: DriveAccess, actorIds: string[]) {
  if ("error" in access || actorIds.length === 0) return new Map<string, string>();
  const { data, error } = await access.supabase.from("profiles").select("id, display_name").in("id", actorIds);
  if (error) return new Map<string, string>();
  return new Map((data ?? []).map((profile) => [profile.id, profile.display_name || "Company user"]));
}
