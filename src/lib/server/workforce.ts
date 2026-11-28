import "server-only"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export type WorkforcePermission = "attendance.view" | "attendance.clock" | "attendance.manage" | "attendance.view_reports" | "leave.view" | "leave.create" | "leave.manage"

export type WorkforceSupabase = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

export type WorkforceAccess = {
  supabase: WorkforceSupabase
  companyId: string
  userId: string
} | { error: string; status: 401 | 403 | 503 }

export async function getWorkforceAccess(
  module: "attendance" | "leave",
): Promise<WorkforceAccess> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError || !membership)
    return { error: "Active company membership not found.", status: 403 }

  const { data: moduleEnabled, error: moduleError } = await supabase.rpc(
    "recruit_admin_current_user_company_feature_enabled",

    {
      requested_company_id: membership.company_id,

      requested_feature: "hr",
    },
  )

  if (moduleError) {
    console.error("Company module access check failed", moduleError)

    return {
      error: "Unable to verify access to this company module.",

      status: 503,
    }
  }

  if (!moduleEnabled) {
    return {
      error: `${
        module === "attendance" ? "Attendance" : "Leave"
      } is disabled for this company.`,

      status: 403,
    }
  }

  return { supabase, companyId: membership.company_id, userId: user.id }
}

export async function hasWorkforcePermission(
  access: WorkforceAccess,
  permission: WorkforcePermission,
) {
  if ("error" in access) return false

  const { data, error } = await access.supabase.rpc(
    "current_user_has_company_permission",

    {
      requested_company_id: access.companyId,

      requested_permission: permission,
    },
  )

  if (error) {
    console.error(`Unable to verify ${permission} permission`, error)

    return false
  }

  return Boolean(data)
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false

  const date = new Date(`${value}T00:00:00.000Z`)

  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  )
}
