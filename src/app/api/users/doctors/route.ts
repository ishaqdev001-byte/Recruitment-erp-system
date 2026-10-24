import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DoctorOption = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function splitName(value: string, email: string) {
  const name = value.trim() || email.split("@")[0] || "Doctor";
  const parts = name.split(/\s+/);
  return {
    firstName: parts[0] ?? "Doctor",
    lastName: parts.slice(1).join(" "),
  };
}

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Doctor directory is unavailable. Contact the workspace administrator." }, { status: 503, headers });
    }

    const { data: memberships, error: membershipsError } = await admin
      .from("company_memberships")
      .select("user_id, role:company_roles!inner(name)")
      .eq("company_id", membership.company_id)
      .eq("status", "active");

    if (membershipsError) {
      console.error("Doctor membership lookup failed", membershipsError);
      return NextResponse.json({ error: "Unable to load the company doctor directory." }, { status: 500, headers });
    }

    const doctorUserIds = (memberships ?? []).flatMap((row) => {
      const roleValue = row.role as unknown as { name: string } | { name: string }[] | null;
      const role = Array.isArray(roleValue) ? roleValue[0]?.name : roleValue?.name;
      return role && (/doctor/i.test(role) || /medical officer/i.test(role)) ? [row.user_id] : [];
    });

    if (!doctorUserIds.length) {
      return NextResponse.json({ doctors: [] }, { headers });
    }

    const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
      admin.from("profiles").select("id, display_name").in("id", doctorUserIds),
      Promise.all(doctorUserIds.map((id) => admin.auth.admin.getUserById(id))),
    ]);

    const authUserError = authUsers.find((result) => result.error)?.error;
    if (profilesError || authUserError) {
      console.error("Doctor profile lookup failed", profilesError ?? authUserError);
      return NextResponse.json({ error: "Unable to load doctor details." }, { status: 500, headers });
    }

    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
    const doctors: DoctorOption[] = authUsers.flatMap(({ data }, index) => {
      const authUser = data.user;
      if (!authUser) return [];
      const email = authUser.email ?? "";
      const name = splitName(
        profileById.get(doctorUserIds[index]) ?? String(authUser.user_metadata?.full_name ?? ""),
        email,
      );
      return [{ id: authUser.id, ...name, email }];
    }).sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

    return NextResponse.json({ doctors }, { headers });
  } catch (error) {
    console.error("Doctor directory request failed", error);
    return NextResponse.json({ error: "Unable to load the company doctor directory." }, { status: 503, headers });
  }
}
