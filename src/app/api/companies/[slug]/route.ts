import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type CompanyInfo = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_admin_user_id: string;
  primary_admin_email: string;
  primary_admin_phone: string | null;
  primary_admin_first_name: string;
  primary_admin_last_name: string;
};

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: slugParam } = await params;
    const slug = slugParam?.toLowerCase().trim();

    if (!slug || slug.length === 0) {
      return NextResponse.json({ error: "Company slug is required." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error." },
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch company by slug
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id, name, logo_url, primary_admin_user_id, slug")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();

    if (companyError || !company) {
      // Company not found or query error
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    // Get primary admin's profile info (phone, display name)
    let adminPhone = "";
    let adminDisplayName = "Administrator";
    
    if (company.primary_admin_user_id) {
      const { data: adminProfile, error: profileError } = await admin
        .from("profiles")
        .select("display_name, phone")
        .eq("id", company.primary_admin_user_id)
        .maybeSingle();

      if (!profileError && adminProfile) {
        adminPhone = adminProfile.phone || "";
        adminDisplayName = adminProfile.display_name || "Administrator";
      }
    }

    // Get primary admin's auth user (email, full_name metadata)
    let adminEmail = "";
    let adminFullName = adminDisplayName;
    
    if (company.primary_admin_user_id) {
      try {
        const { data, error } = await admin.auth.admin.getUserById(
          company.primary_admin_user_id
        );
        if (!error && data?.user) {
          adminEmail = data.user.email ?? "";
          adminFullName =
            String(data.user.user_metadata?.full_name) || adminDisplayName;
        }
      } catch (err) {
        console.error("Error fetching admin auth user:", err);
        // Fall back to display name from profiles
        adminFullName = adminDisplayName;
      }
    }

    const responseData: CompanyInfo = {
      id: company.id,
      name: company.name,
      slug: slug,
      logo_url: company.logo_url || null,
      primary_admin_user_id: company.primary_admin_user_id,
      primary_admin_email: adminEmail || "admin@company.local",
      primary_admin_phone: adminPhone || null,
      primary_admin_first_name: adminFullName.split(" ")[0] || "Admin",
      primary_admin_last_name: adminFullName.split(" ").slice(1).join(" ") || "",
    };

    return NextResponse.json(responseData, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    console.error("Company info endpoint error:", error);
    return NextResponse.json(
      { error: "Unable to fetch company information." },
      { status: 500 }
    );
  }
}
