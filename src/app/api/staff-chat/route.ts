import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type MessageRow = {
  id: string
  company_id: string
  sender_id: string
  recipient_id: string | null
  body: string
  created_at: string
}

type MessageReadRow = {
  message_id: string
  user_id: string
  read_at: string
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getAccess(companyId: string | null) {
  if (!companyId || !uuidPattern.test(companyId)) {
    return { error: "A valid company is required.", status: 400 as const }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: "Authentication required.", status: 401 as const }
  }

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, role_id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership) {
    return { error: "Active company membership not found.", status: 403 as const }
  }

  const admin = createAdminClient()
  if (!admin) {
    return {
      error: "Staff chat requires SUPABASE_SERVICE_ROLE_KEY on the server.",
      status: 503 as const,
    }
  }

  const [roleResult, companyResult] = await Promise.all([
    admin
      .from("company_roles")
      .select("name")
      .eq("company_id", companyId)
      .eq("id", membership.role_id)
      .maybeSingle(),
    admin
      .from("companies")
      .select("primary_admin_user_id")
      .eq("id", companyId)
      .maybeSingle(),
  ])
  if (roleResult.error) throw roleResult.error
  if (companyResult.error) throw companyResult.error
  const roleName = roleResult.data?.name.trim().toLowerCase()
  const canManageGroup =
    companyResult.data?.primary_admin_user_id === user.id ||
    roleName === "general manager" ||
    roleName === "supervisor"

  return { admin, canManageGroup, companyId, user }
}

async function countUnread(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  companyId: string,
  userId: string,
) {
  const { count, error } = await admin
    .from("workspace_notifications")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("recipient_id", userId)
    .eq("required_permission", "staff_chat.view")
    .eq("source_type", "staff_chat.message")
    .is("read_at", null)
  if (error) throw error
  return count ?? 0
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const access = await getAccess(url.searchParams.get("companyId"))
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })
    }

    const mode = url.searchParams.get("mode") ?? "summary"
    if (mode === "summary") {
      return NextResponse.json({
        unreadCount: await countUnread(access.admin, access.companyId, access.user.id),
      }, { headers })
    }

    if (mode === "directory") {
      const { data: memberships, error: membershipError } = await access.admin
        .from("company_memberships")
        .select("user_id")
        .eq("company_id", access.companyId)
        .eq("status", "active")
        .neq("user_id", access.user.id)
      if (membershipError) throw membershipError

      const memberIds = (memberships ?? []).map((membership) => membership.user_id)
      const { data: profiles, error: profileError } = memberIds.length
        ? await access.admin
            .from("profiles")
            .select("id, display_name")
            .in("id", memberIds)
            .order("display_name", { ascending: true })
        : { data: [], error: null }
      if (profileError) throw profileError

      return NextResponse.json({
        staff: (profiles ?? []).map((profile) => ({
          id: profile.id,
          name: profile.display_name?.trim() || "Staff member",
        })),
      }, { headers })
    }

    if (mode !== "messages") {
      return NextResponse.json({ error: "Choose a valid chat request." }, {
        status: 400,
        headers,
      })
    }

    const peerId = url.searchParams.get("peerId")
    if (peerId && (!uuidPattern.test(peerId) || peerId === access.user.id)) {
      return NextResponse.json({ error: "Choose a valid staff member." }, {
        status: 400,
        headers,
      })
    }

    let query = access.admin
      .from("staff_chat_messages")
      .select("id, company_id, sender_id, recipient_id, body, created_at")
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (peerId) {
      const { data: peer, error: peerError } = await access.admin
        .from("company_memberships")
        .select("user_id")
        .eq("company_id", access.companyId)
        .eq("user_id", peerId)
        .eq("status", "active")
        .maybeSingle()
      if (peerError) throw peerError
      if (!peer) {
        return NextResponse.json({ error: "Staff member not found." }, {
          status: 404,
          headers,
        })
      }

      query = query
        .not("recipient_id", "is", null)
        .or(
          `and(sender_id.eq.${access.user.id},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${access.user.id})`,
        )
    } else {
      query = query.is("recipient_id", null)
    }

    const { data, error: messagesError } = await query
    if (messagesError) throw messagesError
    const rawMessages = (data ?? []) as MessageRow[]
    const rawMessageIds = rawMessages.map((message) => message.id)
    let hiddenIds = new Set<string>()
    if (rawMessageIds.length) {
      const { data: hiddenRows, error: hiddenError } = await access.admin
        .from("staff_chat_message_hidden")
        .select("message_id")
        .eq("company_id", access.companyId)
        .eq("user_id", access.user.id)
        .in("message_id", rawMessageIds)
      if (hiddenError) throw hiddenError
      hiddenIds = new Set((hiddenRows ?? []).map((row) => row.message_id))
    }

    const messages = rawMessages.filter((message) => !hiddenIds.has(message.id))
    const messageIds = messages.map((message) => message.id)

    if (messageIds.length) {
      const readRows = messages
        .filter((message) => message.sender_id !== access.user.id)
        .map((message) => ({
          message_id: message.id,
          company_id: access.companyId,
          user_id: access.user.id,
        }))
      if (readRows.length) {
        const { error: readError } = await access.admin
          .from("staff_chat_message_reads")
          .upsert(readRows, {
            onConflict: "message_id,user_id",
            ignoreDuplicates: true,
          })
        if (readError) throw readError
      }

      const { error: readError } = await access.admin
        .from("workspace_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("company_id", access.companyId)
        .eq("recipient_id", access.user.id)
        .eq("required_permission", "staff_chat.view")
        .eq("source_type", "staff_chat.message")
        .is("read_at", null)
        .in("source_id", messageIds)
      if (readError) throw readError
    }

    const { data: receiptRows, error: receiptError } = messageIds.length
      ? await access.admin
          .from("staff_chat_message_reads")
          .select("message_id, user_id, read_at")
          .in("message_id", messageIds)
      : { data: [], error: null }
    if (receiptError) throw receiptError
    const receipts = (receiptRows ?? []) as MessageReadRow[]
    const ownMessageIds = new Set(
      messages
        .filter((message) => message.sender_id === access.user.id)
        .map((message) => message.id),
    )
    const ownReceipts = receipts.filter((receipt) =>
      ownMessageIds.has(receipt.message_id),
    )
    const profileIds = [
      ...new Set([
        ...messages.map((message) => message.sender_id),
        ...ownReceipts.map((receipt) => receipt.user_id),
      ]),
    ]
    const { data: profiles, error: profileError } = profileIds.length
      ? await access.admin
          .from("profiles")
          .select("id, display_name")
          .in("id", profileIds)
      : { data: [], error: null }
    if (profileError) throw profileError

    const names = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        profile.display_name?.trim() || "Staff member",
      ]),
    )

    return NextResponse.json({
      messages: messages.reverse().map((message) => ({
        ...message,
        sender_name: names.get(message.sender_id) ?? "Staff member",
        ...(message.sender_id === access.user.id
          ? {
              read_by: receipts
                .filter((receipt) => receipt.message_id === message.id)
                .map((receipt) => ({
                  id: receipt.user_id,
                  name: names.get(receipt.user_id) ?? "Staff member",
                  read_at: receipt.read_at,
                })),
            }
          : {}),
        can_delete_for_everyone:
          (message.recipient_id === null && access.canManageGroup) ||
          (message.recipient_id !== null &&
            message.sender_id === access.user.id),
        can_delete_for_me:
          message.recipient_id !== null &&
          message.recipient_id === access.user.id,
      })),
      unreadCount: await countUnread(access.admin, access.companyId, access.user.id),
    }, { headers })
  } catch (error) {
    console.error("Staff chat request failed", error)
    return NextResponse.json({ error: "Staff chat is unavailable." }, {
      status: 503,
      headers,
    })
  }
}

export async function DELETE(request: Request) {
  try {
    let body: {
      companyId?: unknown
      messageId?: unknown
      scope?: unknown
    }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "A valid delete request is required." }, {
        status: 400,
        headers,
      })
    }

    const access = await getAccess(
      typeof body.companyId === "string" ? body.companyId : null,
    )
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })
    }
    if (
      typeof body.messageId !== "string" ||
      !uuidPattern.test(body.messageId) ||
      (body.scope !== "everyone" && body.scope !== "me")
    ) {
      return NextResponse.json({ error: "Choose a valid message and delete scope." }, {
        status: 400,
        headers,
      })
    }

    const { data: message, error: messageError } = await access.admin
      .from("staff_chat_messages")
      .select("id, sender_id, recipient_id")
      .eq("company_id", access.companyId)
      .eq("id", body.messageId)
      .maybeSingle()
    if (messageError) throw messageError
    if (!message) {
      return NextResponse.json({ error: "Message not found." }, {
        status: 404,
        headers,
      })
    }

    if (message.recipient_id === null) {
      if (body.scope !== "everyone" || !access.canManageGroup) {
        return NextResponse.json({ error: "You cannot delete this group message." }, {
          status: 403,
          headers,
        })
      }

      const { error: deleteError } = await access.admin
        .from("staff_chat_messages")
        .delete()
        .eq("company_id", access.companyId)
        .eq("id", message.id)
      if (deleteError) throw deleteError
    } else if (body.scope === "everyone") {
      if (message.sender_id !== access.user.id) {
        return NextResponse.json({
          error: "Only the sender can delete a private message for everyone.",
        }, { status: 403, headers })
      }

      const { error: deleteError } = await access.admin
        .from("staff_chat_messages")
        .delete()
        .eq("company_id", access.companyId)
        .eq("id", message.id)
      if (deleteError) throw deleteError
    } else {
      if (message.recipient_id !== access.user.id) {
        return NextResponse.json({
          error: "Only the recipient can delete a private message for themselves.",
        }, { status: 403, headers })
      }

      const { error: hideError } = await access.admin
        .from("staff_chat_message_hidden")
        .upsert({
          message_id: message.id,
          company_id: access.companyId,
          user_id: access.user.id,
        }, { onConflict: "message_id,user_id", ignoreDuplicates: true })
      if (hideError) throw hideError

      const { error: notificationError } = await access.admin
        .from("workspace_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("company_id", access.companyId)
        .eq("recipient_id", access.user.id)
        .eq("required_permission", "staff_chat.view")
        .eq("source_type", "staff_chat.message")
        .eq("source_id", message.id)
        .is("read_at", null)
      if (notificationError) throw notificationError
    }

    return NextResponse.json({ ok: true }, { headers })
  } catch (error) {
    console.error("Staff chat message delete failed", error)
    return NextResponse.json({ error: "Unable to delete this message." }, {
      status: 503,
      headers,
    })
  }
}

export async function POST(request: Request) {
  try {
    let body: { companyId?: unknown; message?: unknown; recipientId?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "A valid message is required." }, {
        status: 400,
        headers,
      })
    }

    const access = await getAccess(
      typeof body.companyId === "string" ? body.companyId : null,
    )
    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })
    }

    if (typeof body.message !== "string") {
      return NextResponse.json({ error: "Enter a message to send." }, {
        status: 400,
        headers,
      })
    }
    const message = body.message.trim()
    if (!message || message.length > 4000) {
      return NextResponse.json({
        error: "Messages must contain 1 to 4,000 characters.",
      }, { status: 400, headers })
    }

    let recipientId: string | null = null
    if (body.recipientId !== null && body.recipientId !== undefined) {
      if (
        typeof body.recipientId !== "string" ||
        !uuidPattern.test(body.recipientId) ||
        body.recipientId === access.user.id
      ) {
        return NextResponse.json({ error: "Choose a valid recipient." }, {
          status: 400,
          headers,
        })
      }

      const { data: recipient, error: recipientError } = await access.admin
        .from("company_memberships")
        .select("user_id")
        .eq("company_id", access.companyId)
        .eq("user_id", body.recipientId)
        .eq("status", "active")
        .maybeSingle()
      if (recipientError) throw recipientError
      if (!recipient) {
        return NextResponse.json({
          error: "Recipient is not active in this company.",
        }, { status: 403, headers })
      }
      recipientId = recipient.user_id
    }

    const { data: inserted, error: insertError } = await access.admin
      .from("staff_chat_messages")
      .insert({
        company_id: access.companyId,
        sender_id: access.user.id,
        recipient_id: recipientId,
        body: message,
      })
      .select("id")
      .single()
    if (insertError) throw insertError

    return NextResponse.json({ ok: true, id: inserted.id }, { headers })
  } catch (error) {
    console.error("Staff chat message send failed", error)
    return NextResponse.json({ error: "Unable to send this message." }, {
      status: 503,
      headers,
    })
  }
}
