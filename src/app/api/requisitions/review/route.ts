import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function getAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return { error: "Active company membership not found.", status: 403 as const };
  return { supabase, companyId: membership.company_id, userId: user.id };
}

async function insertNotification(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  requisitionId: string,
  recipientId: string,
  stage: string,
  title: string,
  body: string,
) {
  if (!admin) return;
  await admin.from("requisition_notifications").insert({
    company_id: companyId,
    requisition_id: requisitionId,
    recipient_id: recipientId,
    stage,
    title,
    body,
  }).then(({ error }) => {
    if (error) console.error("Requisition notification insert failed", error);
  });
}

async function notifyUsersWithPermission(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  requisitionId: string,
  permissionCode: string,
  stage: string,
  title: string,
  body: string,
) {
  if (!admin) return;
  const { data: permUsers, error } = await admin
    .from("role_permissions")
    .select("company_roles!inner(company_memberships!inner(user_id, status))")
    .eq("company_id", companyId)
    .eq("permission_code", permissionCode);

  if (error || !permUsers) return;

  const userIds = new Set<string>();
  for (const row of permUsers as unknown as Array<{ company_roles: { company_memberships: Array<{ user_id: string; status: string }> } }>) {
    for (const m of row.company_roles?.company_memberships ?? []) {
      if (m.status === "active") userIds.add(m.user_id);
    }
  }
  for (const uid of userIds) {
    await insertNotification(admin, companyId, requisitionId, uid, stage, title, body);
  }
}

const stageLabels: Record<string, string> = {
  general_manager: "General Manager",
  finance: "Finance / Cashier",
  director: "Director / CEO",
};

// POST /api/requisitions/review — submit a review decision for a stage
export async function POST(request: Request) {
  try {
    const access = await getAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Provide review details." }, { status: 400, headers: responseHeaders });

    const requisitionId = typeof body.requisitionId === "string" && isUuid(body.requisitionId) ? body.requisitionId : null;
    const stage = body.stage as string;
    const decision = body.decision as string;
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!requisitionId) return NextResponse.json({ error: "Invalid requisition ID." }, { status: 400, headers: responseHeaders });
    if (!["general_manager", "finance", "director"].includes(stage)) return NextResponse.json({ error: "Invalid review stage." }, { status: 400, headers: responseHeaders });
    if (!["approved", "rejected"].includes(decision)) return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400, headers: responseHeaders });

    // Fetch requisition title before calling RPC (for notifications)
    const { data: req } = await access.supabase
      .from("company_requisitions")
      .select("title, requisition_number, created_by")
      .eq("id", requisitionId)
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (!req) return NextResponse.json({ error: "Requisition not found." }, { status: 404, headers: responseHeaders });

    // Call the security-definer RPC
    const { data, error } = await access.supabase.rpc("review_requisition", {
      p_company_id: access.companyId,
      p_requisition_id: requisitionId,
      p_stage: stage,
      p_decision: decision,
      p_note: note,
    });

    if (error) {
      if (error.code === "42501") return NextResponse.json({ error: error.message }, { status: 403, headers: responseHeaders });
      if (["22023", "P0002"].includes(error.code ?? "")) return NextResponse.json({ error: error.message }, { status: 400, headers: responseHeaders });
      console.error("Review requisition RPC failed", error);
      return NextResponse.json({ error: "Unable to submit review." }, { status: 500, headers: responseHeaders });
    }

    const result = data as { status: string; decision: string };
    const admin = createAdminClient();
    const stageLabel = stageLabels[stage] ?? stage;
    const reqTitle = `${req.requisition_number} — ${req.title}`;

    // Notify the creator about the status change
    if (req.created_by) {
      const creatorTitle = decision === "approved"
        ? `Requisition ${decision === "approved" ? "approved" : "rejected"} by ${stageLabel}`
        : `Requisition declined by ${stageLabel}`;
      const creatorBody = decision === "approved"
        ? `Your requisition "${reqTitle}" has been ${stage === "director" ? "fully authorised" : `approved by ${stageLabel} and forwarded to the next stage`}.`
        : `Your requisition "${reqTitle}" was declined at the ${stageLabel} stage.${note ? ` Note: ${note}` : ""}`;
      await insertNotification(admin, access.companyId, requisitionId, req.created_by, `${stage}_${decision}`, creatorTitle, creatorBody);
    }

    // Notify next-stage approvers if approved and not final
    if (decision === "approved" && stage !== "director") {
      const nextPermission = stage === "general_manager" ? "requisitions.verify" : "requisitions.authorize";
      const nextLabel = stage === "general_manager" ? "Finance / Cashier" : "Director / CEO";
      await notifyUsersWithPermission(
        admin,
        access.companyId,
        requisitionId,
        nextPermission,
        `${stage}_approved`,
        `Requisition awaiting your review`,
        `Requisition "${reqTitle}" has been approved by ${stageLabel} and is now awaiting your review.`,
      );
    }

    return NextResponse.json({ ok: true, status: result.status, decision: result.decision }, { headers: responseHeaders });
  } catch (err) {
    console.error("Requisitions review POST failed", err);
    return NextResponse.json({ error: "Requisition review is unavailable." }, { status: 503, headers: responseHeaders });
  }
}
