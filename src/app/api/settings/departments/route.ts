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
  // Also allow if user has any requisition permission (owner / GM / finance)
  const { data: req } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: "requisitions.review",
  });
  return Boolean(req);
}

// GET /api/settings/departments
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data, error } = await access.supabase
      .from("company_departments")
      .select("id, name, description, is_active, created_at")
      .eq("company_id", access.companyId)
      .order("name");
    if (error) {
      console.error("Departments query failed", error);
      return NextResponse.json({ error: "Unable to load departments. Apply migration 202610180001_requisitions.sql if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }

    const canManage = await canManageSettings(access);
    return NextResponse.json({ departments: data ?? [], canManage }, { headers: responseHeaders });
  } catch (err) {
    console.error("Departments GET failed", err);
    return NextResponse.json({ error: "Departments are unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// POST /api/settings/departments
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage departments." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";

    if (!name || name.length > 100) return NextResponse.json({ error: "Enter a department name (up to 100 characters)." }, { status: 400, headers: responseHeaders });
    if (description.length > 500) return NextResponse.json({ error: "Description must be 500 characters or fewer." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for department management." }, { status: 503, headers: responseHeaders });

    const { data, error } = await admin.from("company_departments").insert({
      company_id: access.companyId,
      name,
      description,
      created_by: access.userId,
      updated_by: access.userId,
    }).select("id, name, description, is_active, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A department named "${name}" already exists.` }, { status: 409, headers: responseHeaders });
      console.error("Department creation failed", error);
      return NextResponse.json({ error: "Unable to create department." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ department: data }, { status: 201, headers: responseHeaders });
  } catch (err) {
    console.error("Departments POST failed", err);
    return NextResponse.json({ error: "Department management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// PATCH /api/settings/departments
export async function PATCH(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage departments." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for department management." }, { status: 503, headers: responseHeaders });

    // Toggle active
    if (typeof body.isActive === "boolean") {
      const { data, error } = await admin.from("company_departments")
        .update({ is_active: body.isActive, updated_by: access.userId })
        .eq("id", body.id).eq("company_id", access.companyId)
        .select("id, name, description, is_active, created_at").single();
      if (error || !data) return NextResponse.json({ error: "Unable to update department." }, { status: 500, headers: responseHeaders });
      return NextResponse.json({ department: data }, { headers: responseHeaders });
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!name || name.length > 100) return NextResponse.json({ error: "Enter a department name (up to 100 characters)." }, { status: 400, headers: responseHeaders });

    const { data, error } = await admin.from("company_departments")
      .update({ name, description, updated_by: access.userId })
      .eq("id", body.id).eq("company_id", access.companyId)
      .select("id, name, description, is_active, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A department named "${name}" already exists.` }, { status: 409, headers: responseHeaders });
      return NextResponse.json({ error: "Unable to update department." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ department: data }, { headers: responseHeaders });
  } catch (err) {
    console.error("Departments PATCH failed", err);
    return NextResponse.json({ error: "Department management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

// DELETE /api/settings/departments
export async function DELETE(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const canManage = await canManageSettings(access);
    if (!canManage) return NextResponse.json({ error: "You do not have permission to manage departments." }, { status: 403, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !isUuid(body.id)) return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for department management." }, { status: 503, headers: responseHeaders });

    const { error } = await admin.from("company_departments")
      .delete()
      .eq("id", body.id).eq("company_id", access.companyId);

    if (error) {
      if (error.code === "23503") return NextResponse.json({ error: "Cannot delete a department that is in use by requisitions." }, { status: 409, headers: responseHeaders });
      return NextResponse.json({ error: "Unable to delete department." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ ok: true }, { headers: responseHeaders });
  } catch (err) {
    console.error("Departments DELETE failed", err);
    return NextResponse.json({ error: "Department management is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
