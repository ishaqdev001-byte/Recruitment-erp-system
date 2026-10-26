import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const [medicalView, medicalUpdate] = await Promise.all([
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "medical.view",
    }),
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "medical.update",
    }),
  ]);
  if (medicalView.error || medicalUpdate.error) {
    return { error: "Unable to verify medical hospital permissions.", status: 503 as const };
  }
  if (!medicalView.data && !medicalUpdate.data) {
    return { error: "You do not have permission to access medical hospitals.", status: 403 as const };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Medical management requires SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };

  const canManage = Boolean(medicalUpdate.data);

  return {
    admin,
    companyId: membership.company_id,
    userId: user.id,
    canView: true,
    canManage,
  };
}

// GET: List all hospitals for the company
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data: hospitals, error } = await access.admin
      .from("hospitals")
      .select("id, name, contact_phone, contact_email, address, city, country, description, is_active, created_at")
      .eq("company_id", access.companyId)
      .order("name");

    if (error) throw error;

    return NextResponse.json({
      hospitals: hospitals ?? [],
    }, { headers });
  } catch (error) {
    console.error("Get hospitals request failed", error);
    return NextResponse.json({ error: "Unable to fetch hospitals." }, { status: 500, headers });
  }
}

// POST: Create or update hospital
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") {
      return NextResponse.json({ error: "Specify an action." }, { status: 400, headers });
    }

    if (body.action === "create-hospital") {
      if (!access.canManage) {
        return NextResponse.json({ error: "You do not have permission to create hospitals." }, { status: 403, headers });
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : "";
      const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
      const address = typeof body.address === "string" ? body.address.trim() : "";
      const city = typeof body.city === "string" ? body.city.trim() : "";
      const country = typeof body.country === "string" ? body.country.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";

      if (!name || name.length > 255) {
        return NextResponse.json({ error: "Enter a valid hospital name (1-255 characters)." }, { status: 400, headers });
      }

      const { data: hospital, error: createError } = await access.admin
        .from("hospitals")
        .insert({
          company_id: access.companyId,
          name,
          contact_phone: contactPhone || null,
          contact_email: contactEmail || null,
          address: address || null,
          city: city || null,
          country: country || null,
          description: description || null,
          created_by: access.userId,
        })
        .select("id, name, contact_phone, contact_email, address, city, country, description, is_active, created_at")
        .single();

      if (createError?.code === "23505") {
        return NextResponse.json({ error: "A hospital with that name already exists." }, { status: 409, headers });
      }
      if (createError || !hospital) throw createError ?? new Error("Hospital was not created.");

      return NextResponse.json({ hospital }, { status: 201, headers });
    }

    if (body.action === "update-hospital") {
      if (!access.canManage) {
        return NextResponse.json({ error: "You do not have permission to update hospitals." }, { status: 403, headers });
      }

      const hospitalId = typeof body.hospitalId === "string" ? body.hospitalId : "";
      if (!isUuid(hospitalId)) {
        return NextResponse.json({ error: "Invalid hospital ID." }, { status: 400, headers });
      }

      const name = typeof body.name === "string" ? body.name.trim() : "";
      const contactPhone = typeof body.contactPhone === "string" ? body.contactPhone.trim() : "";
      const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
      const address = typeof body.address === "string" ? body.address.trim() : "";
      const city = typeof body.city === "string" ? body.city.trim() : "";
      const country = typeof body.country === "string" ? body.country.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

      if (name && name.length > 255) {
        return NextResponse.json({ error: "Hospital name must be 1-255 characters." }, { status: 400, headers });
      }

      const updateData: Record<string, unknown> = {};
      if (name) updateData.name = name;
      if (contactPhone !== undefined) updateData.contact_phone = contactPhone || null;
      if (contactEmail !== undefined) updateData.contact_email = contactEmail || null;
      if (address !== undefined) updateData.address = address || null;
      if (city !== undefined) updateData.city = city || null;
      if (country !== undefined) updateData.country = country || null;
      if (description !== undefined) updateData.description = description || null;
      if (isActive !== undefined) updateData.is_active = isActive;

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400, headers });
      }

      const { data: hospital, error: updateError } = await access.admin
        .from("hospitals")
        .update(updateData)
        .eq("id", hospitalId)
        .eq("company_id", access.companyId)
        .select("id, name, contact_phone, contact_email, address, city, country, description, is_active, created_at")
        .single();

      if (updateError?.code === "23505") {
        return NextResponse.json({ error: "A hospital with that name already exists." }, { status: 409, headers });
      }
      if (updateError || !hospital) {
        return NextResponse.json({ error: "Hospital not found or could not be updated." }, { status: 404, headers });
      }

      return NextResponse.json({ hospital }, { headers });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers });
  } catch (error) {
    console.error("Hospital request failed", error);
    return NextResponse.json({ error: "Hospital operation failed." }, { status: 500, headers });
  }
}
