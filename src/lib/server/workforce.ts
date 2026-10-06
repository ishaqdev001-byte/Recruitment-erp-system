import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WorkforcePermission = "attendance.view" | "attendance.clock" | "attendance.manage" | "leave.view" | "leave.create" | "leave.manage";
export type WorkforceSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type WorkforceAccess =
  | { supabase: WorkforceSupabase; companyId: string; userId: string }
  | { error: string; status: 401 | 403 };

export async function getWorkforceAccess(): Promise<WorkforceAccess> {
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

  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function hasWorkforcePermission(access: WorkforceAccess, permission: WorkforcePermission) {
  if ("error" in access) return false;
  const { data, error } = permission === "attendance.view" || permission === "attendance.manage"
    ? await access.supabase.rpc("current_user_can_manage_company_attendance", {
      requested_company_id: access.companyId,
    })
    : await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: permission,
    });
  return !error && Boolean(data);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
