import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

/**
 * GET /api/candidates/[candidateId]/activity-logs
 *
 * Fetches audit logs for a candidate including:
 * - Stage changes
 * - User actions (edits, status updates)
 * - Transaction logs
 * - Who made the change and when
 *
 * Only accessible to Chairman and General Manager roles.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: responseHeaders });
    }

    const { candidateId } = await params;

    // Get candidate and verify access
    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select("id, company_id, first_name, last_name, file_number")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError || !candidate) {
      return NextResponse.json({ error: "Candidate not found." }, { status: 404, headers: responseHeaders });
    }

    // Get current user's role to check if they are Chairman or General Manager
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("role_id, role:company_roles(name)")
      .eq("user_id", user.id)
      .eq("company_id", candidate.company_id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "You do not have access to this candidate's company." }, { status: 403, headers: responseHeaders });
    }

    const userRole = membership.role as unknown as { name: string } | null;
    const roleName = userRole?.name ?? "";

    // Only Chairman and General Manager can view activity logs
    const isAuthorized = roleName === "Company Owner / Primary Administrator" || 
                        roleName === "Primary Administrator" || 
                        roleName === "Chairman" || 
                        roleName === "General Manager";

    if (!isAuthorized) {
      return NextResponse.json({ error: "Only Chairman and General Manager can view activity logs." }, { status: 403, headers: responseHeaders });
    }

    // Fetch audit logs for this candidate
    const { data: auditLogs, error: logsError } = await supabase
      .from("audit_logs")
      .select(
        `id, action, entity_type, entity_id, metadata, created_at,
         user:auth.users (id, email, user_metadata)`,
      )
      .eq("company_id", candidate.company_id)
      .eq("entity_id", candidateId)
      .eq("entity_type", "candidate")
      .order("created_at", { ascending: false })
      .limit(200);
    if (logsError) {
      console.error("Audit logs query failed", logsError);
      return NextResponse.json({ error: "Unable to load activity logs." }, { status: 500, headers: responseHeaders });
    }

    // Fetch invoice payments for transaction logs
    const { data: invoices, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, invoice_number, amount, status, created_at, created_by")
      .eq("company_id", candidate.company_id)
      .eq("recipient_id", candidateId)
      .eq("recipient_type", "candidate")
      .order("created_at", { ascending: false });
    if (invoicesError) {
      console.error("Invoices query failed", invoicesError);
    }

    // Fetch financial receipts for transaction logs
    const { data: receipts, error: receiptsError } = await supabase
      .from("financial_receipts")
      .select("id, receipt_number, amount, category, created_at, created_by")
      .eq("company_id", candidate.company_id)
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });
    if (receiptsError) {
      console.error("Receipts query failed", receiptsError);
    }

    // Combine and format logs
    const transformedLogs = (auditLogs ?? []).map((log: any) => ({
      id: log.id,
      type: "action",
      action: log.action,
      entityType: log.entity_type,
      description: formatActionDescription(log.action, log.metadata),
      metadata: log.metadata,
      user: {
        id: log.user?.id,
        email: log.user?.email,
        name: log.user?.user_metadata?.full_name ?? "System",
      },
      timestamp: log.created_at,
    }));

    const invoiceLogs = (invoices ?? []).map((invoice: any) => ({
      id: invoice.id,
      type: "transaction",
      action: "invoice_created",
      description: `Invoice ${invoice.invoice_number} created for UGX ${Number(invoice.amount).toLocaleString()}`,
      metadata: { invoiceNumber: invoice.invoice_number, amount: invoice.amount, status: invoice.status },
      user: { email: "System", name: "System" },
      timestamp: invoice.created_at,
    }));

    const receiptLogs = (receipts ?? []).map((receipt: any) => ({
      id: receipt.id,
      type: "transaction",
      action: "deposit_received",
      description: `Deposit received: ${receipt.category} - UGX ${Number(receipt.amount).toLocaleString()}`,
      metadata: { receiptNumber: receipt.receipt_number, amount: receipt.amount, category: receipt.category },
      user: { email: "System", name: "System" },
      timestamp: receipt.created_at,
    }));

    // Combine all logs and sort by timestamp
    const allLogs = [...transformedLogs, ...invoiceLogs, ...receiptLogs].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return NextResponse.json(
      {
        candidate: {
          id: candidate.id,
          name: `${candidate.first_name} ${candidate.last_name}`,
          fileNumber: candidate.file_number,
        },
        logs: allLogs,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("Candidate activity logs request failed", error);
    return NextResponse.json({ error: "Unable to load candidate activity logs." }, { status: 503, headers: responseHeaders });
  }
}

function formatActionDescription(action: string, metadata: Record<string, unknown>): string {
  switch (action) {
    case "create":
      return "Candidate created";
    case "update":
      return `Candidate updated: ${Object.keys(metadata || {}).join(", ") || "details"}`;
    case "stage_change":
      return `Stage changed to ${metadata?.new_stage ?? "unknown"}`;
    case "status_update":
      return `Status updated to ${metadata?.status ?? "unknown"}`;
    case "delete":
      return "Candidate deleted";
    default:
      return `${action.replace(/_/g, " ")}`;
  }
}
