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
    .select("company_id, role_id, branch_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const [candidateCreate, medicalUpdate, isMainBranch] = await Promise.all([
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "candidates.create",
    }),
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "medical.update",
    }),
    supabase.rpc("current_user_is_main_branch_user", { requested_company_id: membership.company_id }),
  ]);
  if (candidateCreate.error || medicalUpdate.error || isMainBranch.error) {
    return { error: "Unable to verify appointment and branch permissions.", status: 503 as const };
  }
  if (!candidateCreate.data && !medicalUpdate.data) {
    return { error: "You do not have permission to book medical appointments.", status: 403 as const };
  }
  if (!isMainBranch.data && !membership.branch_id) {
    return { error: "Your account must be assigned to a branch.", status: 403 as const };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Medical booking requires SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("primary_admin_user_id, name")
    .eq("id", membership.company_id)
    .maybeSingle();
  
  if (companyError || !company) return { error: "Unable to verify company.", status: 500 as const };

  return {
    admin,
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id ?? null,
    isMainBranch: Boolean(isMainBranch.data),
    companyName: company.name,
    isOwner: company.primary_admin_user_id === user.id,
  };
}

function candidateAge(dateOfBirth: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(`${dateOfBirth}T00:00:00Z`))) return null;
  const birthDate = new Date(`${dateOfBirth}T00:00:00Z`);
  if (birthDate > now) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  if (now.getUTCMonth() < birthDate.getUTCMonth()
    || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

// POST: Book medical appointment with doctor fee and auto-invoice
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "Request body is required." }, { status: 400, headers });
    }

    // Extract candidate information
    const candidateId = typeof body.candidateId === "string" && isUuid(body.candidateId) ? body.candidateId : null;
    let firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    let lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    let dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
    let passportNumber = typeof body.passportNumber === "string" ? body.passportNumber.trim() : "";
    let phone = typeof body.phone === "string" ? body.phone.trim() : "";

    // Fetch registered candidate data if provided
    if (candidateId) {
      let candidateQuery = access.admin
        .from("candidates")
        .select("id, first_name, last_name, phone, date_of_birth, details")
        .eq("id", candidateId)
        .eq("company_id", access.companyId);
      if (!access.isMainBranch) candidateQuery = candidateQuery.eq("branch_id", access.branchId!);
      const { data: candidate, error: candidateError } = await candidateQuery.maybeSingle();
      if (candidateError || !candidate) {
        return NextResponse.json({ error: "Selected candidate not found in this company." }, { status: 400, headers });
      }
      firstName = String(candidate.first_name ?? "").trim() || firstName;
      lastName = String(candidate.last_name ?? "").trim() || lastName;
      phone = String(candidate.phone ?? "").trim() || phone;
      if (candidate.date_of_birth) dateOfBirth = String(candidate.date_of_birth);

      const { data: passportRow } = await access.admin
        .from("candidate_passports")
        .select("passport_number")
        .eq("candidate_id", candidateId)
        .eq("company_id", access.companyId)
        .maybeSingle();
      if (passportRow?.passport_number) {
        passportNumber = String(passportRow.passport_number).trim();
      }
    }

    const age = candidateAge(dateOfBirth);
    const incomeTypeId = typeof body.incomeTypeId === "string" ? body.incomeTypeId : "";
    const hospitalId = typeof body.hospitalId === "string" ? body.hospitalId : "";
    const doctorUserId = typeof body.doctorUserId === "string" ? body.doctorUserId : "";
    const appointmentAtValue = typeof body.appointmentAt === "string" ? body.appointmentAt : "";
    const totalFeeAmount = Number(body.totalFeeAmount);
    const doctorFeeAmount = Number(body.doctorFeeAmount);
    const remarksText = typeof body.remarks === "string" ? body.remarks.trim() : "";
    const receivedByName = typeof body.receivedByName === "string" ? body.receivedByName.trim() : "";
    const bookedByName = typeof body.bookedByName === "string" ? body.bookedByName.trim() : "";

    const appointmentAt = new Date(appointmentAtValue);

    // Validate required fields
    if (!firstName || firstName.length > 200 || !lastName || lastName.length > 200 || age === null
      || !passportNumber || passportNumber.length > 100 || !phone || phone.length > 100
      || !isUuid(incomeTypeId) || !appointmentAtValue || Number.isNaN(appointmentAt.getTime())
      || !Number.isFinite(totalFeeAmount) || totalFeeAmount <= 0) {
      return NextResponse.json({ 
        error: "Enter valid candidate details, choose a medical service, appointment date, and fees." 
      }, { status: 400, headers });
    }

    // Validate doctor and hospital if provided
    if ((doctorUserId && !isUuid(doctorUserId)) || (hospitalId && !isUuid(hospitalId))) {
      return NextResponse.json({ error: "Invalid doctor or hospital ID." }, { status: 400, headers });
    }

    if (!Number.isFinite(doctorFeeAmount) || doctorFeeAmount < 0 || doctorFeeAmount > totalFeeAmount) {
      return NextResponse.json({ error: "Doctor fee must be between 0 and total fee." }, { status: 400, headers });
    }

    const candidateAmountAfterDoctorFee = totalFeeAmount - doctorFeeAmount;

    // Fetch income type
    let incomeTypeQuery = access.admin.from("company_income_types")
      .select("id, name, income_kind, fee, account_id")
      .eq("id", incomeTypeId).eq("company_id", access.companyId).eq("income_kind", "medical").eq("is_active", true);
    if (!access.isMainBranch) incomeTypeQuery = incomeTypeQuery.eq("branch_id", access.branchId!);
    const { data: incomeType, error: typeError } = await incomeTypeQuery.maybeSingle();
    if (typeError || !incomeType) {
      return NextResponse.json({ error: "Select an active medical service from this company." }, { status: 400, headers });
    }

    // Fetch account
    let accountQuery = access.admin.from("company_accounts")
      .select("id").eq("id", incomeType.account_id).eq("company_id", access.companyId).eq("status", "active");
    if (!access.isMainBranch) accountQuery = accountQuery.eq("branch_id", access.branchId!);
    const { data: account, error: accountError } = await accountQuery.maybeSingle();
    if (accountError || !account) {
      return NextResponse.json({ error: "The medical service account is inactive." }, { status: 400, headers });
    }

    // Fetch hospital if provided
    let hospitalName = "";
    if (hospitalId) {
      const { data: hospital, error: hospitalError } = await access.admin
        .from("hospitals")
        .select("id, name, contact_phone, contact_email")
        .eq("id", hospitalId)
        .eq("company_id", access.companyId)
        .maybeSingle();
      if (hospitalError || !hospital) {
        return NextResponse.json({ error: "Selected hospital not found in this company." }, { status: 400, headers });
      }
      hospitalName = hospital.name;
    }

    // Build payment reference
    const paymentReference = `MED-${Date.now().toString(36).toUpperCase()}`;
    const appointmentDate = appointmentAt.toISOString().slice(0, 10);

    // Insert appointment record
    const { data: appointment, error: apptError } = await access.admin.from("medical_appointments").insert({
      company_id: access.companyId,
      branch_id: access.branchId,
      ...(candidateId ? { candidate_id: candidateId } : {}),
      income_type_id: incomeType.id,
      account_id: account.id,
      ...(hospitalId ? { hospital_id: hospitalId } : {}),
      ...(doctorUserId ? { doctor_user_id: doctorUserId } : {}),
      candidate_first_name: firstName,
      candidate_last_name: lastName,
      candidate_date_of_birth: dateOfBirth,
      candidate_age: age,
      candidate_passport_number: passportNumber,
      candidate_phone: phone,
      appointment_at: appointmentAt.toISOString(),
      fee_amount: totalFeeAmount,
      doctor_fee_amount: doctorFeeAmount,
      candidate_amount_after_doctor_fee: candidateAmountAfterDoctorFee,
      payment_reference: paymentReference,
      remarks: remarksText || null,
      received_by_name: receivedByName || null,
      booked_by_name: bookedByName || access.userId,
      created_by: access.userId,
    }).select("id, candidate_first_name, candidate_last_name, appointment_at, fee_amount, doctor_fee_amount, candidate_amount_after_doctor_fee, status, created_at").single();
    
    if (apptError || !appointment) throw apptError ?? new Error("Medical appointment was not booked.");

    // Record income transaction for candidate payment
    const { data: transaction, error: txError } = await access.admin.from("company_account_transactions").insert({
      company_id: access.companyId,
      branch_id: access.branchId,
      account_id: account.id,
      transaction_type: "income",
      direction: "credit",
      amount: Math.round(candidateAmountAfterDoctorFee * 100) / 100,
      transaction_date: appointmentDate,
      payment_method: "Cash",
      reference: paymentReference,
      description: `Medical appointment — ${firstName} ${lastName} · ${incomeType.name}`,
      source_type: "medical_appointment",
      source_id: String((appointment as Record<string, unknown>).id),
      created_by: access.userId,
    }).select("id").maybeSingle();

    if (txError) {
      console.error("Medical appointment income transaction failed", txError);
      return NextResponse.json({
        warning: "Appointment booked but income transaction could not be recorded automatically.",
        appointment: {
          ...(appointment as Record<string, unknown>),
          fee_amount: totalFeeAmount,
          doctor_fee_amount: doctorFeeAmount,
          candidate_amount_after_doctor_fee: candidateAmountAfterDoctorFee,
        },
      }, { status: 201, headers });
    }

    // Update appointment with transaction ID
    if (transaction?.id) {
      await access.admin.from("medical_appointments")
        .update({ transaction_id: transaction.id })
        .eq("id", String((appointment as Record<string, unknown>).id))
        .eq("company_id", access.companyId);
    }

    // Create auto-invoice for doctor/hospital if doctor fee > 0
    if (doctorFeeAmount > 0 && doctorUserId && hospitalId) {
      try {
        // Get or create supplier for the hospital
        const { data: suppliers, error: suppliersError } = await access.admin
          .from("suppliers")
          .select("id, name")
          .eq("company_id", access.companyId)
          .eq("name", hospitalName)
          .limit(1);

        let supplierId: string | null = null;
        if (!suppliersError && suppliers && suppliers.length > 0) {
          supplierId = suppliers[0].id;
        } else {
          // Create supplier for this hospital
          const { data: newSupplier, error: supplierError } = await access.admin
            .from("suppliers")
            .insert({
              company_id: access.companyId,
              name: hospitalName,
              contact_person: "Hospital",
              is_active: true,
              created_by: access.userId,
            })
            .select("id")
            .single();

          if (!supplierError && newSupplier) {
            supplierId = newSupplier.id;
          }
        }

        if (supplierId) {
          // Create invoice for doctor fee
          const invoiceNumber = `DOC-${Date.now().toString(36).toUpperCase()}`;
          const { data: invoice, error: invoiceError } = await access.admin
            .from("invoices")
            .insert({
              company_id: access.companyId,
              invoice_number: invoiceNumber,
              invoice_type: "doctor_service",
              supplier_id: supplierId,
              invoice_date: appointmentDate,
              due_date: appointmentDate,
              amount: Math.round(doctorFeeAmount * 100) / 100,
              description: `Medical service — ${firstName} ${lastName} at ${hospitalName} · ${incomeType.name}`,
              status: "pending",
              created_by: access.userId,
            })
            .select("id")
            .single();

          if (!invoiceError && invoice) {
            // Update appointment with invoice ID
            await access.admin.from("medical_appointments")
              .update({ invoice_id: invoice.id })
              .eq("id", String((appointment as Record<string, unknown>).id))
              .eq("company_id", access.companyId);
          } else {
            console.warn("Invoice creation for doctor fee failed (non-fatal)", invoiceError);
          }
        }
      } catch (invoiceErr) {
        console.warn("Auto-invoice creation for doctor failed (non-fatal)", invoiceErr);
      }
    }

    // Update candidate stage if linked
    if (candidateId) {
      try {
        const { data: candidate } = await access.admin
          .from("candidates")
          .select("id, details")
          .eq("id", candidateId)
          .eq("company_id", access.companyId)
          .maybeSingle();

        if (candidate) {
          const existingDetails = (candidate.details ?? {}) as Record<string, unknown>;
          const laterStages = new Set(["Medical Examination", "Visa Processing", "Travel"]);
          if (!laterStages.has(String(existingDetails.stage ?? ""))) {
            await access.admin
              .from("candidates")
              .update({
                details: {
                  ...existingDetails,
                  stage: "Medical Booked",
                  medicalBookedAt: new Date().toISOString(),
                } as never,
              })
              .eq("id", candidateId)
              .eq("company_id", access.companyId);
          }
        }
      } catch (stageErr) {
        console.warn("Candidate stage update failed (non-fatal)", stageErr);
      }
    }

    return NextResponse.json({
      appointment: {
        ...(appointment as Record<string, unknown>),
        fee_amount: totalFeeAmount,
        doctor_fee_amount: doctorFeeAmount,
        candidate_amount_after_doctor_fee: candidateAmountAfterDoctorFee,
        income_type_name: incomeType.name,
        hospital_name: hospitalName,
        payment_reference: paymentReference,
      },
    }, { status: 201, headers });
  } catch (error) {
    console.error("Medical appointment booking failed", error);
    return NextResponse.json({ error: "Failed to book medical appointment." }, { status: 500, headers });
  }
}
