import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    const { data: membership, error: membershipError } = await supabase.from("company_memberships")
      .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "communications.sms.send",
    });
    if (permissionError || !allowed) return NextResponse.json({ error: "You do not have permission to send SMS." }, { status: 403, headers });

    const permissionChecks = await Promise.all([
      supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "candidates.view" }),
      supabase.rpc("current_user_has_company_permission", { requested_company_id: membership.company_id, requested_permission: "employers.view" }),
    ]);
    const contacts: { id: string; type: string; name: string; phone: string }[] = [];
    if (!permissionChecks[0].error && permissionChecks[0].data) {
      const { data, error } = await supabase.from("candidates")
        .select("id, first_name, last_name, phone").eq("company_id", membership.company_id)
        .not("phone", "is", null).order("first_name").limit(3000);
      if (error) throw error;
      for (const candidate of data ?? []) {
        if (candidate.phone?.trim()) contacts.push({ id: candidate.id, type: "Candidate", name: `${candidate.first_name} ${candidate.last_name}`.trim(), phone: candidate.phone });
      }
    }
    if (!permissionChecks[1].error && permissionChecks[1].data) {
      const { data, error } = await supabase.from("employers")
        .select("id, company_name, phone_numbers").eq("company_id", membership.company_id)
        .order("company_name").limit(1000);
      if (error) throw error;
      for (const employer of data ?? []) {
        for (const [index, phone] of (employer.phone_numbers ?? []).entries()) {
          if (phone?.trim()) contacts.push({ id: `${employer.id}:${index}`, type: "Employer", name: employer.company_name, phone });
        }
      }
    }
    const { data: memberships, error: membersError } = await supabase.from("company_memberships")
      .select("user_id").eq("company_id", membership.company_id).eq("status", "active");
    if (membersError) throw membersError;
    const userIds = (memberships ?? []).map((item) => item.user_id);
    if (userIds.length) {
      const { data, error } = await supabase.from("profiles").select("id, display_name, phone")
        .in("id", userIds).not("phone", "is", null);
      if (error) throw error;
      for (const profile of data ?? []) {
        if (profile.phone?.trim()) contacts.push({ id: profile.id, type: "Staff", name: profile.display_name || "Staff member", phone: profile.phone });
      }
    }

    return NextResponse.json({ contacts }, { headers });
  } catch (error) {
    console.error("SMS contact list request failed", error);
    return NextResponse.json({ error: "SMS contacts are unavailable." }, { status: 503, headers });
  }
}
