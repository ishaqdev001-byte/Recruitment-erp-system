import path from "node:path";
import { Readable, Writable } from "node:stream";
import { loadEnvConfig } from "@next/env";
import { Client as FtpClient } from "basic-ftp";
import { createClient } from "@supabase/supabase-js";

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

function candidateFolderName(candidate) {
  const name = `${candidate.first_name} ${candidate.last_name}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = name.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48).replace(/-+$/g, "") || "candidate";
  return `${slug}--${candidate.id}`;
}

function resolveStoragePath(storagePath) {
  const root = path.posix.resolve(basePath);
  const resolved = path.posix.resolve(root, storagePath);
  if (!resolved.startsWith(`${root}/`)) throw new Error("Candidate file is outside the configured storage root.");
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

try {
  await ftp.access({ host, port, user: username, password, secure: false });
  let offset = 0;
  let provisioned = 0;
  let movedFiles = 0;
  const pageSize = 500;

  while (true) {
    const { data: candidates, error } = await supabase
      .from("candidates")
      .select("id, company_id, first_name, last_name")
      .order("company_id")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!candidates?.length) break;

    for (const candidate of candidates) {
      const folderPaths = [
        path.posix.resolve(basePath, "company", candidate.company_id, "candidates", candidateFolderName(candidate)),
        path.posix.resolve(basePath, "company", candidate.company_id, "finance", "candidates", candidateFolderName(candidate)),
      ];
      if (folderPaths.some((folderPath) => !folderPath.startsWith(`${path.posix.resolve(basePath)}/`))) {
        throw new Error("Candidate folders are outside the configured storage root.");
      }
      for (const folderPath of folderPaths) await ftp.ensureDir(folderPath);
      provisioned += 1;

      const { data: documents, error: documentsError } = await supabase
        .from("candidate_documents")
        .select("id, storage_path, document_type")
        .eq("company_id", candidate.company_id)
        .eq("candidate_id", candidate.id);
      if (documentsError) throw documentsError;

      const legacyPrefix = `company/${candidate.company_id}/candidates/${candidate.id}/`;
      for (const document of documents ?? []) {
        if (!document.storage_path.startsWith(legacyPrefix)) continue;
        const fileName = document.storage_path.split("/").pop();
        if (!fileName || !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(fileName)) {
          throw new Error(`Unexpected candidate document path for record ${document.id}.`);
        }

        const newStoragePath = `company/${candidate.company_id}/candidates/${candidateFolderName(candidate)}/${document.document_type}/${fileName}`;
        const oldRemotePath = resolveStoragePath(document.storage_path);
        const newRemotePath = resolveStoragePath(newStoragePath);
        const content = await downloadFile(oldRemotePath);
        await ftp.ensureDir(path.posix.dirname(newRemotePath));
        await ftp.uploadFrom(Readable.from([content]), newRemotePath);

        const { error: updateError } = await supabase.from("candidate_documents")
          .update({ storage_path: newStoragePath })
          .eq("id", document.id)
          .eq("company_id", candidate.company_id);
        if (updateError) throw updateError;

        try {
          await ftp.remove(oldRemotePath);
        } catch (error) {
          console.error(`Old candidate file could not be removed for record ${document.id}`, error);
        }
        movedFiles += 1;
      }
    }

    offset += candidates.length;
    if (candidates.length < pageSize) break;
  }

  console.info(`Ensured candidate folders for ${provisioned} candidates and moved ${movedFiles} existing files.`);
} finally {
  ftp.close();
}