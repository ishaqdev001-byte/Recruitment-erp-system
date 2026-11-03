import { NextResponse } from "next/server";
import { getLinkedStaffAccess } from "@/lib/server/staff-profile";
import { respondToStaffProfileReminder } from "@/lib/server/staff-profile-reminders";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const actions = ["reviewed", "review_later", "same", "changed"];
  if (!body || typeof body.action !== "string" || !actions.includes(body.action)) {
    return NextResponse.json({ error: "Choose a valid HR profile reminder response." }, { status: 400, headers });
  }

  try {
    const access = await getLinkedStaffAccess(false);
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status, headers });
    }

    const { data: staff, error: staffError } = await access.admin
      .from("company_staff_members")
      .select("name, phone, date_of_birth, sex, local_address, next_of_kin, next_of_kin_phone, emergency_contact_address")
      .eq("company_id", access.companyId)
      .eq("id", access.staffId)
      .eq("linked_user_id", access.userId)
      .single();
    if (staffError) {
      throw staffError;
    }
    if (
      !staff.name?.trim() ||
      !staff.phone?.trim() ||
      !staff.date_of_birth ||
      !staff.sex ||
      !staff.local_address?.trim() ||
      !staff.next_of_kin?.trim() ||
      !staff.next_of_kin_phone?.trim() ||
      !staff.emergency_contact_address?.trim()
    ) {
      return NextResponse.json(
        { error: "Complete your required personal details before confirming this reminder." },
        { status: 409, headers },
      );
    }

    const reminder = await respondToStaffProfileReminder(access, body?.action);
    return NextResponse.json({ reminder }, { headers });
  } catch (error) {
    console.error("Staff HR profile reminder response failed:", error);
    return NextResponse.json({ error: "Unable to update your HR profile reminder." }, { status: 503, headers });
  }
}
