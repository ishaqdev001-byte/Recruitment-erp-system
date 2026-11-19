import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/candidate-inquiries/[inquiryId]">,
) {
  try {
    const { inquiryId } = await context.params;
    if (!isUuid(inquiryId)) {
      return NextResponse.json({ error: "Inquiry not found." }, { status: 404, headers });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    const [{ data: canDelete, error: permissionError }, { data: inquiryScope, error: scopeError }] =
      await Promise.all([
        supabase.rpc("current_user_has_company_permission", {
          requested_company_id: membership.company_id,
          requested_permission: "candidates.delete",
        }),
        supabase.rpc("current_user_role_setting", {
          requested_company_id: membership.company_id,
          requested_setting: "inquiry_scope",
          fallback_value: "company",
        }),
      ]);
    if (permissionError || scopeError) {
      console.error("Candidate inquiry delete access lookup failed", permissionError ?? scopeError);
      return NextResponse.json({ error: "Unable to verify inquiry delete access." }, { status: 503, headers });
    }
    if (!canDelete) {
      return NextResponse.json({ error: "You do not have permission to delete inquiries." }, { status: 403, headers });
    }

    const { data: inquiry, error: inquiryError } = await supabase
      .from("candidate_inquiries")
      .select("id, status, created_by")
      .eq("id", inquiryId)
      .eq("company_id", membership.company_id)
      .maybeSingle();
    if (inquiryError) {
      console.error("Candidate inquiry lookup before deletion failed", inquiryError);
      return NextResponse.json({ error: "Unable to verify this inquiry." }, { status: 503, headers });
    }
    if (!inquiry) {
      return NextResponse.json({ error: "Inquiry not found." }, { status: 404, headers });
    }
    if (inquiryScope === "created" && inquiry.created_by !== user.id) {
      return NextResponse.json({ error: "Inquiry not found." }, { status: 404, headers });
    }
    if (inquiry.status !== "inquiry") {
      return NextResponse.json({ error: "Only open inquiries can be deleted." }, { status: 409, headers });
    }

    const { data, error } = await supabase
      .from("candidate_inquiries")
      .delete()
      .eq("id", inquiryId)
      .eq("company_id", membership.company_id)
      .eq("status", "inquiry")
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("Candidate inquiry deletion failed", error);
      if (error.code === "23503") {
        return NextResponse.json({
          error: "This inquiry has already been registered and cannot be deleted.",
        }, { status: 409, headers });
      }
      return NextResponse.json({ error: "Unable to delete this inquiry." }, { status: 503, headers });
    }
    if (!data) {
      return NextResponse.json({ error: "Inquiry not found or no longer available for deletion." }, { status: 404, headers });
    }

    return new Response(null, { status: 204, headers });
  } catch (error) {
    console.error("Candidate inquiry deletion request failed", error);
    return NextResponse.json({ error: "Candidate inquiry deletion is unavailable." }, { status: 503, headers });
  }
}
