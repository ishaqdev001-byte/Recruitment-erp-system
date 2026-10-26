import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const incomeKinds = new Set(["medical", "other"]);

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

  const [financeView, financeCreate, financeEdit, candidatesView, candidatesCreate, medicalView, isMainBranchResult] = await Promise.all([
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "finance.view" }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "finance.create" }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "finance.edit" }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "candidates.view" }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "candidates.create" }),
    supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "medical.view" }),
    supabase.rpc("current_user_is_main_branch_user", { requested_company_id: membership.company_id }),
  ]);
  if ([financeView, financeCreate, financeEdit, candidatesView, candidatesCreate, medicalView, isMainBranchResult].some((result) => result.error)) {
    return { error: "Unable to verify income, appointment, or branch access.", status: 503 as const };
  }

  const isMainBranch = Boolean(isMainBranchResult.data);
  if (!isMainBranch && !membership.branch_id) return { error: "Your account must be assigned to a branch.", status: 403 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Other income and appointments require SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const };

  const canManageTypes = Boolean(financeCreate.data || financeEdit.data);
  const canBookAppointments = Boolean(candidatesCreate.data);
  const canViewAppointments = Boolean(candidatesView.data || candidatesCreate.data || medicalView.data);
  if (!financeView.data && !candidatesView.data && !candidatesCreate.data && !medicalView.data && !canManageTypes) {
    return { error: "You do not have permission to access company income sources.", status: 403 as const };
  }
  return {
    admin,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id ?? null,
    isMainBranch,
    canManageTypes,
    canBookAppointments,
    canViewAppointments,
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

export async function GET() {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    // Branch-scoped filtering: non-main-branch users only see their branch's data
    const branchFilter = access.isMainBranch ? null : access.branchId;

    let incomeTypeQuery = access.admin.from("company_income_types").select("id, name, income_kind, fee, account_id, is_default, is_active, created_at")
      .eq("company_id", access.companyId);
    if (branchFilter) incomeTypeQuery = incomeTypeQuery.eq("branch_id", branchFilter);

    let accountQuery = access.admin.from("company_accounts").select("id, name, status")
      .eq("company_id", access.companyId);
    if (branchFilter) accountQuery = accountQuery.eq("branch_id", branchFilter);

    const [{ data: incomeTypes, error: typeError }, { data: accounts, error: accountError }] = await Promise.all([
      incomeTypeQuery.order("income_kind").order("name"),
      accountQuery.order("name"),
    ]);
    if (typeError || accountError) throw typeError ?? accountError;

    let appointments: Record<string, unknown>[] = [];
    if (access.canViewAppointments) {
      let apptQuery = access.admin.from("medical_appointments").select("*")
        .eq("company_id", access.companyId);
      if (branchFilter) apptQuery = apptQuery.eq("branch_id", branchFilter);
      const { data, error } = await apptQuery.order("appointment_at", { ascending: false });
      if (error) throw error;
      appointments = data ?? [];
    }

    const accountNames = new Map((accounts ?? []).map((account) => [account.id, account.name]));
    const typeById = new Map((incomeTypes ?? []).map((type) => [type.id, type]));
    return NextResponse.json({
      incomeTypes: (incomeTypes ?? []).map((type) => ({ ...type, fee: Number(type.fee), account_name: accountNames.get(type.account_id) ?? "Account" })),
      accounts: accounts ?? [],
      appointments: appointments.map((appointment) => ({
        ...appointment,
        fee_amount: Number(appointment.fee_amount),
        income_type_name: typeById.get(String(appointment.income_type_id))?.name ?? "Medical service",
        account_name: accountNames.get(String(appointment.account_id)) ?? "Account",
      })),
      permissions: {
        canManageTypes: access.canManageTypes,
        canBookAppointments: access.canBookAppointments,
        canViewAppointments: access.canViewAppointments,
      },
    }, { headers });
  } catch (error) {
    console.error("Company other income request failed", error);
    return NextResponse.json({ error: "Company income sources and appointments are unavailable. Apply the medical appointments migration and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return NextResponse.json({ error: "Choose an income action." }, { status: 400, headers });

    if (body.action === "create-income-type" || body.action === "update-income-type") {
      if (!access.canManageTypes) return NextResponse.json({ error: "Only the company owner, CEO, Finance Manager, or General Manager can manage income types." }, { status: 403, headers });
      const incomeTypeId = typeof body.incomeTypeId === "string" ? body.incomeTypeId : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const incomeKind = typeof body.incomeKind === "string" ? body.incomeKind : "";
      const fee = Number(body.fee);
      const accountId = typeof body.accountId === "string" ? body.accountId : "";
      if (!name || name.length > 160 || !incomeKinds.has(incomeKind)
        || !Number.isFinite(fee) || fee < 0 || fee > 999999999999.99
        || !isUuid(accountId) || (body.action === "update-income-type" && !isUuid(incomeTypeId))) {
        return NextResponse.json({ error: "Enter a valid income name, kind, fee, and account." }, { status: 400, headers });
      }
      let accountQuery = access.admin.from("company_accounts")
        .select("id").eq("id", accountId).eq("company_id", access.companyId).eq("status", "active");
      if (!access.isMainBranch) accountQuery = accountQuery.eq("branch_id", access.branchId!);
      const { data: account, error: accountError } = await accountQuery.maybeSingle();
      if (accountError || !account) return NextResponse.json({ error: "Select an active account from this company." }, { status: 400, headers });

      if (body.action === "create-income-type") {
        const { data, error } = await access.admin.from("company_income_types").insert({
          company_id: access.companyId,
          branch_id: access.branchId,
          name,
          income_kind: incomeKind,
          fee,
          account_id: accountId,
          created_by: access.userId,
        }).select("id, name, income_kind, fee, account_id, is_default, is_active, created_at").single();
        if (error?.code === "23505") return NextResponse.json({ error: "An income source with that name already exists." }, { status: 409, headers });
        if (error || !data) throw error ?? new Error("Income type was not created.");
        return NextResponse.json({ incomeType: { ...data, fee: Number(data.fee) } }, { status: 201, headers });
      }

      let incomeTypeQuery = access.admin.from("company_income_types").update({ name, income_kind: incomeKind, fee, account_id: accountId })
        .eq("id", incomeTypeId).eq("company_id", access.companyId);
      if (!access.isMainBranch) incomeTypeQuery = incomeTypeQuery.eq("branch_id", access.branchId!);
      const { data, error } = await incomeTypeQuery
        .select("id, name, income_kind, fee, account_id, is_default, is_active, created_at").maybeSingle();
      if (error?.code === "23505") return NextResponse.json({ error: "An income source with that name already exists." }, { status: 409, headers });
      if (error || !data) return NextResponse.json({ error: "Income source not found or could not be updated." }, { status: 404, headers });
      return NextResponse.json({ incomeType: { ...data, fee: Number(data.fee) } }, { headers });
    }

    if (body.action === "book-medical-appointment") {
      if (!access.canBookAppointments) return NextResponse.json({ error: "You do not have permission to book medical appointments." }, { status: 403, headers });

      // Optional candidate link — if candidateId supplied, fetch and use their stored data
      const candidateId = typeof body.candidateId === "string" && isUuid(body.candidateId) ? body.candidateId : null;

      let firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
      let lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
      let dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
      let passportNumber = typeof body.passportNumber === "string" ? body.passportNumber.trim() : "";
      let phone = typeof body.phone === "string" ? body.phone.trim() : "";

      // When a registered candidate is selected, pull their data server-side
      // to guarantee we use what's actually in the database (not just what the client sent)
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

        // Passport: prefer candidate_passports table, fall back to details JSONB
        const { data: passportRow } = await access.admin
          .from("candidate_passports")
          .select("passport_number")
          .eq("candidate_id", candidateId)
          .eq("company_id", access.companyId)
          .maybeSingle();
        if (passportRow?.passport_number) {
          passportNumber = String(passportRow.passport_number).trim();
        } else {
          const details = (candidate.details ?? {}) as Record<string, unknown>;
          if (typeof details.passportNumber === "string" && details.passportNumber) {
            passportNumber = details.passportNumber.trim();
          }
        }
      }

      const age = candidateAge(dateOfBirth);
      const incomeTypeId = typeof body.incomeTypeId === "string" ? body.incomeTypeId : "";
      const appointmentAtValue = typeof body.appointmentAt === "string" ? body.appointmentAt : "";
      const appointmentAt = new Date(appointmentAtValue);

      if (!firstName || firstName.length > 200 || !lastName || lastName.length > 200 || age === null
        || !passportNumber || passportNumber.length > 100 || !phone || phone.length > 100
        || !isUuid(incomeTypeId) || !appointmentAtValue || Number.isNaN(appointmentAt.getTime())) {
        return NextResponse.json({ error: "Enter valid candidate details and choose a medical service and appointment date." }, { status: 400, headers });
      }

      let incomeTypeQuery = access.admin.from("company_income_types")
        .select("id, name, income_kind, fee, account_id")
        .eq("id", incomeTypeId).eq("company_id", access.companyId).eq("income_kind", "medical").eq("is_active", true);
      if (!access.isMainBranch) incomeTypeQuery = incomeTypeQuery.eq("branch_id", access.branchId!);
      const { data: incomeType, error: typeError } = await incomeTypeQuery.maybeSingle();
      if (typeError || !incomeType) return NextResponse.json({ error: "Select an active medical service from this company." }, { status: 400, headers });

      const feeAmount = Number(incomeType.fee);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
        return NextResponse.json({ error: "Set a positive fee for this medical service before booking appointments." }, { status: 400, headers });
      }

      let appointmentAccountQuery = access.admin.from("company_accounts")
        .select("id").eq("id", incomeType.account_id).eq("company_id", access.companyId).eq("status", "active");
      if (!access.isMainBranch) appointmentAccountQuery = appointmentAccountQuery.eq("branch_id", access.branchId!);
      const { data: account, error: accountError } = await appointmentAccountQuery.maybeSingle();
      if (accountError || !account) return NextResponse.json({ error: "The medical service account is inactive. Configure an active account first." }, { status: 400, headers });

      // Build a unique reference for the payment transaction
      const paymentReference = `MED-${Date.now().toString(36).toUpperCase()}`;
      const appointmentDate = appointmentAt.toISOString().slice(0, 10);

      // Insert the appointment record
      const { data: appointment, error: apptError } = await access.admin.from("medical_appointments").insert({
        company_id: access.companyId,
        branch_id: access.branchId,
        ...(candidateId ? { candidate_id: candidateId } : {}),
        income_type_id: incomeType.id,
        account_id: account.id,
        candidate_first_name: firstName,
        candidate_last_name: lastName,
        candidate_date_of_birth: dateOfBirth,
        candidate_age: age,
        candidate_passport_number: passportNumber,
        candidate_phone: phone,
        appointment_at: appointmentAt.toISOString(),
        fee_amount: feeAmount,
        payment_reference: paymentReference,
        created_by: access.userId,
      }).select("id, candidate_first_name, candidate_last_name, candidate_date_of_birth, candidate_age, candidate_passport_number, candidate_phone, appointment_at, fee_amount, account_id, status, created_at").single();
      if (apptError || !appointment) throw apptError ?? new Error("Medical appointment was not booked.");

      // Record the income credit transaction against the account automatically
      // transaction_type = 'income', direction = 'credit', source_type = 'medical_appointment'
      const { data: transaction, error: txError } = await access.admin.from("company_account_transactions").insert({
        company_id: access.companyId,
        branch_id: access.branchId,
        account_id: account.id,
        transaction_type: "income",
        direction: "credit",
        amount: Math.round(feeAmount * 100) / 100,
        transaction_date: appointmentDate,
        payment_method: "Cash",
        reference: paymentReference,
        description: `Medical appointment — ${firstName} ${lastName} · ${incomeType.name}`,
        source_type: "medical_appointment",
        source_id: String((appointment as Record<string, unknown>).id),
        created_by: access.userId,
      }).select("id").maybeSingle();

      if (txError) {
        console.error("Medical appointment income transaction failed — appointment was booked but payment not recorded", txError);
        // Appointment itself succeeded; return with a warning rather than rolling back
        return NextResponse.json({
          appointment: {
            ...(appointment as Record<string, unknown>),
            fee_amount: feeAmount,
            income_type_name: incomeType.name,
          },
          warning: "Appointment booked but the income transaction could not be recorded automatically. Record it manually in Finance → Accounts.",
        }, { status: 201, headers });
      }

      // Update the appointment row with the transaction id for cross-linking
      if (transaction?.id) {
        await access.admin.from("medical_appointments")
          .update({ transaction_id: transaction.id, payment_reference: paymentReference })
          .eq("id", String((appointment as Record<string, unknown>).id))
          .eq("company_id", access.companyId);
      }

      // ── Update candidate stage to "Medical Booked" ─────────────────────
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
          console.warn("Medical stage update on booking failed (non-fatal)", stageErr);
        }
      }

      return NextResponse.json({
        appointment: {
          ...(appointment as Record<string, unknown>),
          fee_amount: feeAmount,
          income_type_name: incomeType.name,
          payment_reference: paymentReference,
        },
      }, { status: 201, headers });
    }

    return NextResponse.json({ error: "Choose a valid income action." }, { status: 400, headers });
  } catch (error) {
    console.error("Company other income update failed", error);
    return NextResponse.json({ error: "Unable to save this income or appointment record." }, { status: 503, headers });
  }
}