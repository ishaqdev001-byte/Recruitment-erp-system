import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };
const supplierFields = "id, supplier_name, contact_person, phone, email, branch, status, created_at";

async function getSupplierAccess(permission: "suppliers.view" | "suppliers.create") {
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

  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) {
    return { error: "You do not have permission to access suppliers. Workspace administrators should apply the latest Supabase migration if supplier setup is incomplete.", status: 403 as const };
  }

  return { companyId: membership.company_id, userId: user.id, supabase };
}

export async function GET() {
  try {
    const access = await getSupplierAccess("suppliers.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data, error } = await access.supabase
      .from("suppliers")
      .select(supplierFields)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Supplier list query failed", error);
      return NextResponse.json({ error: "Unable to load company suppliers." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json({ suppliers: data ?? [] }, { headers: responseHeaders });
  } catch (error) {
    console.error("Supplier list request failed", error);
    return NextResponse.json({ error: "Supplier data is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSupplierAccess("suppliers.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const supplierName = typeof body?.supplierName === "string" ? body.supplierName.trim() : "";
    const contactPerson = typeof body?.contactPerson === "string" ? body.contactPerson.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const branch = typeof body?.branch === "string" ? body.branch.trim() : "";
    if (!supplierName || supplierName.length > 200 || !contactPerson || contactPerson.length > 200
      || !phone || phone.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200
      || !branch || branch.length > 200) {
      return NextResponse.json({ error: "Provide a supplier name and valid contact, phone, email, and branch details." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase
      .from("suppliers")
      .insert({
        company_id: access.companyId,
        created_by: access.userId,
        supplier_name: supplierName,
        contact_person: contactPerson,
        phone,
        email,
        branch,
      })
      .select(supplierFields)
      .single();
    if (error || !data) {
      console.error("Supplier registration failed", error);
      return NextResponse.json({ error: "Unable to register this supplier." }, { status: 403, headers: responseHeaders });
    }

    return NextResponse.json({ supplier: data }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Supplier registration request failed", error);
    return NextResponse.json({ error: "Supplier registration is unavailable." }, { status: 503, headers: responseHeaders });
  }
}