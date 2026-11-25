import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { normalizeUgandanPhone, sendSmsUg } from "@/lib/server/smsug"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const smsTitle = "Candidate Update"

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

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

      .select("id, first_name, last_name, phone, agent_id, agent_user_id")

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

    const assignedRosterIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.agent_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const assignedUserIds = [
      ...new Set(
        candidates
          .map((candidate) => candidate.agent_user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    const admin = createAdminClient()
    if (!admin) {
      return NextResponse.json(
        {
          error:
            "Agent message delivery requires SUPABASE_SERVICE_ROLE_KEY on the server.",
          smsSent: true,
          retryable: false,
        },
        { status: 503, headers },
      )
    }

    const [rosterById, rosterByUser] = await Promise.all([
      assignedRosterIds.length
        ? admin
            .from("company_recruitment_agents")
            .select("id, name, phone, linked_user_id")
            .eq("company_id", membership.company_id)
            .eq("status", "active")
            .in("id", assignedRosterIds)
        : Promise.resolve({ data: [], error: null }),
      assignedUserIds.length
        ? admin
            .from("company_recruitment_agents")
            .select("id, name, phone, linked_user_id")
            .eq("company_id", membership.company_id)
            .eq("status", "active")
            .in("linked_user_id", assignedUserIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (rosterById.error || rosterByUser.error)
      throw rosterById.error ?? rosterByUser.error
    const agents = [
      ...new Map(
        [...(rosterById.data ?? []), ...(rosterByUser.data ?? [])].map(
          (agent) => [agent.id, agent],
        ),
      ).values(),
    ]
    const agentByIdentity = new Map<string, typeof agents[number]>()
    for (const agent of agents) {
      agentByIdentity.set(agent.id, agent)
      if (agent.linked_user_id) agentByIdentity.set(agent.linked_user_id, agent)
    }

    const candidateNamesByAgent = new Map<string, string[]>()
    const candidateIdsByAgent = new Map<string, string[]>()
    for (const candidate of candidates) {
      const identity = candidate.agent_id ?? candidate.agent_user_id
      const agent = identity ? agentByIdentity.get(identity) : undefined
      if (!agent) continue
      candidateNamesByAgent.set(agent.id, [
        ...(candidateNamesByAgent.get(agent.id) ?? []),
        `${candidate.first_name} ${candidate.last_name}`.trim(),
      ])
      candidateIdsByAgent.set(agent.id, [
        ...(candidateIdsByAgent.get(agent.id) ?? []),
        candidate.id,
      ])
    }

    let notesSent = 0
    const linkedUserIds = agents
      .map((agent) => agent.linked_user_id)
      .filter((id): id is string => Boolean(id))
    if (linkedUserIds.length) {
      const { data: agentMemberships, error: agentMembershipError } =
        await supabase
          .from("company_memberships")
          .select("user_id, role_id")
          .eq("company_id", membership.company_id)
          .eq("status", "active")
          .in("user_id", linkedUserIds)
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
            (role) => role.name.trim().toLowerCase() === "recruitment agent",
          )
          .map((role) => role.id),
      )
      const activeAgentIds = (agentMemberships ?? [])
        .filter((item) => agentRoleIds.has(item.role_id))
        .map((item) => item.user_id)
      const noteRows = activeAgentIds.flatMap((recipientId) => {
        const agent = agents.find((item) => item.linked_user_id === recipientId)
        if (!agent) return []
        const candidateNames = candidateNamesByAgent.get(agent.id) ?? []
        return [
          {
            company_id: membership.company_id,
            request_id: body.requestId as string,
            sender_id: user.id,
            recipient_id: recipientId,
            subject: `Update for ${candidateNames.length} candidate${
              candidateNames.length === 1 ? "" : "s"
            }`,
            body: message,
            candidate_ids: candidateIdsByAgent.get(agent.id) ?? [],
            candidate_names: candidateNames,
          },
        ]
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
                "The SMS was sent, but linked-agent notes could not be delivered. Retry to finish delivery without resending the candidate SMS.",
              smsSent: true,
              retryable: true,
            },
            { status: 503, headers },
          )
        }
        notesSent = noteRows.length
      }
    }

    let agentSmsSent = 0
    const agentMessageFailures: string[] = []
    for (const agent of agents.filter(
      (item) => !item.linked_user_id && candidateNamesByAgent.has(item.id),
    )) {
      const phone = normalizeUgandanPhone(agent.phone ?? "")
      const names = candidateNamesByAgent.get(agent.id) ?? []
      if (!phone) {
        agentMessageFailures.push(
          `${agent.name}: a valid phone number is required for SMS messages.`,
        )
        continue
      }
      let noteBody = `Company update for ${agent.name}: ${names.slice(0, 8).join(", ")}`
      if (names.length > 8) noteBody += ` and ${names.length - 8} more`
      noteBody += `. Candidate SMS: ${message}`
      noteBody = noteBody.slice(0, 480)

      const { data: existing, error: existingError } = await admin
        .from("company_agent_messages")
        .select("id, provider_status, sms_request_id")
        .eq("company_id", membership.company_id)
        .eq("request_id", body.requestId as string)
        .eq("agent_id", agent.id)
        .maybeSingle()
      if (existingError) throw existingError
      if (existing?.provider_status === "sent") {
        agentSmsSent += 1
        continue
      }
      if (
        existing &&
        (existing.provider_status === "sending" ||
          existing.provider_status === "unknown")
      ) {
        agentMessageFailures.push(
          `${agent.name}: SMS delivery is uncertain; check Sent Messages before retrying.`,
        )
        continue
      }

      const messageRow = {
        company_id: membership.company_id,
        agent_id: agent.id,
        request_id: body.requestId as string,
        sender_id: user.id,
        recipient_name: agent.name,
        recipient_phone: phone,
        subject: "Candidate Update",
        body: noteBody,
        candidate_ids: candidateIdsByAgent.get(agent.id) ?? [],
        candidate_names: names,
        provider_status: "sending",
        provider_error: null,
      }
      const claim = existing
        ? await admin
            .from("company_agent_messages")
            .update(messageRow)
            .eq("id", existing.id)
            .eq("provider_status", "failed")
            .select("id, sms_request_id")
            .maybeSingle()
        : await admin
            .from("company_agent_messages")
            .insert(messageRow)
            .select("id, sms_request_id")
            .maybeSingle()
      if (claim.error || !claim.data) {
        agentMessageFailures.push(
          `${agent.name}: unable to claim the message for delivery.`,
        )
        continue
      }

      const { error: smsLogError } = await admin
        .from("sms_message_logs")
        .upsert(
          {
            company_id: membership.company_id,
            request_id: claim.data.sms_request_id,
            created_by: user.id,
            title: "Agent Update",
            message: noteBody,
            contacts: [phone],
            contact_name: agent.name,
            contact_type: "Other",
            candidate_ids: candidateIdsByAgent.get(agent.id) ?? [],
            provider_status: "sending",
            provider_error: null,
            provider_token: null,
            recipients: null,
            cost: null,
            balance: null,
          },
          { onConflict: "company_id,request_id" },
        )
      if (smsLogError) {
        await admin
          .from("company_agent_messages")
          .update({
            provider_status: "failed",
            provider_error: "Unable to record the agent SMS before delivery.",
          })
          .eq("id", claim.data.id)
        agentMessageFailures.push(
          `${agent.name}: unable to record the SMS before delivery.`,
        )
        continue
      }

      const smsResult = await sendSmsUg("Agent Update", noteBody, [phone])
      const providerStatus = smsResult.ok
        ? "sent"
        : smsResult.code === "sms_network_error" ||
            smsResult.code === "sms_not_configured"
          ? "unknown"
          : "failed"
      const { error: messageUpdateError } = await admin
        .from("company_agent_messages")
        .update({
          provider_status: providerStatus,
          provider_error: smsResult.ok ? null : smsResult.message,
          provider_token: smsResult.ok ? smsResult.token : null,
          cost: smsResult.ok ? smsResult.cost : null,
          balance: smsResult.ok ? smsResult.balance : null,
        })
        .eq("id", claim.data.id)
        .eq("company_id", membership.company_id)
      const { error: smsReceiptError } = await admin
        .from("sms_message_logs")
        .update({
          provider_status: providerStatus,
          provider_error: smsResult.ok ? null : smsResult.message,
          provider_token: smsResult.ok ? smsResult.token : null,
          recipients: smsResult.ok ? smsResult.recipients : null,
          cost: smsResult.ok ? smsResult.cost : null,
          balance: smsResult.ok ? smsResult.balance : null,
        })
        .eq("company_id", membership.company_id)
        .eq("request_id", claim.data.sms_request_id)
      if (messageUpdateError) {
        console.error(
          "Agent SMS was sent but its receipt could not be saved",
          messageUpdateError,
        )
        agentMessageFailures.push(
          `${agent.name}: SMS was sent but its receipt could not be saved.`,
        )
        continue
      }
      if (smsReceiptError) {
        console.error(
          "Agent SMS history receipt could not be saved",
          smsReceiptError,
        )
        agentMessageFailures.push(
          `${agent.name}: SMS result could not be saved to Sent Messages.`,
        )
        continue
      }
      if (!smsResult.ok) {
        agentMessageFailures.push(`${agent.name}: ${smsResult.message}`)
        continue
      }
      agentSmsSent += 1
    }

    if (agentMessageFailures.length) {
      return NextResponse.json(
        {
          error: `The candidate SMS was sent, but some accountless agent messages need attention: ${agentMessageFailures.join(" ")}`,
          smsSent: true,
          retryable: true,
          agentsNotified: notesSent + agentSmsSent,
        },
        { status: 503, headers },
      )
    }

    return NextResponse.json(
      {
        ok: true,

        recipients: contacts.length,

        agentsNotified: notesSent + agentSmsSent,

        agentsNotifiedBySms: agentSmsSent,

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
