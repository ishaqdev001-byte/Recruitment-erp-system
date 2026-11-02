import { NextResponse } from "next/server"

import { safeDownloadName } from "@/lib/server/documents"

import { getCompanyChairmanHrAccess } from "@/lib/server/hr-profiles"

import { downloadCompanyDriveFile } from "@/lib/storage/interserver"

export const runtime = "nodejs"

export async function GET(
  request: Request,

  context: { params: Promise<{ staffId: string; documentId: string }> },
) {
  const access = await getCompanyChairmanHrAccess(
    new URL(request.url).searchParams.get("companyId"),
  )

  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const { staffId, documentId } = await context.params

  const { data: document, error } = await access.admin

    .from("company_staff_documents")

    .select("file_name, mime_type, storage_path")

    .eq("id", documentId)

    .eq("company_id", access.companyId)

    .eq("staff_member_id", staffId)

    .maybeSingle()

  if (error) {
    console.error("Chairman HR document query failed:", error)

    return NextResponse.json({ error: "Unable to load this HR document." }, {
      status: 503,
    })
  }

  if (!document) {
    return NextResponse.json({ error: "HR document not found." }, {
      status: 404,
    })
  }

  try {
    const content = await downloadCompanyDriveFile(document.storage_path)

    return new NextResponse(content, {
      headers: {
        "Cache-Control": "private, no-store",

        "Content-Type": document.mime_type,

        "Content-Disposition": `attachment; filename="${safeDownloadName(document.file_name)}"`,

        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (downloadError) {
    console.error("Chairman HR document download failed:", downloadError)

    return NextResponse.json({ error: "HR document is unavailable." }, {
      status: 503,
    })
  }
}
