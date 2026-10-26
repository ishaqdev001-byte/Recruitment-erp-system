import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { uploadCompanyDriveFile, downloadCompanyDriveFile, deleteCompanyDriveFile } from "@/lib/storage/interserver";
import { fileTypeFromBuffer } from "file-type";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };
const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Authentication required.", status: 401 as const };

  // Get user's primary company membership
  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return { error: "Active company membership not found.", status: 403 as const };
  }

  return { userId: user.id, companyId: membership.company_id, user };
}

/**
 * GET /api/workspace/profile
 * Retrieve current user's profile information
 */
export async function GET() {
  try {
    const auth = await getAuthenticatedUser();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: responseHeaders });

    const supabase = await createSupabaseServerClient();
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to enable profile management." },
        { status: 503, headers: responseHeaders }
      );
    }

    // Get profile information
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, display_name, phone, branch, bio, photo_url, created_at, updated_at")
      .eq("id", auth.userId)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return NextResponse.json({ error: "Unable to load profile." }, { status: 500, headers: responseHeaders });
    }

    // Get current profile photo
    const { data: currentPhoto, error: photoError } = await admin
      .from("user_profile_photos")
      .select("id, file_name, mime_type, file_size, uploaded_at")
      .eq("user_id", auth.userId)
      .eq("company_id", auth.companyId)
      .eq("is_current", true)
      .maybeSingle();

    if (photoError) {
      console.error("Profile photo fetch error:", photoError);
    }

    return NextResponse.json(
      {
        profile: profile || {
          id: auth.userId,
          display_name: "",
          phone: "",
          branch: "",
          bio: "",
          photo_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        currentPhoto: currentPhoto || null,
      },
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error("Profile GET request failed:", error);
    return NextResponse.json({ error: "Profile retrieval failed." }, { status: 500, headers: responseHeaders });
  }
}

/**
 * POST /api/workspace/profile
 * Update profile information (display_name, phone, branch, bio)
 * or upload profile photo
 */
export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to enable profile management." },
        { status: 503, headers: responseHeaders }
      );
    }

    const contentType = request.headers.get("content-type") || "";

    // Handle multipart form data (photo upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("photo") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No photo file provided." }, { status: 400, headers: responseHeaders });
      }

      // Validate file size
      if (file.size > MAX_PHOTO_SIZE) {
        return NextResponse.json(
          { error: `Photo must be smaller than ${MAX_PHOTO_SIZE / (1024 * 1024)}MB.` },
          { status: 400, headers: responseHeaders }
        );
      }

      // Validate MIME type
      const buffer = await file.arrayBuffer();
      const detectedType = await fileTypeFromBuffer(buffer);
      const mimeType = detectedType?.mime || file.type;

      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        return NextResponse.json(
          { error: "Only JPEG, PNG, WebP, and GIF images are allowed." },
          { status: 400, headers: responseHeaders }
        );
      }

      try {
        // Generate unique filename
        const ext = path.extname(file.name) || `.${detectedType?.ext || "jpg"}`;
        const photoId = crypto.randomUUID();
        const fileName = `${photoId}${ext}`;
        const storagePath = `company/${auth.companyId}/users/${auth.userId}/profile-photos/${fileName}`;

        // Upload to storage
        await uploadCompanyDriveFile(storagePath, Buffer.from(buffer));

        // Mark previous photo as inactive and insert new one
        await admin
          .from("user_profile_photos")
          .update({ is_current: false })
          .eq("user_id", auth.userId)
          .eq("company_id", auth.companyId)
          .eq("is_current", true);

        const { data: photoRecord, error: insertError } = await admin
          .from("user_profile_photos")
          .insert({
            user_id: auth.userId,
            company_id: auth.companyId,
            file_name: fileName,
            file_type: ext.substring(1),
            mime_type: mimeType,
            file_size: file.size,
            storage_path: storagePath,
            is_current: true,
          })
          .select("id, file_name, mime_type, file_size, uploaded_at")
          .single();

        if (insertError) {
          console.error("Profile photo insert error:", insertError);
          return NextResponse.json({ error: "Unable to save photo metadata." }, { status: 500, headers: responseHeaders });
        }

        // Update profile with photo_url
        const photoUrl = `/api/workspace/profile/photo/${photoRecord.id}`;
        const { error: updateError } = await admin
          .from("profiles")
          .update({ photo_url: photoUrl })
          .eq("id", auth.userId);

        if (updateError) {
          console.error("Profile photo_url update error:", updateError);
        }

        return NextResponse.json(
          {
            success: true,
            photo: photoRecord,
            photoUrl,
          },
          { status: 201, headers: responseHeaders }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Photo upload error:", message);
        return NextResponse.json(
          { error: "Failed to upload photo. " + message },
          { status: 500, headers: responseHeaders }
        );
      }
    }

    // Handle JSON (profile text update)
    const body = await request.json() as Record<string, unknown>;
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const branch = typeof body.branch === "string" ? body.branch.trim() : "";
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";

    // Validate inputs
    if (displayName && displayName.length > 200) {
      return NextResponse.json({ error: "Display name must be 200 characters or less." }, { status: 400, headers: responseHeaders });
    }
    if (phone && phone.length > 60) {
      return NextResponse.json({ error: "Phone must be 60 characters or less." }, { status: 400, headers: responseHeaders });
    }
    if (branch && branch.length > 200) {
      return NextResponse.json({ error: "Branch must be 200 characters or less." }, { status: 400, headers: responseHeaders });
    }
    if (bio && bio.length > 5000) {
      return NextResponse.json({ error: "Bio must be 5000 characters or less." }, { status: 400, headers: responseHeaders });
    }

    // Update profile
    const updateData: Record<string, string> = {};
    if (displayName) updateData.display_name = displayName;
    if (phone !== undefined) updateData.phone = phone;
    if (branch !== undefined) updateData.branch = branch;
    if (bio !== undefined) updateData.bio = bio;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No profile fields to update." }, { status: 400, headers: responseHeaders });
    }

    const { data: updatedProfile, error: updateError } = await admin
      .from("profiles")
      .update(updateData)
      .eq("id", auth.userId)
      .select("id, display_name, phone, branch, bio, photo_url, updated_at")
      .single();

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json({ error: "Unable to update profile." }, { status: 500, headers: responseHeaders });
    }

    return NextResponse.json(
      {
        success: true,
        profile: updatedProfile,
      },
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    console.error("Profile POST request failed:", error);
    return NextResponse.json({ error: "Profile update failed." }, { status: 500, headers: responseHeaders });
  }
}

/**
 * PATCH /api/workspace/profile
 * Delete profile photo
 */
export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedUser();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to enable profile management." },
        { status: 503, headers: responseHeaders }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const photoId = typeof body.photoId === "string" ? body.photoId : "";

    if (action === "delete-photo") {
      if (!photoId) {
        return NextResponse.json({ error: "Photo ID is required." }, { status: 400, headers: responseHeaders });
      }

      // Get photo record
      const { data: photo, error: photoError } = await admin
        .from("user_profile_photos")
        .select("storage_path, id")
        .eq("id", photoId)
        .eq("user_id", auth.userId)
        .eq("company_id", auth.companyId)
        .maybeSingle();

      if (photoError || !photo) {
        return NextResponse.json({ error: "Photo not found." }, { status: 404, headers: responseHeaders });
      }

      try {
        // Delete from storage
        await deleteCompanyDriveFile(photo.storage_path);
      } catch (error) {
        console.error("Storage deletion error (non-fatal):", error);
        // Continue with database deletion even if storage deletion fails
      }

      // Delete from database
      const { error: deleteError } = await admin
        .from("user_profile_photos")
        .delete()
        .eq("id", photoId)
        .eq("user_id", auth.userId);

      if (deleteError) {
        console.error("Photo deletion error:", deleteError);
        return NextResponse.json({ error: "Unable to delete photo." }, { status: 500, headers: responseHeaders });
      }

      // If this was the current photo, clear photo_url from profile
      const { data: currentPhoto } = await admin
        .from("user_profile_photos")
        .select("id")
        .eq("user_id", auth.userId)
        .eq("company_id", auth.companyId)
        .eq("is_current", true)
        .maybeSingle();

      if (!currentPhoto) {
        await admin
          .from("profiles")
          .update({ photo_url: null })
          .eq("id", auth.userId);
      }

      return NextResponse.json(
        { success: true, message: "Photo deleted." },
        { status: 200, headers: responseHeaders }
      );
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400, headers: responseHeaders });
  } catch (error) {
    console.error("Profile PATCH request failed:", error);
    return NextResponse.json({ error: "Profile operation failed." }, { status: 500, headers: responseHeaders });
  }
}
