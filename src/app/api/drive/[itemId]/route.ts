import { NextResponse } from "next/server";
import { canAccessDriveCategory, getDriveAccess, type DriveCategory } from "@/lib/server/company-drive";
import { isUuid, safeDownloadName } from "@/lib/server/documents";
import { deleteCompanyDriveFile, downloadCompanyDriveFile } from "@/lib/storage/interserver";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: responseHeaders });

export async function GET(_request: Request, context: RouteContext<"/api/drive/[itemId]">) {
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const { itemId } = await context.params;
    if (!isUuid(itemId)) return privateJson({ error: "File not found." }, 404);

    const { data: item, error } = await access.supabase.from("company_drive_items")
      .select("id, name, item_type, category, mime_type, file_size, storage_path, source_type, source_id")
      .eq("company_id", access.companyId)
      .eq("id", itemId)
      .maybeSingle();
    if (error || !item) return privateJson({ error: "File not found." }, 404);
    if (item.item_type !== "file" || !item.storage_path || !item.mime_type) return privateJson({ error: "This item is a folder." }, 400);
    if (!await canAccessDriveCategory(access, item.category as DriveCategory, "view")) return privateJson({ error: "You do not have permission to download this file." }, 403);

    const content = await downloadCompanyDriveFile(item.storage_path);
    return new Response(new Uint8Array(content), {
      headers: {
        ...responseHeaders,
        "Content-Type": item.mime_type,
        "Content-Length": String(content.byteLength),
        "Content-Disposition": `attachment; filename="${safeDownloadName(item.name)}"; filename*=UTF-8''${encodeURIComponent(item.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    console.error("Company drive download failed", error);
    return privateJson({ error: "Unable to download this file from storage." }, 503);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/drive/[itemId]">) {
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const { itemId } = await context.params;
    if (!isUuid(itemId)) return privateJson({ error: "Drive item not found." }, 404);

    const body = await request.json().catch(() => null) as { name?: unknown; parentId?: unknown } | null;
    if (!body || (body.name === undefined && body.parentId === undefined)) return privateJson({ error: "Provide a new name or destination folder." }, 400);
    if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim() || body.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(body.name))) {
      return privateJson({ error: "File or folder name is invalid." }, 400);
    }
    const parentId = body.parentId === undefined ? undefined : body.parentId === null || body.parentId === "" ? null : typeof body.parentId === "string" ? body.parentId : "invalid";
    if (parentId === "invalid" || (parentId && !isUuid(parentId))) return privateJson({ error: "Choose a valid destination folder." }, 400);

    const { data: item, error: itemError } = await access.supabase.from("company_drive_items")
      .select("id, category, created_by, is_system")
      .eq("id", itemId)
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (itemError || !item) return privateJson({ error: "Drive item not found." }, 404);
    const action = parentId === undefined ? "edit" : "move";
    if (!await canAccessDriveCategory(access, item.category as DriveCategory, action, item.created_by)) {
      return privateJson({ error: `You do not have permission to ${action} this item.` }, 403);
    }

    const updates: Record<string, unknown> = { modified_by: access.userId };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (parentId !== undefined) updates.parent_id = parentId;
    const { data, error } = await access.supabase.from("company_drive_items")
      .update(updates)
      .eq("id", itemId)
      .eq("company_id", access.companyId)
      .select("id, parent_id, item_type, category, name, is_system, file_type, mime_type, file_size, source_type, source_id, created_by, modified_by, created_at, updated_at")
      .maybeSingle();
    if (error || !data) {
      if (error?.code === "23505") return privateJson({ error: "A file or folder with that name already exists at this location." }, 409);
      if (error?.code === "23514" || error?.code === "23503") return privateJson({ error: error.message }, 400);
      console.error("Company drive item update failed", error);
      return privateJson({ error: item.is_system ? "Your personal drive folder cannot be renamed or moved." : "Unable to update this drive item." }, 403);
    }
    return privateJson({ item: data });
  } catch (error) {
    console.error("Company drive item update request failed", error);
    return privateJson({ error: "Unable to update this drive item." }, 503);
  }
}

export async function DELETE(_request: Request, context: RouteContext<"/api/drive/[itemId]">) {
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const { itemId } = await context.params;
    if (!isUuid(itemId)) return privateJson({ error: "Drive item not found." }, 404);

    const { data: item, error: itemError } = await access.supabase.from("company_drive_items")
      .select("id, item_type, category, name, storage_path, created_by, is_system")
      .eq("id", itemId)
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (itemError || !item) return privateJson({ error: "Drive item not found." }, 404);
    if (!await canAccessDriveCategory(access, item.category as DriveCategory, "delete", item.created_by)
      || (item.is_system && !await canAccessDriveCategory(access, item.category as DriveCategory, "delete"))) {
      return privateJson({ error: "Only the creator or company owner, CEO, and general manager can delete this item." }, 403);
    }

    if (item.item_type === "folder") {
      const { data: child, error: childError } = await access.supabase.from("company_drive_items")
        .select("id")
        .eq("company_id", access.companyId)
        .eq("parent_id", item.id)
        .limit(1)
        .maybeSingle();
      if (childError) return privateJson({ error: "Unable to verify that this folder is empty." }, 500);
      if (child) return privateJson({ error: "Move or delete the folder contents before deleting this folder." }, 409);
    }

    const { data: deleted, error } = await access.supabase.from("company_drive_items")
      .delete()
      .eq("id", itemId)
      .eq("company_id", access.companyId)
      .select("id")
      .maybeSingle();
    if (error || !deleted) {
      console.error("Company drive item deletion failed", error);
      return privateJson({ error: "Unable to delete this item." }, 403);
    }
    if (item.storage_path) {
      try {
        await deleteCompanyDriveFile(item.storage_path);
      } catch (cleanupError) {
        console.error("Company drive storage cleanup failed", cleanupError);
      }
    }
    return new Response(null, { status: 204, headers: responseHeaders });
  } catch (error) {
    console.error("Company drive item deletion request failed", error);
    return privateJson({ error: "Unable to delete this drive item." }, 503);
  }
}
