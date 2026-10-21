import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWorkforceAccess, hasWorkforcePermission } from "@/lib/server/workforce";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

// GET /api/leave/types — list all leave types for the company (all members)
export async function GET() {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const canCreate = await hasWorkforcePermission(access, "leave.create");
    const canView = await hasWorkforcePermission(access, "leave.view");
    if (!canCreate && !canView) {
      return NextResponse.json({ error: "You do not have permission to view leave types." }, { status: 403, headers });
    }

    const { data, error } = await access.supabase
      .from("company_leave_types")
      .select("id, name, days_per_year, description, is_active, created_at")
      .eq("company_id", access.companyId)
      .order("name");
    if (error) {
      console.error("Leave types query failed", error);
      return NextResponse.json({ error: "Unable to load leave types. Apply migration 202610170004_leave_types_workflow.sql if setup is incomplete." }, { status: 500, headers });
    }

    // Determine if the current user can manage leave types (Owner, CEO, GM)
    const { data: permRow } = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "leave.types",
    });
    const canManageTypes = Boolean(permRow);

    return NextResponse.json({ leaveTypes: data ?? [], canManageTypes }, { headers });
  } catch (err) {
    console.error("Leave types GET failed", err);
    return NextResponse.json({ error: "Leave types are unavailable." }, { status: 503, headers });
  }
}

// POST /api/leave/types — create a new leave type
export async function POST(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data: permRow } = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "leave.types",
    });
    if (!permRow) return NextResponse.json({ error: "Only the Company Owner, CEO, or General Manager can create leave types." }, { status: 403, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Provide leave type details." }, { status: 400, headers });

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const daysPerYear = typeof body.daysPerYear === "number" ? Math.round(body.daysPerYear) : (typeof body.daysPerYear === "string" ? parseInt(body.daysPerYear, 10) : NaN);
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!name || name.length > 100) return NextResponse.json({ error: "Enter a leave type name (up to 100 characters)." }, { status: 400, headers });
    if (!Number.isInteger(daysPerYear) || daysPerYear < 1 || daysPerYear > 365) return NextResponse.json({ error: "Days per year must be between 1 and 365." }, { status: 400, headers });
    if (description.length > 1000) return NextResponse.json({ error: "Description must be 1,000 characters or fewer." }, { status: 400, headers });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for leave type management." }, { status: 503, headers });

    const { data, error } = await admin.from("company_leave_types").insert({
      company_id: access.companyId,
      name,
      days_per_year: daysPerYear,
      description,
      created_by: access.userId,
      updated_by: access.userId,
    }).select("id, name, days_per_year, description, is_active, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A leave type named "${name}" already exists.` }, { status: 409, headers });
      console.error("Leave type creation failed", error);
      return NextResponse.json({ error: "Unable to create leave type." }, { status: 500, headers });
    }

    return NextResponse.json({ leaveType: data }, { status: 201, headers });
  } catch (err) {
    console.error("Leave types POST failed", err);
    return NextResponse.json({ error: "Leave type management is unavailable." }, { status: 503, headers });
  }
}

// PATCH /api/leave/types — update an existing leave type
export async function PATCH(request: Request) {
  try {
    const access = await getWorkforceAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data: permRow } = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "leave.types",
    });
    if (!permRow) return NextResponse.json({ error: "Only the Company Owner, CEO, or General Manager can edit leave types." }, { status: 403, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Provide leave type details." }, { status: 400, headers });

    const id = typeof body.id === "string" ? body.id : "";
    if (!isUuid(id)) return NextResponse.json({ error: "Choose a valid leave type to update." }, { status: 400, headers });

    const updates: Record<string, unknown> = { updated_by: access.userId };

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name || name.length > 100) return NextResponse.json({ error: "Enter a leave type name (up to 100 characters)." }, { status: 400, headers });
      updates.name = name;
    }
    if (body.daysPerYear !== undefined) {
      const daysPerYear = typeof body.daysPerYear === "number" ? Math.round(body.daysPerYear) : parseInt(String(body.daysPerYear), 10);
      if (!Number.isInteger(daysPerYear) || daysPerYear < 1 || daysPerYear > 365) return NextResponse.json({ error: "Days per year must be between 1 and 365." }, { status: 400, headers });
      updates.days_per_year = daysPerYear;
    }
    if (typeof body.description === "string") {
      const description = body.description.trim();
      if (description.length > 1000) return NextResponse.json({ error: "Description must be 1,000 characters or fewer." }, { status: 400, headers });
      updates.description = description;
    }
    if (typeof body.isActive === "boolean") {
      updates.is_active = body.isActive;
    }

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Server is not configured for leave type management." }, { status: 503, headers });

    const { data, error } = await admin.from("company_leave_types").update(updates)
      .eq("id", id).eq("company_id", access.companyId)
      .select("id, name, days_per_year, description, is_active, created_at").single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "A leave type with that name already exists." }, { status: 409, headers });
      console.error("Leave type update failed", error);
      return NextResponse.json({ error: "Unable to update leave type." }, { status: 500, headers });
    }
    if (!data) return NextResponse.json({ error: "Leave type not found." }, { status: 404, headers });

    return NextResponse.json({ leaveType: data }, { headers });
  } catch (err) {
    console.error("Leave types PATCH failed", err);
    return NextResponse.json({ error: "Leave type management is unavailable." }, { status: 503, headers });
  }
}
