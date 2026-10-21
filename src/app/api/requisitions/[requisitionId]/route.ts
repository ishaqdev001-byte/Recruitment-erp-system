import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: "Active company membership not found.", status: 403 as const };
  return { supabase, companyId: membership.company_id, userId: user.id };
}

// GET /api/requisitions/[requisitionId] — fetch a single requisition with its items
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requisitionId: string }> },
) {
  try {
    const { requisitionId } = await params;
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data: requisition, error: reqError } = await access.supabase
      .from("company_requisitions")
      .select(`
        id, requisition_number, title, department_id, department_name,
        currency_id, currency_code, service_provider_id, service_provider_name,
        due_date, notes, total_amount, status, amount_paid, payment_status,
        general_manager_status, general_manager_reviewed_at, general_manager_note,
        finance_status, finance_reviewed_at, finance_note,
        director_status, director_reviewed_at, director_note,
        created_by, created_at, updated_at
      `)
      .eq("id", requisitionId)
      .eq("company_id", access.companyId)
      .maybeSingle();

    if (reqError) {
      console.error("Requisition detail query failed", reqError);
      return NextResponse.json({ error: "Unable to load requisition." }, { status: 500, headers: responseHeaders });
    }
    if (!requisition) return NextResponse.json({ error: "Requisition not found." }, { status: 404, headers: responseHeaders });

    const { data: items, error: itemsError } = await access.supabase
      .from("company_requisition_items")
      .select("id, description, quantity, rate, total_amount, sort_order")
      .eq("requisition_id", requisitionId)
      .eq("company_id", access.companyId)
      .order("sort_order");

    if (itemsError) {
      console.error("Requisition items query failed", itemsError);
    }

    return NextResponse.json({ requisition, items: items ?? [] }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisition detail GET failed", err);
    return NextResponse.json({ error: "Requisition detail is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
