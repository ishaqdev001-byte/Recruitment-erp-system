import "server-only";

import { fileTypeFromBuffer } from "file-type";
import { randomUUID } from "node:crypto";

export const MAX_DOCUMENT_SIZE = 4 * 1024 * 1024;

export const DOCUMENT_TYPES = [
  "cv", "passport", "medical", "id", "certificate", "contract",
  "visa", "payment_receipt", "photo", "other",
] as const;

const MIME_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

export class DocumentInputError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export interface ValidatedDocumentUpload {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  extension: string;
  fileSize: number;
}

export async function validateDocumentUpload(formData: FormData): Promise<ValidatedDocumentUpload> {
  const value = formData.get("file");
  if (!(value instanceof File)) throw new DocumentInputError("Choose a file to upload.");
  if (value.size < 1 || value.size > MAX_DOCUMENT_SIZE) {
    throw new DocumentInputError("Files must be 4 MB or smaller.", 413);
  }
  if (!value.name || value.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(value.name)) {
    throw new DocumentInputError("The file name is invalid.");
  }

  const extension = value.name.split(".").pop()?.toLowerCase() ?? "";
  const buffer = Buffer.from(await value.arrayBuffer());
  const detected = await fileTypeFromBuffer(buffer);
  const allowedExtensions = detected ? MIME_EXTENSIONS[detected.mime] : undefined;

  if (!detected || !allowedExtensions?.includes(extension)) {
    throw new DocumentInputError("Only valid PDF, JPEG, PNG, and WebP files are supported.", 415);
  }
  if (value.type && value.type !== detected.mime) {
    throw new DocumentInputError("The file content does not match its declared type.", 415);
  }

  return {
    buffer,
    fileName: value.name,
    mimeType: detected.mime,
    extension: detected.ext,
    fileSize: buffer.byteLength,
  };
}

export function isDocumentType(value: FormDataEntryValue | null): value is (typeof DOCUMENT_TYPES)[number] {
  return typeof value === "string" && DOCUMENT_TYPES.includes(value as (typeof DOCUMENT_TYPES)[number]);
}

export function createDocumentStoragePath(
  companyId: string,
  candidateId: string,
  documentType: (typeof DOCUMENT_TYPES)[number],
  extension: string,
) {
  return `company/${companyId}/candidates/${candidateId}/${documentType}/${randomUUID()}.${extension}`;
}

export function safeDownloadName(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 255) || "document";
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}