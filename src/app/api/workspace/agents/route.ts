import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { normalizeUgandanPhone } from "@/lib/server/smsug"

export const runtime = "nodejs"

const headers = { "Cache-Control": "private, no-store" }

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const usernamePattern = /^[a-zA-Z0-9._-]{3,80}$/

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function findAuthUserByEmail(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    })
    if (error) throw error
    const existingUser = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    )
    if (existingUser) return true
    if (data.users.length < 1000) return false
  }
}

async function removeProvisionedAgentAccount(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  companyId: string,
  userId: string,
) {
  const { error: membershipError } = await admin
    .from("company_memberships")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", userId)
  if (membershipError) {
    console.error("Agent account membership rollback failed", membershipError)
  }

  const { error: profileError } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId)
  if (profileError) {
    console.error("Agent account profile rollback failed", profileError)
  }

  const { error: userError } = await admin.auth.admin.deleteUser(userId)
  if (userError) {
    console.error("Agent auth account rollback failed", userError)
  }
}

async function provisionAgentAccount(options: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>
  companyId: string
  roleId: string
  branchId: string
  branchName: string
  name: string
  phone: string
  email: string
  password: string
}) {
  const {
    admin,
    companyId,
    roleId,
    branchId,
    branchName,
    name,
    phone,
    email,
    password,
  } = options
  if (await findAuthUserByEmail(admin, email)) {
    return {
      error: "That email already belongs to an account. Use a different email.",
      status: 409,
    } as const
  }

  const { data: createdAccount, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    })

  if (authError || !createdAccount.user) {
    return {
      error:
        "Unable to create the agent login. Check the email and password requirements.",
      status: 400,
    } as const
  }

  const authUser = createdAccount.user

  const { error: profileError } = await admin.from("profiles").upsert({
    id: authUser.id,
    display_name: name,
    phone,
    branch: branchName,
    must_change_password: true,
  })
  if (profileError) {
    await removeProvisionedAgentAccount(admin, companyId, authUser.id)
    throw profileError
  }

  const { error: membershipError } = await admin
    .from("company_memberships")
    .insert({
      company_id: companyId,
      user_id: authUser.id,
      role_id: roleId,
      branch_id: branchId,
      status: "active",
    })
  if (membershipError) {
    await removeProvisionedAgentAccount(admin, companyId, authUser.id)
    throw membershipError
  }

  return { userId: authUser.id } as const
}

async function getAccess() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id, role_id, branch_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError || !membership) {
    return {
      error: "Active company membership not found.",
      status: 403 as const,
    }
  }

  const [
    { data: company, error: companyError },

    { data: manageAgents, error: manageError },

    { data: viewUsers, error: viewError },

    { data: viewCandidates, error: viewCandidatesError },
  ] = await Promise.all([
    supabase

      .from("companies")

      .select("id, name, slug, primary_admin_user_id")

      .eq("id", membership.company_id)

      .maybeSingle(),

    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,

      requested_permission: "agents.manage",
    }),

    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,

      requested_permission: "users.view",
    }),

    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,

      requested_permission: "candidates.view",
    }),
  ])

  if (
    companyError ||
    manageError ||
    viewError ||
    viewCandidatesError ||
    !company
  ) {
    return { error: "Unable to verify agent access.", status: 503 as const }
  }

  const isPrimaryAdmin = company.primary_admin_user_id === user.id

  let isMainBranch = isPrimaryAdmin

  if (!isPrimaryAdmin) {
    const { data, error } = await supabase.rpc(
      "current_user_is_main_branch_user",
      {
        requested_company_id: membership.company_id,
      },
    )

    if (error)
      return {
        error: "Unable to verify your company branch.",
        status: 503 as const,
      }

    isMainBranch = Boolean(data)
  }

  if (!isPrimaryAdmin && !isMainBranch && !membership.branch_id) {
    return {
      error: "Your account must be assigned to a branch to manage agents.",
      status: 403 as const,
    }
  }

  const canManage = isPrimaryAdmin || Boolean(manageAgents)

  const canView = isPrimaryAdmin || Boolean(viewUsers) || canManage

  if (!canView)
    return {
      error: "You do not have permission to view agents.",
      status: 403 as const,
    }

  const admin = createAdminClient()

  if (!admin)
    return {
      error:
        "Agent management requires SUPABASE_SERVICE_ROLE_KEY on the server.",
      status: 503 as const,
    }

  return {
    supabase,

    admin,

    userId: user.id,

    company,

    companyId: membership.company_id,

    branchId: membership.branch_id as string | null,

    isPrimaryAdmin,

    isMainBranch,

    canManage,

    canViewCandidates: isPrimaryAdmin || Boolean(viewCandidates),

    canResetPasswords: isPrimaryAdmin,
  }
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })
    }

    let agentsQuery = access.admin

      .from("company_recruitment_agents")

      .select(
        "id, agent_code, name, username, email, phone, branch_id, linked_user_id, status",
      )

      .eq("company_id", access.companyId)

      .order("name")

    if (!access.isMainBranch && !access.isPrimaryAdmin && access.branchId) {
      agentsQuery = agentsQuery.eq("branch_id", access.branchId)
    }

    let branchQuery = access.admin

      .from("company_branches")

      .select("id, name, code, is_main_branch")

      .eq("company_id", access.companyId)

      .eq("status", "active")

      .order("name")

    if (!access.isMainBranch && !access.isPrimaryAdmin && access.branchId) {
      branchQuery = branchQuery.eq("id", access.branchId)
    }

    const [
      { data: agentRows, error: agentsError },
      { data: branchRows, error: branchesError },
    ] = await Promise.all([agentsQuery, branchQuery])

    if (agentsError || branchesError) throw agentsError ?? branchesError

    return NextResponse.json(
      {
        agents: (agentRows ?? []).map((agent) => ({
          id: agent.id,

          agentCode: agent.agent_code,

          name: agent.name,

          username: agent.username,

          email: agent.email ?? "",

          phone: agent.phone ?? "",

          branchId: agent.branch_id,

          linkedUserId: agent.linked_user_id,

          hasAccount: Boolean(agent.linked_user_id),

          status: agent.status,

          branch:
            branchRows?.find((branch) => branch.id === agent.branch_id)?.name ??
            "",
        })),

        branches: (branchRows ?? []).map((branch) => ({
          id: branch.id,

          name: branch.name,

          code: branch.code,

          isMainBranch: branch.is_main_branch,
        })),

        canManageAgents: access.canManage,

        canViewCandidates: access.canViewCandidates,

        canResetPasswords: access.canResetPasswords,
      },

      { headers },
    )
  } catch (error) {
    console.error("Agent roster lookup failed", error)

    return NextResponse.json({ error: "Unable to load company agents." }, {
      status: 503,
      headers,
    })
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access) {
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers,
      })
    }

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const action = typeof body?.action === "string" ? body.action : ""

    if (action === "reset-password") {
      if (!access.canResetPasswords) {
        return NextResponse.json(
          { error: "Only the Chairman can reset an agent password." },
          { status: 403, headers },
        )
      }

      const agentId = typeof body?.agentId === "string" ? body.agentId : ""

      const password = typeof body?.password === "string" ? body.password : ""

      if (
        !uuidPattern.test(agentId) ||
        password.length < 8 ||
        password.length > 72
      ) {
        return NextResponse.json(
          {
            error:
              "Choose an agent and enter a password between 8 and 72 characters.",
          },
          { status: 400, headers },
        )
      }

      const { data: agent, error } = await access.admin

        .from("company_recruitment_agents")

        .select("id, linked_user_id")

        .eq("id", agentId)

        .eq("company_id", access.companyId)

        .maybeSingle()

      if (error) throw error

      if (!agent?.linked_user_id) {
        return NextResponse.json(
          { error: "This agent does not have a linked account." },
          { status: 409, headers },
        )
      }

      const { error: updateError } =
        await access.admin.auth.admin.updateUserById(
          agent.linked_user_id,

          { password },
        )

      if (updateError) throw updateError

      const { error: profileError } = await access.admin

        .from("profiles")

        .update({ must_change_password: true })

        .eq("id", agent.linked_user_id)

      if (profileError) throw profileError

      return NextResponse.json({ ok: true }, { headers })
    }

    if (!access.canManage) {
      return NextResponse.json(
        { error: "You do not have permission to manage agents." },
        { status: 403, headers },
      )
    }

    if (action === "create") {
      const name = typeof body?.name === "string" ? body.name.trim() : ""

      const username =
        typeof body?.username === "string"
          ? body.username.trim().toLowerCase()
          : ""

      const email =
        typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

      const phoneInput =
        typeof body?.phone === "string" ? body.phone.trim() : ""

      const phone = normalizeUgandanPhone(phoneInput)

      const branchId = typeof body?.branchId === "string" ? body.branchId : ""
      const createLogin = body?.createLogin === true
      const password = typeof body?.password === "string" ? body.password : ""

      if (
        !name ||
        name.length > 200 ||
        !usernamePattern.test(username) ||
        (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200)) ||
        (createLogin && !email) ||
        (createLogin && (password.length < 8 || password.length > 72)) ||
        !phone ||
        !uuidPattern.test(branchId)
      ) {
        return NextResponse.json(
          {
            error: createLogin
              ? "Enter the agent’s email and a password between 8 and 72 characters."
              : "Enter a valid agent name, username, phone, email, and branch.",
          },
          { status: 400, headers },
        )
      }

      if (
        !access.isMainBranch &&
        !access.isPrimaryAdmin &&
        branchId !== access.branchId
      ) {
        return NextResponse.json(
          { error: "You can only add agents to your assigned branch." },
          { status: 403, headers },
        )
      }

      const { data: branch, error: branchError } = await access.admin

        .from("company_branches")

        .select("id, name")

        .eq("id", branchId)

        .eq("company_id", access.companyId)

        .eq("status", "active")

        .maybeSingle()

      if (branchError) throw branchError

      if (!branch)
        return NextResponse.json(
          { error: "Choose an active branch in this company." },
          { status: 400, headers },
        )

      let agentRoleId = ""
      if (createLogin) {
        const { data: role, error: roleError } = await access.admin
          .from("company_roles")
          .select("id")
          .eq("company_id", access.companyId)
          .ilike("name", "Recruitment Agent")
          .limit(1)
          .maybeSingle()
        if (roleError) throw roleError
        if (!role) {
          return NextResponse.json(
            {
              error:
                "The Recruitment Agent role is not configured for this company.",
            },
            { status: 409, headers },
          )
        }
        agentRoleId = role.id
      }

      const { data: agent, error } = await access.admin

        .from("company_recruitment_agents")

        .insert({
          company_id: access.companyId,

          name,

          username,

          email: email || null,

          phone,

          branch_id: branchId,

          created_by: access.userId,
        })

        .select("id")

        .single()

      if (error?.code === "23505") {
        return NextResponse.json(
          {
            error: "That username is already used by an agent in this company.",
          },
          { status: 409, headers },
        )
      }

      if (error || !agent)
        throw error ?? new Error("Agent record could not be created.")

      if (createLogin) {
        const provisioned = await provisionAgentAccount({
          admin: access.admin,
          companyId: access.companyId,
          roleId: agentRoleId,
          branchId,
          branchName: branch.name,
          name,
          phone,
          email,
          password,
        })
        if ("error" in provisioned) {
          const { error: deleteError } = await access.admin
            .from("company_recruitment_agents")
            .delete()
            .eq("id", agent.id)
            .eq("company_id", access.companyId)
          if (deleteError) {
            console.error("Agent roster rollback failed", deleteError)
          }
          return NextResponse.json({ error: provisioned.error }, {
            status: provisioned.status,
            headers,
          })
        }

        const { error: linkError } = await access.admin
          .from("company_recruitment_agents")
          .update({
            linked_user_id: provisioned.userId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", agent.id)
          .eq("company_id", access.companyId)
          .is("linked_user_id", null)
        if (linkError) {
          await removeProvisionedAgentAccount(
            access.admin,
            access.companyId,
            provisioned.userId,
          )
          const { error: deleteError } = await access.admin
            .from("company_recruitment_agents")
            .delete()
            .eq("id", agent.id)
            .eq("company_id", access.companyId)
          if (deleteError) {
            console.error("Agent roster rollback failed", deleteError)
          }
          throw linkError
        }
      }

      return NextResponse.json({ agentId: agent.id, hasAccount: createLogin }, {
        status: 201,
        headers,
      })
    }

    const agentId = typeof body?.agentId === "string" ? body.agentId : ""

    if (!uuidPattern.test(agentId)) {
      return NextResponse.json({ error: "Select a valid agent." }, {
        status: 400,
        headers,
      })
    }

    const { data: agent, error: agentError } = await access.admin

      .from("company_recruitment_agents")

      .select(
        "id, name, username, email, phone, branch_id, linked_user_id, status",
      )

      .eq("id", agentId)

      .eq("company_id", access.companyId)

      .maybeSingle()

    if (agentError) throw agentError

    if (!agent)
      return NextResponse.json({ error: "Agent not found in this company." }, {
        status: 404,
        headers,
      })

    if (
      !access.isMainBranch &&
      !access.isPrimaryAdmin &&
      agent.branch_id !== access.branchId
    ) {
      return NextResponse.json(
        { error: "You can only manage agents in your assigned branch." },
        { status: 403, headers },
      )
    }

    if (action === "link-account") {
      const email =
        typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
      const password = typeof body?.password === "string" ? body.password : ""
      if (
        agent.status !== "active" ||
        agent.linked_user_id ||
        !/^\S+@\S+\.\S+$/.test(email) ||
        email.length > 200 ||
        password.length < 8 ||
        password.length > 72
      ) {
        return NextResponse.json(
          {
            error:
              "Choose an active accountless agent, enter a valid email, and set a password between 8 and 72 characters.",
          },
          { status: 400, headers },
        )
      }

      const [
        { data: branch, error: branchError },
        { data: role, error: roleError },
      ] = await Promise.all([
        access.admin
          .from("company_branches")
          .select("id, name")
          .eq("id", agent.branch_id)
          .eq("company_id", access.companyId)
          .eq("status", "active")
          .maybeSingle(),
        access.admin
          .from("company_roles")
          .select("id")
          .eq("company_id", access.companyId)
          .ilike("name", "Recruitment Agent")
          .limit(1)
          .maybeSingle(),
      ])
      if (branchError || roleError) throw branchError ?? roleError
      if (!branch || !role) {
        return NextResponse.json(
          {
            error:
              "The agent’s branch or Recruitment Agent role is unavailable.",
          },
          { status: 409, headers },
        )
      }

      const provisioned = await provisionAgentAccount({
        admin: access.admin,
        companyId: access.companyId,
        roleId: role.id,
        branchId: branch.id,
        branchName: branch.name,
        name: agent.name,
        phone: agent.phone ?? "",
        email,
        password,
      })
      if ("error" in provisioned) {
        return NextResponse.json({ error: provisioned.error }, {
          status: provisioned.status,
          headers,
        })
      }

      const { error: linkError } = await access.admin
        .from("company_recruitment_agents")
        .update({
          email,
          linked_user_id: provisioned.userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", agentId)
        .eq("company_id", access.companyId)
        .is("linked_user_id", null)
      if (linkError) {
        await removeProvisionedAgentAccount(
          access.admin,
          access.companyId,
          provisioned.userId,
        )
        throw linkError
      }

      return NextResponse.json({ ok: true, hasAccount: true }, {
        status: 201,
        headers,
      })
    }

    if (action === "update") {
      const name = typeof body?.name === "string" ? body.name.trim() : ""

      const username =
        typeof body?.username === "string"
          ? body.username.trim().toLowerCase()
          : ""

      const email =
        typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

      const phoneInput =
        typeof body?.phone === "string" ? body.phone.trim() : ""

      const phone = normalizeUgandanPhone(phoneInput)

      const branchId = typeof body?.branchId === "string" ? body.branchId : ""

      if (
        !name ||
        name.length > 200 ||
        !usernamePattern.test(username) ||
        (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200)) ||
        !phone ||
        !uuidPattern.test(branchId)
      ) {
        return NextResponse.json(
          { error: "Enter valid agent details and an active branch." },
          { status: 400, headers },
        )
      }

      if (
        agent.linked_user_id &&
        email &&
        email !== agent.email?.toLowerCase()
      ) {
        return NextResponse.json(
          {
            error:
              "A linked account's email can only be changed through Users & Roles.",
          },
          { status: 409, headers },
        )
      }

      if (
        !access.isMainBranch &&
        !access.isPrimaryAdmin &&
        branchId !== access.branchId
      ) {
        return NextResponse.json(
          { error: "You can only assign agents to your branch." },
          { status: 403, headers },
        )
      }

      const { data: branch, error: branchError } = await access.admin

        .from("company_branches")

        .select("id")

        .eq("id", branchId)

        .eq("company_id", access.companyId)

        .eq("status", "active")

        .maybeSingle()

      if (branchError) throw branchError

      if (!branch)
        return NextResponse.json(
          { error: "Choose an active branch in this company." },
          { status: 400, headers },
        )

      const { error } = await access.admin

        .from("company_recruitment_agents")

        .update({
          name,

          username,

          email: agent.linked_user_id ? agent.email : email || null,

          phone,

          branch_id: branchId,

          updated_at: new Date().toISOString(),
        })

        .eq("id", agentId)

        .eq("company_id", access.companyId)

      if (error?.code === "23505") {
        return NextResponse.json(
          {
            error: "That username is already used by an agent in this company.",
          },
          { status: 409, headers },
        )
      }

      if (error) throw error

      return NextResponse.json({ ok: true }, { headers })
    }

    if (action === "status") {
      const status = body?.status

      if (status !== "active" && status !== "disabled") {
        return NextResponse.json(
          { error: "Choose an active or inactive status." },
          { status: 400, headers },
        )
      }

      const { error: updateError } = await access.admin

        .from("company_recruitment_agents")

        .update({ status, updated_at: new Date().toISOString() })

        .eq("id", agentId)

        .eq("company_id", access.companyId)

      if (updateError) throw updateError

      if (agent.linked_user_id) {
        const { error: membershipError } = await access.admin

          .from("company_memberships")

          .update({ status })

          .eq("company_id", access.companyId)

          .eq("user_id", agent.linked_user_id)

        if (membershipError) throw membershipError
      }

      return NextResponse.json({ ok: true }, { headers })
    }

    if (action === "delete") {
      if (agent.linked_user_id) {
        const { error: membershipError } = await access.admin

          .from("company_memberships")

          .update({ status: "disabled" })

          .eq("company_id", access.companyId)

          .eq("user_id", agent.linked_user_id)

        if (membershipError) throw membershipError
      }

      const { error: candidateError } = await access.admin

        .from("candidates")

        .update({ agent_id: null, agent_user_id: null })

        .eq("company_id", access.companyId)

        .eq("agent_id", agentId)

      if (candidateError) throw candidateError

      const { error: inquiryError } = await access.admin

        .from("candidate_inquiries")

        .update({ agent_id: null, agent_user_id: null })

        .eq("company_id", access.companyId)

        .eq("agent_id", agentId)

      if (inquiryError) throw inquiryError

      const { error } = await access.admin

        .from("company_recruitment_agents")

        .delete()

        .eq("id", agentId)

        .eq("company_id", access.companyId)

      if (error) throw error

      return NextResponse.json({ ok: true }, { headers })
    }

    return NextResponse.json({ error: "Unsupported agent action." }, {
      status: 400,
      headers,
    })
  } catch (error) {
    console.error("Agent management request failed", error)

    return NextResponse.json({ error: "Unable to manage this agent." }, {
      status: 503,
      headers,
    })
  }
}
