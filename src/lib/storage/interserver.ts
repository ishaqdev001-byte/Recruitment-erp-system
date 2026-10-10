import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { Readable, Writable } from "node:stream";
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
  try {
    const remotePath = getRemotePath(storagePath);
    await withFtp(async (client) => {
      await client.ensureDir(path.posix.dirname(remotePath));
      await client.uploadFrom(Readable.from([content]), remotePath);
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      await writeFallbackStorageFile(storagePath, content);
      return;
    }
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
  try {
    const remotePath = getRemotePath(storagePath);
    await withFtp(async (client) => {
      try {
        await client.remove(remotePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/not found|no such file|550/i.test(message)) {
          throw error;
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      await deleteFallbackStorageFile(storagePath);
      return;
    }
    throw error;
  }
}

export async function uploadCompanyDriveFile(storagePath: string, content: Buffer) {
  try {
    const remotePath = getCompanyDriveRemotePath(storagePath);
    await withFtp(async (client) => {
      await client.ensureDir(path.posix.dirname(remotePath));
      await client.uploadFrom(Readable.from([content]), remotePath);
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      await writeFallbackStorageFile(storagePath, content);
      return;
    }
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
  try {
    const remotePath = getCompanyDriveRemotePath(storagePath);
    await withFtp(async (client) => {
      try {
        await client.remove(remotePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/not found|no such file|550/i.test(message)) {
          throw error;
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isStorageConnectionError(message)) {
      await deleteFallbackStorageFile(storagePath);
      return;
    }
    throw error;
  }
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