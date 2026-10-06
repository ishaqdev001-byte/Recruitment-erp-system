import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getInvitation(invitationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) return { error: "Invitation not found.", status: 404 as const };

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Open the invitation link from your email to continue.", status: 401 as const };

  const admin = createAdminClient();
  if (!admin) return { error: "Invitation verification is unavailable. Contact the company administrator.", status: 503 as const };
  const { data: invitation, error: invitationError } = await admin
    .from("workspace_invitations")
    .select("id, company_id, user_id, role_id, expires_at, accepted_at")
    .eq("id", invitationId)
    .maybeSingle();
  if (invitationError || !invitation || invitation.user_id !== user.id) {
    return { error: "This invitation is invalid. Ask the company administrator to send a new one.", status: 404 as const };
  }
  if (invitation.accepted_at) return { error: "This invitation has already been accepted. Log in with your password.", status: 410 as const };
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return { error: "This invitation has expired. Ask the company administrator to send a new one.", status: 410 as const };
  }

  const [{ data: membership, error: membershipError }, { data: company, error: companyError }, { data: role, error: roleError }] = await Promise.all([
    admin.from("company_memberships").select("role_id, status").eq("company_id", invitation.company_id).eq("user_id", user.id).maybeSingle(),
    admin.from("companies").select("name").eq("id", invitation.company_id).maybeSingle(),
    admin.from("company_roles").select("name").eq("id", invitation.role_id).eq("company_id", invitation.company_id).maybeSingle(),
  ]);
  if (membershipError || companyError || roleError || membership?.status !== "active"
    || membership.role_id !== invitation.role_id || !company || !role) {
    return { error: "The invited company assignment could not be verified. Ask the company administrator to resend the invitation.", status: 403 as const };
  }

  return { admin, invitation, userId: user.id, companyName: company.name, roleName: role.name };
}

async function getLegacyInvitation() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Open the invitation link from your email to continue.", status: 401 as const };
  const admin = createAdminClient();
  if (!admin) return { error: "Invitation verification is unavailable. Contact the company administrator.", status: 503 as const };

  const { data: memberships, error: membershipError } = await admin
    .from("company_memberships")
    .select("company_id, role_id")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (membershipError || memberships?.length !== 1) {
    return { error: "This older invitation does not resolve to exactly one active company. Ask the administrator to send a new invitation.", status: 403 as const };
  }
  const membership = memberships[0];

  const { data: previousInvitations, error: previousError } = await admin
    .from("workspace_invitations")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (previousError) return { error: "Unable to verify this invitation.", status: 503 as const };
  if (previousInvitations?.length) return getInvitation(previousInvitations[0].id);

  const [{ data: company }, { data: role }] = await Promise.all([
    admin.from("companies").select("name").eq("id", membership.company_id).maybeSingle(),
    admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
  ]);
  if (!company || !role) {
    return { error: "This older invitation could not be matched to its company and role. Ask the administrator to send a new invitation.", status: 403 as const };
  }

  const { data: invitation, error: insertError } = await admin.from("workspace_invitations").insert({
    company_id: membership.company_id,
    user_id: user.id,
    role_id: membership.role_id,
  }).select("id").single();
  if (insertError || !invitation) return { error: "Unable to create a short-lived acceptance record. Ask the administrator to send a new invitation.", status: 500 as const };
  return getInvitation(invitation.id);
}

export async function GET(_request: Request, context: RouteContext<"/api/workspace/invitations/[invitationId]">) {
  try {
    const { invitationId } = await context.params;
    const result = invitationId === "legacy" ? await getLegacyInvitation() : await getInvitation(invitationId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: responseHeaders });
    return NextResponse.json({
      invitationId: result.invitation.id,
      companyId: result.invitation.company_id,
      companyName: result.companyName,
      roleName: result.roleName,
      expiresAt: result.invitation.expires_at,
    }, { headers: responseHeaders });
  } catch (error) {
    console.error("Workspace invitation lookup failed", error);
    return NextResponse.json({ error: "Unable to verify this invitation." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(_request: Request, context: RouteContext<"/api/workspace/invitations/[invitationId]">) {
  try {
    const { invitationId } = await context.params;
    const result = await getInvitation(invitationId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status, headers: responseHeaders });
    const { data, error } = await result.admin
      .from("workspace_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("user_id", result.userId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "This invitation expired before it could be completed. Ask the company administrator to send a new one." }, { status: 410, headers: responseHeaders });
    return NextResponse.json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Workspace invitation acceptance failed", error);
    return NextResponse.json({ error: "Unable to complete this invitation." }, { status: 503, headers: responseHeaders });
  }
}