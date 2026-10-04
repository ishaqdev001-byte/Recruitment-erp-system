import "server-only";

import SftpClient from "ssh2-sftp-client";
import path from "node:path";

function getStorageConfig() {
  const host = process.env.INTERSERVER_STORAGE_HOST;
  const username = process.env.INTERSERVER_STORAGE_USERNAME;
  const password = process.env.INTERSERVER_STORAGE_PASSWORD;
  const basePath = process.env.INTERSERVER_STORAGE_BASE_PATH;
  const port = Number(process.env.INTERSERVER_STORAGE_PORT || "22");

  if (!host || !username || !password || !basePath || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("InterServer storage configuration is incomplete.");
  }
  if (!path.posix.isAbsolute(basePath) || basePath.split("/").includes("..")) {
    throw new Error("InterServer storage base path is invalid.");
  }

  return { host, username, password, port, basePath: path.posix.normalize(basePath) };
}

function getRemotePath(storagePath: string) {
  if (!/^company\/[0-9a-f-]+\/candidates\/[0-9a-f-]+\/[a-z_]+\/[0-9a-f-]+\.[a-z0-9]+$/i.test(storagePath)) {
    throw new Error("Storage reference is invalid.");
  }

  const { basePath } = getStorageConfig();
  const root = path.posix.resolve(basePath);
  const remotePath = path.posix.resolve(root, storagePath);
  if (!remotePath.startsWith(`${root}/`)) throw new Error("Storage reference is outside the configured root.");
  return remotePath;
}

async function withSftp<T>(operation: (client: SftpClient) => Promise<T>): Promise<T> {
  const config = getStorageConfig();
  const client = new SftpClient();
  let connected = false;

  try {
    await client.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      readyTimeout: 15_000,
    });
    connected = true;
    return await operation(client);
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch {
        // Preserve the original storage result or error.
      }
    }
  }
}

export function uploadInterServerFile(storagePath: string, content: Buffer) {
  const remotePath = getRemotePath(storagePath);
  return withSftp(async (client) => {
    await client.mkdir(path.posix.dirname(remotePath), true);
    await client.put(content, remotePath);
  });
}

export function downloadInterServerFile(storagePath: string) {
  const remotePath = getRemotePath(storagePath);
  return withSftp(async (client) => {
    const result = await client.get(remotePath);
    if (!Buffer.isBuffer(result)) throw new Error("Stored file could not be read as bytes.");
    return result;
  });
}

export function deleteInterServerFile(storagePath: string) {
  const remotePath = getRemotePath(storagePath);
  return withSftp(async (client) => {
    const exists = await client.exists(remotePath);
    if (exists) await client.delete(remotePath);
  });
}