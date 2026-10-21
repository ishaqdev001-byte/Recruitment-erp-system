import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

async function canManageSettings(access: Awaited<ReturnType<typeof getAccess>>) {
  if ("error" in access) return false;
  const { data } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: "settings.manage",
  });
  if (data) return true;
  const { data: req } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: "requisitions.review",
  });
  return Boolean(req);
}

// GET /api/settings/currencies
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data, error } = await access.supabase
      .from("company_currencies")
      .select("id, code, name, symbol, is_active, is_default, created_at")
      .eq("company_id", access.companyId)
      .order("code");
    if (error) {
      console.error("Currencies query failed", error);
      return NextResponse.json({ error: "Unable to load currencies. Apply migration 202610180001_requisitions.sql if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    const canManage = await canManageSettings(access);
    return NextResponse.json({ currencies: data ?? [], canManage }, { headers: responseHeaders });
  } catch (err) {
    console.error("Currencies GET failed", err);
    return NextResponse.json({ error: "Currencies are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// POST /api/settings/currencies
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage currencies." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const symbol = typeof body?.symbol === "string" ? body.symbol.trim() : "";
    const isDefault = body?.isDefault === true;

    if (!code || code.length > 10) return NextResponse.json({ error: "Enter a currency code (e.g. UGX, USD)." }, { status: 400, headers: responseHeaders });
    if (!name || name.length > 100) return NextResponse.json({ error: "Enter a currency name." }, { status: 400, headers: responseHeaders });
    if (symbol.length > 10) return NextResponse.json({ error: "Symbol must be 10 characters or fewer." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for currency management." }, { status: 503, headers: responseHeaders });

    // If setting as default, clear existing default first
    if (isDefault) {
      await admin.from("company_currencies")
        .update({ is_default: false })
        .eq("company_id", access.companyId)
        .eq("is_default", true);
    }

    const { data, error } = await admin.from("company_currencies").insert({
      company_id: access.companyId,
      code,
      name,
      symbol,
      is_default: isDefault,
      created_by: access.userId,
    }).select("id, code, name, symbol, is_active, is_default, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A currency with code "${code}" already exists.` }, { status: 409, headers: responseHeaders });
      console.error("Currency creation failed", error);
      return NextResponse.json({ error: "Unable to create currency." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ currency: data }, { status: 201, headers: responseHeaders });
  } catch (err) {
    console.error("Currencies POST failed", err);
    return NextResponse.json({ error: "Currency management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PATCH /api/settings/currencies
export async function PATCH(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage currencies." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for currency management." }, { status: 503, headers: responseHeaders });

    if (typeof body.isActive === "boolean") {
      const { data, error } = await admin.from("company_currencies")
        .update({ is_active: body.isActive })
        .eq("id", body.id).eq("company_id", access.companyId)
        .select("id, code, name, symbol, is_active, is_default, created_at").single();
      if (error || !data) return NextResponse.json({ error: "Unable to update currency." }, { status: 500, headers: responseHeaders });
      return NextResponse.json({ currency: data }, { headers: responseHeaders });
    }

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    const isDefault = body.isDefault === true;

    if (!code || code.length > 10) return NextResponse.json({ error: "Enter a currency code." }, { status: 400, headers: responseHeaders });
    if (!name || name.length > 100) return NextResponse.json({ error: "Enter a currency name." }, { status: 400, headers: responseHeaders });

    if (isDefault) {
      await admin.from("company_currencies")
        .update({ is_default: false })
        .eq("company_id", access.companyId)
        .eq("is_default", true)
        .neq("id", body.id);
    }

    const { data, error } = await admin.from("company_currencies")
      .update({ code, name, symbol, is_default: isDefault })
      .eq("id", body.id).eq("company_id", access.companyId)
      .select("id, code, name, symbol, is_active, is_default, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A currency with code "${code}" already exists.` }, { status: 409, headers: responseHeaders });
      return NextResponse.json({ error: "Unable to update currency." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ currency: data }, { headers: responseHeaders });
  } catch (err) {
    console.error("Currencies PATCH failed", err);
    return NextResponse.json({ error: "Currency management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// DELETE /api/settings/currencies
export async function DELETE(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage currencies." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for currency management." }, { status: 503, headers: responseHeaders });

    const { error } = await admin.from("company_currencies")
      .delete()
      .eq("id", body.id).eq("company_id", access.companyId);

    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "Cannot delete a currency that is in use by requisitions." }, { status: 409, headers: responseHeaders });
      return NextResponse.json({ error: "Unable to delete currency." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ ok: true }, { headers: responseHeaders });
  } catch (err) {
    console.error("Currencies DELETE failed", err);
    return NextResponse.json({ error: "Currency management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
