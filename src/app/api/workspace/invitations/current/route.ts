import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseServerUser } from "@/lib/server/auth-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const user = await getSupabaseServerUser(supabase);
    if (!user) return NextResponse.json({ error: "Your invitation sign-in session is missing or expired. Ask the company administrator to resend the invitation." }, { status: 401, headers: responseHeaders });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) return NextResponse.json({ error: "Invitation verification is unavailable." }, { status: 503, headers: responseHeaders });
    const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: invitation, error } = await admin
      .from("workspace_invitations")
      .select("id, company_id, accepted_at, expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Current invitation lookup failed", error);
      return NextResponse.json({ error: "Unable to verify workspace invitation status." }, { status: 503, headers: responseHeaders });
    }

    const relinkInvitationRequiresEmailLink = Boolean(
      invitation &&
      !invitation.accepted_at &&
      user.app_metadata?.workspace_account_unlinked === true &&
      user.app_metadata?.workspace_relink_company_id === invitation.company_id
    );

    return NextResponse.json({
      invitationId: relinkInvitationRequiresEmailLink ? null : invitation?.id ?? null,
      requiresAcceptance: Boolean(invitation && !invitation.accepted_at && !relinkInvitationRequiresEmailLink),
      legacyInvitation: !invitation && Boolean(user.app_metadata?.invitation_company_id
        || (user.user_metadata?.company_name && user.user_metadata?.role_name)),
      expiresAt: relinkInvitationRequiresEmailLink ? null : invitation?.expires_at ?? null,
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Current invitation request failed", error);
    return NextResponse.json({ error: "Unable to verify workspace invitation status." }, { status: 503, headers: responseHeaders });
  }
}