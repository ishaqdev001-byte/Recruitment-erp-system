import "server-only";

import crypto from "node:crypto";

import type { DriveAccess } from "@/lib/server/company-drive";

export type DriveMountCredential = {
  id: string;
  username: string;
  password: string;
  label: string;
  webdavUrl: string;
};

function resolveWebdavBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://localhost:3000";
}

async function revokeExistingMount(access: DriveAccess) {
  if ("error" in access) throw new Error(access.error);

  const { data: active } = await access.supabase
    .from("company_drive_mounts")
    .select("id")
    .eq("company_id", access.companyId)
    .eq("user_id", access.userId)
    .is("revoked_at", null)
    .maybeSingle();

  if (!active) return;
  await access.supabase.from("company_drive_mounts")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", active.id)
    .eq("company_id", access.companyId);
}

export async function createDriveMount(access: DriveAccess, label = "Windows network location"): Promise<DriveMountCredential> {
  if ("error" in access) throw new Error(access.error);

  await revokeExistingMount(access);

  const secret = crypto.randomBytes(24).toString("base64url");
  const username = `${access.companyId}:${access.userId}`;
  const passwordHash = crypto.createHash("sha256").update(secret).digest("hex");
  const { data, error } = await access.supabase.from("company_drive_mounts").insert({
    company_id: access.companyId,
    user_id: access.userId,
    token_hash: passwordHash,
    label,
  }).select("id, label").single();
  if (error || !data) throw new Error(error?.message || "Unable to create the mounted network share.");

  return {
    id: data.id,
    username,
    password: secret,
    label: data.label || label,
    webdavUrl: `${resolveWebdavBaseUrl().replace(/\/$/, "")}/webdav/company-drive`,
  };
}

export async function revokeDriveMount(access: DriveAccess) {
  if ("error" in access) throw new Error(access.error);
  await access.supabase.from("company_drive_mounts")
    .update({ revoked_at: new Date().toISOString() })
    .eq("company_id", access.companyId)
    .eq("user_id", access.userId)
    .is("revoked_at", null);
}
