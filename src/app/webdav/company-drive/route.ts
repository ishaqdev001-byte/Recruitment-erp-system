import { getDriveAccess } from "@/lib/server/company-drive";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const mountUsers = new Map<string, { companyId: string; userId: string; username: string }>();

function isBasicAuthHeader(value: string | null): value is string {
  return typeof value === "string" && value.toLowerCase().startsWith("basic ");
}

async function getMountedUser(request: Request) {
  const header = request.headers.get("authorization");
  if (!isBasicAuthHeader(header)) return null;

  const encoded = header.slice(6).trim();
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return null;
  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  const [companyId, userId] = username.split(":");
  if (!companyId || !userId) return null;

  const access = await getDriveAccess();
  if ("error" in access || access.companyId !== companyId || access.userId !== userId) return null;

  const { data: mount } = await access.supabase.from("company_drive_mounts")
    .select("id, token_hash, revoked_at, user_id, company_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!mount) return null;
  const providedHash = createHash("sha256").update(password).digest("hex");
  if (providedHash !== mount.token_hash) return null;
  mountUsers.set(username, { companyId, userId, username });
  return { companyId, userId, username };
}

export async function GET(request: Request) {
  const authenticated = await getMountedUser(request);
  if (!authenticated) {
    return new NextResponse(null, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Company Drive"', "Content-Type": "text/plain" },
    });
  }

  const access = await getDriveAccess();
  if ("error" in access) {
    return new NextResponse(null, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Company Drive"', "Content-Type": "text/plain" } });
  }

  const { data: root } = await access.supabase
    .from("company_drive_items")
    .select("id, name")
    .eq("company_id", authenticated.companyId)
    .eq("category", "shared")
    .eq("is_system", true)
    .is("parent_id", null)
    .maybeSingle();

  return NextResponse.json({
    companyId: authenticated.companyId,
    userId: authenticated.userId,
    root: root ? { id: root.id, name: root.name } : null,
    note: "This is a WebDAV-compatible mount endpoint for the company drive.",
  });
}
