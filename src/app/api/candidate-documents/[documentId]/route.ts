import { NextResponse } from "next/server";
import { DocumentInputError, isDocumentType, isUuid, safeDownloadName, validateDocumentUpload } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteInterServerFile, downloadInterServerFile, uploadInterServerFile } from "@/lib/storage/interserver";

export const runtime = "nodejs";

const privateJson = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function requestExceedsUploadLimit(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024 + 64 * 1024;
}

async function getAuthorizedDocument(documentId: string, action: string) {
  if (!isUuid(documentId)) return { response: privateJson({ error: "Document not found." }, 404) };
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: privateJson({ error: "Authentication required." }, 401) };

  const { data: document, error } = await supabase
    .from("candidate_documents")
    .select("id, candidate_id, company_id, file_name, original_file_name, file_type, mime_type, file_size, document_type, storage_path, notes, expires_at")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !document) return { response: privateJson({ error: "Document not found." }, 404) };

  const { data: allowed, error: permissionError } = await supabase.rpc("can_access_candidate_document", {
    requested_company_id: document.company_id,
    requested_document_type: document.document_type,
    requested_action: action,
  });
  if (permissionError || !allowed) return { response: privateJson({ error: "You do not have permission for this document." }, 403) };
  return { supabase, user, document };
}

export async function GET(request: Request, context: RouteContext<"/api/candidate-documents/[documentId]">) {
  try {
    const { documentId } = await context.params;
    const inline = new URL(request.url).searchParams.get("disposition") === "inline";
    const result = await getAuthorizedDocument(documentId, inline ? "view" : "download");
    if ("response" in result) return result.response;

    const { document, supabase } = result;
    const previewable = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(document.mime_type);
    if (inline && !previewable) return privateJson({ error: "File preview is unavailable." }, 415);

    const content = await downloadInterServerFile(document.storage_path);
    const { error: auditError } = await supabase.rpc("log_candidate_document_access", {
      requested_document_id: document.id,
      requested_action: inline ? "view" : "download",
    });
    if (auditError) {
      console.error("Document access audit failed", auditError);
      return privateJson({ error: "Unable to complete document access." }, 500);
    }

    const disposition = inline ? "inline" : "attachment";
    const filename = safeDownloadName(document.file_name);
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type": document.mime_type,
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    console.error("Candidate document retrieval failed", error);
    return privateJson({ error: "Unable to retrieve document." }, 503);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/candidate-documents/[documentId]">) {
  try {
    const { documentId } = await context.params;
    const result = await getAuthorizedDocument(documentId, "edit");
    if ("response" in result) return result.response;

    const body = await request.json().catch(() => null) as { fileName?: unknown; notes?: unknown; expiresAt?: unknown } | null;
    if (!body || (body.fileName === undefined && body.notes === undefined && body.expiresAt === undefined)) {
      return privateJson({ error: "Provide a name, notes, or expiry date to update." }, 400);
    }
    const updates: { file_name?: string; notes?: string; expires_at?: string | null } = {};
    if (body.fileName !== undefined) {
      if (typeof body.fileName !== "string" || !body.fileName.trim() || body.fileName.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(body.fileName)) {
        return privateJson({ error: "File name is invalid." }, 400);
      }
      updates.file_name = body.fileName.trim();
    }
    if (body.notes !== undefined) {
      if (typeof body.notes !== "string" || body.notes.length > 2000) return privateJson({ error: "Notes are invalid." }, 400);
      updates.notes = body.notes;
    }
    if (body.expiresAt !== undefined) {
      if (body.expiresAt !== null && (typeof body.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.expiresAt) || Number.isNaN(Date.parse(body.expiresAt)))) {
        return privateJson({ error: "Expiry date is invalid." }, 400);
      }
      updates.expires_at = body.expiresAt as string | null;
    }

    const { data, error } = await result.supabase
      .from("candidate_documents")
      .update(updates)
      .eq("id", documentId)
      .select("id, file_name, original_file_name, file_type, mime_type, file_size, document_type, uploaded_by, created_at, updated_at, expires_at, notes, status")
      .single();
    if (error) {
      console.error("Candidate document update failed", error);
      return privateJson({ error: "Unable to update document." }, 403);
    }
    return privateJson({ document: data });
  } catch (error) {
    console.error("Candidate document update failed", error);
    return privateJson({ error: "Unable to update document." }, 500);
  }
}

export async function PUT(request: Request, context: RouteContext<"/api/candidate-documents/[documentId]">) {
  let replacementPath: string | undefined;
  try {
    if (requestExceedsUploadLimit(request)) return privateJson({ error: "Files must be 4 MB or smaller." }, 413);
    const { documentId } = await context.params;
    const result = await getAuthorizedDocument(documentId, "edit");
    if ("response" in result) return result.response;

    const formData = await request.formData();
    const file = await validateDocumentUpload(formData);
    replacementPath = `company/${result.document.company_id}/candidates/${result.document.candidate_id}/${result.document.document_type}/${crypto.randomUUID()}.${file.extension}`;
    await uploadInterServerFile(replacementPath, file.buffer);

    const { data, error } = await result.supabase
      .from("candidate_documents")
      .update({
        file_name: file.fileName,
        original_file_name: file.fileName,
        file_type: file.extension,
        mime_type: file.mimeType,
        file_size: file.fileSize,
        storage_path: replacementPath,
      })
      .eq("id", documentId)
      .select("id, file_name, original_file_name, file_type, mime_type, file_size, document_type, uploaded_by, created_at, updated_at, expires_at, notes, status")
      .single();
    if (error) {
      await deleteInterServerFile(replacementPath);
      replacementPath = undefined;
      console.error("Candidate document replacement metadata update failed", error);
      return privateJson({ error: "Unable to replace document." }, 403);
    }

    try {
      await deleteInterServerFile(result.document.storage_path);
    } catch (cleanupError) {
      console.error("Replaced document cleanup failed", cleanupError);
    }
    return privateJson({ document: data });
  } catch (error) {
    if (replacementPath) {
      try {
        await deleteInterServerFile(replacementPath);
      } catch (cleanupError) {
        console.error("Failed to clean up an incomplete replacement", cleanupError);
      }
    }
    if (error instanceof DocumentInputError) return privateJson({ error: error.message }, error.status);
    console.error("Candidate document replacement failed", error);
    return privateJson({ error: "Unable to replace document." }, 503);
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/candidate-documents/[documentId]">) {
  try {
    const { documentId } = await context.params;
    const result = await getAuthorizedDocument(documentId, "delete");
    if ("response" in result) return result.response;

    const { error } = await result.supabase.from("candidate_documents").delete().eq("id", documentId);
    if (error) {
      console.error("Candidate document deletion failed", error);
      return privateJson({ error: "Unable to delete document." }, 403);
    }
    try {
      await deleteInterServerFile(result.document.storage_path);
    } catch (cleanupError) {
      console.error("Deleted document storage cleanup failed", cleanupError);
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Candidate document deletion failed", error);
    return privateJson({ error: "Unable to delete document." }, 500);
  }
}