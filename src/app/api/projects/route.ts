import { NextResponse } from "next/server"

import {
  getProjectAccess,
  getProjectAssignmentContext,
  hasProjectPermission,
  listProjectAccounts,
  projectToDatabase,
  parseProjectInput,
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

    const managerNameById = new Map(
      assignmentContext.managers.map((manager) => [manager.id, manager.name]),
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

    return NextResponse.json(
      {
        projects: (data ?? []).map((project) => {
          const project_manager_name =
            (project.project_manager_user_id &&
              managerNameById.get(project.project_manager_user_id)) ||
            ""

          const assigned_staff_name =
            (project.assigned_staff_id &&
              staffById.get(project.assigned_staff_id)?.name) ||
            ""

          const can_assign_staff =
            assignmentContext.isChairman ||
            (canAssign &&
              assignmentContext.isProjectManager &&
              project.project_manager_user_id === access.userId)

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

        managerOptions: assignmentContext.isChairman
          ? assignmentContext.managers
          : [],

        staffOptions:
          assignmentContext.isChairman ||
          (canAssign && assignmentContext.isProjectManager)
            ? assignmentContext.staff

                .filter((staff) => staff.status === "Active")

                .map(({ id, name, position }) => ({ id, name, position }))
            : [],

        permissions: {
          canCreate,

          canEdit,

          canDelete,

          canChangeStatus,

          canViewFull,

          canManageManagers: assignmentContext.isChairman,

          canAssignStaff:
            assignmentContext.isChairman ||
            (canAssign && assignmentContext.isProjectManager),
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

    if (body && "projectManagerId" in body && !assignmentContext.isChairman) {
      return NextResponse.json(
        { error: "Only the Chairman can assign a Projects Manager." },

        { status: 403, headers: responseHeaders },
      )
    }

    const requestedManagerId =
      typeof body?.projectManagerId === "string" ? body.projectManagerId : ""

    if (
      assignmentContext.isChairman &&
      assignmentContext.managers.length > 0 &&
      !requestedManagerId
    ) {
      return NextResponse.json(
        { error: "Select a Projects Manager for this project." },

        { status: 400, headers: responseHeaders },
      )
    }

    if (
      requestedManagerId &&
      !assignmentContext.managers.some(
        (manager) => manager.id === requestedManagerId,
      )
    ) {
      return NextResponse.json(
        { error: "Select an active Projects Manager from this company." },

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
        ...projectToDatabase(input, account.branch_id),

        company_id: access.companyId,

        created_by: access.userId,

        project_manager_user_id: requestedManagerId || null,
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
