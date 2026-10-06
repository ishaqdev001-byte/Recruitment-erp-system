import { NextResponse } from "next/server";
import { getPassportAccess, hasPassportPermission } from "@/lib/server/passports";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const statuses = new Set(["available", "with_agent", "withdrawn", "transferred"]);

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export async function PATCH(request: Request, context: { params: Promise<{ passportId: string }> }) {
  try {
    const access = await getPassportAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    if (!await hasPassportPermission(access, "passport.edit")) return NextResponse.json({ error: "You do not have permission to update passport custody." }, { status: 403, headers: responseHeaders });

    const { passportId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const status = typeof body?.status === "string" ? body.status : "";
    if (!body || !statuses.has(status)) return NextResponse.json({ error: "Choose a valid passport status." }, { status: 400, headers: responseHeaders });

    const update: Record<string, string | null> = {
      passport_status: status,
      status_updated_by: access.userId,
      withdrawn_at: null,
      withdrawal_requested_by: "",
      transferred_at: null,
      transfer_destination: "",
    };
    if (status === "available") {
      const branch = typeof body.storageBranch === "string" ? body.storageBranch.trim() : "";
      const location = typeof body.storageLocation === "string" ? body.storageLocation.trim() : "";
      if (!branch || branch.length > 200 || !location || location.length > 200) {
        return NextResponse.json({ error: "Provide the storage branch and locker location for an available passport." }, { status: 400, headers: responseHeaders });
      }
      update.storage_branch = branch;
      update.storage_location = location;
    }
    if (status === "withdrawn") {
      const requestedBy = typeof body.withdrawalRequestedBy === "string" ? body.withdrawalRequestedBy.trim() : "";
      if (!validDate(body.withdrawnAt) || !requestedBy || requestedBy.length > 200) {
        return NextResponse.json({ error: "Provide the withdrawal date and the person who requested it." }, { status: 400, headers: responseHeaders });
      }
      update.withdrawn_at = body.withdrawnAt;
      update.withdrawal_requested_by = requestedBy;
    }
    if (status === "transferred") {
      const destination = typeof body.transferDestination === "string" ? body.transferDestination.trim() : "";
      if (!validDate(body.transferredAt) || !destination || destination.length > 300) {
        return NextResponse.json({ error: "Provide the transfer date and destination." }, { status: 400, headers: responseHeaders });
      }
      update.transferred_at = body.transferredAt;
      update.transfer_destination = destination;
    }

    const { data, error } = await access.supabase.from("candidate_passports")
      .update(update)
      .eq("id", passportId)
      .eq("company_id", access.companyId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("Passport status update failed", error);
      return NextResponse.json({ error: "Unable to update passport custody." }, { status: 403, headers: responseHeaders });
    }
    return NextResponse.json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Passport status update request failed", error);
    return NextResponse.json({ error: "Passport status update is unavailable." }, { status: 503, headers: responseHeaders });
  }
}