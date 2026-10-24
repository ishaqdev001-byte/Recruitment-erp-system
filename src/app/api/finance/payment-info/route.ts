import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getPaymentInfoAccess(permission: "finance.view" | "finance.create") {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id, role_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };
  
  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) return { error: "You do not have permission to access payment information.", status: 403 as const };
  
  const admin = createAdminClient();
  if (!admin) return { error: "Payment information requires SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };
  
  const [{ data: company, error: companyError }, { data: role, error: roleError }] = await Promise.all([
    admin.from("companies").select("primary_admin_user_id").eq("id", membership.company_id).maybeSingle(),
    admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
  ]);
  
  if (companyError || roleError || !company || !role) return { error: "Unable to verify payment info access.", status: 500 as const };
  
  const canManagePaymentInfo = company.primary_admin_user_id === user.id;
  
  return { admin, companyId: membership.company_id, userId: user.id, canManagePaymentInfo };
}

export async function GET() {
  try {
    const access = await getPaymentInfoAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    
    const [{ data: paymentMethods, error: paymentError }, { data: company, error: companyError }, { data: canCreate, error: createError }] = await Promise.all([
      access.admin.from("company_payment_info")
        .select("id, payment_method, bank_name, account_name, account_number, swift_code, currency, payment_reference, description, is_default, is_active, created_at")
        .eq("company_id", access.companyId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false }),
      access.admin.from("companies")
        .select("name, email, phone, office_address, city, country, registration_number, website, logo_url")
        .eq("id", access.companyId)
        .maybeSingle(),
      (await createSupabaseServerClient()).rpc("current_user_has_company_permission", { requested_company_id: access.companyId, requested_permission: "finance.create" }),
    ]);
    
    if (paymentError || companyError || createError) throw paymentError ?? companyError ?? createError;
    
    return NextResponse.json({
      paymentMethods: paymentMethods ?? [],
      company: company ?? {},
      permissions: { canManagePaymentInfo: access.canManagePaymentInfo, canCreate: Boolean(canCreate) },
    }, { headers });
  } catch (error) {
    console.error("Payment information request failed", error);
    return NextResponse.json({ error: "Payment information is unavailable. Apply the payment information migration and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getPaymentInfoAccess("finance.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Choose a payment action." }, { status: 400, headers });
    
    if (body.action === "create-payment-method") {
      if (!access.canManagePaymentInfo) return NextResponse.json({ error: "Only the company owner, CEO, or Finance Manager can manage payment methods." }, { status: 403, headers });
      
      const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
      const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
      const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
      const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
      const swiftCode = typeof body.swiftCode === "string" ? body.swiftCode.trim() : "";
      const currency = typeof body.currency === "string" ? body.currency.trim() : "UGX";
      const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      
      if (!paymentMethod || paymentMethod.length > 60 || bankName.length > 150 || accountName.length > 150 
        || accountNumber.length > 100 || swiftCode.length > 20 || currency.length > 10 || paymentReference.length > 100 || description.length > 500) {
        return NextResponse.json({ error: "Enter valid payment information within size limits." }, { status: 400, headers });
      }
      
      const { data: paymentInfo, error } = await access.admin.from("company_payment_info").insert({
        company_id: access.companyId,
        payment_method: paymentMethod,
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        swift_code: swiftCode,
        currency,
        payment_reference: paymentReference,
        description,
        is_default: false,
        is_active: true,
        created_by: access.userId,
      }).select("id, payment_method, bank_name, account_name, account_number, swift_code, currency, payment_reference, description, is_default, is_active, created_at").single();
      
      if (error?.code === "23505") return NextResponse.json({ error: "A payment method with this name already exists." }, { status: 409, headers });
      if (error || !paymentInfo) throw error ?? new Error("Payment method was not created.");
      
      return NextResponse.json({ paymentInfo }, { status: 201, headers });
    }
    
    if (body.action === "update-payment-method") {
      if (!access.canManagePaymentInfo) return NextResponse.json({ error: "Only the company owner, CEO, or Finance Manager can manage payment methods." }, { status: 403, headers });
      
      const paymentInfoId = typeof body.paymentInfoId === "string" ? body.paymentInfoId : "";
      const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
      const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
      const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
      const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : "";
      const swiftCode = typeof body.swiftCode === "string" ? body.swiftCode.trim() : "";
      const currency = typeof body.currency === "string" ? body.currency.trim() : "UGX";
      const paymentReference = typeof body.paymentReference === "string" ? body.paymentReference.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
      const isDefault = typeof body.isDefault === "boolean" ? body.isDefault : false;
      
      if (!/^[0-9a-f-]{36}$/i.test(paymentInfoId) || !paymentMethod || paymentMethod.length > 60 
        || bankName.length > 150 || accountName.length > 150 || accountNumber.length > 100 
        || swiftCode.length > 20 || currency.length > 10 || paymentReference.length > 100 || description.length > 500) {
        return NextResponse.json({ error: "Enter a valid payment info ID and valid payment information within size limits." }, { status: 400, headers });
      }
      
      const { data: paymentInfo, error } = await access.admin.from("company_payment_info")
        .update({
          payment_method: paymentMethod,
          bank_name: bankName,
          account_name: accountName,
          account_number: accountNumber,
          swift_code: swiftCode,
          currency,
          payment_reference: paymentReference,
          description,
          is_active: isActive,
          is_default: isDefault,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentInfoId)
        .eq("company_id", access.companyId)
        .select("id, payment_method, bank_name, account_name, account_number, swift_code, currency, payment_reference, description, is_default, is_active, created_at")
        .maybeSingle();
      
      if (error?.code === "23505") return NextResponse.json({ error: "A payment method with this name already exists." }, { status: 409, headers });
      if (error || !paymentInfo) return NextResponse.json({ error: "Payment method not found or could not be updated." }, { status: 404, headers });
      
      return NextResponse.json({ paymentInfo }, { headers });
    }
    
    if (body.action === "delete-payment-method") {
      if (!access.canManagePaymentInfo) return NextResponse.json({ error: "Only the company owner, CEO, or Finance Manager can delete payment methods." }, { status: 403, headers });
      
      const paymentInfoId = typeof body.paymentInfoId === "string" ? body.paymentInfoId : "";
      if (!/^[0-9a-f-]{36}$/i.test(paymentInfoId)) {
        return NextResponse.json({ error: "Enter a valid payment info ID to delete." }, { status: 400, headers });
      }
      
      const { data: paymentInfo, error: fetchError } = await access.admin.from("company_payment_info")
        .select("id, is_default").eq("id", paymentInfoId).eq("company_id", access.companyId).maybeSingle();
      if (fetchError || !paymentInfo) return NextResponse.json({ error: "Payment method not found." }, { status: 404, headers });
      
      const { error: deleteError } = await access.admin.from("company_payment_info").delete().eq("id", paymentInfoId).eq("company_id", access.companyId);
      if (deleteError) throw deleteError;
      
      return NextResponse.json({ success: true }, { status: 200, headers });
    }
    
    return NextResponse.json({ error: "Unknown payment action." }, { status: 400, headers });
  } catch (error) {
    console.error("Payment information update failed", error);
    return NextResponse.json({ error: "Unable to save this payment information." }, { status: 503, headers });
  }
}
