import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getInvitation(invitationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(invitationId))
    return { error: "Invitation not found.", status: 404 as const }

  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return {
      error: "Open the invitation link from your email to continue.",
      status: 401 as const,
    }

  const admin = createAdminClient()

  if (!admin)
    return {
      error:
        "Invitation verification is unavailable. Contact the company administrator.",
      status: 503 as const,
    }

  const { data: invitation, error: invitationError } = await admin

    .from("workspace_invitations")

    .select("id, company_id, user_id, role_id, expires_at, accepted_at")

    .eq("id", invitationId)

    .maybeSingle()

  if (invitationError || !invitation || invitation.user_id !== user.id) {
    return {
      error:
        "This invitation is invalid. Ask the company administrator to send a new one.",
      status: 404 as const,
    }
  }

  if (invitation.accepted_at)
    return {
      error:
        "This invitation has already been accepted. Log in with your password.",
      status: 410 as const,
    }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return {
      error:
        "This invitation has expired. Ask the company administrator to resend it from Users & Roles.",
      status: 410 as const,
    }
  }

  const [
    { data: membership, error: membershipError },
    { data: company, error: companyError },
    { data: role, error: roleError },
  ] = await Promise.all([
    admin
      .from("company_memberships")
      .select("role_id, status")
      .eq("company_id", invitation.company_id)
      .eq("user_id", user.id)
      .maybeSingle(),

    admin
      .from("companies")
      .select("name")
      .eq("id", invitation.company_id)
      .maybeSingle(),

    admin
      .from("company_roles")
      .select("name")
      .eq("id", invitation.role_id)
      .eq("company_id", invitation.company_id)
      .maybeSingle(),
  ])

  const isRelink = Boolean(
    membership?.status === "disabled" &&
      user.app_metadata?.workspace_account_unlinked === true &&
      user.app_metadata?.workspace_invite_pending === true &&
      user.app_metadata?.workspace_relink_company_id ===
        invitation.company_id &&
      typeof user.app_metadata?.workspace_staff_member_id === "string",
  )

  if (
    membershipError ||
    companyError ||
    roleError ||
    !membership ||
    (membership.status !== "active" && !isRelink) ||
    membership.role_id !== invitation.role_id ||
    !company ||
    !role
  ) {
    return {
      error:
        "The invited company assignment could not be verified. Ask the company administrator to resend the invitation.",
      status: 403 as const,
    }
  }

  return {
    admin,

    invitation,

    userId: user.id,

    companyName: company.name,

    roleName: role.name,

    isRelink,

    requiresPasswordSetup: user.app_metadata?.workspace_invite_pending === true,
  }
}

async function getLegacyInvitation() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return {
      error: "Open the invitation link from your email to continue.",
      status: 401 as const,
    }

  const admin = createAdminClient()

  if (!admin)
    return {
      error:
        "Invitation verification is unavailable. Contact the company administrator.",
      status: 503 as const,
    }

  const { data: memberships, error: membershipError } = await admin

    .from("company_memberships")

    .select("company_id, role_id")

    .eq("user_id", user.id)

    .eq("status", "active")

  if (membershipError || memberships?.length !== 1) {
    return {
      error:
        "This older invitation does not resolve to exactly one active company. Ask the administrator to send a new invitation.",
      status: 403 as const,
    }
  }

  const membership = memberships[0]

  const { data: previousInvitations, error: previousError } = await admin

    .from("workspace_invitations")

    .select("id")

    .eq("user_id", user.id)

    .order("created_at", { ascending: false })

    .limit(1)

  if (previousError)
    return { error: "Unable to verify this invitation.", status: 503 as const }

  if (previousInvitations?.length)
    return getInvitation(previousInvitations[0].id)

  const [{ data: company }, { data: role }] = await Promise.all([
    admin
      .from("companies")
      .select("name")
      .eq("id", membership.company_id)
      .maybeSingle(),

    admin
      .from("company_roles")
      .select("name")
      .eq("id", membership.role_id)
      .eq("company_id", membership.company_id)
      .maybeSingle(),
  ])

  if (!company || !role) {
    return {
      error:
        "This older invitation could not be matched to its company and role. Ask the administrator to send a new invitation.",
      status: 403 as const,
    }
  }

  const { data: invitation, error: insertError } = await admin
    .from("workspace_invitations")
    .insert({
      company_id: membership.company_id,

      user_id: user.id,

      role_id: membership.role_id,
    })
    .select("id")
    .single()

  if (insertError || !invitation)
    return {
      error:
        "Unable to create a 30-minute acceptance record. Ask the administrator to send a new invitation.",
      status: 500 as const,
    }

  return getInvitation(invitation.id)
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/workspace/invitations/[invitationId]">,
) {
  try {
    const { invitationId } = await context.params

    const result =
      invitationId === "legacy"
        ? await getLegacyInvitation()
        : await getInvitation(invitationId)

    if ("error" in result)
      return NextResponse.json({ error: result.error }, {
        status: result.status,
        headers: responseHeaders,
      })

    return NextResponse.json(
      {
        invitationId: result.invitation.id,

        companyId: result.invitation.company_id,

        companyName: result.companyName,

        roleName: result.roleName,

        expiresAt: result.invitation.expires_at,

        requiresPasswordSetup: result.requiresPasswordSetup,
      },
      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Workspace invitation lookup failed", error)

    return NextResponse.json({ error: "Unable to verify this invitation." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

export async function POST(
  _request: Request,
  context: RouteContext<"/api/workspace/invitations/[invitationId]">,
) {
  try {
    const { invitationId } = await context.params

    const result = await getInvitation(invitationId)

    if ("error" in result)
      return NextResponse.json({ error: result.error }, {
        status: result.status,
        headers: responseHeaders,
      })

    const { data: authUser, error: authUserError } =
      await result.admin.auth.admin.getUserById(result.userId)

    if (authUserError || !authUser.user) {
      return NextResponse.json(
        { error: "Unable to verify the invited account." },
        { status: 500, headers: responseHeaders },
      )
    }

    if (result.isRelink) {
      const originalAppMetadata = authUser.user.app_metadata ?? {}

      const staffId =
        typeof originalAppMetadata.workspace_staff_member_id === "string"
          ? originalAppMetadata.workspace_staff_member_id
          : ""

      const relinkActorId =
        typeof originalAppMetadata.workspace_relink_requested_by === "string"
          ? originalAppMetadata.workspace_relink_requested_by
          : result.userId

      if (!staffId) {
        return NextResponse.json(
          { error: "The linked staff profile could not be verified." },
          { status: 409, headers: responseHeaders },
        )
      }

      const [
        { data: staff, error: staffError },
        { data: profile, error: profileError },
      ] = await Promise.all([
        result.admin

          .from("company_staff_members")

          .select("id, status, linked_user_id")

          .eq("company_id", result.invitation.company_id)

          .eq("id", staffId)

          .maybeSingle(),

        result.admin

          .from("profiles")

          .select("must_change_password")

          .eq("id", result.userId)

          .maybeSingle(),
      ])

      if (staffError || profileError) {
        console.error(
          "Staff relink invitation verification failed",
          staffError ?? profileError,
        )

        return NextResponse.json(
          { error: "Unable to verify the staff account." },
          { status: 500, headers: responseHeaders },
        )
      }

      if (
        !staff ||
        staff.linked_user_id !== null ||
        staff.status !== "Inactive"
      ) {
        return NextResponse.json(
          { error: "This staff profile is no longer available for relinking." },
          { status: 409, headers: responseHeaders },
        )
      }

      let staffLinked = false

      let membershipEnabled = false

      let profileUpdated = false

      let metadataUpdated = false

      const rollbackRelink = async () => {
        const failures: string[] = []

        if (metadataUpdated) {
          const { error } = await result.admin.auth.admin.updateUserById(
            result.userId,
            {
              app_metadata: originalAppMetadata,
            },
          )

          if (error) {
            failures.push("account metadata")

            console.error("Staff relink metadata rollback failed", error)
          }
        }

        if (profileUpdated) {
          const { error } = await result.admin

            .from("profiles")

            .update({
              must_change_password: profile?.must_change_password ?? false,
            })

            .eq("id", result.userId)

          if (error) {
            failures.push("password requirement")

            console.error(
              "Staff relink password requirement rollback failed",
              error,
            )
          }
        }

        if (membershipEnabled) {
          const { error } = await result.admin

            .from("company_memberships")

            .update({ status: "disabled" })

            .eq("company_id", result.invitation.company_id)

            .eq("user_id", result.userId)

          if (error) {
            failures.push("company access")

            console.error("Staff relink membership rollback failed", error)
          }
        }

        if (staffLinked) {
          const { error } = await result.admin

            .from("company_staff_members")

            .update({
              linked_user_id: null,

              status: "Inactive",

              updated_by: relinkActorId,
            })

            .eq("company_id", result.invitation.company_id)

            .eq("id", staffId)

            .eq("linked_user_id", result.userId)

          if (error) {
            failures.push("staff link")

            console.error("Staff relink record rollback failed", error)
          }
        }

        return failures
      }

      const { data: linkedStaff, error: linkError } = await result.admin

        .from("company_staff_members")

        .update({
          linked_user_id: result.userId,

          status: "Active",

          updated_by: relinkActorId,
        })

        .eq("company_id", result.invitation.company_id)

        .eq("id", staffId)

        .eq("status", "Inactive")

        .is("linked_user_id", null)

        .select("id")

        .maybeSingle()

      if (linkError || !linkedStaff) {
        console.error("Staff relink invitation link failed", linkError)

        return NextResponse.json(
          { error: "Unable to relink this staff profile." },
          { status: 409, headers: responseHeaders },
        )
      }

      staffLinked = true

      const { data: enabledMembership, error: membershipError } =
        await result.admin

          .from("company_memberships")

          .update({ status: "active" })

          .eq("company_id", result.invitation.company_id)

          .eq("user_id", result.userId)

          .eq("status", "disabled")

          .select("user_id")

          .maybeSingle()

      if (membershipError || !enabledMembership) {
        const failures = await rollbackRelink()

        console.error(
          "Staff relink membership activation failed",
          membershipError,
        )

        return NextResponse.json(
          {
            error: failures.length
              ? "Unable to restore the account safely. Contact support."
              : "Unable to restore this company's access.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      membershipEnabled = true

      if (profile?.must_change_password) {
        const { error } = await result.admin

          .from("profiles")

          .update({ must_change_password: false })

          .eq("id", result.userId)

        if (error) {
          const failures = await rollbackRelink()

          console.error("Staff relink password flag update failed", error)

          return NextResponse.json(
            {
              error: failures.length
                ? "Unable to restore the account safely. Contact support."
                : "Unable to update the staff password requirement.",
            },

            { status: 500, headers: responseHeaders },
          )
        }

        profileUpdated = true
      }

      const { error: metadataError } =
        await result.admin.auth.admin.updateUserById(
          result.userId,

          {
            app_metadata: {
              ...originalAppMetadata,

              workspace_invite_pending: false,

              workspace_invite_revoked: false,

              workspace_account_unlinked: false,

              workspace_relink_requested_by: null,

              workspace_relink_company_id: null,
            },
          },
        )

      if (metadataError) {
        const failures = await rollbackRelink()

        console.error("Staff relink metadata update failed", metadataError)

        return NextResponse.json(
          {
            error: failures.length
              ? "Unable to restore the account safely. Contact support."
              : "Unable to finish relinking the staff account.",
          },

          { status: 500, headers: responseHeaders },
        )
      }

      metadataUpdated = true

      const { data: acceptedInvitation, error: acceptanceError } =
        await result.admin

          .from("workspace_invitations")

          .update({ accepted_at: new Date().toISOString() })

          .eq("id", invitationId)

          .eq("user_id", result.userId)

          .is("accepted_at", null)

          .gt("expires_at", new Date().toISOString())

          .select("id")

          .maybeSingle()

      if (acceptanceError || !acceptedInvitation) {
        const failures = await rollbackRelink()

        console.error(
          "Staff relink invitation acceptance failed",
          acceptanceError,
        )

        return NextResponse.json(
          {
            error: failures.length
              ? "Unable to restore the account safely. Contact support."
              : "This invitation expired before it could be completed. Ask the company administrator to send a new one.",
          },

          { status: 410, headers: responseHeaders },
        )
      }

      return NextResponse.json({ success: true }, { headers: responseHeaders })
    }

    const { error: metadataError } =
      await result.admin.auth.admin.updateUserById(result.userId, {
        app_metadata: {
          ...authUser.user.app_metadata,

          workspace_invite_pending: false,

          workspace_invite_revoked: false,
        },
      })

    if (metadataError) {
      console.error(
        "Workspace invitation metadata update failed",
        metadataError,
      )

      return NextResponse.json(
        { error: "Unable to complete this invitation." },
        { status: 500, headers: responseHeaders },
      )
    }

    const { data, error } = await result.admin

      .from("workspace_invitations")

      .update({ accepted_at: new Date().toISOString() })

      .eq("id", invitationId)

      .eq("user_id", result.userId)

      .is("accepted_at", null)

      .gt("expires_at", new Date().toISOString())

      .select("id")

      .maybeSingle()

    if (error || !data) {
      const { error: restoreMetadataError } =
        await result.admin.auth.admin.updateUserById(result.userId, {
          app_metadata: {
            ...authUser.user.app_metadata,

            workspace_invite_pending: true,
          },
        })

      if (restoreMetadataError)
        console.error(
          "Workspace invitation metadata rollback failed",
          restoreMetadataError,
        )

      return NextResponse.json(
        {
          error:
            "This invitation expired before it could be completed. Ask the company administrator to send a new one.",
        },
        { status: 410, headers: responseHeaders },
      )
    }

    return NextResponse.json({ success: true }, { headers: responseHeaders })
  } catch (error) {
    console.error("Workspace invitation acceptance failed", error)

    return NextResponse.json({ error: "Unable to complete this invitation." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}
