import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getLinkedStaffAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const { data: canAccessHr, error: permissionError } = await supabase.rpc(
    "current_user_has_company_permission",
    {
      requested_company_id: membership.company_id,
      requested_permission: "human_resources.view",
    },
  );
  if (permissionError) return { error: "Unable to verify Human Resource access.", status: 503 as const };
  if (!canAccessHr) return { error: "You do not have permission to access Human Resource self-service.", status: 403 as const };

  const admin = createAdminClient();
  if (!admin) return { error: "Personal HR updates are unavailable because server storage is not configured.", status: 503 as const };
  const { data: company, error: companyError } = await admin.from("companies")
    .select("primary_admin_user_id")
    .eq("id", membership.company_id)
    .maybeSingle();
  if (companyError || !company) return { error: "Unable to verify company access.", status: 500 as const };
  if (company.primary_admin_user_id === user.id) return { error: "The company owner does not use employee self-service.", status: 403 as const };

  const { data: staff, error: staffError } = await admin.from("company_staff_members")
    .select("id")
    .eq("company_id", membership.company_id)
    .eq("linked_user_id", user.id)
    .maybeSingle();
  if (staffError) return { error: "Unable to load your HR profile.", status: 500 as const };
  if (!staff) return { error: "Your account is not linked to a staff profile. Ask the company owner to link it in Users & Roles.", status: 404 as const };

  return { admin, companyId: membership.company_id, userId: user.id, staffId: staff.id };
}