import { NextResponse } from "next/server"

import {
  getProjectAccess,
  getProjectAssignmentContext,
  hasProjectPermission,
  listProjectAccounts,
  listProjectCounterparties,
  projectToDatabase,
  parseProjectInput,
  resolveProjectSource,
} from "@/lib/server/projects"

export const runtime = "nodejs"

const responseHeaders = { "Cache-Control": "private, no-store" }

export async function GET() {
  try {
    const access = await getProjectAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    if (!(await hasProjectPermission(access, "projects.view"))) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to view projects. Apply the latest Supabase migration if project setup is incomplete.",
        },
        { status: 403, headers: responseHeaders },
      )
    }

    const [{ data, error }, assignmentContext] = await Promise.all([
      access.supabase

        .from("projects")

        .select("*")

        .eq("company_id", access.companyId)

        .order("created_at", { ascending: false }),

      getProjectAssignmentContext(access),
    ])

    if (error) {
      console.error("Project list query failed", error)

      return NextResponse.json({ error: "Unable to load projects." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    const [
      canCreate,

      canEdit,

      canDelete,

      canChangeStatus,

      canAssign,

      canViewFull,
    ] = await Promise.all([
      hasProjectPermission(access, "projects.create"),

      hasProjectPermission(access, "projects.edit"),

      hasProjectPermission(access, "projects.delete"),

      hasProjectPermission(access, "projects.status"),

      hasProjectPermission(access, "projects.assign"),

      hasProjectPermission(access, "projects.view_full"),
    ])

    const canReadFullProjectData = canViewFull

    const handlerNameById = new Map(
      assignmentContext.handlers.map((handler) => [handler.id, handler.name]),
    )

    const staffById = new Map(
      assignmentContext.staff.map((staff) => [staff.id, staff]),
    )

    const accountOptions = canCreate
      ? (await listProjectAccounts(access)).map(({ id, name }) => ({
          id,
          name,
        }))
      : []

    const counterparties =
      canCreate || canEdit
        ? await listProjectCounterparties(access)
        : { contractors: [], partners: [] }

    return NextResponse.json(
      {
        projects: (data ?? []).map((project) => {
          const project_manager_name =
            (project.project_manager_user_id &&
              handlerNameById.get(project.project_manager_user_id)) ||
            ""

          const assigned_staff_name =
            (project.assigned_staff_id &&
              staffById.get(project.assigned_staff_id)?.name) ||
            ""

          const can_assign_staff =
            assignmentContext.isChairman ||
            canAssign

          if (canReadFullProjectData) {
            return {
              ...project,

              project_manager_name,

              assigned_staff_name,

              can_assign_staff,
            }
          }

          return {
            id: project.id,

            project_name: project.project_name,

            project_manager_user_id: project.project_manager_user_id,

            project_manager_name,

            assigned_staff_id: project.assigned_staff_id,

            assigned_staff_name,

            can_assign_staff,

            project_source_type: project.project_source_type,

            partner_id: project.partner_id,

            partner_service_charge: 0,

            contractor_name: project.contractor_name,

            country: project.country,

            salary_range: project.salary_range,

            age_bracket: project.age_bracket,

            total_demand: project.total_demand,

            contractor_service_charge: 0,

            candidate_service_charge: project.candidate_service_charge,

            account_id: "",

            interview_mode: "Direct submission",

            status: project.status,

            submitted_count: project.submitted_count,

            visa_count: project.visa_count,

            ticket_count: project.ticket_count,
          }
        }),

        accountOptions,

        contractorOptions: counterparties.contractors,

        partnerOptions: counterparties.partners,

        projectHandlerOptions:
          (assignmentContext.isChairman || canAssign) && (canCreate || canEdit)
          ? assignmentContext.handlers
          : [],

        staffOptions:
          assignmentContext.assistantStaffEnabled &&
          (assignmentContext.isChairman || canAssign)
            ? assignmentContext.staff

                .filter((staff) => staff.status === "Active")

                .map(({ id, name, position, status }) => ({ id, name, position, status }))
            : [],

        assistantStaffEnabled: assignmentContext.assistantStaffEnabled,

        permissions: {
          canCreate,

          canEdit,

          canDelete,

          canChangeStatus,

          canViewFull,

          canManageManagers: assignmentContext.isChairman || canAssign,

          canAssignStaff:
            assignmentContext.isChairman || canAssign,
        },
      },
      { headers: responseHeaders },
    )
  } catch (error) {
    console.error("Project list request failed", error)

    return NextResponse.json({ error: "Project data is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}

export async function POST(request: Request) {
  try {
    const access = await getProjectAccess()

    if ("error" in access)
      return NextResponse.json({ error: access.error }, {
        status: access.status,
        headers: responseHeaders,
      })

    if (!(await hasProjectPermission(access, "projects.create")))
      return NextResponse.json(
        { error: "You do not have permission to create projects." },
        { status: 403, headers: responseHeaders },
      )

    const body = (await request
      .json()
      .catch(() => null)) as Record<string, unknown> | null

    const input = parseProjectInput(body)

    if (!input)
      return NextResponse.json(
        { error: "Enter valid project details and at least one vacancy." },
        { status: 400, headers: responseHeaders },
      )

    const assignmentContext = await getProjectAssignmentContext(access)

    const source = await resolveProjectSource(access, input)

    if ("error" in source)
      return NextResponse.json(
        { error: source.error },
        { status: 400, headers: responseHeaders },
      )

    const requestedHandlerProperty = body && (
      "projectHandlerId" in body || "projectManagerId" in body
    )
    const canAssignHandler =
      assignmentContext.isChairman ||
      await hasProjectPermission(access, "projects.assign")

    if (requestedHandlerProperty && !canAssignHandler) {
      return NextResponse.json(
        { error: "You do not have permission to assign a Project Handler." },

        { status: 403, headers: responseHeaders },
      )
    }

    const requestedHandlerId =
      typeof body?.projectHandlerId === "string"
        ? body.projectHandlerId
        : typeof body?.projectManagerId === "string"
          ? body.projectManagerId
          : ""

    if (
      requestedHandlerId &&
      !assignmentContext.handlers.some(
        (handler) => handler.id === requestedHandlerId,
      )
    ) {
      return NextResponse.json(
        { error: "Select an active company member as Project Handler." },

        { status: 400, headers: responseHeaders },
      )
    }

    const account = (await listProjectAccounts(access)).find(
      ({ id }) => id === input.accountId,
    )

    if (!account) {
      return NextResponse.json(
        { error: "Select an active company account available to your branch." },
        { status: 400, headers: responseHeaders },
      )
    }

    const { data, error } = await access.supabase
      .from("projects")
      .insert({
        ...projectToDatabase(source.input, account.branch_id),

        company_id: access.companyId,

        created_by: access.userId,

        project_manager_user_id: requestedHandlerId || null,
      })
      .select("*")
      .single()

    if (error || !data) {
      console.error("Project creation failed", error)

      return NextResponse.json({ error: "Unable to create this project." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    return NextResponse.json({ project: data }, {
      status: 201,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Project creation request failed", error)

    return NextResponse.json({ error: "Project creation is unavailable." }, {
      status: 503,
      headers: responseHeaders,
    })
  }
}
