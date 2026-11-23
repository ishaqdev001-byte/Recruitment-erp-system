import { createClient } from "@supabase/supabase-js"

import { NextResponse } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

const workflowKeys = [
  "expense_request",

  "linked_requisition",

  "standalone_requisition",

  "leave",
] as const

type WorkflowKey = typeof workflowKeys[number]

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

type WorkflowAccess = { error: string; status: 401 | 403 | 503 } | {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>

  admin: NonNullable<ReturnType<typeof createAdminClient>>

  companyId: string

  canManage: boolean
}

async function getAccess(): Promise<WorkflowAccess> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },

    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user)
    return { error: "Authentication required.", status: 401 as const }

  const { data: membership, error: membershipError } = await supabase

    .from("company_memberships")

    .select("company_id")

    .eq("user_id", user.id)

    .eq("status", "active")

    .limit(1)

    .maybeSingle()

  if (membershipError) {
    console.error("Workflow membership lookup failed", membershipError)

    return { error: "Unable to verify company access.", status: 503 as const }
  }

  if (!membership)
    return {
      error: "Active company membership not found.",

      status: 403 as const,
    }

  const admin = createAdminClient()

  if (!admin)
    return {
      error: "Workflow settings are unavailable on this server.",

      status: 503 as const,
    }

  const [{ data: company, error: companyError }, permissionResult] =
    await Promise.all([
      admin

        .from("companies")

        .select("primary_admin_user_id")

        .eq("id", membership.company_id)

        .maybeSingle(),

      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,

        requested_permission: "workflows.manage",
      }),
    ])

  if (companyError || !company || permissionResult.error) {
    console.error("Workflow settings access check failed", {
      companyError,

      permissionError: permissionResult.error,
    })

    return {
      error: "Unable to verify workflow-management access.",

      status: 503 as const,
    }
  }

  const canManage =
    company.primary_admin_user_id === user.id || Boolean(permissionResult.data)

  return {
    supabase,

    admin,

    companyId: membership.company_id,

    canManage,
  }
}

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },

    { status, headers: responseHeaders },
  )
}

export async function GET() {
  try {
    const access = await getAccess()

    if ("error" in access) return errorResponse(access.error, access.status)

    if (!access.canManage)
      return errorResponse(
        "You do not have permission to manage approval workflows.",

        403,
      )

    const [
      { data: workflows, error: workflowError },
      { data: roles, error: roleError },
    ] = await Promise.all([
      access.admin

        .from("company_approval_workflows")

        .select("id, workflow_key, name, updated_at")

        .eq("company_id", access.companyId)

        .order("workflow_key"),

      access.admin

        .from("company_roles")

        .select("id, name")

        .eq("company_id", access.companyId)

        .order("name"),
    ])

    if (workflowError || roleError) {
      console.error("Workflow settings lookup failed", {
        workflowError,

        roleError,
      })

      return errorResponse("Unable to load approval workflows.", 503)
    }

    const { data: stages, error: stageError } = await access.admin

      .from("company_approval_workflow_stages")

      .select(
        "id, workflow_id, workflow_key, stage_key, position, label, action_type, permission_code, role_ids, instructions",
      )

      .eq("company_id", access.companyId)

      .order("position")

    if (stageError) {
      console.error("Workflow stages lookup failed", stageError)

      return errorResponse("Unable to load workflow stages.", 503)
    }

    const roleIds = (roles ?? []).map((role) => role.id)

    const { data: rolePermissions, error: permissionError } = roleIds.length
      ? await access.admin

          .from("role_permissions")

          .select("role_id, permission_code")

          .eq("company_id", access.companyId)

          .in("role_id", roleIds)
      : { data: [], error: null }

    if (permissionError) {
      console.error("Workflow role permissions lookup failed", permissionError)

      return errorResponse("Unable to load role permissions.", 503)
    }

    const permissionsByRole = new Map<string, string[]>()

    for (const permission of rolePermissions ?? []) {
      const current = permissionsByRole.get(permission.role_id) ?? []

      current.push(permission.permission_code)

      permissionsByRole.set(permission.role_id, current)
    }

    return NextResponse.json(
      {
        canManage: access.canManage,

        workflows: (workflows ?? []).map((workflow) => ({
          ...workflow,

          stages: (stages ?? [])

            .filter((stage) => stage.workflow_id === workflow.id)

            .map((stage) => ({
              stageKey: stage.stage_key,

              label: stage.label,

              actionType: stage.action_type,

              permissionCode: stage.permission_code,

              roleIds: stage.role_ids ?? [],

              instructions: stage.instructions,
            })),
        })),

        roles: (roles ?? []).map((role) => ({
          ...role,

          permissionCodes: permissionsByRole.get(role.id) ?? [],
        })),
      },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Approval workflow GET failed", error)

    return errorResponse("Approval workflows are unavailable.", 503)
  }
}

export async function PUT(request: Request) {
  try {
    const access = await getAccess()

    if ("error" in access) return errorResponse(access.error, access.status)

    if (!access.canManage)
      return errorResponse(
        "You do not have permission to manage approval workflows.",

        403,
      )

    const body = (await request.json().catch(() => null)) as {
      workflowKey?: unknown

      name?: unknown

      stages?: unknown
    } | null

    if (
      !body ||
      typeof body.workflowKey !== "string" ||
      !workflowKeys.includes(body.workflowKey as WorkflowKey) ||
      typeof body.name !== "string" ||
      !Array.isArray(body.stages)
    )
      return errorResponse("Provide a valid workflow configuration.", 400)

    const { data, error } = await access.supabase.rpc(
      "save_company_approval_workflow",

      {
        requested_company_id: access.companyId,

        requested_workflow_key: body.workflowKey,

        requested_name: body.name,

        requested_steps: body.stages,
      },
    )

    if (error) {
      if (error.code === "42501") return errorResponse(error.message, 403)

      if (error.code === "22023") return errorResponse(error.message, 400)

      console.error("Workflow configuration save failed", error)

      return errorResponse("Unable to save the approval workflow.", 500)
    }

    return NextResponse.json(
      { ok: true, ...data as Record<string, unknown> },

      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Approval workflow PUT failed", error)

    return errorResponse("Approval workflow update is unavailable.", 503)
  }
}
