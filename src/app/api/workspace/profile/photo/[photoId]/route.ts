import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { downloadCompanyDriveFile } from "@/lib/storage/interserver";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * GET /api/workspace/profile/photo/[photoId]
 * Retrieve and serve a profile photo
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ photoId: string }> }
) {
  try {
    const { photoId: rawPhotoId } = await params;
    const photoId = typeof rawPhotoId === "string" ? rawPhotoId.trim() : "";
    if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) {
      return NextResponse.json({ error: "Invalid photo ID." }, { status: 400 });
    }

    // Verify user is authenticated
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    // Get user's company membership
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "Profile service is unavailable." },
        { status: 503 }
      );
    }

    // Get photo record
    const { data: photoRecord, error: photoError } = await admin
      .from("user_profile_photos")
      .select("storage_path, mime_type, file_size")
      .eq("id", photoId)
      .eq("company_id", membership.company_id)
      .maybeSingle();

    if (photoError || !photoRecord) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    // Log access
    const { error: accessLogError } = await admin.rpc("log_profile_photo_access", {
      requested_photo_id: photoId,
      requested_action: "view",
    });
    if (accessLogError) {
      console.error("Failed to log profile photo access:", accessLogError);
    }

    try {
      // Download file from storage
      const fileBuffer = await downloadCompanyDriveFile(photoRecord.storage_path);

      // Return file with appropriate headers
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          "Content-Type": photoRecord.mime_type,
          "Content-Length": String(fileBuffer.length),
          "Cache-Control": "public, max-age=86400", // Cache for 24 hours
          "ETag": `"${photoId}"`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to download profile photo:", message);
      return NextResponse.json(
        { error: "Unable to retrieve photo." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Profile photo retrieval failed:", error);
    return NextResponse.json(
      { error: "Profile photo service error." },
      { status: 500 }
    );
  }
}
