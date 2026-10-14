import { NextResponse } from "next/server";
import { getLinkedStaffAccess } from "@/lib/server/staff-profile";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const access = await getLinkedStaffAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const { data, error } = await access.admin.from("company_staff_paychecks")
    .select("id, pay_period, gross_amount, benefits_total, deductions_total, net_amount, payment_date, payment_method, payment_reference")
    .eq("company_id", access.companyId).eq("staff_member_id", access.staffId)
    .order("pay_period", { ascending: false }).order("payment_date", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load your payslips." }, { status: 500, headers });
  return NextResponse.json({ payslips: (data ?? []).map((paycheck) => ({
    ...paycheck,
    payslipUrl: `/api/paychecks/${paycheck.id}/payslip`,
  })) }, { headers });
}