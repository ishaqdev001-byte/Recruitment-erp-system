import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeDownloadName } from "@/lib/server/documents";
import { downloadCompanyDriveFile } from "@/lib/storage/interserver";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(_request: Request, context: { params: Promise<{ paycheckId: string }> }) {
  try {
    const { paycheckId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(paycheckId)) return NextResponse.json({ error: "Payslip not found." }, { status: 404, headers });

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    const { data: membership, error: membershipError } = await supabase.from("company_memberships")
      .select("company_id, branch_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Payslip storage is unavailable." }, { status: 503, headers });
    const [permission, mainBranch] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "finance.view" }),
      supabase.rpc("current_user_is_main_branch_user", { requested_company_id: membership.company_id }),
    ]);
    if (permission.error || mainBranch.error) return NextResponse.json({ error: "Unable to verify payslip access." }, { status: 503, headers });

    let paycheckQuery = admin.from("company_staff_paychecks")
      .select("id, company_id, staff_member_id, pay_period, payslip_path")
      .eq("id", paycheckId).eq("company_id", membership.company_id);
    if (permission.data && !mainBranch.data) {
      if (!membership.branch_id) return NextResponse.json({ error: "Your account must be assigned to a branch." }, { status: 403, headers });
      paycheckQuery = paycheckQuery.eq("branch_id", membership.branch_id);
    } else if (!permission.data) {
      const { data: ownStaff, error: staffError } = await admin.from("company_staff_members")
        .select("id").eq("company_id", membership.company_id).eq("linked_user_id", user.id);
      if (staffError) return NextResponse.json({ error: "Unable to verify payslip access." }, { status: 500, headers });
      const ownStaffIds = (ownStaff ?? []).map((staffMember) => staffMember.id);
      if (!ownStaffIds.length) return NextResponse.json({ error: "You do not have permission to view this payslip." }, { status: 403, headers });
      paycheckQuery = paycheckQuery.in("staff_member_id", ownStaffIds);
    }
    const { data: paycheck, error: paycheckError } = await paycheckQuery.maybeSingle();
    if (paycheckError || !paycheck) return NextResponse.json({ error: "Payslip not found." }, { status: 404, headers });

    const content = await downloadCompanyDriveFile(paycheck.payslip_path);
    const period = String(paycheck.pay_period).slice(0, 7);
    return new Response(new Uint8Array(content), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="payslip-${period}-${paycheck.id}.pdf"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Payslip download failed", error);
    return NextResponse.json({ error: "Payslip is unavailable." }, { status: 503, headers });
  }
}