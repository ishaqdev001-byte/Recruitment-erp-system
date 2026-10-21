import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === value;
}

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

// GET /api/requisitions/payments?requisitionId=xxx
// Returns all payments recorded against a requisition plus available active accounts
export async function GET(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const url = new URL(request.url);
    const requisitionId = url.searchParams.get("requisitionId") ?? "";

    if (!isUuid(requisitionId)) {
      return NextResponse.json({ error: "Provide a valid requisition ID." }, { status: 400, headers: responseHeaders });
    }

    const [paymentsResult, accountsResult] = await Promise.all([
      access.supabase
        .from("requisition_payments")
        .select("id, account_id, amount, payment_date, reference, notes, recorded_by, created_at")
        .eq("company_id", access.companyId)
        .eq("requisition_id", requisitionId)
        .order("payment_date", { ascending: false }),

      access.supabase
        .from("company_accounts")
        .select("id, name, account_type, account_number, is_default")
        .eq("company_id", access.companyId)
        .eq("status", "active")
        .order("name"),
    ]);

    if (paymentsResult.error) {
      console.error("Payments query failed", paymentsResult.error);
      return NextResponse.json({ error: "Unable to load payments. Apply migration 202610180002_requisition_payments.sql if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json({
      payments: paymentsResult.data ?? [],
      accounts: accountsResult.data ?? [],
    }, { headers: responseHeaders });
  } catch (err) {
    console.error("Payments GET failed", err);
    return NextResponse.json({ error: "Payments are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// POST /api/requisitions/payments — record a payment
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Provide payment details." }, { status: 400, headers: responseHeaders });

    const requisitionId = isUuid(body.requisitionId) ? body.requisitionId : null;
    const accountId = isUuid(body.accountId) ? body.accountId : null;
    const amount = typeof body.amount === "number" ? body.amount : parseFloat(String(body.amount ?? ""));
    const paymentDate = isIsoDate(body.paymentDate) ? body.paymentDate : new Date().toISOString().slice(0, 10);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!requisitionId) return NextResponse.json({ error: "Invalid requisition ID." }, { status: 400, headers: responseHeaders });
    if (!accountId) return NextResponse.json({ error: "Select a company account to deduct from." }, { status: 400, headers: responseHeaders });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid payment amount greater than zero." }, { status: 400, headers: responseHeaders });

    // Call the security-definer RPC — it handles permission check, account validation,
    // payment_status update, and posts the ledger debit entry
    const { data, error } = await access.supabase.rpc("record_requisition_payment", {
      p_company_id: access.companyId,
      p_requisition_id: requisitionId,
      p_account_id: accountId,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_reference: reference,
      p_notes: notes,
    });

    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
      if (["22023", "P0002"].includes(error.code ?? "")) return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
      console.error("Record payment RPC failed", error);
      return NextResponse.json({ error: "Unable to record payment." }, { status: 500, headers: responseHeaders });
    }

    const result = data as {
      payment_id: string;
      amount_paid: number;
      total_amount: number;
      balance: number;
      payment_status: string;
    };

    return NextResponse.json({
      paymentId: result.payment_id,
      amountPaid: result.amount_paid,
      totalAmount: result.total_amount,
      balance: result.balance,
      paymentStatus: result.payment_status,
    }, { status: 201, headers: responseHeaders });
  } catch (err) {
    console.error("Payments POST failed", err);
    return NextResponse.json({ error: "Payment recording is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
