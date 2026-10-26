import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { generateAppointmentSlipPDF, AppointmentSlipData } from "@/lib/appointment-slip-pdf";

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

  const financeView = await supabase.rpc("current_user_has_company_permission", { 
    requested_company_id: membership.company_id, 
    requested_permission: "finance.view" 
  });
  if (financeView.error || !financeView.data) {
    return { error: "You do not have permission to view medical appointments.", status: 403 as const };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Medical operations require SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };

  return {
    admin,
    supabase,
    companyId: membership.company_id,
    userId: user.id,
  };
}

// GET: Generate and download appointment slip PDF
export async function GET(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const url = new URL(request.url);
    const appointmentId = url.searchParams.get("appointmentId");

    if (!appointmentId || !isUuid(appointmentId)) {
      return NextResponse.json({ error: "Valid appointment ID required." }, { status: 400, headers });
    }

    // Fetch appointment details
    const { data: appointmentData, error: apptError } = await access.admin
      .from("medical_appointments")
      .select(`
        id,
        candidate_first_name,
        candidate_last_name,
        candidate_date_of_birth,
        candidate_age,
        candidate_passport_number,
        candidate_phone,
        appointment_at,
        fee_amount,
        doctor_fee_amount,
        candidate_amount_after_doctor_fee,
        remarks,
        received_by_name,
        booked_by_name,
        payment_reference,
        created_at,
        doctor_user_id,
        hospital_id,
        income_type_id,
        company_income_types(name),
        hospitals(id, name, contact_phone, contact_email, address, city, country)
      `)
      .eq("company_id", access.companyId)
      .eq("id", appointmentId)
      .maybeSingle();

    if (apptError || !appointmentData) {
      return NextResponse.json({ error: "Appointment not found." }, { status: 404, headers });
    }

    const appointment = appointmentData as any;

    // Fetch company details
    const { data: company, error: companyError } = await access.admin
      .from("companies")
      .select("name")
      .eq("id", access.companyId)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company details not found." }, { status: 500, headers });
    }

    // Fetch doctor name if available
    let doctorName = "N/A";
    if (appointment.doctor_user_id) {
      const { data: { user: doctorUser } } = await access.admin.auth.admin.getUserById(appointment.doctor_user_id);
      if (doctorUser) {
        doctorName = doctorUser.user_metadata?.display_name || doctorUser.email?.split("@")[0] || "Doctor";
      }
    }

    // Prepare data for PDF
    const slipData: AppointmentSlipData = {
      appointmentId: appointment.id,
      companyName: company.name,
      agencyName: company.name,
      
      candidateFirstName: appointment.candidate_first_name,
      candidateLastName: appointment.candidate_last_name,
      candidateDateOfBirth: appointment.candidate_date_of_birth,
      candidateAge: appointment.candidate_age,
      candidatePassport: appointment.candidate_passport_number,
      candidatePhone: appointment.candidate_phone,
      
      medicalServiceType: appointment.company_income_types?.name || "Medical Service",
      appointmentDateTime: appointment.appointment_at,
      remarks: appointment.remarks || undefined,
      
      hospitalName: appointment.hospitals?.[0]?.name || appointment.hospitals?.name || "Hospital",
      hospitalPhone: appointment.hospitals?.[0]?.contact_phone || appointment.hospitals?.contact_phone || undefined,
      hospitalEmail: appointment.hospitals?.[0]?.contact_email || appointment.hospitals?.contact_email || undefined,
      hospitalAddress: appointment.hospitals?.[0]?.address || appointment.hospitals?.address || undefined,
      
      doctorName,
      
      totalFee: Number(appointment.fee_amount),
      doctorFee: Number(appointment.doctor_fee_amount || 0),
      candidateAmount: Number(appointment.candidate_amount_after_doctor_fee || appointment.fee_amount),
      
      bookedBy: appointment.booked_by_name || "Staff",
      receivedBy: appointment.received_by_name || undefined,
      bookingDate: appointment.created_at,
      paymentReference: appointment.payment_reference,
    };

    // Generate PDF
    const pdfBytes = await generateAppointmentSlipPDF(slipData);

    // Return PDF
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="appointment-slip-${appointment.id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Appointment slip generation failed", error);
    return NextResponse.json({ error: "Failed to generate appointment slip." }, { status: 500, headers });
  }
}
