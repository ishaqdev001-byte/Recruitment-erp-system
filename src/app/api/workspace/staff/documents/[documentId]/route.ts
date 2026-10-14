import { NextResponse } from "next/server";
import { getLinkedStaffAccess } from "@/lib/server/staff-profile";
import { deleteCompanyDriveFile, downloadCompanyDriveFile } from "@/lib/storage/interserver";
import { safeDownloadName } from "@/lib/server/documents";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const access = await getLinkedStaffAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const { documentId } = await context.params;
  const { data: document, error } = await access.admin.from("company_staff_documents")
    .select("file_name, mime_type, storage_path")
    .eq("id", documentId).eq("company_id", access.companyId).eq("staff_member_id", access.staffId)
    .maybeSingle();
  if (error || !document) return NextResponse.json({ error: "Personal document not found." }, { status: 404, headers });
  try {
    const content = await downloadCompanyDriveFile(document.storage_path);
    return new NextResponse(content, {
      headers: {
        ...headers,
        "Content-Type": document.mime_type,
        "Content-Disposition": `attachment; filename="${safeDownloadName(document.file_name)}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (downloadError) {
    console.error("HR document download failed", downloadError);
    return NextResponse.json({ error: "Personal document is unavailable." }, { status: 503, headers });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  const access = await getLinkedStaffAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const { documentId } = await context.params;
  const { data: document, error } = await access.admin.from("company_staff_documents")
    .select("storage_path")
    .eq("id", documentId).eq("company_id", access.companyId).eq("staff_member_id", access.staffId)
    .maybeSingle();
  if (error || !document) return NextResponse.json({ error: "Personal document not found." }, { status: 404, headers });
  try {
    await deleteCompanyDriveFile(document.storage_path);
    const { error: deleteError } = await access.admin.from("company_staff_documents")
      .delete().eq("id", documentId).eq("company_id", access.companyId).eq("staff_member_id", access.staffId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true }, { headers });
  } catch (deleteError) {
    console.error("HR document deletion failed", deleteError);
    return NextResponse.json({ error: "Unable to delete personal document." }, { status: 503, headers });
  }
}