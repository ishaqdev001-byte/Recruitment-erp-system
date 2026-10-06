import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PassportAccess =
  | { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; companyId: string; userId: string }
  | { error: string; status: 401 | 403 };

export async function getPassportAccess() {
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
  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function hasPassportPermission(access: PassportAccess, permission: "passport.view" | "passport.edit") {
  if ("error" in access) return false;
  const { data, error } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: permission,
  });
  return !error && Boolean(data);
}