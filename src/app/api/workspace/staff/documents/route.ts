import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { DocumentInputError, MAX_DOCUMENT_SIZE, validateDocumentUpload } from "@/lib/server/documents";
import { getLinkedStaffAccess } from "@/lib/server/staff-profile";
import { deleteCompanyDriveFile, uploadCompanyDriveFile } from "@/lib/storage/interserver";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const documentTypes = ["passport", "national_id", "academic_qualification", "professional_qualification", "employment_record", "other"] as const;

function requestExceedsUploadLimit(request: Request) {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > MAX_DOCUMENT_SIZE + 64 * 1024;
}

export async function GET() {
  const access = await getLinkedStaffAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const { data, error } = await access.admin.from("company_staff_documents")
    .select("id, document_type, file_name, file_type, mime_type, file_size, created_at")
    .eq("company_id", access.companyId).eq("staff_member_id", access.staffId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Unable to load personal documents." }, { status: 500, headers });
  return NextResponse.json({ documents: data ?? [] }, { headers });
}

export async function POST(request: Request) {
  let storagePath = "";
  try {
    if (requestExceedsUploadLimit(request)) return NextResponse.json({ error: `Files must be ${Math.floor(MAX_DOCUMENT_SIZE / (1024 * 1024))} MB or smaller.` }, { status: 413, headers });
    const access = await getLinkedStaffAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const formData = await request.formData();
    const documentType = formData.get("documentType");
    if (typeof documentType !== "string" || !documentTypes.includes(documentType as (typeof documentTypes)[number])) {
      return NextResponse.json({ error: "Choose a valid personal document type." }, { status: 400, headers });
    }
    const file = await validateDocumentUpload(formData);
    storagePath = `company/${access.companyId}/users/${access.userId}/hr-profile--${access.staffId}/${randomUUID()}.${file.extension}`;
    await uploadCompanyDriveFile(storagePath, file.buffer);
    const { data, error } = await access.admin.from("company_staff_documents").insert({
      company_id: access.companyId,
      staff_member_id: access.staffId,
      document_type: documentType,
      file_name: file.fileName,
      file_type: file.extension,
      mime_type: file.mimeType,
      file_size: file.fileSize,
      storage_path: storagePath,
      uploaded_by: access.userId,
    }).select("id, document_type, file_name, file_type, mime_type, file_size, created_at").single();
    if (error || !data) {
      await deleteCompanyDriveFile(storagePath);
      storagePath = "";
      throw error ?? new Error("Document metadata was not saved.");
    }
    return NextResponse.json({ document: data }, { status: 201, headers });
  } catch (error) {
    if (storagePath) {
      try { await deleteCompanyDriveFile(storagePath); } catch (cleanupError) { console.error("HR document cleanup failed", cleanupError); }
    }
    if (error instanceof DocumentInputError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("HR document upload failed", error);
    return NextResponse.json({ error: "Personal document upload failed." }, { status: 503, headers });
  }
}