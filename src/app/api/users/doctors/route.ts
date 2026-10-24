import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type DoctorOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
    }

    // Get current user's company membership
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "No active company membership" }, { status: 403, headers });
    }

    // Query company_memberships for users with doctor or medical officer role in this company
    // Join with company_roles to filter by role names
    const { data: memberships, error: membershipsFetchError } = await supabase
      .from("company_memberships")
      .select(`
        user_id,
        company_roles(name)
      `)
      .eq("company_id", membership.company_id)
      .eq("status", "active");

    if (membershipsFetchError) {
      console.error("Error fetching company memberships:", membershipsFetchError);
      return NextResponse.json({ error: "Failed to fetch doctors" }, { status: 500, headers });
    }

    // Filter for doctor/medical officer roles and get their user IDs
    const doctorUserIds = (memberships || [])
      .filter((m: any) => {
        const roleName = m.company_roles?.name || "";
        return roleName.toLowerCase().includes("doctor") || roleName.toLowerCase().includes("medical officer");
      })
      .map((m: any) => m.user_id);

    if (doctorUserIds.length === 0) {
      return NextResponse.json({ doctors: [] }, { headers });
    }

    // Get user details from company_users table
    const { data: doctors, error: doctorsError } = await supabase
      .from("company_users")
      .select("user_id, first_name, last_name, email")
      .eq("company_id", membership.company_id)
      .eq("is_active", true)
      .in("user_id", doctorUserIds)
      .order("first_name");

    if (doctorsError) {
      console.error("Error fetching doctor details:", doctorsError);
      return NextResponse.json({ error: "Failed to fetch doctors" }, { status: 500, headers });
    }

    // Format response
    const formattedDoctors: DoctorOption[] = (doctors || []).map((doc: any) => ({
      id: doc.user_id,
      firstName: doc.first_name || "",
      lastName: doc.last_name || "",
      email: doc.email || "",
    }));

    return NextResponse.json({ doctors: formattedDoctors }, { headers });
  } catch (error) {
    console.error("Error in GET /api/users/doctors:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers });
  }
}
