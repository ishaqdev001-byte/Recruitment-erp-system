import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };
const employerFields = "id, company_name, contact_persons, phone_numbers, email_addresses, countries, created_at";

async function getEmployerAccess(
  permission: "employers.view" | "employers.create" | "employers.edit",
) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { error: "Active company membership not found.", status: 403 as const };

  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError) throw permissionError;
  if (!allowed) return { error: "You do not have permission to access employers. Workspace administrators should apply the latest Supabase migration if employer setup is incomplete.", status: 403 as const };

  return { companyId: membership.company_id, userId: user.id, supabase };
}

function readStringList(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return null;
  const entries = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (entries.some((item) => !item || item.length > 200)) return null;
  return entries;
}

export async function GET() {
  try {
    const access = await getEmployerAccess("employers.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const { data, error } = await access.supabase
      .from("employers")
      .select(employerFields)
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Employer list query failed", error);
      return NextResponse.json({ error: "Unable to load company contractors." }, { status: 500, headers: responseHeaders });
    }

    const [
      { data: canViewFinance, error: financePermissionError },
      { data: canCreate, error: createPermissionError },
      { data: canEdit, error: editPermissionError },
      { data: company, error: companyError },
    ] = await Promise.all([
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "finance.view",
      }),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "employers.create",
      }),
      access.supabase.rpc("current_user_has_company_permission", {
        requested_company_id: access.companyId,
        requested_permission: "employers.edit",
      }),
      access.supabase
        .from("companies")
        .select("primary_admin_user_id")
        .eq("id", access.companyId)
        .maybeSingle(),
    ]);
    if (
      financePermissionError ||
      createPermissionError ||
      editPermissionError ||
      companyError
    )
      throw financePermissionError ?? createPermissionError ?? editPermissionError ?? companyError;
    let financeByContractor = new Map<string, { projectId: string; projectName: string; visaCount: number; contractorServiceCharge: number; amountDue: number; accountId: string }[]>();
    if (canViewFinance) {
      const { data: projectFinance, error: projectFinanceError } = await access.supabase.rpc("list_project_contractor_finance", {
        requested_company_id: access.companyId,
      });
      if (projectFinanceError) throw projectFinanceError;
      financeByContractor = new Map();
      for (const project of projectFinance ?? []) {
        const rows = financeByContractor.get(project.contractor_id) ?? [];
        rows.push({
          projectId: project.project_id,
          projectName: project.project_name,
          visaCount: Number(project.visa_count),
          contractorServiceCharge: Number(project.contractor_service_charge),
          amountDue: Number(project.amount_due),
          accountId: project.account_id,
        });
        financeByContractor.set(project.contractor_id, rows);
      }
    }

    return NextResponse.json({
      employers: (data ?? []).map((employer) => ({ ...employer, financeProjects: financeByContractor.get(employer.id) ?? [] })),
      permissions: {
        canViewFinance: Boolean(canViewFinance),
        canCreate: Boolean(canCreate),
        canEdit: Boolean(canEdit && company?.primary_admin_user_id === access.userId),
      },
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Employer list request failed", error);
    return NextResponse.json({ error: "Contractor data is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getEmployerAccess("employers.edit");
    if ("error" in access)
      return NextResponse.json(
        { error: access.error },
        { status: access.status, headers: responseHeaders },
      );

    const { data: company, error: companyError } = await access.supabase
      .from("companies")
      .select("primary_admin_user_id")
      .eq("id", access.companyId)
      .maybeSingle();
    if (companyError) throw companyError;
    if (company?.primary_admin_user_id !== access.userId) {
      return NextResponse.json(
        { error: "Only the Chairman can edit contractor details." },
        { status: 403, headers: responseHeaders },
      );
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const employerId = typeof body?.id === "string" ? body.id : "";
    const companyName =
      typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const contacts = readStringList(body?.contacts);
    const phones = readStringList(body?.phones);
    const emails = readStringList(body?.emails);
    const countries = readStringList(body?.countries);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        employerId,
      ) ||
      !companyName ||
      companyName.length > 200 ||
      !contacts ||
      !phones ||
      !emails ||
      !countries
    ) {
      return NextResponse.json(
        { error: "Provide a company name and valid contact, phone, email, and country details." },
        { status: 400, headers: responseHeaders },
      );
    }
    if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return NextResponse.json(
        { error: "Enter valid email addresses." },
        { status: 400, headers: responseHeaders },
      );
    }

    const { data, error } = await access.supabase
      .from("employers")
      .update({
        company_name: companyName,
        contact_persons: contacts,
        phone_numbers: phones,
        email_addresses: emails,
        countries,
      })
      .eq("id", employerId)
      .eq("company_id", access.companyId)
      .select(employerFields)
      .maybeSingle();
    if (error) {
      console.error("Contractor update failed", error);
      return NextResponse.json(
        { error: "Unable to update this contractor." },
        { status: 500, headers: responseHeaders },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Contractor not found in this company." },
        { status: 404, headers: responseHeaders },
      );
    }

    return NextResponse.json({ employer: data }, { headers: responseHeaders });
  } catch (error) {
    console.error("Contractor update request failed", error);
    return NextResponse.json(
      { error: "Contractor editing is unavailable." },
      { status: 503, headers: responseHeaders },
    );
  }
}

export async function POST(request: Request) {
  try {
    const access = await getEmployerAccess("employers.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const contacts = readStringList(body?.contacts);
    const phones = readStringList(body?.phones);
    const emails = readStringList(body?.emails);
    const countries = readStringList(body?.countries);
    if (!companyName || companyName.length > 200 || !contacts || !phones || !emails || !countries) {
      return NextResponse.json({ error: "Provide a company name and valid contact, phone, email, and country details." }, { status: 400, headers: responseHeaders });
    }
    if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return NextResponse.json({ error: "Enter valid email addresses." }, { status: 400, headers: responseHeaders });
    }

    const { data, error } = await access.supabase
      .from("employers")
      .insert({
        company_id: access.companyId,
        created_by: access.userId,
        company_name: companyName,
        contact_persons: contacts,
        phone_numbers: phones,
        email_addresses: emails,
        countries,
      })
      .select(employerFields)
      .single();
    if (error || !data) {
      console.error("Employer registration failed", error);
      return NextResponse.json({ error: "Unable to register this contractor." }, { status: 403, headers: responseHeaders });
    }

    return NextResponse.json({ employer: data }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Employer registration request failed", error);
    return NextResponse.json({ error: "Contractor registration is unavailable." }, { status: 503, headers: responseHeaders });
  }
}