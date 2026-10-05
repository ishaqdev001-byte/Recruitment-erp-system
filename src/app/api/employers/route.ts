import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };
const employerFields = "id, company_name, contact_persons, phone_numbers, email_addresses, countries, created_at";

async function getEmployerAccess(permission: "employers.view" | "employers.create") {
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
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: permission,
  });
  if (permissionError || !allowed) return { error: "You do not have permission to access employers. Workspace administrators should apply the latest Supabase migration if employer setup is incomplete.", status: 403 as const };

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

    return NextResponse.json({ employers: data ?? [] }, { headers: responseHeaders });
  } catch (error) {
    console.error("Employer list request failed", error);
    return NextResponse.json({ error: "Contractor data is unavailable." }, { status: 503, headers: responseHeaders });
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