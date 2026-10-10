import { NextResponse } from "next/server";
import { DocumentInputError, isUuid, MAX_DOCUMENT_SIZE, storageFolderName, validateDriveFileUpload } from "@/lib/server/documents";
import { canAccessDriveCategory, drivePermissions, getDriveAccess, getDriveActorNames, type DriveCategory } from "@/lib/server/company-drive";
import { syncFinanceDrive } from "@/lib/server/company-drive-finance";
import { deleteCompanyDriveFile, uploadCompanyDriveFile } from "@/lib/storage/interserver";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };
const privateJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: responseHeaders });
function requestExceedsUploadLimit(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > MAX_DOCUMENT_SIZE + 64 * 1024;
}
const safeFolderName = (value: string) => value.replace(/[\\/\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "User folder";
const validCategory = (value: string | null): value is DriveCategory => value === "shared" || value === "finance";
const companyFolderName = (value: string) => {
  const words = value.toLocaleUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : (words[0] ?? "COMPANY").slice(0, 3)) || "COMPANY";
};

async function ensureCompanyRoot(access: Extract<Awaited<ReturnType<typeof getDriveAccess>>, { supabase: unknown }>) {
  const { data: existing } = await access.supabase.from("company_drive_items")
    .select("id, name")
    .eq("company_id", access.companyId)
    .eq("category", "shared")
    .eq("item_type", "folder")
    .eq("is_system", true)
    .is("parent_id", null)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await access.supabase.from("company_drive_items").insert({
    company_id: access.companyId,
    item_type: "folder",
    category: "shared",
    name: companyFolderName(access.companyName),
    is_system: true,
    created_by: access.userId,
    modified_by: access.userId,
  }).select("id, name").single();
  if (data) return data;
  if (error?.code === "23505") {
    const retry = await access.supabase.from("company_drive_items").select("id, name")
      .eq("company_id", access.companyId).eq("category", "shared").eq("is_system", true).is("parent_id", null).maybeSingle();
    if (retry.data) return retry.data;
  }
  throw new Error("Unable to create the company drive folder.");
}

async function ensureUsersFolder(access: Extract<Awaited<ReturnType<typeof getDriveAccess>>, { supabase: unknown }>, companyRootId: string) {
  const { data: existing } = await access.supabase.from("company_drive_items")
    .select("id, name")
    .eq("company_id", access.companyId)
    .eq("category", "shared")
    .eq("item_type", "folder")
    .eq("is_system", true)
    .eq("parent_id", companyRootId)
    .ilike("name", "Users")
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await access.supabase.from("company_drive_items").insert({
    company_id: access.companyId,
    parent_id: companyRootId,
    item_type: "folder",
    category: "shared",
    name: "Users",
    is_system: true,
    created_by: access.userId,
    modified_by: access.userId,
  }).select("id, name").single();
  if (data) return data;
  if (error?.code === "23505") {
    const retry = await access.supabase.from("company_drive_items").select("id, name")
      .eq("company_id", access.companyId).eq("category", "shared").eq("is_system", true)
      .eq("parent_id", companyRootId).ilike("name", "Users").maybeSingle();
    if (retry.data) return retry.data;
  }
  throw new Error("Unable to create the company Users folder.");
}

async function ensurePersonalFolder(access: Extract<Awaited<ReturnType<typeof getDriveAccess>>, { supabase: unknown }>, usersFolderId: string) {
  const { data: existing } = await access.supabase.from("company_drive_items")
    .select("id, name")
    .eq("company_id", access.companyId)
    .eq("category", "shared")
    .eq("item_type", "folder")
    .eq("is_system", true)
    .eq("created_by", access.userId)
    .eq("parent_id", usersFolderId)
    .maybeSingle();
  if (existing) return existing;

  const name = safeFolderName(access.userName);
  const { data, error } = await access.supabase.from("company_drive_items").insert({
    company_id: access.companyId,
    parent_id: usersFolderId,
    item_type: "folder",
    category: "shared",
    name,
    is_system: true,
    created_by: access.userId,
    modified_by: access.userId,
  }).select("id, name").single();
  if (data) return data;
  if (error?.code === "23505") {
    const suffix = safeFolderName(access.userEmail.split("@")[0] || access.userId.slice(0, 8));
    const retry = await access.supabase.from("company_drive_items").insert({
      company_id: access.companyId,
      parent_id: usersFolderId,
      item_type: "folder",
      category: "shared",
      name: `${name} (${suffix})`.slice(0, 255),
      is_system: true,
      created_by: access.userId,
      modified_by: access.userId,
    }).select("id, name").single();
    if (retry.data) return retry.data;
  }
  throw new Error("Unable to create your company drive folder.");
}

async function resolveDriveParent(
  access: Extract<Awaited<ReturnType<typeof getDriveAccess>>, { supabase: unknown }>,
  category: DriveCategory,
  parentId: string | null,
) {
  if (category !== "shared" || parentId) return parentId;
  const companyRoot = await ensureCompanyRoot(access);
  const usersFolder = await ensureUsersFolder(access, companyRoot.id);
  if (!access.isPrimaryCompanyUser) await ensurePersonalFolder(access, usersFolder.id);
  return companyRoot.id;
}

async function getPersonalStoragePath(
  access: Extract<Awaited<ReturnType<typeof getDriveAccess>>, { supabase: unknown }>,
  parentId: string | null,
) {
  if (!parentId) return null;
  const { data, error } = await access.supabase.rpc("company_drive_personal_folder_path", {
    requested_company_id: access.companyId,
    requested_folder_id: parentId,
  });
  if (error) throw error;
  const folderPath = data?.[0];
  if (!folderPath) return null;
  const segments = folderPath.folder_ids
    .map((id: string, index: number) => storageFolderName(id, folderPath.folder_names[index]))
    .reverse();
  return `company/${access.companyId}/users/${access.userId}/${segments.join("/")}`;
}

export async function GET(request: Request) {
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const url = new URL(request.url);
    const categoryValue = url.searchParams.get("category") ?? "shared";
    if (!validCategory(categoryValue)) return privateJson({ error: "Choose a valid drive." }, 400);
    const parentId = url.searchParams.get("parentId");
    if (parentId && !isUuid(parentId)) return privateJson({ error: "Folder not found." }, 404);
    if (!await canAccessDriveCategory(access, categoryValue, "view")) {
      return privateJson({ error: categoryValue === "finance" ? "Finance drive access is limited to the company owner, CEO, General Manager, and finance roles." : "You do not have permission to view the company drive. Check your role or apply migration 019 if setup is incomplete." }, 403);
    }

    if (categoryValue === "finance" && await canAccessDriveCategory(access, "finance", "create")) {
      try {
        await syncFinanceDrive(access);
      } catch (syncError) {
        console.warn("Company finance drive sync skipped because the InterServer storage backend is unavailable.", syncError);
      }
    }
    let companyRoot: { id: string; name: string } | null = null;
    let usersFolder: { id: string; name: string } | null = null;
    let personalFolder: { id: string; name: string } | null = null;
    if (categoryValue === "shared" && !parentId) {
      companyRoot = await ensureCompanyRoot(access);
      usersFolder = await ensureUsersFolder(access, companyRoot.id);
      if (!access.isPrimaryCompanyUser) personalFolder = await ensurePersonalFolder(access, usersFolder.id);
    }
    const allFolders = url.searchParams.get("allFolders") === "true";

    let query = access.supabase.from("company_drive_items")
      .select("id, parent_id, item_type, category, name, is_system, file_type, mime_type, file_size, source_type, source_id, created_by, modified_by, created_at, updated_at")
      .eq("company_id", access.companyId)
      .eq("category", categoryValue);
    query = allFolders
      ? query.eq("item_type", "folder")
      : parentId
        ? query.eq("parent_id", parentId)
        : categoryValue === "shared" && companyRoot
          ? query.eq("parent_id", companyRoot.id)
          : query.is("parent_id", null);
    const { data: items, error } = await query.order("item_type", { ascending: false }).order("name");
    if (error) {
      console.error("Company drive listing failed", error);
      return privateJson({ error: "Unable to load company drive items." }, 500);
    }

    const actorIds = [...new Set((items ?? []).flatMap((item) => [item.created_by, item.modified_by].filter((id): id is string => Boolean(id))))];
    const names = await getDriveActorNames(access, actorIds);
    const permissions = await drivePermissions(access, categoryValue);
    const { data: canDeleteOwn } = await access.supabase.rpc("current_user_has_company_permission", {
      requested_company_id: access.companyId,
      requested_permission: "drive.delete.own",
    });
    return privateJson({
      items: (items ?? []).map((item) => ({
        ...item,
        created_by_name: names.get(item.created_by ?? "") || (item.created_by === access.userId ? access.userName : "Former user"),
        modified_by_name: names.get(item.modified_by ?? "") || (item.modified_by === access.userId ? access.userName : "Former user"),
      })),
      companyRoot,
      usersFolder,
      personalFolder,
      isPrimaryCompanyUser: access.isPrimaryCompanyUser,
      currentUserId: access.userId,
      permissions: { ...permissions, canDeleteOwn: Boolean(canDeleteOwn) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown drive error";
    if (/InterServer FTP authentication failed|INTERSERVER_STORAGE/i.test(message)) {
      return privateJson({ error: "Company drive storage is unavailable. Verify the InterServer FTP host, username, password, and base path." }, 503);
    }
    console.error("Company drive request failed", error);
    return privateJson({ error: "Company drive is unavailable." }, 503);
  }
}

export async function POST(request: Request) {
  let uploadedStoragePath: string | null = null;
  try {
    const access = await getDriveAccess();
    if ("error" in access) return privateJson({ error: access.error }, access.status);
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null) as Record<string, unknown> | null;
      const category = typeof body?.category === "string" ? body.category : "shared";
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const parentId = body?.parentId === null || body?.parentId === undefined || body.parentId === "" ? null : typeof body.parentId === "string" ? body.parentId : "invalid";
      if (!validCategory(category) || !name || name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(name) || (parentId && !isUuid(parentId))) {
        return privateJson({ error: "Enter a valid folder name and location." }, 400);
      }
      if (!await canAccessDriveCategory(access, category, "create")) return privateJson({ error: "You do not have permission to create folders in this drive." }, 403);
      const targetParentId = await resolveDriveParent(access, category, parentId);
      const { data, error } = await access.supabase.from("company_drive_items").insert({
        company_id: access.companyId,
        parent_id: targetParentId,
        item_type: "folder",
        category,
        name,
        created_by: access.userId,
        modified_by: access.userId,
      }).select("id, parent_id, item_type, category, name, is_system, created_by, modified_by, created_at, updated_at").single();
      if (error || !data) {
        if (error?.code === "23505") return privateJson({ error: "A file or folder with that name already exists here." }, 409);
        console.error("Company drive folder creation failed", error);
        return privateJson({ error: "Unable to create this folder." }, 400);
      }
      return privateJson({ item: data }, 201);
    }

    if (!contentType.includes("multipart/form-data")) return privateJson({ error: "Send a folder request or a file upload." }, 415);
    if (requestExceedsUploadLimit(request)) return privateJson({ error: `Files must be ${Math.floor(MAX_DOCUMENT_SIZE / (1024 * 1024))} MB or smaller.` }, 413);
    const formData = await request.formData();
    const categoryValue = formData.get("category");
    const category = typeof categoryValue === "string" ? categoryValue : "shared";
    const parentValue = formData.get("parentId");
    const parentId = typeof parentValue === "string" && parentValue ? parentValue : null;
    if (!validCategory(category) || (parentId && !isUuid(parentId))) return privateJson({ error: "Choose a valid drive folder." }, 400);
    if (!await canAccessDriveCategory(access, category, "create")) return privateJson({ error: "You do not have permission to upload to this drive." }, 403);
    const targetParentId = await resolveDriveParent(access, category, parentId);

    const file = await validateDriveFileUpload(formData);
    const id = crypto.randomUUID();
    const personalStoragePath = category === "shared" ? await getPersonalStoragePath(access, targetParentId) : null;
    uploadedStoragePath = personalStoragePath
      ? `${personalStoragePath}/${id}.${file.extension}`
      : category === "finance"
        ? `company/${access.companyId}/finance/${id}.${file.extension}`
        : `company/${access.companyId}/drive/${id}.${file.extension}`;
    await uploadCompanyDriveFile(uploadedStoragePath, file.buffer);
    const { data, error } = await access.supabase.from("company_drive_items").insert({
      id,
      company_id: access.companyId,
      parent_id: targetParentId,
      item_type: "file",
      category,
      name: file.fileName,
      file_type: file.extension,
      mime_type: file.mimeType,
      file_size: file.fileSize,
      storage_path: uploadedStoragePath,
      created_by: access.userId,
      modified_by: access.userId,
    }).select("id, parent_id, item_type, category, name, is_system, file_type, mime_type, file_size, created_by, modified_by, created_at, updated_at").single();
    if (error || !data) {
      if (error?.code === "23505" && formData.get("replaceExisting") === "true") {
        const { data: existing, error: existingError } = await access.supabase.from("company_drive_items")
          .select("id, name, item_type, storage_path, created_by")
          .eq("company_id", access.companyId)
          .eq("parent_id", targetParentId)
          .eq("category", category)
          .eq("item_type", "file");
        const existingFile = (existing ?? []).find((item) => item.name.toLocaleLowerCase() === file.fileName.toLocaleLowerCase());

        if (!existingError && existingFile?.item_type === "file" && existingFile.created_by === access.userId
          && await canAccessDriveCategory(access, category, "edit", existingFile.created_by)) {
          const replacement = await access.supabase.from("company_drive_items")
            .update({
              file_type: file.extension,
              mime_type: file.mimeType,
              file_size: file.fileSize,
              storage_path: uploadedStoragePath,
              modified_by: access.userId,
            })
            .eq("id", existingFile.id)
            .eq("company_id", access.companyId)
            .select("id, parent_id, item_type, category, name, is_system, file_type, mime_type, file_size, created_by, modified_by, created_at, updated_at")
            .single();

          if (!replacement.error && replacement.data) {
            uploadedStoragePath = null;
            if (existingFile.storage_path) {
              try {
                await deleteCompanyDriveFile(existingFile.storage_path);
              } catch (cleanupError) {
                console.error("Previous backup file cleanup failed", cleanupError);
              }
            }
            return privateJson({ item: replacement.data, status: "synced" });
          }
          console.error("Company drive backup replacement failed", replacement.error);
        }
      }
      await deleteCompanyDriveFile(uploadedStoragePath);
      uploadedStoragePath = null;
      if (error?.code === "23505") return privateJson({ error: "A file or folder with that name already exists here." }, 409);
      console.error("Company drive metadata creation failed", error);
      return privateJson({ error: "Unable to save uploaded file metadata." }, 400);
    }
    return privateJson({ item: data, status: "synced" }, 201);
  } catch (error) {
    if (uploadedStoragePath) {
      try {
        await deleteCompanyDriveFile(uploadedStoragePath);
      } catch (cleanupError) {
        console.error("Company drive upload cleanup failed", cleanupError);
      }
    }
    if (error instanceof DocumentInputError) return privateJson({ error: error.message }, error.status);
    console.error("Company drive upload failed", error);
    return privateJson({ error: "Unable to upload and sync this file." }, 503);
  }
}
