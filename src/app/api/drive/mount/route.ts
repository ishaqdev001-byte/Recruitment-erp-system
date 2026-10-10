import { NextResponse } from "next/server";

import { getDriveAccess } from "@/lib/server/company-drive";
import { createDriveMount, revokeDriveMount } from "@/lib/server/company-drive-mount";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: responseHeaders });

export async function POST(request: Request) {
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const body = await request.json().catch(() => null) as { action?: string; label?: string } | null;
    if (!body || !body.action) return privateJson({ error: "Choose a mount action." }, 400);

    if (body.action === "revoke") {
      await revokeDriveMount(access);
      return privateJson({ revoked: true });
    }

    if (body.action !== "create") {
      return privateJson({ error: "Unsupported mount action." }, 400);
    }

    const mount = await createDriveMount(access, typeof body.label === "string" ? body.label : "Windows network location");
    return privateJson({ mount }, 201);
  } catch (error) {
    console.error("Drive mount request failed", error);
    return privateJson({ error: error instanceof Error ? error.message : "Unable to set up the mounted network share." }, 503);
  }
}

export async function GET() {
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const { data: current } = await access.supabase.from("company_drive_mounts")
      .select("id, label, created_at, last_used_at, revoked_at")
      .eq("company_id", access.companyId)
      .eq("user_id", access.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return privateJson({ mount: current ? { id: current.id, label: current.label, createdAt: current.created_at, lastUsedAt: current.last_used_at, revokedAt: current.revoked_at } : null });
  } catch (error) {
    console.error("Drive mount lookup failed", error);
    return privateJson({ error: "Unable to load the mounted share." }, 503);
  }
}
