import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/workspace/users/change-password
 *
 * Called when a user who was created with a default/temporary password logs in
 * for the first time. Updates their Supabase password and clears the
 * must_change_password flag in their profile row.
 *
 * Body: { newPassword: string }
 * Auth: requires an active Supabase session (the user must already be signed in)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: responseHeaders });
    }

    const body = await request.json() as Record<string, unknown>;
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Your new password must be at least 8 characters." }, { status: 400, headers: responseHeaders });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the Next.js server." },
        { status: 503, headers: responseHeaders },
      );
    }

    // Verify the user actually has must_change_password set — prevents misuse
    const { data: profile, error: profileReadError } = await admin
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    if (profileReadError) {
      return NextResponse.json({ error: "Unable to verify your account status." }, { status: 500, headers: responseHeaders });
    }
    if (!profile?.must_change_password) {
      // Already cleared — treat as a no-op success (idempotent)
      return NextResponse.json({ success: true }, { headers: responseHeaders });
    }

    // Update the Supabase Auth password via the admin API
    const { error: passwordError } = await admin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });
    if (passwordError) {
      return NextResponse.json({ error: passwordError.message ?? "Unable to update your password." }, { status: 500, headers: responseHeaders });
    }

    // Clear the must_change_password flag
    const { error: clearError } = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (clearError) {
      // Password changed successfully; flag clear failed — not critical, user can re-login
      console.error("Failed to clear must_change_password for user", user.id, clearError);
    }

    return NextResponse.json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("change-password request failed", error);
    return NextResponse.json({ error: "Unable to update your password." }, { status: 503, headers: responseHeaders });
  }
}
