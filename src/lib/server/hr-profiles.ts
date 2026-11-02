import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getCompanyChairmanHrAccess(companyId: string | null) {
  if (
    !companyId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      companyId,
    )
  ) {
    return { error: "A valid company is required.", status: 400 as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) {
    console.error("Chairman HR membership lookup failed:", membershipError);
    return {
      error: "Unable to verify company membership.",
      status: 503 as const,
    };
  }
  if (!membership) {
    return { error: "Active company membership not found.", status: 403 as const };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      error: "HR profile management is unavailable because server storage is not configured.",
      status: 503 as const,
    };
  }

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("primary_admin_user_id")
    .eq("id", membership.company_id)
    .maybeSingle();
  if (companyError) {
    console.error("Chairman HR access verification failed:", companyError);
    return { error: "Unable to verify company access.", status: 500 as const };
  }
  if (!company || company.primary_admin_user_id !== user.id) {
    return {
      error: "Only the company Chairman can view company HR profiles.",
      status: 403 as const,
    };
  }

  return { admin, companyId: membership.company_id };
}
