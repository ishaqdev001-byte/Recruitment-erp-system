import { NextRequest, NextResponse } from "next/server";
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

// GET /api/settings/service-providers
export async function GET(request: NextRequest) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    let query = access.supabase
      .from("company_service_providers")
      .select("id, name, contact_name, phone, email, address, notes, is_active, created_at")
      .eq("company_id", access.companyId)
      .order("name");

    if (search) {
      query = query.ilike("name", `%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Service providers query failed", error);
      return NextResponse.json({ error: "Unable to load service providers. Apply migration 202610180001_requisitions.sql if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    const canManage = await canManageSettings(access);
    return NextResponse.json({ serviceProviders: data ?? [], canManage }, { headers: responseHeaders });
  } catch (err) {
    console.error("Service providers GET failed", err);
    return NextResponse.json({ error: "Service providers are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// POST /api/settings/service-providers
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage service providers." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const contactName = typeof body?.contactName === "string" ? body.contactName.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

    if (!name || name.length > 150) return NextResponse.json({ error: "Enter a service provider name (up to 150 characters)." }, { status: 400, headers: responseHeaders });
    if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for service provider management." }, { status: 503, headers: responseHeaders });

    const { data, error } = await admin.from("company_service_providers").insert({
      company_id: access.companyId,
      name,
      contact_name: contactName,
      phone,
      email,
      address,
      notes,
      created_by: access.userId,
      updated_by: access.userId,
    }).select("id, name, contact_name, phone, email, address, notes, is_active, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A service provider named "${name}" already exists.` }, { status: 409, headers: responseHeaders });
      console.error("Service provider creation failed", error);
      return NextResponse.json({ error: "Unable to create service provider." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ serviceProvider: data }, { status: 201, headers: responseHeaders });
  } catch (err) {
    console.error("Service providers POST failed", err);
    return NextResponse.json({ error: "Service provider management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PATCH /api/settings/service-providers
export async function PATCH(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage service providers." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for service provider management." }, { status: 503, headers: responseHeaders });

    if (typeof body.isActive === "boolean") {
      const { data, error } = await admin.from("company_service_providers")
        .update({ is_active: body.isActive, updated_by: access.userId })
        .eq("id", body.id).eq("company_id", access.companyId)
        .select("id, name, contact_name, phone, email, address, notes, is_active, created_at").single();
      if (error || !data) return NextResponse.json({ error: "Unable to update service provider." }, { status: 500, headers: responseHeaders });
      return NextResponse.json({ serviceProvider: data }, { headers: responseHeaders });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!name || name.length > 150) return NextResponse.json({ error: "Enter a service provider name." }, { status: 400, headers: responseHeaders });
    if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: responseHeaders });

    const { data, error } = await admin.from("company_service_providers")
      .update({ name, contact_name: contactName, phone, email, address, notes, updated_by: access.userId })
      .eq("id", body.id).eq("company_id", access.companyId)
      .select("id, name, contact_name, phone, email, address, notes, is_active, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A service provider named "${name}" already exists.` }, { status: 409, headers: responseHeaders });
      return NextResponse.json({ error: "Unable to update service provider." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ serviceProvider: data }, { headers: responseHeaders });
  } catch (err) {
    console.error("Service providers PATCH failed", err);
    return NextResponse.json({ error: "Service provider management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// DELETE /api/settings/service-providers
export async function DELETE(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage service providers." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for service provider management." }, { status: 503, headers: responseHeaders });

    const { error } = await admin.from("company_service_providers")
      .delete()
      .eq("id", body.id).eq("company_id", access.companyId);

    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "Cannot delete a service provider that is in use by requisitions." }, { status: 409, headers: responseHeaders });
      return NextResponse.json({ error: "Unable to delete service provider." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ ok: true }, { headers: responseHeaders });
  } catch (err) {
    console.error("Service providers DELETE failed", err);
    return NextResponse.json({ error: "Service provider management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
