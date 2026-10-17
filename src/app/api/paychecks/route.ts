import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteCompanyDriveFile, uploadCompanyDriveFile } from "@/lib/storage/interserver";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const paymentMethods = ["Bank transfer", "Mobile money", "Cash", "Cheque", "Other"] as const;
const pageWidth = 595.28;
const pageHeight = 841.89;

type PayLine = { description: string; amount: number };
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
  if (permissionError || !allowed) return { error: `You do not have permission to ${permission === "finance.view" ? "view" : "record"} payroll.`, status: 403 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Payroll requires SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };
  return { admin, companyId: membership.company_id, userId: user.id };
}

function parseLines(value: unknown): PayLine[] | null {
  if (!Array.isArray(value) || value.length > 5) return null;
  const lines: PayLine[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const amount = Number(item.amount);
    if (!description || description.length > 100 || !Number.isFinite(amount) || amount < 0 || amount > 999999999) return null;
    if (amount > 0) lines.push({ description, amount: Math.round(amount * 100) / 100 });
  }
  return lines;
}

function formatMoney(value: number) {
  return `UGX ${value.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function embedLogo(pdf: PDFDocument, value: string): Promise<PDFImage | null> {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  try {
    let mimeType: "image/png" | "image/jpeg";
    let bytes: Buffer;
    if (match) {
      mimeType = match[1] === "png" ? "image/png" : "image/jpeg";
      bytes = Buffer.from(match[2], "base64");
    } else {
      const logoUrl = new URL(value);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl || logoUrl.origin !== new URL(supabaseUrl).origin) return null;
      const response = await fetch(logoUrl, { redirect: "error", signal: AbortSignal.timeout(3000) });
      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (!response.ok || (contentType !== "image/png" && contentType !== "image/jpeg")) return null;
      bytes = Buffer.from(await response.arrayBuffer());
      mimeType = contentType;
    }
    if (bytes.byteLength > 2_000_000) return null;
    return mimeType === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch {
    return null;
  }
}

function text(page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  page.drawText(value.replace(/[^\x20-\x7E]/g, " ").slice(0, 110), { x, y, size, font, color });
}

async function generatePayslip(input: {
  company: { name: string; logo_url: string | null; registration_number: string | null; phone: string | null; email: string | null; office_address: string | null };
  employee: { name: string; staff_id: string; position: string };
  payPeriod: string;
  paymentDate: string;
  paymentMethod: string;
  paymentReference: string;
  baseSalary: number;
  earnings: PayLine[];
  benefits: PayLine[];
  deductions: PayLine[];
  gross: number;
  benefitsTotal: number;
  deductionsTotal: number;
  net: number;
}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payslip ${input.employee.staff_id} ${input.payPeriod}`);
  pdf.setAuthor(input.company.name || "Company");
  const page = pdf.addPage([pageWidth, pageHeight]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.12, 0.16, 0.19);
  const muted = rgb(0.38, 0.43, 0.47);
  const accent = rgb(0.05, 0.43, 0.48);
  const line = rgb(0.84, 0.88, 0.89);
  const logo = await embedLogo(pdf, input.company.logo_url ?? "");
  if (logo) {
    const dimensions = logo.scale(Math.min(1, 74 / logo.width, 58 / logo.height));
    page.drawImage(logo, { x: 48, y: 758, width: dimensions.width, height: dimensions.height });
  }

  text(page, input.company.name || "Company", 48, 738, 16, bold, dark);
  const companyDetails = [input.company.registration_number, input.company.office_address, input.company.phone, input.company.email].filter(Boolean).join("  |  ");
  if (companyDetails) text(page, companyDetails, 48, 720, 8, regular, muted);
  text(page, "PAYSLIP", 435, 770, 21, bold, accent);
  text(page, `PAY PERIOD  ${input.payPeriod}`, 435, 748, 9, bold, dark);
  text(page, `PAID  ${input.paymentDate}`, 435, 732, 9, regular, muted);
  page.drawLine({ start: { x: 48, y: 698 }, end: { x: pageWidth - 48, y: 698 }, thickness: 1, color: line });

  text(page, "EMPLOYEE", 48, 674, 8, bold, muted);
  text(page, input.employee.name, 48, 652, 13, bold, dark);
  text(page, `Staff ID: ${input.employee.staff_id}`, 48, 634, 9, regular, muted);
  text(page, `Position: ${input.employee.position}`, 48, 618, 9, regular, muted);
  text(page, `Payment method: ${input.paymentMethod}`, 330, 652, 9, regular, dark);
  if (input.paymentReference) text(page, `Payment reference: ${input.paymentReference}`, 330, 634, 9, regular, muted);

  let y = 584;
  page.drawRectangle({ x: 48, y: y - 8, width: pageWidth - 96, height: 22, color: rgb(0.92, 0.96, 0.96) });
  text(page, "PAY COMPONENT", 58, y, 8, bold, muted);
  text(page, "TYPE", 328, y, 8, bold, muted);
  text(page, "AMOUNT", 454, y, 8, bold, muted);
  y -= 30;

  const items: { description: string; type: string; amount: number }[] = [
    { description: "Basic salary", type: "Earning", amount: input.baseSalary },
    ...input.earnings.map((item) => ({ ...item, type: "Earning" })),
    ...input.benefits.map((item) => ({ ...item, type: "Benefit" })),
    ...input.deductions.map((item) => ({ ...item, type: "Deduction" })),
  ];
  for (const item of items) {
    text(page, item.description, 58, y, 9, regular, dark);
    text(page, item.type, 328, y, 8, regular, muted);
    text(page, formatMoney(item.amount), 454, y, 9, regular, dark);
    page.drawLine({ start: { x: 48, y: y - 8 }, end: { x: pageWidth - 48, y: y - 8 }, thickness: 0.45, color: line });
    y -= 22;
  }

  y -= 18;
  const summaryX = 330;
  const drawTotal = (label: string, value: number, rowY: number, prominent = false) => {
    text(page, label, summaryX, rowY, prominent ? 10 : 9, prominent ? bold : regular, prominent ? dark : muted);
    text(page, formatMoney(value), 454, rowY, prominent ? 10 : 9, bold, prominent ? accent : dark);
  };
  drawTotal("Gross earnings", input.gross, y); y -= 19;
  drawTotal("Total benefits", input.benefitsTotal, y); y -= 19;
  drawTotal("Total deductions", input.deductionsTotal, y); y -= 25;
  page.drawLine({ start: { x: summaryX, y: y + 15 }, end: { x: pageWidth - 48, y: y + 15 }, thickness: 1.2, color: accent });
  drawTotal("NET PAY", input.net, y, true);

  page.drawRectangle({ x: 48, y: 75, width: pageWidth - 96, height: 42, color: rgb(0.96, 0.97, 0.97) });
  text(page, "Generated by the company payroll system.", 60, 98, 8, regular, muted);
  text(page, "Keep this payslip for your records.", 60, 84, 8, regular, muted);
  return Buffer.from(await pdf.save());
}

export async function GET() {
  try {
    const access = await getPayrollAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const [{ data: paychecks, error: paychecksError }, { data: staff, error: staffError }, { data: accounts, error: accountsError }] = await Promise.all([
      access.admin.from("company_staff_paychecks").select("id, staff_member_id, pay_period, base_salary, earnings, benefits, deductions, gross_amount, benefits_total, deductions_total, net_amount, payment_date, payment_method, payment_reference, created_at")
        .eq("company_id", access.companyId).order("pay_period", { ascending: false }).order("payment_date", { ascending: false }),
      access.admin.from("company_staff_members").select("id, staff_id, name, position, pay_type, base_salary, weekly_transport_allowance, transport_account_id, date_joined").eq("company_id", access.companyId).order("name"),
      access.admin.from("company_accounts").select("id, name, account_type, account_number").eq("company_id", access.companyId).eq("status", "active").order("name"),
    ]);
    if (paychecksError || staffError || accountsError) throw paychecksError ?? staffError ?? accountsError;
    const [{ data: company, error: companyError }, { data: allowed, error: createPermissionError }] = await Promise.all([
      access.admin.from("companies").select("name, logo_url").eq("id", access.companyId).maybeSingle(),
      (await createSupabaseServerClient()).rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "finance.create" }),
    ]);
    if (companyError || !company || createPermissionError) throw companyError ?? createPermissionError;
    const staffById = new Map((staff ?? []).map((member) => [member.id, member]));
    const rows = (paychecks ?? []).map((paycheck) => ({
      ...paycheck,
      employee: staffById.get(paycheck.staff_member_id) ?? { name: "Staff member", staff_id: "", position: "" },
      payslipUrl: `/api/paychecks/${paycheck.id}/payslip`,
    }));
    return NextResponse.json({ paychecks: rows, staff: staff ?? [], accounts: accounts ?? [], company, permissions: { canRecord: Boolean(allowed) } }, { headers });
  } catch (error) {
    console.error("Paycheck list request failed", error);
    return NextResponse.json({ error: "Payroll data is unavailable. Apply the staff payroll migration and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  let payslipPath = "";
  try {
    const access = await getPayrollAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const staffMemberId = typeof body?.staffMemberId === "string" ? body.staffMemberId : "";
    const payPeriod = typeof body?.payPeriod === "string" ? body.payPeriod : "";
    const paymentDate = typeof body?.paymentDate === "string" ? body.paymentDate : "";
    const paymentMethod = typeof body?.paymentMethod === "string" ? body.paymentMethod : "";
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const earnings = parseLines(body?.earnings ?? []);
    const submittedBenefits = parseLines(body?.benefits ?? []);
    const submittedDeductions = parseLines(body?.deductions ?? []);
    const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
    if (!/^[0-9a-f-]{36}$/i.test(staffMemberId) || !/^\d{4}-\d{2}-01$/.test(payPeriod) || !validDate(paymentDate)
      || Number(payPeriod.slice(5, 7)) < 1 || Number(payPeriod.slice(5, 7)) > 12
      || !paymentMethods.includes(paymentMethod as (typeof paymentMethods)[number]) || !/^[0-9a-f-]{36}$/i.test(accountId)
      || !earnings || !submittedBenefits || !submittedDeductions) {
      return NextResponse.json({ error: "Enter a valid employee, month, salary, payment method, and payroll items." }, { status: 400, headers });
    }
    const [{ data: employee, error: employeeError }, { data: company, error: companyError }, { data: account, error: accountError }] = await Promise.all([
      access.admin.from("company_staff_members").select("id, staff_id, name, position, pay_type, base_salary, weekly_transport_allowance, transport_account_id, date_joined").eq("id", staffMemberId).eq("company_id", access.companyId).maybeSingle(),
      access.admin.from("companies").select("name, logo_url, registration_number, phone, email, office_address").eq("id", access.companyId).maybeSingle(),
      access.admin.from("company_accounts").select("id").eq("id", accountId).eq("company_id", access.companyId).eq("status", "active").maybeSingle(),
    ]);
    if (accountError) throw accountError;
    if (!account) return NextResponse.json({ error: "Select an active company account for payroll." }, { status: 400, headers });
    if (employeeError || companyError || !employee || !company) throw employeeError ?? companyError ?? new Error("Employee or company was not found.");
    if (employee.pay_type !== "payroll" || Number(employee.base_salary) <= 0) {
      return NextResponse.json({ error: "Only payroll staff with a configured base salary can receive a monthly paycheck." }, { status: 400, headers });
    }
    if (Number(employee.weekly_transport_allowance) > 0 && employee.transport_account_id !== account.id) {
      return NextResponse.json({ error: "Use the funding account selected for this staff member's transport allowance." }, { status: 400, headers });
    }
    const salary = Math.round(Number(employee.base_salary) * 100) / 100;
    const gross = Math.round((salary + earnings.reduce((sum, item) => sum + item.amount, 0)) * 100) / 100;

    const { data: adjustments, error: adjustmentsError } = await access.admin.from("company_staff_payroll_adjustments")
      .select("id, adjustment_type, amount, description, payment_reference")
      .eq("company_id", access.companyId).eq("staff_member_id", employee.id).eq("pay_period", payPeriod).is("paycheck_id", null);
    if (adjustmentsError) throw adjustmentsError;
    const weeklyTransportAllowance = Number(employee.weekly_transport_allowance ?? 0);
    const monthlyTransportAllowance = Math.round((weeklyTransportAllowance * 52 / 12) * 100) / 100;
    const recurringBenefits = monthlyTransportAllowance > 0 ? [{
      description: `Weekly transport allowance (UGX ${weeklyTransportAllowance.toLocaleString("en-UG", { minimumFractionDigits: 2 })}/week)`,
      amount: monthlyTransportAllowance,
    }] : [];
    const benefits = [
      ...submittedBenefits,
      ...recurringBenefits,
      ...(adjustments ?? []).filter((item) => item.adjustment_type === "benefit").map((item) => ({
        description: `${item.description} (${item.payment_reference})`, amount: Number(item.amount),
      })),
    ];
    const deductions = [
      ...submittedDeductions,
      ...(adjustments ?? []).filter((item) => item.adjustment_type === "deduction").map((item) => ({
        description: `${item.description} (${item.payment_reference})`, amount: Number(item.amount),
      })),
    ];
    const benefitsTotal = Math.round(benefits.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const deductionsTotal = Math.round(deductions.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    const net = Math.round((gross + benefitsTotal - deductionsTotal) * 100) / 100;
    if (gross + benefitsTotal <= 0 || deductionsTotal > gross + benefitsTotal) {
      return NextResponse.json({ error: "The net pay must be greater than or equal to zero." }, { status: 400, headers });
    }

    const paycheckId = randomUUID();
    const { data: paymentReference, error: paymentReferenceError } = await access.admin.rpc("allocate_company_payroll_reference", { requested_company_id: access.companyId });
    if (paymentReferenceError || typeof paymentReference !== "string") throw paymentReferenceError ?? new Error("Payment reference could not be allocated.");
    payslipPath = `company/${access.companyId}/finance/${paycheckId}.pdf`;
    const payslip = await generatePayslip({
      company,
      employee,
      payPeriod,
      paymentDate,
      paymentMethod,
      paymentReference,
      baseSalary: salary,
      earnings,
      benefits,
      deductions,
      gross,
      benefitsTotal,
      deductionsTotal,
      net,
    });
    await uploadCompanyDriveFile(payslipPath, payslip);

    const { data: paycheck, error } = await access.admin.from("company_staff_paychecks").insert({
      id: paycheckId,
      company_id: access.companyId,
      staff_member_id: employee.id,
      pay_period: payPeriod,
      base_salary: salary,
      earnings,
      benefits,
      deductions,
      gross_amount: gross,
      benefits_total: benefitsTotal,
      deductions_total: deductionsTotal,
      net_amount: net,
      payment_date: paymentDate,
      payment_method: paymentMethod,
      account_id: account.id,
      payment_reference: paymentReference,
      payslip_path: payslipPath,
      paid_by: access.userId,
    }).select("id, staff_member_id, pay_period, gross_amount, benefits_total, deductions_total, net_amount, payment_date, payment_method, payment_reference")
      .single();
    if (error || !paycheck) {
      await deleteCompanyDriveFile(payslipPath);
      payslipPath = "";
      if (error?.code === "23505") return NextResponse.json({ error: "A paycheck has already been recorded for this employee and month." }, { status: 409, headers });
      throw error ?? new Error("Paycheck was not saved.");
    }
    const adjustmentIds = (adjustments ?? []).map((adjustment) => adjustment.id);
    if (adjustmentIds.length) {
      const { error: linkError } = await access.admin.from("company_staff_payroll_adjustments")
        .update({ paycheck_id: paycheckId })
        .eq("company_id", access.companyId).eq("staff_member_id", employee.id).eq("pay_period", payPeriod)
        .is("paycheck_id", null).in("id", adjustmentIds);
      if (linkError) {
        await access.admin.from("company_staff_paychecks").delete().eq("id", paycheckId).eq("company_id", access.companyId);
        await deleteCompanyDriveFile(payslipPath);
        payslipPath = "";
        throw linkError;
      }
    }
    return NextResponse.json({ paycheck: { ...paycheck, employee, payslipUrl: `/api/paychecks/${paycheck.id}/payslip` } }, { status: 201, headers });
  } catch (error) {
    if (payslipPath) {
      try { await deleteCompanyDriveFile(payslipPath); } catch (cleanupError) { console.error("Payslip cleanup failed", cleanupError); }
    }
    console.error("Paycheck recording failed", error);
    return NextResponse.json({ error: "Unable to record this paycheck and generate its payslip." }, { status: 503, headers });
  }
}