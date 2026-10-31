import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

import {
  createPushAdminClient,
  dispatchPushNotifications,
} from "@/lib/server/push-notifications"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

function hasCronAuthorization(request: Request) {
  const secret = process.env.NOTIFICATION_DISPATCH_SECRET

  const authorization = request.headers.get("authorization") ?? ""

  const expected = secret ? `Bearer ${secret}` : ""

  const receivedBuffer = Buffer.from(authorization)

  const expectedBuffer = Buffer.from(expected)

  return (
    Boolean(secret) &&
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  )
}

export async function POST(request: Request) {
  try {
    if (hasCronAuthorization(request)) {
      const admin = createPushAdminClient()

      const [{ error: taskError }, { error: inquiryError }] = await Promise.all(
        [
          admin.rpc("dispatch_due_task_notifications"),

          admin.rpc("dispatch_due_candidate_inquiry_notifications"),
        ],
      )

      if (taskError)
        throw new Error(
          `Scheduled task notification dispatch failed: ${taskError.message}`,
        )

      if (inquiryError)
        throw new Error(
          `Scheduled inquiry notification dispatch failed: ${inquiryError.message}`,
        )

      const result = await dispatchPushNotifications({})

      return NextResponse.json({ ok: true, ...result }, { headers })
    }

    const supabase = await createSupabaseServerClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, {
        status: 401,
        headers,
      })
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")

      .select("company_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )
    }

    const result = await dispatchPushNotifications({
      userId: user.id,

      companyId: membership.company_id,
    })

    return NextResponse.json({ ok: true, ...result }, { headers })
  } catch (error) {
    console.error("Push notification dispatch failed", error)

    return NextResponse.json({ error: "Push notifications are unavailable." }, {
      status: 503,
      headers,
    })
  }
}
