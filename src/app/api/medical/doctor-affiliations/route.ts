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
    .select("company_id, role_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const financeView = await supabase.rpc("current_user_has_company_permission", { 
    requested_company_id: membership.company_id, 
    requested_permission: "finance.view" 
  });
  if (financeView.error || !financeView.data) {
    return { error: "You do not have permission to access medical doctors.", status: 403 as const };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Medical management requires SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("primary_admin_user_id")
    .eq("id", membership.company_id)
    .maybeSingle();
  
  if (companyError || !company) return { error: "Unable to verify company.", status: 500 as const };

  const isOwner = company.primary_admin_user_id === user.id;
  const financeCreate = await supabase.rpc("current_user_has_company_permission", { 
    requested_company_id: membership.company_id, 
    requested_permission: "finance.create" 
  });
  const financeEdit = await supabase.rpc("current_user_has_company_permission", { 
    requested_company_id: membership.company_id, 
    requested_permission: "finance.edit" 
  });

  const canManage = isOwner || financeCreate.data || financeEdit.data;

  return {
    admin,
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    canView: true,
    canManage,
  };
}

// GET: List doctor-hospital affiliations
export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data: affiliations, error } = await access.admin
      .from("doctor_hospital_affiliations")
      .select(`
        id,
        doctor_user_id,
        hospital_id,
        fee_to_doctor,
        is_primary,
        created_at,
        hospitals(id, name, contact_phone),
        doctor:company_memberships!doctor_user_id(user_id)
      `)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Fetch doctor names from auth.users
    const affiliationsWithDoctorNames = await Promise.all(
      (affiliations ?? []).map(async (aff) => {
        const { data: { user: doctorUser } } = await access.admin.auth.admin.getUserById(aff.doctor_user_id);
        return {
          ...aff,
          doctor_email: doctorUser?.email,
          doctor_name: doctorUser?.user_metadata?.display_name || doctorUser?.email?.split("@")[0] || "Doctor",
          fee_to_doctor: Number(aff.fee_to_doctor),
        };
      })
    );

    return NextResponse.json({
      affiliations: affiliationsWithDoctorNames,
    }, { headers });
  } catch (error) {
    console.error("Get doctor affiliations request failed", error);
    return NextResponse.json({ error: "Unable to fetch doctor affiliations." }, { status: 500, headers });
  }
}

// POST: Create or update doctor-hospital affiliation
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") {
      return NextResponse.json({ error: "Specify an action." }, { status: 400, headers });
    }

    if (body.action === "link-doctor-hospital") {
      if (!access.canManage) {
        return NextResponse.json({ error: "You do not have permission to link doctors to hospitals." }, { status: 403, headers });
      }

      const doctorUserId = typeof body.doctorUserId === "string" ? body.doctorUserId : "";
      const hospitalId = typeof body.hospitalId === "string" ? body.hospitalId : "";
      const feeToDoctor = Number(body.feeToDoctor);
      const isPrimary = typeof body.isPrimary === "boolean" ? body.isPrimary : false;

      if (!isUuid(doctorUserId) || !isUuid(hospitalId) || !Number.isFinite(feeToDoctor) || feeToDoctor < 0) {
        return NextResponse.json({ 
          error: "Enter a valid doctor, hospital, and fee amount." 
        }, { status: 400, headers });
      }

      // Verify doctor exists in company
      const { data: doctorMembership, error: doctorError } = await access.admin
        .from("company_memberships")
        .select("user_id")
        .eq("company_id", access.companyId)
        .eq("user_id", doctorUserId)
        .maybeSingle();

      if (doctorError || !doctorMembership) {
        return NextResponse.json({ error: "Doctor not found in this company." }, { status: 400, headers });
      }

      // Verify hospital exists
      const { data: hospital, error: hospitalError } = await access.admin
        .from("hospitals")
        .select("id")
        .eq("company_id", access.companyId)
        .eq("id", hospitalId)
        .maybeSingle();

      if (hospitalError || !hospital) {
        return NextResponse.json({ error: "Hospital not found in this company." }, { status: 400, headers });
      }

      // If setting as primary, unset other primary affiliations for this doctor
      if (isPrimary) {
        await access.admin
          .from("doctor_hospital_affiliations")
          .update({ is_primary: false })
          .eq("company_id", access.companyId)
          .eq("doctor_user_id", doctorUserId);
      }

      const { data: affiliation, error: createError } = await access.admin
        .from("doctor_hospital_affiliations")
        .insert({
          company_id: access.companyId,
          doctor_user_id: doctorUserId,
          hospital_id: hospitalId,
          fee_to_doctor: feeToDoctor,
          is_primary: isPrimary,
          created_by: access.userId,
        })
        .select("id, doctor_user_id, hospital_id, fee_to_doctor, is_primary, created_at")
        .single();

      if (createError?.code === "23505") {
        return NextResponse.json({ 
          error: "This doctor is already affiliated with this hospital." 
        }, { status: 409, headers });
      }
      if (createError || !affiliation) throw createError ?? new Error("Affiliation was not created.");

      return NextResponse.json({ 
        affiliation: {
          ...affiliation,
          fee_to_doctor: Number(affiliation.fee_to_doctor),
        }
      }, { status: 201, headers });
    }

    if (body.action === "update-affiliation") {
      if (!access.canManage) {
        return NextResponse.json({ error: "You do not have permission to update affiliations." }, { status: 403, headers });
      }

      const affiliationId = typeof body.affiliationId === "string" ? body.affiliationId : "";
      if (!isUuid(affiliationId)) {
        return NextResponse.json({ error: "Invalid affiliation ID." }, { status: 400, headers });
      }

      const feeToDoctor = Number(body.feeToDoctor);
      const isPrimary = typeof body.isPrimary === "boolean" ? body.isPrimary : undefined;

      if (feeToDoctor !== undefined && (!Number.isFinite(feeToDoctor) || feeToDoctor < 0)) {
        return NextResponse.json({ error: "Enter a valid fee amount." }, { status: 400, headers });
      }

      const updateData: Record<string, unknown> = {};
      if (Number.isFinite(feeToDoctor)) updateData.fee_to_doctor = feeToDoctor;
      if (isPrimary !== undefined) updateData.is_primary = isPrimary;

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: "Provide at least one field to update." }, { status: 400, headers });
      }

      // Get the affiliation to find doctor_user_id if setting as primary
      const { data: existing } = await access.admin
        .from("doctor_hospital_affiliations")
        .select("doctor_user_id")
        .eq("id", affiliationId)
        .eq("company_id", access.companyId)
        .maybeSingle();

      if (!existing) {
        return NextResponse.json({ error: "Affiliation not found." }, { status: 404, headers });
      }

      // If setting as primary, unset other primary affiliations
      if (isPrimary) {
        await access.admin
          .from("doctor_hospital_affiliations")
          .update({ is_primary: false })
          .eq("company_id", access.companyId)
          .eq("doctor_user_id", existing.doctor_user_id);
      }

      const { data: affiliation, error: updateError } = await access.admin
        .from("doctor_hospital_affiliations")
        .update(updateData)
        .eq("id", affiliationId)
        .eq("company_id", access.companyId)
        .select("id, doctor_user_id, hospital_id, fee_to_doctor, is_primary, created_at")
        .single();

      if (updateError || !affiliation) {
        return NextResponse.json({ error: "Affiliation could not be updated." }, { status: 500, headers });
      }

      return NextResponse.json({ 
        affiliation: {
          ...affiliation,
          fee_to_doctor: Number(affiliation.fee_to_doctor),
        }
      }, { headers });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers });
  } catch (error) {
    console.error("Doctor affiliation request failed", error);
    return NextResponse.json({ error: "Doctor affiliation operation failed." }, { status: 500, headers });
  }
}
