import { NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Registration = {
  companyName: string;
  registrationNumber: string;
  country: string;
  city: string;
  officeAddress: string;
  phone: string;
  email: string;
  website: string;
  fullName: string;
  position: string;
  adminPhone: string;
};

function readRegistration(value: unknown): Registration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const readText = (key: string, maxLength: number, required = false) => {
    const raw = record[key];
    if (raw === undefined && !required) return "";
    if (typeof raw !== "string") return null;
    const text = raw.trim();
    if (text.length > maxLength || (required && !text)) return null;
    return text;
  };

  const companyName = readText("companyName", 200, true);
  const registrationNumber = readText("registrationNumber", 200);
  const country = readText("country", 200);
  const city = readText("city", 200);
  const officeAddress = readText("officeAddress", 500);
  const phone = readText("phone", 100);
  const email = readText("email", 254);
  const website = readText("website", 500);
  const fullName = readText("fullName", 200, true);
  const position = readText("position", 150);
  const adminPhone = readText("adminPhone", 60);
  if (
    companyName === null || registrationNumber === null || country === null || city === null
    || officeAddress === null || phone === null || email === null || website === null
    || fullName === null || position === null || adminPhone === null
  ) return null;

  return {
    companyName, registrationNumber, country, city, officeAddress, phone,
    email, website, fullName, position, adminPhone,
  };
}

function slugBase(companyName: string) {
  return companyName.split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "company";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected company setup error.";
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publicKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Company registration server configuration is incomplete." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in to finish company registration." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let user: User;
  try {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json({ error: "Your session is invalid or expired. Sign in again." }, { status: 401 });
    }
    user = data.user;
  } catch (error) {
    console.error("Company registration auth verification failed:", error);
    return NextResponse.json({ error: "Unable to verify your session right now. Please try again." }, { status: 503 });
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Verify your email before provisioning a company workspace." }, { status: 403 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const registration = readRegistration(user.user_metadata?.company_registration);
  if (!registration) {
    return NextResponse.json({ error: "Company registration details are missing or invalid. Return to registration and try again." }, { status: 400 });
  }

  let companyId: string | null = null;
  let createdCompanyId: string | null = null;
  try {
    const { data: existingCompany, error: existingCompanyError } = await admin
      .from("companies")
      .select("id")
      .eq("primary_admin_user_id", user.id)
      .limit(1)
      .maybeSingle();
    if (existingCompanyError) throw existingCompanyError;
    companyId = existingCompany?.id ?? null;

    if (!companyId) {
      const { data: existingMembership, error: membershipLookupError } = await admin
        .from("company_memberships")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (membershipLookupError) throw membershipLookupError;
      if (existingMembership) {
        return NextResponse.json(
          { error: "This account already belongs to a company and cannot create another workspace." },
          { status: 409 },
        );
      }

      const base = slugBase(registration.companyName);
      let company: { id: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const suffix = attempt === 0 ? "" : `-${crypto.randomUUID().slice(0, 6)}`;
        const slug = `${base}${suffix}`;
        const { data: slugMatch, error: slugLookupError } = await admin
          .from("companies")
          .select("id")
          .eq("slug", slug)
          .limit(1)
          .maybeSingle();
        if (slugLookupError) throw slugLookupError;
        if (slugMatch) continue;

        const { data, error } = await admin
          .from("companies")
          .insert({
            name: registration.companyName,
            slug,
            status: "trial",
            primary_admin_user_id: user.id,
            registration_number: registration.registrationNumber,
            country: registration.country,
            city: registration.city,
            office_address: registration.officeAddress,
            phone: registration.phone,
            email: registration.email,
            website: registration.website,
          })
          .select("id")
          .single();
        if (!error) {
          company = data;
          break;
        }
        if (error.code !== "23505") throw error;
      }
      if (!company) throw new Error("Unable to reserve a unique company URL. Please try again.");
      companyId = company.id;
      createdCompanyId = company.id;
    }

    const { data: existingMembership, error: existingMemberError } = await admin
      .from("company_memberships")
      .select("status")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingMemberError) throw existingMemberError;
    if (existingMembership && existingMembership.status !== "active") {
      throw new Error("The existing company membership is not active. Contact a company administrator.");
    }

    const { error: profileError } = await admin
      .from("profiles")
      .update({ display_name: registration.fullName, phone: registration.adminPhone })
      .eq("id", user.id);
    if (profileError) throw profileError;

    const { error: renameRoleError } = await admin
      .from("company_roles")
      .update({ name: "Chairman" })
      .eq("company_id", companyId)
      .in("name", ["Company Owner / Primary Administrator", "Primary Administrator"]);
    if (renameRoleError) throw renameRoleError;

    const { data: chairmanRole, error: roleError } = await admin
      .from("company_roles")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", "Chairman")
      .maybeSingle();
    if (roleError) throw roleError;
    if (!chairmanRole) throw new Error("The default Chairman role was not seeded. Apply the pending company-role migrations.");

    const { data: branch, error: branchError } = await admin
      .from("company_branches")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_main_branch", true)
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) throw new Error("The company Main Branch was not created. Apply the branch-system migration.");

    if (!existingMembership) {
      const { error: createMembershipError } = await admin
        .from("company_memberships")
        .insert({
          company_id: companyId,
          user_id: user.id,
          role_id: chairmanRole.id,
          branch_id: branch.id,
          status: "active",
        });
      if (createMembershipError) throw createMembershipError;
    }

    if (registration.position) {
      const { data: staff, error: staffError } = await admin
        .from("company_staff_members")
        .update({ position: registration.position })
        .eq("company_id", companyId)
        .eq("linked_user_id", user.id)
        .select("id")
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staff) throw new Error("The company staff profile was not created. Apply the staff-management migrations.");
    }

    return NextResponse.json({ companyId });
  } catch (error) {
    if (createdCompanyId) {
      const { error: rollbackError } = await admin
        .from("companies")
        .delete()
        .eq("id", createdCompanyId);
      if (rollbackError) console.error("Company registration rollback failed:", rollbackError);
    }
    console.error("Company registration provisioning failed:", error);
    return NextResponse.json(
      { error: `Company setup failed: ${errorMessage(error)}` },
      { status: 500 },
    );
  }
}
