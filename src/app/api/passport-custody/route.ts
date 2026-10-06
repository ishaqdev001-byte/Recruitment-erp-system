import { NextResponse } from "next/server";
import { getPassportAccess, hasPassportPermission } from "@/lib/server/passports";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const access = await getPassportAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    if (!await hasPassportPermission(access, "passport.view")) {
      return NextResponse.json({ error: "You do not have permission to view passport custody." }, { status: 403, headers: responseHeaders });
    }
    const [{ data: passports, error }, canEdit] = await Promise.all([
      access.supabase.rpc("list_passport_tracking", { requested_company_id: access.companyId }),
      hasPassportPermission(access, "passport.edit"),
    ]);
    if (error) {
      console.error("Passport custody query failed", error);
      return NextResponse.json({ error: "Unable to load passport custody. Apply the latest passport migration if setup is incomplete." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ passports: passports ?? [], permissions: { canEdit } }, { headers: responseHeaders });
  } catch (error) {
    console.error("Passport custody request failed", error);
    return NextResponse.json({ error: "Passport custody is unavailable." }, { status: 503, headers: responseHeaders });
  }
}