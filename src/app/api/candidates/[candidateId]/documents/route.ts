import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createDocumentStoragePath, DocumentInputError, isDocumentType, isUuid, validateDocumentUpload } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteInterServerFile, uploadInterServerFile } from "@/lib/storage/interserver";

export const runtime = "nodejs";

const privateJson = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

function requestExceedsUploadLimit(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > 4 * 1024 * 1024 + 64 * 1024;
}

export async function GET(_request: Request, context: RouteContext<"/api/candidates/[candidateId]/documents">) {
  try {
    const { candidateId } = await context.params;
    if (!isUuid(candidateId)) return privateJson({ error: "Candidate not found." }, 404);

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return privateJson({ error: "Authentication required." }, 401);

    const { data, error } = await supabase
      .from("candidate_documents")
      .select("id, file_name, original_file_name, file_type, mime_type, file_size, document_type, uploaded_by, updated_by, created_at, updated_at, expires_at, notes, status")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Candidate document listing failed", error);
      return privateJson({ error: "Unable to load documents." }, 500);
    }
    const actorIds = [...new Set((data ?? []).flatMap((document) => [document.uploaded_by, document.updated_by].filter((id): id is string => Boolean(id))))];
    const actorNames = new Map<string, string>();
    if (user.user_metadata?.full_name) actorNames.set(user.id, String(user.user_metadata.full_name));
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (actorIds.length && supabaseUrl && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data: profiles, error: profilesError } = await admin.from("profiles").select("id, display_name").in("id", actorIds);
      if (profilesError) console.error("Document actor names could not be loaded", profilesError);
      for (const profile of profiles ?? []) {
        if (profile.display_name) actorNames.set(profile.id, profile.display_name);
      }
    }

    return privateJson({ documents: (data ?? []).map((document) => ({
      ...document,
      uploaded_by_name: actorNames.get(document.uploaded_by) ?? "Company user",
      updated_by_name: actorNames.get(document.updated_by ?? document.uploaded_by) ?? "Company user",
    })) });
  } catch (error) {
    console.error("Candidate document listing failed", error);
    return privateJson({ error: "Document service is unavailable." }, 503);
  }
}

export async function POST(request: Request, context: RouteContext<"/api/candidates/[candidateId]/documents">) {
  let uploadedStoragePath: string | undefined;

  try {
    if (requestExceedsUploadLimit(request)) return privateJson({ error: "Files must be 4 MB or smaller." }, 413);
    const { candidateId } = await context.params;
    if (!isUuid(candidateId)) return privateJson({ error: "Candidate not found." }, 404);

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return privateJson({ error: "Authentication required." }, 401);

    const formData = await request.formData();
    const documentType = formData.get("documentType");
    if (!isDocumentType(documentType)) return privateJson({ error: "Document type is invalid." }, 400);
    const notes = formData.get("notes");
    const expiresAt = formData.get("expiresAt");
    if (typeof notes === "string" && notes.length > 2000) return privateJson({ error: "Notes are too long." }, 400);
    if (expiresAt !== null && (typeof expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt)))) {
      return privateJson({ error: "Expiry date is invalid." }, 400);
    }

    const { data: candidate, error: candidateError } = await supabase
      .from("candidates")
      .select("id, company_id")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError || !candidate) return privateJson({ error: "Candidate not found." }, 404);

    const file = await validateDocumentUpload(formData);
    uploadedStoragePath = createDocumentStoragePath(candidate.company_id, candidate.id, documentType, file.extension);
    await uploadInterServerFile(uploadedStoragePath, file.buffer);

    const { data, error } = await supabase
      .from("candidate_documents")
      .insert({
        company_id: candidate.company_id,
        candidate_id: candidate.id,
        file_name: file.fileName,
        original_file_name: file.fileName,
        file_type: file.extension,
        mime_type: file.mimeType,
        file_size: file.fileSize,
        storage_path: uploadedStoragePath,
        document_type: documentType,
        uploaded_by: user.id,
        updated_by: user.id,
        expires_at: expiresAt || null,
        notes: typeof notes === "string" ? notes : "",
      })
      .select("id, file_name, original_file_name, file_type, mime_type, file_size, document_type, uploaded_by, updated_by, created_at, updated_at, expires_at, notes, status")
      .single();

    if (error) {
      await deleteInterServerFile(uploadedStoragePath);
      uploadedStoragePath = undefined;
      console.error("Candidate document metadata insert failed", error);
      return privateJson({ error: "Unable to save document metadata." }, 403);
    }
    return privateJson({ document: data }, 201);
  } catch (error) {
    if (uploadedStoragePath) {
      try {
        await deleteInterServerFile(uploadedStoragePath);
      } catch (cleanupError) {
        console.error("Failed to clean up an incomplete document upload", cleanupError);
      }
    }
    if (error instanceof DocumentInputError) return privateJson({ error: error.message }, error.status);
    console.error("Candidate document upload failed", error);
    return privateJson({ error: "Document upload failed." }, 503);
  }
}