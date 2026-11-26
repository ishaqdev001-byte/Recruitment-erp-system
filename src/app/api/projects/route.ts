import { NextResponse } from "next/server"

import {
  getProjectAccess,
  getProjectAssignmentContext,
  hasProjectPermission,
  listProjectAccounts,
  listProjectCounterparties,
  resolveProjectHandlerSelection,
  projectToDatabase,
  parseProjectInput,
  resolveProjectSource,
} from "@/lib/server/projects"

export const runtime = "nodejs"

// Cache projects list for 5 minutes to improve performance
// stale-while-revalidate allows showing cached data while fetching fresh data
const responseHeaders = {
  "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
}

export async function GET(request: Request) {
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

    // Parse pagination parameters from URL
    const url = new URL(request.url)
    const searchParams = url.searchParams
    const limitParam = searchParams.get("limit")
    const offsetParam = searchParams.get("offset")
    const cursor = searchParams.get("cursor")

    // Validate and parse limit (default 50, max 500)
    let limit = 50
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10)
      if (!Number.isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 500) {
        limit = parsedLimit
      }
    }

    // Validate and parse offset (default 0, ignored if cursor provided)
    let offset = 0
    if (!cursor && offsetParam) {
      const parsedOffset = parseInt(offsetParam, 10)
      if (!Number.isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset
      }
    }

    let projectsQuery = access.supabase
      .from("projects")
      .select("*", { count: "exact" })
      .eq("company_id", access.companyId)
      .order("created_at", { ascending: false })

    // Apply cursor-based or offset-based pagination
    if (cursor) {
      projectsQuery = projectsQuery.lt("created_at", cursor).limit(limit + 1)
    } else {
      projectsQuery = projectsQuery.range(offset, offset + limit - 1)
    }

    const [{ data, error, count: totalCount }, assignmentContext] = await Promise.all([
      projectsQuery,
      getProjectAssignmentContext(access),
    ])

    if (error) {
      console.error("Project list query failed", error)

      return NextResponse.json({ error: "Unable to load projects." }, {
        status: 500,
        headers: responseHeaders,
      })
    }

    let paginatedProjects = data ?? []
    let hasNextPage = false
    let nextCursor: string | null = null

    if (cursor) {
      // For cursor-based pagination, we fetched limit + 1 to check if there are more
      if (paginatedProjects.length > limit) {
        hasNextPage = true
        paginatedProjects = paginatedProjects.slice(0, limit)
        // Next cursor is the created_at of the last item in current page
        const lastProject = paginatedProjects[paginatedProjects.length - 1]
        if (lastProject?.created_at) {
          nextCursor = lastProject.created_at
        }
      }
    } else if (totalCount) {
      hasNextPage = offset + limit < totalCount
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
        projects: paginatedProjects.map((project) => {
          const project_manager_name =
            (project.project_manager_user_id &&
              handlerNameById.get(project.project_manager_user_id)) ||
            (project.project_handler_staff_id &&
              staffById.get(project.project_handler_staff_id)?.name) ||
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

            project_handler_staff_id: project.project_handler_staff_id,

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
          ? [
              ...assignmentContext.handlers.map(({ id, name, position }) => ({
                id: `member:${id}`,
                name,
                position,
                kind: "member" as const,
              })),
              ...assignmentContext.staffHandlers.map(
                ({ id, name, position }) => ({
                  id: `staff:${id}`,
                  name,
                  position,
                  kind: "staff" as const,
                }),
              ),
            ]
          : [],

        staffOptions:
          assignmentContext.assistantStaffEnabled &&
          (assignmentContext.isChairman || canAssign)
            ? assignmentContext.staff
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

        pagination: {
          limit,
          offset: cursor ? undefined : offset,
          has_next: hasNextPage,
          next_cursor: nextCursor,
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

    const requestedHandlerProperty = Boolean(
      body && ("projectHandlerId" in body || "projectManagerId" in body),
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

    const requestedHandlerValue =
      body && "projectHandlerId" in body
        ? body.projectHandlerId
        : body?.projectManagerId
    const handlerAssignment = requestedHandlerProperty
      ? resolveProjectHandlerSelection(requestedHandlerValue, assignmentContext)
      : {
          project_manager_user_id: null,
          project_handler_staff_id: null,
        }

    if (!handlerAssignment) {
      return NextResponse.json(
        {
          error:
            "Select an active company member or staff member as Project Handler.",
        },
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

        ...handlerAssignment,
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
