import { NextResponse } from "next/server"

import { normalizeUgandanPhone, sendSmsUg } from "@/lib/server/smsug"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const smsTitle = "Candidate Update"

export async function POST(request: Request) {
  let smsSent = false
  let smsReceiptRecorded = false

  try {
    const supabase = await createSupabaseServerClient()

    const {
      data: { user },

      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user)
      return NextResponse.json(
        { error: "Authentication required." },

        { status: 401, headers },
      )

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, role_id")

      .eq("user_id", user.id)

      .eq("status", "active")

      .limit(1)

      .maybeSingle()

    if (membershipError || !membership)
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers },
      )

    const { data: role, error: roleError } = await supabase
      .from("company_roles")
      .select("name")
      .eq("company_id", membership.company_id)
      .eq("id", membership.role_id)
      .maybeSingle()
    if (roleError || !role)
      return NextResponse.json(
        { error: "Unable to verify your company role." },
        { status: 503, headers },
      )
    if (role.name.trim().toLocaleLowerCase() === "recruitment agent")
      return NextResponse.json(
        {
          error:
            "Recruitment Agents can view only their agent notes in Communications.",
        },
        { status: 403, headers },
      )

    const [candidatePermission, smsPermission] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "candidates.view",
      }),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "communications.sms.send",
      }),
    ])

    if (candidatePermission.error || smsPermission.error)
      return NextResponse.json(
        { error: "Unable to verify your SMS and candidate permissions." },

        { status: 503, headers },
      )

    if (!candidatePermission.data || !smsPermission.data)
      return NextResponse.json(
        { error: "You need candidate view and SMS send permissions." },

        { status: 403, headers },
      )

    const body = (await request.json().catch(() => null)) as {
      requestId?: unknown

      candidateIds?: unknown

      message?: unknown
    } | null

    if (
      typeof body?.requestId !== "string" ||
      !uuidPattern.test(body.requestId)
    )
      return NextResponse.json(
        { error: "Invalid SMS request ID." },

        { status: 400, headers },
      )

    if (
      typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.trim().length > 480
    )
      return NextResponse.json(
        { error: "Message must be between 1 and 480 characters." },

        { status: 400, headers },
      )

    if (
      !Array.isArray(body.candidateIds) ||
      body.candidateIds.length < 1 ||
      body.candidateIds.length > 3000 ||
      body.candidateIds.some(
        (candidateId) =>
          typeof candidateId !== "string" || !uuidPattern.test(candidateId),
      )
    )
      return NextResponse.json(
        { error: "Select between 1 and 3,000 valid candidates." },

        { status: 400, headers },
      )

    const candidateIds = [...new Set(body.candidateIds as string[])]

    const message = body.message.trim()

    const { data: candidates, error: candidatesError } = await supabase

      .from("candidates")

      .select("id, first_name, last_name, phone, agent_user_id")

      .eq("company_id", membership.company_id)

      .in("id", candidateIds)

    if (candidatesError) {
      console.error("Bulk candidate SMS lookup failed", candidatesError)

      return NextResponse.json(
        { error: "Unable to verify the selected candidates." },

        { status: 503, headers },
      )
    }

    if (!candidates || candidates.length !== candidateIds.length)
      return NextResponse.json(
        { error: "Some selected candidates are unavailable." },

        { status: 404, headers },
      )

    const missingPhone = candidates.find(
      (candidate) => !candidate.phone?.trim(),
    )

    if (missingPhone)
      return NextResponse.json(
        {
          error: `${missingPhone.first_name} ${missingPhone.last_name} has no registered phone number. Update the candidate before sending.`,
        },

        { status: 400, headers },
      )

    const contacts = [
      ...new Set(
        candidates.map((candidate) =>
          normalizeUgandanPhone(candidate.phone ?? ""),
        ),
      ),
    ].sort()

    if (contacts.some((phone) => !phone))
      return NextResponse.json(
        {
          error:
            "One or more selected candidates have an invalid phone number. Use a valid Ugandan mobile number before sending.",
        },

        { status: 400, headers },
      )

    const { data: claimed, error: claimError } = await supabase

      .from("sms_message_logs")

      .insert({
        company_id: membership.company_id,

        request_id: body.requestId,

        created_by: user.id,

        title: smsTitle,

        message,

        contacts,

        candidate_ids: candidateIds,

        contact_name: `Pipeline selection (${candidates.length})`,

        contact_type: "Candidate",

        provider_status: "sending",
      })

      .select("id")

      .maybeSingle()

    let alreadySent = false

    if (claimError?.code === "23505") {
      const { data: existing, error: existingError } = await supabase

        .from("sms_message_logs")

        .select("id, provider_status, message, contacts, candidate_ids")

        .eq("company_id", membership.company_id)

        .eq("request_id", body.requestId)

        .maybeSingle()

      if (existingError) throw existingError

      if (
        existing?.message !== message ||
        JSON.stringify([...(existing?.contacts ?? [])].sort()) !==
          JSON.stringify(contacts) ||
        JSON.stringify([...(existing?.candidate_ids ?? [])].sort()) !==
          JSON.stringify([...candidateIds].sort())
      )
        return NextResponse.json(
          {
            error:
              "This SMS request ID was already used for a different message or candidate selection.",
          },

          { status: 409, headers },
        )

      if (existing?.provider_status !== "sent")
        return NextResponse.json(
          {
            error:
              "This SMS request is already being processed or has an uncertain result. Check Sent Messages before retrying.",

            status: existing?.provider_status ?? "unknown",
          },

          { status: 409, headers },
        )
      alreadySent = true
      smsSent = true
      smsReceiptRecorded = true
    } else if (claimError || !claimed) {
      console.error("Bulk candidate SMS claim failed", claimError)

      return NextResponse.json(
        {
          error:
            "Unable to safely record this SMS request. No message was sent.",
        },

        { status: 503, headers },
      )
    }

    if (!alreadySent) {
      const smsResult = await sendSmsUg(smsTitle, message, contacts as string[])

      if (!smsResult.ok) {
        const providerStatus =
          smsResult.code === "sms_network_error" ||
          smsResult.code === "sms_not_configured"
            ? "unknown"
            : "failed"

        const { error: updateError } = await supabase

          .from("sms_message_logs")

          .update({
            provider_status: providerStatus,

            provider_error: smsResult.message,
          })

          .eq("id", claimed!.id)

          .eq("company_id", membership.company_id)

        if (updateError)
          console.error("Bulk candidate SMS status update failed", updateError)

        return NextResponse.json(
          {
            error: smsResult.message,

            code: smsResult.code,

            status: providerStatus,
          },

          { status: smsResult.status, headers },
        )
      }

      smsSent = true
      const { data: receipt, error: updateError } = await supabase
        .from("sms_message_logs")

        .update({
          provider_status: "sent",

          provider_token: smsResult.token,

          recipients: smsResult.recipients,

          cost: smsResult.cost,

          balance: smsResult.balance,
        })

        .eq("id", claimed!.id)

        .eq("company_id", membership.company_id)

        .select("id")

        .maybeSingle()

      if (updateError || !receipt) {
        console.error(
          "SMS sent but bulk candidate SMS receipt update failed",
          updateError,
        )
        return NextResponse.json(
          {
            error:
              "SMSUG accepted the SMS, but its receipt could not be saved. Check Sent Messages before taking further action.",
            smsSent: true,
            retryable: false,
          },
          { status: 503, headers },
        )
      }

      smsReceiptRecorded = true
    }

    const candidateNamesByAgent = new Map<string, string[]>()

    const candidateIdsByAgent = new Map<string, string[]>()

    for (const candidate of candidates) {
      if (!candidate.agent_user_id) continue

      const names = candidateNamesByAgent.get(candidate.agent_user_id) ?? []

      names.push(`${candidate.first_name} ${candidate.last_name}`.trim())

      candidateNamesByAgent.set(candidate.agent_user_id, names)

      const assignedIds = candidateIdsByAgent.get(candidate.agent_user_id) ?? []

      assignedIds.push(candidate.id)

      candidateIdsByAgent.set(candidate.agent_user_id, assignedIds)
    }

    let notesSent = 0

    if (candidateNamesByAgent.size) {
      const agentIds = [...candidateNamesByAgent.keys()]

      const { data: agentMemberships, error: agentMembershipError } =
        await supabase

          .from("company_memberships")

          .select("user_id, role_id")

          .eq("company_id", membership.company_id)

          .eq("status", "active")

          .in("user_id", agentIds)

      if (agentMembershipError) throw agentMembershipError

      const roleIds = [
        ...new Set((agentMemberships ?? []).map((item) => item.role_id)),
      ]

      const { data: roles, error: rolesError } = roleIds.length
        ? await supabase

            .from("company_roles")

            .select("id, name")

            .eq("company_id", membership.company_id)

            .in("id", roleIds)
        : { data: [], error: null }

      if (rolesError) throw rolesError

      const agentRoleIds = new Set(
        (roles ?? [])

          .filter(
            (role) =>
              role.name.trim().toLocaleLowerCase() === "recruitment agent",
          )

          .map((role) => role.id),
      )

      const activeAgentIds = (agentMemberships ?? [])

        .filter((item) => agentRoleIds.has(item.role_id))

        .map((item) => item.user_id)

      const noteRows = activeAgentIds.map((recipientId) => {
        const candidateNames = candidateNamesByAgent.get(recipientId) ?? []

        return {
          company_id: membership.company_id,

          request_id: body.requestId as string,

          sender_id: user.id,

          recipient_id: recipientId,

          subject: `Update for ${candidateNames.length} candidate${
            candidateNames.length === 1 ? "" : "s"
          }`,

          body: message,

          candidate_ids: candidateIdsByAgent.get(recipientId) ?? [],

          candidate_names: candidateNames,
        }
      })

      if (noteRows.length) {
        const { error: noteError } = await supabase

          .from("candidate_agent_notes")

          .upsert(noteRows, {
            onConflict: "company_id,request_id,recipient_id",

            ignoreDuplicates: true,
          })

        if (noteError) {
          console.error(
            "SMS sent but candidate agent notes could not be delivered",

            noteError,
          )

          return NextResponse.json(
            {
              error:
                "The SMS was sent, but agent notes could not be delivered. Retry this request to complete note delivery without resending the SMS.",

              smsSent: true,

              retryable: true,
            },

            { status: 503, headers },
          )
        }

        notesSent = noteRows.length
      }
    }

    return NextResponse.json(
      {
        ok: true,

        recipients: contacts.length,

        agentsNotified: notesSent,

        alreadySent,
      },

      { status: alreadySent ? 200 : 201, headers },
    )
  } catch (error) {
    console.error("Bulk candidate SMS request failed", error)

    return NextResponse.json(
      {
        error: smsSent
          ? "The SMS was sent, but agent note delivery could not be confirmed. Retry to complete note delivery without resending the SMS."
          : "Bulk candidate SMS is unavailable. Check Sent Messages before retrying.",
        ...(smsSent ? { smsSent: true, retryable: smsReceiptRecorded } : {}),
      },

      { status: 503, headers },
    )
  }
}
