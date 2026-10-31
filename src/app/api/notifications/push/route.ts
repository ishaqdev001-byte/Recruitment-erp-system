import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

import {
  createPushAdminClient,
  isPushConfigured,
} from "@/lib/server/push-notifications"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

type PushSubscriptionPayload = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

async function getAccess() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error } = await supabase
    .from("company_memberships")

    .select("company_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (error || !membership)
    return {
      error: "Active company membership not found.",
      status: 403 as const,
    }

  return { supabase, companyId: membership.company_id, userId: user.id }
}

function isValidPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4000) return false

  try {
    const endpoint = new URL(value)

    const supportedHost = [
      ".googleapis.com",

      ".mozilla.com",

      ".windows.com",

      ".microsoft.com",

      ".push.apple.com",
    ].some((suffix) => endpoint.hostname.endsWith(suffix))

    return (
      endpoint.protocol === "https:" &&
      !endpoint.username &&
      !endpoint.password &&
      supportedHost
    )
  } catch {
    return false
  }
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    const configured = isPushConfigured()

    let subscribed = false

    if (configured) {
      const admin = createPushAdminClient()

      const { data, error } = await admin
        .from("notification_push_subscriptions")

        .select("id")

        .eq("company_id", access.companyId)

        .eq("user_id", access.userId)

        .limit(1)

      if (error) throw error

      subscribed = Boolean(data?.length)
    }

    return NextResponse.json(
      {
        configured,

        dispatchConfigured: Boolean(
          process.env.NOTIFICATION_DISPATCH_SECRET?.trim(),
        ),

        publicKey: process.env.VAPID_PUBLIC_KEY ?? null,

        subscribed,
      },
      { headers },
    )
  } catch (error) {
    console.error("Push subscription status failed", error)

    return NextResponse.json(
      { error: "Push notification settings are unavailable." },
      { status: 503, headers },
    )
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })

    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Web Push is not configured on the server." },
        { status: 503, headers },
      )
    }

    const body = (await request.json().catch(() => null)) as PushSubscriptionPayload | null;

    if (
      !isValidPushEndpoint(body?.endpoint) ||
      typeof body.keys?.p256dh !== "string" ||
      !body.keys.p256dh.trim() ||
      body.keys.p256dh.length > 256 ||
      typeof body.keys.auth !== "string" ||
      !body.keys.auth.trim() ||
      body.keys.auth.length > 256
    ) {
      return NextResponse.json(
        { error: "A valid browser push subscription is required." },
        { status: 400, headers },
      )
    }

    const admin = createPushAdminClient()

    const { error } = await admin
      .from("notification_push_subscriptions")
      .upsert(
        {
          company_id: access.companyId,

          user_id: access.userId,

          endpoint: body.endpoint,

          p256dh: body.keys.p256dh,

          auth: body.keys.auth,

          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      )

    if (error) throw error

    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    console.error("Push subscription creation failed", error)

    return NextResponse.json(
      { error: "Unable to enable browser notifications." },
      { status: 503, headers },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user)
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })

    const body = (await request.json().catch(() => null)) as {
      endpoint?: unknown
    } | null

    if (!isValidPushEndpoint(body?.endpoint)) {
      return NextResponse.json(
        { error: "A valid browser push endpoint is required." },
        { status: 400, headers },
      )
    }

    const admin = createPushAdminClient()

    const { error } = await admin
      .from("notification_push_subscriptions")

      .delete()

      .eq("user_id", user.id)

      .eq("endpoint", body.endpoint)

    if (error) throw error

    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    console.error("Push subscription removal failed", error)

    return NextResponse.json(
      { error: "Unable to disable browser notifications." },
      { status: 503, headers },
    )
  }
}
