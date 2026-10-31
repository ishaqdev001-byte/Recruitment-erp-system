import "server-only"

import { createClient } from "@supabase/supabase-js"

import webPush from "web-push"

type NotificationType = "task" | "candidate_inquiry" | "leave" | "requisition" | "workspace"

type PushNotification = {
  id: string

  company_id: string

  recipient_id: string

  title: string

  body: string

  required_permission?: string

  destination?: string

  type: NotificationType
}

type PushSubscriptionRow = {
  id: string

  company_id: string

  user_id: string

  endpoint: string

  p256dh: string

  auth: string
}

type PendingNotificationRow = {
  id: string

  company_id: string

  recipient_id: string

  notification_type: NotificationType

  title: string

  body: string
}

type PendingWorkspaceNotificationRow = {
  id: string

  company_id: string

  recipient_id: string

  required_permission: string

  category: string

  title: string

  body: string
}

const permissionCodes: Record<NotificationType, string[]> = {
  task: ["tasks.view"],

  candidate_inquiry: ["candidates.view"],

  leave: ["leave.view", "leave.create", "leave.manage"],

  workspace: [],

  requisition: [
    "requisitions.create",

    "requisitions.review",

    "requisitions.verify",

    "requisitions.authorize",
  ],
}

export function isPushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
  )
}

export function createPushAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service-role configuration is required for push notifications.",
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function isPermissionAllowed(
  notification: PushNotification,

  roleName: string,

  permissions: Set<string>,
) {
  if (notification.type === "workspace") {
    return Boolean(notification.required_permission && permissions.has(notification.required_permission))
  }

  if (roleName.trim().toLowerCase() === "recruitment agent") return false

  return permissionCodes[notification.type].some((code) =>
    permissions.has(code),
  )
}

function getNotificationPath(notification: PushNotification) {
  if (notification.type === "workspace") {
    const destinations: Record<string, string> = {
      candidates: "candidates",
      "candidate-inquiries": "candidate-inquiries",
      tasks: "tasks",
      approvals: "approvals",
      finance: "finance",
      "agent-finance": "agent-invoices",
      "human-resources": "human-resources",
      communications: "communications",
      medical: "medical-management",
    }
    return `/?notification=${destinations[notification.destination ?? ""] ?? "dashboard"}`
  }

  const { type } = notification
  if (type === "leave") return "/?notification=leave"

  if (type === "requisition") return "/?notification=requisitions"

  if (type === "candidate_inquiry") return "/?notification=candidates"

  return "/?notification=tasks"
}

async function loadUnreadNotifications(
  admin: ReturnType<typeof createPushAdminClient>,

  userId?: string,

  companyId?: string,
): Promise<PushNotification[]> {
  const [legacyResult, workspaceResult] = await Promise.all([
    admin.rpc("list_pending_push_notifications", {
      requested_user_id: userId ?? null,
      requested_company_id: companyId ?? null,
    }),
    admin.rpc("list_pending_workspace_push_notifications", {
      requested_user_id: userId ?? null,
      requested_company_id: companyId ?? null,
    }),
  ])
  if (legacyResult.error) {
    throw new Error(`Unable to load pending push notifications: ${legacyResult.error.message}`)
  }
  if (workspaceResult.error) {
    throw new Error(`Unable to load pending workspace notifications: ${workspaceResult.error.message}`)
  }

  const legacyRows: unknown[] = legacyResult.data ?? []
  const workspaceRows: unknown[] = workspaceResult.data ?? []
  const legacyNotifications = legacyRows.map((row): PushNotification => {
    if (
      typeof row !== "object" ||
      row === null ||
      !("id" in row) ||
      !("company_id" in row) ||
      !("recipient_id" in row) ||
      !("notification_type" in row) ||
      !("title" in row) ||
      !("body" in row)
    ) {
      throw new Error(
        "The pending push notification query returned an invalid row.",
      )
    }

    const pending = row as PendingNotificationRow

    if (
      typeof pending.id !== "string" ||
      typeof pending.company_id !== "string" ||
      typeof pending.recipient_id !== "string" ||
      typeof pending.title !== "string" ||
      typeof pending.body !== "string" ||
      !["task", "candidate_inquiry", "leave", "requisition"].includes(
        pending.notification_type,
      )
    ) {
      throw new Error(
        "The pending push notification query returned invalid data.",
      )
    }

    return {
      id: pending.id,

      company_id: pending.company_id,

      recipient_id: pending.recipient_id,

      title: pending.title,

      body: pending.body,

      type: pending.notification_type,
    }
  })
  const workspaceNotifications = workspaceRows.map((row): PushNotification => {
    if (
      typeof row !== "object" ||
      row === null ||
      !("id" in row) ||
      !("company_id" in row) ||
      !("recipient_id" in row) ||
      !("required_permission" in row) ||
      !("category" in row) ||
      !("title" in row) ||
      !("body" in row)
    ) {
      throw new Error("The pending workspace notification query returned an invalid row.")
    }

    const pending = row as PendingWorkspaceNotificationRow
    const categories = [
      "candidates",
      "candidate-inquiries",
      "tasks",
      "approvals",
      "finance",
      "agent-finance",
      "human-resources",
      "communications",
      "medical",
    ]
    if (
      typeof pending.id !== "string" ||
      typeof pending.company_id !== "string" ||
      typeof pending.recipient_id !== "string" ||
      typeof pending.required_permission !== "string" ||
      !categories.includes(pending.category) ||
      typeof pending.title !== "string" ||
      typeof pending.body !== "string"
    ) {
      throw new Error("The pending workspace notification query returned invalid data.")
    }
    return {
      id: pending.id,
      company_id: pending.company_id,
      recipient_id: pending.recipient_id,
      title: pending.title,
      body: pending.body,
      type: "workspace",
      required_permission: pending.required_permission,
      destination: pending.category,
    }
  })

  return [...legacyNotifications, ...workspaceNotifications]
}

export async function dispatchPushNotifications(options: {
  userId?: string

  companyId?: string
}) {
  if (!isPushConfigured()) {
    throw new Error("Web Push is not configured on the server.")
  }

  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT!,

    process.env.VAPID_PUBLIC_KEY!,

    process.env.VAPID_PRIVATE_KEY!,
  )

  const admin = createPushAdminClient()

  const notifications = await loadUnreadNotifications(
    admin,
    options.userId,
    options.companyId,
  )

  if (!notifications.length) return { scanned: 0, delivered: 0 }

  const companyIds = [...new Set(notifications.map((item) => item.company_id))]

  const userIds = [...new Set(notifications.map((item) => item.recipient_id))]

  const [
    { data: memberships, error: membershipError },
    { data: subscriptions, error: subscriptionError },
  ] = await Promise.all([
    admin
      .from("company_memberships")

      .select("company_id, user_id, role_id")

      .eq("status", "active")

      .in("company_id", companyIds)

      .in("user_id", userIds),

    admin
      .from("notification_push_subscriptions")

      .select("id, company_id, user_id, endpoint, p256dh, auth")

      .in("company_id", companyIds)

      .in("user_id", userIds),
  ])

  if (membershipError)
    throw new Error(
      `Unable to verify push notification recipients: ${membershipError.message}`,
    )

  if (subscriptionError)
    throw new Error(
      `Unable to load push subscriptions: ${subscriptionError.message}`,
    )

  if (!memberships?.length || !subscriptions?.length) {
    return { scanned: notifications.length, delivered: 0 }
  }

  const roleIds = [
    ...new Set(memberships.map((membership) => membership.role_id)),
  ]

  const [
    { data: roles, error: roleError },
    { data: rolePermissions, error: permissionError },
  ] = await Promise.all([
    admin
      .from("company_roles")
      .select("id, company_id, name")
      .in("id", roleIds),

    admin
      .from("role_permissions")

      .select("role_id, company_id, permission_code")

      .in("company_id", companyIds)

      .in("role_id", roleIds),
  ])

  if (roleError)
    throw new Error(
      `Unable to verify push recipient roles: ${roleError.message}`,
    )

  if (permissionError)
    throw new Error(
      `Unable to verify push recipient permissions: ${permissionError.message}`,
    )

  const rolesById = new Map((roles ?? []).map((role) => [role.id, role]))

  const permissionsByMembership = new Map<string, Set<string>>()

  for (const permission of rolePermissions ?? []) {
    const key = `${permission.company_id}:${permission.role_id}`

    const permissions = permissionsByMembership.get(key) ?? new Set<string>()

    permissions.add(permission.permission_code)

    permissionsByMembership.set(key, permissions)
  }

  const membershipByUser = new Map(
    (memberships ?? []).map((membership) => [
      `${membership.company_id}:${membership.user_id}`,

      membership,
    ]),
  )

  const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>()

  for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
    const key = `${subscription.company_id}:${subscription.user_id}`

    const userSubscriptions = subscriptionsByUser.get(key) ?? []

    userSubscriptions.push(subscription)

    subscriptionsByUser.set(key, userSubscriptions)
  }

  let delivered = 0

  for (const notification of notifications) {
    const membership = membershipByUser.get(
      `${notification.company_id}:${notification.recipient_id}`,
    )

    if (!membership) continue

    const role = rolesById.get(membership.role_id)

    const permissions =
      permissionsByMembership.get(
        `${notification.company_id}:${membership.role_id}`,
      ) ?? new Set()

    if (!role || !isPermissionAllowed(notification, role.name, permissions))
      continue

    const userSubscriptions = subscriptionsByUser.get(
      `${notification.company_id}:${notification.recipient_id}`,
    )

    if (!userSubscriptions?.length) continue

    const { data: claimed, error: claimError } = await admin.rpc(
      "claim_notification_push_delivery",
      {
        requested_company_id: notification.company_id,

        requested_user_id: notification.recipient_id,

        requested_notification_type: notification.type,

        requested_notification_id: notification.id,
      },
    )

    if (claimError)
      throw new Error(
        `Unable to claim a push notification: ${claimError.message}`,
      )

    if (!claimed) continue

    const sendResults = await Promise.all(
      userSubscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,

              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },

            JSON.stringify({
              title: notification.title,

              body: notification.body.slice(0, 500),

              url: getNotificationPath(notification),
            }),
          )

          return true
        } catch (error) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? Number(error.statusCode)
              : undefined

          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await admin
              .from("notification_push_subscriptions")

              .delete()
              .eq("id", subscription.id)

            if (deleteError)
              console.error(
                "Expired push subscription cleanup failed",
                deleteError,
              )
          } else {
            console.error("Web Push delivery failed", {
              subscriptionId: subscription.id,
              statusCode,
            })
          }

          return false
        }
      }),
    )

    const anyDelivered = sendResults.some(Boolean)

    const { error: updateError } = await admin
      .from("notification_push_deliveries")

      .update({
        status: anyDelivered ? "delivered" : "pending",

        delivered_at: anyDelivered ? new Date().toISOString() : null,

        lease_expires_at: null,

        last_error: anyDelivered
          ? ""
          : "Push delivery failed for all active subscriptions.",
      })

      .eq("company_id", notification.company_id)

      .eq("user_id", notification.recipient_id)

      .eq("notification_type", notification.type)

      .eq("notification_id", notification.id)

    if (updateError)
      throw new Error(
        `Unable to record push delivery result: ${updateError.message}`,
      )

    if (anyDelivered) delivered += 1
  }

  return { scanned: notifications.length, delivered }
}
