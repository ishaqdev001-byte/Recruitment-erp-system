import path from "node:path";
import { createRequire } from "node:module";
import { Readable, Writable } from "node:stream";
import { Client as FtpClient } from "basic-ftp";
import { createClient } from "@supabase/supabase-js";

const projectRequire = createRequire(import.meta.url);
const nextRequire = createRequire(projectRequire.resolve("next/package.json"));
const { loadEnvConfig } = nextRequire("@next/env");
loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const host = process.env.INTERSERVER_STORAGE_HOST;
const port = Number(process.env.INTERSERVER_STORAGE_PORT || "21");
const username = process.env.INTERSERVER_STORAGE_USERNAME;
const password = process.env.INTERSERVER_STORAGE_PASSWORD;
const basePath = process.env.INTERSERVER_STORAGE_BASE_PATH;

if (!supabaseUrl || !serviceRoleKey || !host || !username || !password || !basePath || !path.posix.isAbsolute(basePath)) {
  throw new Error("Supabase and InterServer FTP environment variables are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const ftp = new FtpClient(15_000);
const storageRoot = path.posix.resolve(basePath);

function resolveStoragePath(storagePath) {
  const resolved = path.posix.resolve(storageRoot, storagePath);
  if (!resolved.startsWith(`${storageRoot}/`)) throw new Error("Company file is outside the configured storage root.");
  return resolved;
}

async function downloadFile(remotePath) {
  const chunks = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  await ftp.downloadTo(destination, remotePath);
  return Buffer.concat(chunks);
}

async function moveDriveFile(item, newStoragePath) {
  const content = await downloadFile(resolveStoragePath(item.storage_path));
  const newRemotePath = resolveStoragePath(newStoragePath);
  await ftp.ensureDir(path.posix.dirname(newRemotePath));
  await ftp.uploadFrom(Readable.from([content]), newRemotePath);

  const { error: updateError } = await supabase.from("company_drive_items")
    .update({ storage_path: newStoragePath })
    .eq("id", item.id)
    .eq("company_id", item.company_id);
  if (updateError) {
    await ftp.remove(newRemotePath).catch(() => undefined);
    throw updateError;
  }

  try {
    await ftp.remove(resolveStoragePath(item.storage_path));
  } catch (removeError) {
    console.error(`Old file could not be removed for drive item ${item.id}`, removeError);
  }
}

try {
  await ftp.access({ host, port, user: username, password, secure: false });

  let movedFinanceFiles = 0;
  let movedOwnerFiles = 0;
  let companyOffset = 0;
  const companyPageSize = 500;
  while (true) {
    const { data: companies, error } = await supabase.from("companies").select("id, primary_admin_user_id").order("id").range(companyOffset, companyOffset + companyPageSize - 1);
    if (error) throw error;
    if (!companies?.length) break;

    for (const company of companies) {
      for (const folder of ["users", "finance", "candidates", "drive"]) {
        await ftp.ensureDir(resolveStoragePath(`company/${company.id}/${folder}`));
      }

      if (company.primary_admin_user_id) {
        const ownerPathPattern = new RegExp(`^company/${company.id}/users/${company.primary_admin_user_id}/(?:[a-z0-9-]{1,48}--[0-9a-f-]{36}/)+([0-9a-f-]{36}\\.[a-z0-9]{1,12})$`, "i");
        while (true) {
          const { data: ownerFiles, error: ownerFilesError } = await supabase.from("company_drive_items")
            .select("id, company_id, storage_path")
            .eq("company_id", company.id)
            .eq("category", "shared")
            .like("storage_path", `company/${company.id}/users/${company.primary_admin_user_id}/%`)
            .order("id")
            .limit(250);
          if (ownerFilesError) throw ownerFilesError;
          if (!ownerFiles?.length) break;

          for (const item of ownerFiles) {
            const match = ownerPathPattern.exec(item.storage_path ?? "");
            if (!match) throw new Error(`Unexpected primary-user storage path for drive item ${item.id}.`);
            await moveDriveFile(item, `company/${company.id}/drive/${match[1]}`);
            movedOwnerFiles += 1;
          }
        }
      }
    }

    companyOffset += companies.length;
    if (companies.length < companyPageSize) break;
  }

  const pageSize = 250;
  const legacyPathPattern = /^company\/([0-9a-f-]{36})\/drive\/([0-9a-f-]{36}\.[a-z0-9]{1,12})$/i;

  while (true) {
    const { data: items, error } = await supabase.from("company_drive_items")
      .select("id, company_id, storage_path")
      .eq("category", "finance")
      .like("storage_path", "company/%/drive/%")
      .order("id")
      .limit(pageSize);
    if (error) throw error;
    if (!items?.length) break;

    for (const item of items) {
      const match = legacyPathPattern.exec(item.storage_path ?? "");
      if (!match || match[1].toLowerCase() !== item.company_id.toLowerCase()) {
        throw new Error(`Unexpected Finance storage path for drive item ${item.id}.`);
      }

      await moveDriveFile(item, `company/${item.company_id}/finance/${match[2]}`);
      movedFinanceFiles += 1;
    }

  }

  console.info(`Ensured company storage folders, moved ${movedOwnerFiles} primary-user files to drive/, and moved ${movedFinanceFiles} Finance files to finance/.`);
} finally {
  ftp.close();
}