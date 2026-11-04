import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { fileTypeFromBuffer } from "file-type"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

const photoBucket = "profile-photos"

const maxPhotoSize = 5 * 1024 * 1024

const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"])

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getProfileAccess() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error,
  } = await supabase.auth.getUser()

  if (error || !user)
    return {
      error: "Authentication required.",

      status: 401 as const,

      userId: null,
    }

  const admin = createAdminClient()

  if (!admin)
    return {
      error: "Profile updates are not configured on this server.",

      status: 503 as const,

      userId: null,
    }

  return { admin, user }
}

export async function GET(request: Request) {
  try {
    const access = await getProfileAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers: responseHeaders },
      )

    if (new URL(request.url).searchParams.get("photo") === "1") {
      const { data: photo, error: photoError } = await access.admin.storage

        .from(photoBucket)

        .download(`${access.user.id}/avatar`)

      if (photoError || !photo) {
        if (photoError)
          console.error("User profile photo download failed", photoError)

        return new Response("Profile photo not found.", {
          status: 404,

          headers: responseHeaders,
        })
      }

      return new Response(photo, {
        headers: {
          ...responseHeaders,

          "Content-Type": photo.type || "application/octet-stream",

          "X-Content-Type-Options": "nosniff",
        },
      })
    }

    const { data, error } = await access.admin

      .from("profiles")

      .select("display_name, phone, avatar_url")

      .eq("id", access.user.id)

      .maybeSingle()

    if (error) {
      console.error("User profile lookup failed", error)

      return NextResponse.json(
        { error: "Unable to load your profile." },

        { status: 500, headers: responseHeaders },
      )
    }

    if (!data)
      return NextResponse.json(
        { error: "Your user profile could not be found." },

        { status: 404, headers: responseHeaders },
      )

    return NextResponse.json({ profile: data }, { headers: responseHeaders })
  } catch (error) {
    console.error("User profile lookup request failed", error)

    return NextResponse.json(
      { error: "Unable to load your profile." },

      { status: 500, headers: responseHeaders },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getProfileAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers: responseHeaders },
      )

    const body: unknown = await request.json()

    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json(
        { error: "Provide a valid profile name and phone number." },

        { status: 400, headers: responseHeaders },
      )

    const { displayName, phone } = body as Record<string, unknown>

    if (
      typeof displayName !== "string" ||
      typeof phone !== "string" ||
      displayName.trim().length < 2 ||
      displayName.trim().length > 120 ||
      phone.trim().length > 40
    )
      return NextResponse.json(
        {
          error:
            "Enter a name (2–120 characters) and a phone number of at most 40 characters.",
        },

        { status: 400, headers: responseHeaders },
      )

    const { data, error } = await access.admin

      .from("profiles")

      .update({
        display_name: displayName.trim(),

        phone: phone.trim(),
      })

      .eq("id", access.user.id)

      .select("display_name, phone, avatar_url")

      .maybeSingle()

    if (error) {
      console.error("User profile update failed", error)

      return NextResponse.json(
        { error: "Unable to save your profile." },

        { status: 500, headers: responseHeaders },
      )
    }

    if (!data)
      return NextResponse.json(
        { error: "Your user profile could not be found." },

        { status: 404, headers: responseHeaders },
      )

    const { error: metadataError } =
      await access.admin.auth.admin.updateUserById(
        access.user.id,

        {
          user_metadata: {
            ...access.user.user_metadata,

            full_name: data.display_name,

            phone: data.phone,
          },
        },
      )

    if (metadataError) {
      console.error(
        "User profile metadata synchronization failed",
        metadataError,
      )

      return NextResponse.json(
        {
          error:
            "Profile was saved, but your workspace needs a refresh to show the updated name.",
        },

        { status: 500, headers: responseHeaders },
      )
    }

    return NextResponse.json(
      { profile: data },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("User profile update request failed", error)

    return NextResponse.json(
      { error: "Unable to save your profile." },

      { status: 500, headers: responseHeaders },
    )
  }
}

export async function POST(request: Request) {
  try {
    const access = await getProfileAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers: responseHeaders },
      )

    const formData = await request.formData()

    const file = formData.get("photo")

    if (!(file instanceof File))
      return NextResponse.json(
        { error: "Choose an image to upload." },

        { status: 400, headers: responseHeaders },
      )

    if (file.size === 0 || file.size > maxPhotoSize)
      return NextResponse.json(
        { error: "Choose an image smaller than 5 MB." },

        { status: 400, headers: responseHeaders },
      )

    const bytes = Buffer.from(await file.arrayBuffer())

    const fileType = await fileTypeFromBuffer(bytes)

    if (!fileType || !allowedPhotoTypes.has(fileType.mime))
      return NextResponse.json(
        { error: "Profile photos must be JPG, PNG, or WebP images." },

        { status: 400, headers: responseHeaders },
      )

    const objectPath = `${access.user.id}/avatar`

    const { error: uploadError } = await access.admin.storage

      .from(photoBucket)

      .upload(objectPath, bytes, {
        contentType: fileType.mime,

        upsert: true,

        cacheControl: "3600",
      })

    if (uploadError) {
      console.error("User profile photo upload failed", uploadError)

      return NextResponse.json(
        { error: "Unable to upload your profile photo." },

        { status: 500, headers: responseHeaders },
      )
    }

    const avatarUrl = `/api/workspace/my-profile?photo=1&v=${Date.now()}`

    const { data, error: profileError } = await access.admin

      .from("profiles")

      .update({ avatar_url: avatarUrl })

      .eq("id", access.user.id)

      .select("display_name, phone, avatar_url")

      .maybeSingle()

    if (profileError || !data) {
      console.error("User profile photo reference update failed", profileError)

      const { error: cleanupError } = await access.admin.storage

        .from(photoBucket)

        .remove([objectPath])

      if (cleanupError)
        console.error("Orphaned profile photo cleanup failed", cleanupError)

      return NextResponse.json(
        { error: "The photo uploaded, but your profile could not be updated." },

        { status: 500, headers: responseHeaders },
      )
    }

    const { error: metadataError } =
      await access.admin.auth.admin.updateUserById(
        access.user.id,

        {
          user_metadata: {
            ...access.user.user_metadata,

            avatar_url: avatarUrl,
          },
        },
      )

    if (metadataError) {
      console.error(
        "User profile photo metadata synchronization failed",
        metadataError,
      )

      return NextResponse.json(
        {
          error:
            "Photo was saved, but your workspace needs a refresh to show it.",
        },

        { status: 500, headers: responseHeaders },
      )
    }

    return NextResponse.json(
      { profile: data },

      { status: 201, headers: responseHeaders },
    )
  } catch (error) {
    console.error("User profile photo request failed", error)

    return NextResponse.json(
      { error: "Unable to upload your profile photo." },

      { status: 500, headers: responseHeaders },
    )
  }
}

export async function DELETE() {
  try {
    const access = await getProfileAccess()

    if ("error" in access)
      return NextResponse.json(
        { error: access.error },

        { status: access.status, headers: responseHeaders },
      )

    const { data, error: profileError } = await access.admin

      .from("profiles")

      .update({ avatar_url: null })

      .eq("id", access.user.id)

      .select("display_name, phone, avatar_url")

      .maybeSingle()

    if (profileError || !data) {
      console.error("User profile photo removal failed", profileError)

      return NextResponse.json(
        { error: "Unable to remove your profile photo." },

        { status: 500, headers: responseHeaders },
      )
    }

    const { error: storageError } = await access.admin.storage

      .from(photoBucket)

      .remove([`${access.user.id}/avatar`])

    if (storageError)
      console.error("Profile photo storage cleanup failed", storageError)

    const { error: metadataError } =
      await access.admin.auth.admin.updateUserById(
        access.user.id,

        {
          user_metadata: {
            ...access.user.user_metadata,

            avatar_url: null,
          },
        },
      )

    if (metadataError) {
      console.error("User profile photo metadata removal failed", metadataError)

      return NextResponse.json(
        {
          error:
            "Photo was removed, but your workspace needs a refresh to reflect the change.",
        },

        { status: 500, headers: responseHeaders },
      )
    }

    return NextResponse.json(
      { profile: data },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("User profile photo removal request failed", error)

    return NextResponse.json(
      { error: "Unable to remove your profile photo." },

      { status: 500, headers: responseHeaders },
    )
  }
}
