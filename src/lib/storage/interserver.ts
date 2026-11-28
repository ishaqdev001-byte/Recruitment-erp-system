import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { Client as FtpClient } from "basic-ftp";
import { candidateStorageFolderName } from "@/lib/server/documents";

const FALLBACK_STORAGE_ROOT = path.resolve(process.cwd(), ".local-storage");

function fallbackStorageFilePath(storagePath: string) {
  const cleaned = storagePath.replace(/^\/+/, "");
  const resolved = path.resolve(FALLBACK_STORAGE_ROOT, cleaned);
  if (!resolved.startsWith(FALLBACK_STORAGE_ROOT)) {
    throw new Error("Fallback storage path is outside the project root.");
  }
  return resolved;
}

async function writeFallbackStorageFile(storagePath: string, content: Buffer) {
  const filePath = fallbackStorageFilePath(storagePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

async function readFallbackStorageFile(storagePath: string) {
  const filePath = fallbackStorageFilePath(storagePath);
  return fs.readFile(filePath);
}

async function deleteFallbackStorageFile(storagePath: string) {
  const filePath = fallbackStorageFilePath(storagePath);
  await fs.rm(filePath, { force: true });
}

function isStorageConnectionError(message: string) {
  return /InterServer (?:SFTP|FTP) authentication failed|getConnection|All configured authentication methods failed|authentication|ECONNREFUSED|ECONNRESET|timed out/i.test(message);
}

function isRemotePathNotFoundError(message: string) {
  return /no such file|not found|does not exist|cannot find the file/i.test(message);
}

export function hasInterServerStorageConfig() {
  const host = process.env.INTERSERVER_STORAGE_HOST;
  const username = process.env.INTERSERVER_STORAGE_USERNAME;
  const password = process.env.INTERSERVER_STORAGE_PASSWORD;
  const basePath = process.env.INTERSERVER_STORAGE_BASE_PATH;
  const port = Number(process.env.INTERSERVER_STORAGE_PORT || "21");

  return Boolean(host && username && password && basePath && Number.isInteger(port) && port >= 1 && port <= 65535 && path.posix.isAbsolute(basePath) && !basePath.split("/").includes(".."));
}

function getStorageConfig() {
  const host = process.env.INTERSERVER_STORAGE_HOST;
  const username = process.env.INTERSERVER_STORAGE_USERNAME;
  const password = process.env.INTERSERVER_STORAGE_PASSWORD;
  const basePath = process.env.INTERSERVER_STORAGE_BASE_PATH;
  const port = Number(process.env.INTERSERVER_STORAGE_PORT || "21");

  if (!host || !username || !password || !basePath || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("InterServer storage configuration is incomplete.");
  }
  if (!path.posix.isAbsolute(basePath) || basePath.split("/").includes("..")) {
    throw new Error("InterServer storage base path is invalid.");
  }

  return { host, username, password, port, basePath: path.posix.normalize(basePath) };
}

function getRemotePath(storagePath: string) {
  if (!/^company\/[0-9a-f-]{36}\/candidates\/(?:[0-9a-f-]{36}|[a-z0-9-]{1,48}--[0-9a-f-]{36})\/[a-z_]+\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(storagePath)) {
    throw new Error("Storage reference is invalid.");
  }

  const { basePath } = getStorageConfig();
  const root = path.posix.resolve(basePath);
  const remotePath = path.posix.resolve(root, storagePath);
  if (!remotePath.startsWith(`${root}/`)) throw new Error("Storage reference is outside the configured root.");
  return remotePath;
}

function getCompanyDriveRemotePath(storagePath: string) {
  const isDriveFile = /^company\/[0-9a-f-]{36}\/drive\/[0-9a-f-]{36}\.[a-z0-9]{1,12}$/i.test(storagePath);
  const isUserDriveFile = /^company\/[0-9a-f-]{36}\/users\/[0-9a-f-]{36}\/(?:[a-z0-9-]{1,48}--[0-9a-f-]{36}\/)+[0-9a-f-]{36}\.[a-z0-9]{1,12}$/i.test(storagePath);
  const isFinanceFile = /^company\/[0-9a-f-]{36}\/finance\/[0-9a-f-]{36}\.[a-z0-9]{1,12}$/i.test(storagePath);
  const isCandidateFinanceFile = /^company\/[0-9a-f-]{36}\/finance\/candidates\/[a-z0-9-]{1,48}--[0-9a-f-]{36}\/(?:invoice|payment_receipt)\/[0-9a-f-]{36}\.pdf$/i.test(storagePath);
  if (!isDriveFile && !isUserDriveFile && !isFinanceFile && !isCandidateFinanceFile) {
    throw new Error("Company drive storage reference is invalid.");
  }

  const { basePath } = getStorageConfig();
  const root = path.posix.resolve(basePath);
  const remotePath = path.posix.resolve(root, storagePath);
  if (!remotePath.startsWith(`${root}/`)) throw new Error("Company drive storage reference is outside the configured root.");
  return remotePath;
}

async function withFtp<T>(operation: (client: FtpClient) => Promise<T>): Promise<T> {
  const config = getStorageConfig();
  const client = new FtpClient(15_000);

  try {
    await client.access({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      secure: false,
    });
    return await operation(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown FTP error";
    if (isStorageConnectionError(message)) {
      throw new Error("InterServer FTP authentication failed. Check INTERSERVER_STORAGE_HOST, INTERSERVER_STORAGE_PORT, INTERSERVER_STORAGE_USERNAME, INTERSERVER_STORAGE_PASSWORD, and INTERSERVER_STORAGE_BASE_PATH.");
    }
    throw error;
  } finally {
    try {
      client.close();
    } catch {
      // Preserve the original storage result or error.
    }
  }
}

const COMPANY_STORAGE_ID_PATTERN =
  /^company\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

export class CompanyStorageQuotaExceededError extends Error {
  constructor() {
    super("This company has reached its allocated storage limit. Contact Recruit Admin to increase the allocation.");
    this.name = "CompanyStorageQuotaExceededError";
  }
}

function getCompanyStorageId(storagePath: string) {
  const match = COMPANY_STORAGE_ID_PATTERN.exec(storagePath);
  if (!match) throw new Error("Company storage reference is invalid.");
  return match[1];
}

async function reserveCompanyStorageDelta(companyId: string, byteDelta: number) {
  if (!Number.isSafeInteger(byteDelta)) {
    throw new Error("Company storage byte count is outside the supported range.");
  }
  if (byteDelta === 0) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Company storage allocation checks require server Supabase admin configuration.");
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: reserved, error } = await admin.rpc(
    "recruit_admin_reserve_company_storage",
    { requested_company_id: companyId, byte_delta: byteDelta },
  );
  if (error) {
    console.error("Company storage allocation check failed", error);
    throw new Error("Unable to verify this company's storage allocation. Apply the Recruit Admin storage migration and try again.");
  }
  if (reserved !== true) throw new CompanyStorageQuotaExceededError();
}

async function getLocalFileSize(storagePath: string) {
  try {
    const info = await fs.stat(fallbackStorageFilePath(storagePath));
    return info.isFile() ? info.size : 0;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

async function getExistingStorageFileSize(storagePath: string, remotePath: string) {
  try {
    return await withFtp(async (client) => {
      try {
        return await client.size(remotePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isRemotePathNotFoundError(message)) return 0;
        throw error;
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      return getLocalFileSize(storagePath);
    }
    throw error;
  }
}

async function reserveUploadStorage(storagePath: string, remotePath: string, newFileSize: number) {
  const companyId = getCompanyStorageId(storagePath);
  const previousFileSize = await getExistingStorageFileSize(storagePath, remotePath);
  const byteDelta = newFileSize - previousFileSize;
  await reserveCompanyStorageDelta(companyId, byteDelta);
  return { companyId, byteDelta };
}

async function rollbackStorageDelta(companyId: string, byteDelta: number) {
  try {
    await reserveCompanyStorageDelta(companyId, -byteDelta);
  } catch (rollbackError) {
    console.error("Company storage accounting rollback failed", rollbackError);
  }
}

async function scanLocalCompanyStorage(companyId: string) {
  const companyRoot = fallbackStorageFilePath(`company/${companyId}`);
  const pendingDirectories = [companyRoot];
  let bytes = 0;
  let fileCount = 0;

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile()) {
        const info = await fs.stat(entryPath);
        bytes += info.size;
        fileCount += 1;
      }
    }
  }

  return { bytes, fileCount };
}

async function scanRemoteCompanyStorage(client: FtpClient, companyId: string, basePath: string) {
  const root = path.posix.resolve(basePath, "company", companyId);
  const allowedRoot = path.posix.resolve(basePath, "company");
  if (!root.startsWith(`${allowedRoot}/`)) {
    throw new Error("Company storage path is outside the configured storage root.");
  }

  const pendingDirectories = [root];
  let bytes = 0;
  let fileCount = 0;

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!;
    let entries;
    try {
      entries = await client.list(directory);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRemotePathNotFoundError(message) && directory === root) {
        const parent = path.posix.dirname(root);
        const companyParent = path.posix.dirname(parent);
        try {
          const siblings = await client.list(parent);
          if (!siblings.some((entry) => entry.name === companyId && entry.isDirectory)) {
            continue;
          }
        } catch (parentError) {
          const parentMessage = parentError instanceof Error ? parentError.message : String(parentError);
          if (!isRemotePathNotFoundError(parentMessage)) throw parentError;
          const topLevelEntries = await client.list(companyParent);
          if (!topLevelEntries.some((entry) => entry.name === path.posix.basename(parent) && entry.isDirectory)) {
            continue;
          }
          throw error;
        }
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.name === "." || entry.name === "..") continue;
      const entryPath = path.posix.resolve(directory, entry.name);
      if (!entryPath.startsWith(`${root}/`)) {
        throw new Error("InterServer returned a path outside the company storage root.");
      }
      if (entry.isDirectory) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile) {
        bytes += entry.size;
        fileCount += 1;
      }
    }
  }

  return { bytes, fileCount };
}

export async function measureCompanyStorage(companyIds: string[]) {
  const uniqueIds = [...new Set(companyIds)];
  if (uniqueIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new Error("Company storage measurement received an invalid company id.");
  }

  const measured = new Map(uniqueIds.map((id) => [id, { bytes: 0, fileCount: 0 }]));
  if (hasInterServerStorageConfig()) {
    const { basePath } = getStorageConfig();
    await withFtp(async (client) => {
      for (const companyId of uniqueIds) {
        measured.set(companyId, await scanRemoteCompanyStorage(client, companyId, basePath));
      }
    });
  }

  for (const companyId of uniqueIds) {
    const localUsage = await scanLocalCompanyStorage(companyId);
    const current = measured.get(companyId)!;
    measured.set(companyId, {
      bytes: current.bytes + localUsage.bytes,
      fileCount: current.fileCount + localUsage.fileCount,
    });
  }

  return measured;
}

async function downloadFtpFile(client: FtpClient, remotePath: string) {
  const chunks: Buffer[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await client.downloadTo(destination, remotePath);
  return Buffer.concat(chunks);
}

export async function uploadInterServerFile(storagePath: string, content: Buffer) {
  const remotePath = getRemotePath(storagePath);
  const reservation = await reserveUploadStorage(storagePath, remotePath, content.byteLength);
  try {
    await withFtp(async (client) => {
      await client.ensureDir(path.posix.dirname(remotePath));
      await client.uploadFrom(Readable.from([content]), remotePath);
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      try {
        await writeFallbackStorageFile(storagePath, content);
      } catch (fallbackError) {
        await rollbackStorageDelta(reservation.companyId, reservation.byteDelta);
        throw fallbackError;
      }
      return;
    }
    await rollbackStorageDelta(reservation.companyId, reservation.byteDelta);
    throw error;
  }
}

export async function downloadInterServerFile(storagePath: string) {
  try {
    const remotePath = getRemotePath(storagePath);
    const result = await withFtp(async (client) => downloadFtpFile(client, remotePath));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      return readFallbackStorageFile(storagePath);
    }
    throw error;
  }
}

export async function deleteInterServerFile(storagePath: string) {
  const remotePath = getRemotePath(storagePath);
  const previousFileSize = await getExistingStorageFileSize(storagePath, remotePath);
  const companyId = getCompanyStorageId(storagePath);
  try {
    await withFtp(async (client) => {
      try {
        await client.remove(remotePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRemotePathNotFoundError(message)) {
          throw error;
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      await deleteFallbackStorageFile(storagePath);
      await reserveCompanyStorageDelta(companyId, -previousFileSize);
      return;
    }
    throw error;
  }
  await reserveCompanyStorageDelta(companyId, -previousFileSize);
}

export async function uploadCompanyDriveFile(storagePath: string, content: Buffer) {
  const remotePath = getCompanyDriveRemotePath(storagePath);
  const reservation = await reserveUploadStorage(storagePath, remotePath, content.byteLength);
  try {
    await withFtp(async (client) => {
      await client.ensureDir(path.posix.dirname(remotePath));
      await client.uploadFrom(Readable.from([content]), remotePath);
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      try {
        await writeFallbackStorageFile(storagePath, content);
      } catch (fallbackError) {
        await rollbackStorageDelta(reservation.companyId, reservation.byteDelta);
        throw fallbackError;
      }
      return;
    }
    await rollbackStorageDelta(reservation.companyId, reservation.byteDelta);
    throw error;
  }
}

export async function downloadCompanyDriveFile(storagePath: string) {
  try {
    const remotePath = getCompanyDriveRemotePath(storagePath);
    const result = await withFtp(async (client) => downloadFtpFile(client, remotePath));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      return readFallbackStorageFile(storagePath);
    }
    throw error;
  }
}

export async function deleteCompanyDriveFile(storagePath: string) {
  const remotePath = getCompanyDriveRemotePath(storagePath);
  const previousFileSize = await getExistingStorageFileSize(storagePath, remotePath);
  const companyId = getCompanyStorageId(storagePath);
  try {
    await withFtp(async (client) => {
      try {
        await client.remove(remotePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isRemotePathNotFoundError(message)) {
          throw error;
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      await deleteFallbackStorageFile(storagePath);
      await reserveCompanyStorageDelta(companyId, -previousFileSize);
      return;
    }
    throw error;
  }
  await reserveCompanyStorageDelta(companyId, -previousFileSize);
}

export async function ensureInterServerCandidateFolders(companyId: string, candidateId: string, candidateName: string) {
  if (!/^[0-9a-f-]{36}$/i.test(companyId) || !/^[0-9a-f-]{36}$/i.test(candidateId)) {
    throw new Error("Candidate storage identity is invalid.");
  }

  const folderName = candidateStorageFolderName(candidateId, candidateName);
  const { basePath } = getStorageConfig();
  const root = path.posix.resolve(basePath);
  const remoteFolders = [
    path.posix.resolve(basePath, "company", companyId, "candidates", folderName),
    path.posix.resolve(basePath, "company", companyId, "finance", "candidates", folderName),
  ];
  if (remoteFolders.some((remoteFolder) => !remoteFolder.startsWith(`${root}/`))) {
    throw new Error("Candidate folder is outside the configured storage root.");
  }
  await withFtp(async (client) => {
    for (const remoteFolder of remoteFolders) await client.ensureDir(remoteFolder);
  });
}
