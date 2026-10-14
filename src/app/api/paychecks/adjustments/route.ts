import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const paymentMethods = ["Bank transfer", "Mobile money", "Cash", "Cheque", "Other"] as const;

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getPayrollAccess(permission: "finance.view" | "finance.create") {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };
  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) return { error: "You do not have permission to manage payroll.", status: 403 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Payroll requires SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };
  return { admin, companyId: membership.company_id, userId: user.id };
}

function getCompanyInitials(name: string) {
  const initials = name.trim().split(/\s+/).map((part) => part[0] ?? "").join("").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 10);
  return /^[A-Z]/.test(initials) ? initials : "PAY";
}

function validPayPeriod(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-01$/.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export async function GET() {
  try {
    const access = await getPayrollAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    let { data: settings, error: settingsError } = await access.admin.from("company_payroll_reference_settings")
      .select("reference_prefix, next_sequence").eq("company_id", access.companyId).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) {
      const { data: company, error: companyError } = await access.admin.from("companies").select("name").eq("id", access.companyId).maybeSingle();
      if (companyError || !company) throw companyError ?? new Error("Company was not found.");
      const created = await access.admin.from("company_payroll_reference_settings").insert({
        company_id: access.companyId,
        reference_prefix: getCompanyInitials(company.name),
        next_sequence: 1,
      }).select("reference_prefix, next_sequence").single();
      if (created.error?.code === "23505") {
        const current = await access.admin.from("company_payroll_reference_settings").select("reference_prefix, next_sequence").eq("company_id", access.companyId).single();
        if (current.error) throw current.error;
        settings = current.data;
      } else {
        if (created.error) throw created.error;
        settings = created.data;
      }
    }

    const { data: adjustments, error } = await access.admin.from("company_staff_payroll_adjustments")
      .select("id, staff_member_id, pay_period, adjustment_type, amount, payment_method, payment_reference, description, paycheck_id, created_at")
      .eq("company_id", access.companyId).order("created_at", { ascending: false });
    if (error) throw error;
    const staffIds = [...new Set((adjustments ?? []).map((adjustment) => adjustment.staff_member_id))];
    const { data: staff, error: staffError } = staffIds.length
      ? await access.admin.from("company_staff_members").select("id, name, staff_id").eq("company_id", access.companyId).in("id", staffIds)
      : { data: [], error: null };
    if (staffError) throw staffError;
    const staffById = new Map((staff ?? []).map((member) => [member.id, member]));
    return NextResponse.json({
      adjustments: (adjustments ?? []).map((adjustment) => ({ ...adjustment, employee: staffById.get(adjustment.staff_member_id) ?? { name: "Staff member", staff_id: "" } })),
      referencePreview: `${settings.reference_prefix}-${String(settings.next_sequence).padStart(6, "0")}`,
    }, { headers });
  } catch (error) {
    console.error("Payroll adjustment list failed", error);
    return NextResponse.json({ error: "Payroll adjustments are unavailable. Apply the payroll adjustment migration and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getPayrollAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const staffMemberIds = Array.isArray(body?.staffMemberIds)
      ? [...new Set(body.staffMemberIds.filter((value): value is string => typeof value === "string"))]
      : [];
    const payPeriod = body?.payPeriod;
    const adjustmentType = body?.adjustmentType;
    const amount = Number(body?.amount);
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    if (!staffMemberIds.length || staffMemberIds.length > 500 || staffMemberIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))
      || !validPayPeriod(payPeriod) || !["benefit", "deduction"].includes(String(adjustmentType))
      || !Number.isFinite(amount) || amount <= 0 || amount > 999999999
      || !paymentMethods.includes(paymentMethod as (typeof paymentMethods)[number])
      || !description || description.length > 200) {
      return NextResponse.json({ error: "Select staff members and enter a valid month, amount, payment method, and description." }, { status: 400, headers });
    }

    const [{ data: selectedStaff, error: staffError }, { data: existingChecks, error: checksError }] = await Promise.all([
      access.admin.from("company_staff_members").select("id, name").eq("company_id", access.companyId).in("id", staffMemberIds),
      access.admin.from("company_staff_paychecks").select("staff_member_id").eq("company_id", access.companyId).eq("pay_period", payPeriod).in("staff_member_id", staffMemberIds),
    ]);
    if (staffError || checksError) throw staffError ?? checksError;
    if (!selectedStaff || selectedStaff.length !== staffMemberIds.length) return NextResponse.json({ error: "One or more selected staff members are not in this company." }, { status: 400, headers });
    if (existingChecks?.length) return NextResponse.json({ error: "A monthly payslip has already been issued for one or more selected staff. Record benefits and deductions before the monthly payment." }, { status: 409, headers });

    const { data: reference, error: referenceError } = await access.admin.rpc("allocate_company_payroll_reference", { requested_company_id: access.companyId });
    if (referenceError || typeof reference !== "string") throw referenceError ?? new Error("Payroll reference could not be allocated.");
    const { data: records, error } = await access.admin.from("company_staff_payroll_adjustments").insert(staffMemberIds.map((staffMemberId) => ({
      company_id: access.companyId,
      staff_member_id: staffMemberId,
      pay_period: payPeriod,
      adjustment_type: adjustmentType,
      amount: Math.round(amount * 100) / 100,
      payment_method: paymentMethod,
      payment_reference: reference,
      description,
      created_by: access.userId,
    }))).select("id, staff_member_id, pay_period, adjustment_type, amount, payment_method, payment_reference, description, created_at");
    if (error) throw error;
    return NextResponse.json({ reference, records, count: records?.length ?? 0 }, { status: 201, headers });
  } catch (error) {
    console.error("Payroll adjustment recording failed", error);
    return NextResponse.json({ error: "Unable to record payroll adjustments." }, { status: 503, headers });
  }
}