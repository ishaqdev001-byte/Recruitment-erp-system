import { NextResponse } from "next/server";
import {
  getProjectAssignmentContext,
  getProjectAccess,
  hasProjectPermission,
  listProjectAccounts,
  parseProjectInput,
  projectToDatabase,
  resolveProjectSource,
} from "@/lib/server/projects";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const access = await getProjectAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const { projectId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body)) return NextResponse.json({ error: "Project changes are required." }, { status: 400, headers: responseHeaders });

    const { data: current, error: currentError } = await access.supabase.from("projects").select("status, account_id, branch_id, project_manager_user_id, assigned_staff_id, project_source_type, contractor_id, partner_id, contractor_name, contractor_service_charge, partner_service_charge, candidate_service_charge").eq("id", projectId).eq("company_id", access.companyId).maybeSingle();
    if (currentError || !current) return NextResponse.json({ error: "Project not found." }, { status: 404, headers: responseHeaders });

    const changedFields = Object.keys(body);
    if (body.action === "assign-assistant-staff" || body.action === "assign-staff") {
      const hasAssistantStaffId = changedFields.includes("assistantStaffId");
      const hasLegacyStaffId = changedFields.includes("staffId");
      if (
        changedFields.some((field) => !["action", "assistantStaffId", "staffId"].includes(field)) ||
        hasAssistantStaffId === hasLegacyStaffId
      ) {
        return NextResponse.json(
          { error: "Choose one staff assignment change." },
          { status: 400, headers: responseHeaders },
        );
      }

      const [assignmentContext, canAssign] = await Promise.all([
        getProjectAssignmentContext(access),
        hasProjectPermission(access, "projects.assign"),
      ]);
      if (!assignmentContext.assistantStaffEnabled) {
        return NextResponse.json(
          { error: "Assistant Staff assignments are disabled in company settings." },
          { status: 409, headers: responseHeaders },
        );
      }
      if (!assignmentContext.isChairman && !canAssign) {
        return NextResponse.json(
          {
            error: "You do not have permission to assign Assistant Staff.",
          },
          { status: 403, headers: responseHeaders },
        );
      }

      const requestedStaffId = body.assistantStaffId ?? body.staffId;
      const staffId =
        requestedStaffId === null || requestedStaffId === ""
          ? null
          : typeof requestedStaffId === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                requestedStaffId,
              )
            ? requestedStaffId
            : undefined;
      if (staffId === undefined) {
        return NextResponse.json(
          { error: "Select an active staff member from this company." },
          { status: 400, headers: responseHeaders },
        );
      }

      if (staffId) {
        const selectedStaff = assignmentContext.staff.find(
          (staff) => staff.id === staffId && staff.status === "Active",
        );
        if (!selectedStaff) {
          return NextResponse.json(
            { error: "Select an active staff member from this company." },
            { status: 400, headers: responseHeaders },
          );
        }
      }

      const { data: updatedProject, error: assignmentError } = await access.supabase
        .from("projects")
        .update({ assigned_staff_id: staffId })
        .eq("id", projectId)
        .eq("company_id", access.companyId)
        .select("*")
        .maybeSingle();
      if (assignmentError) {
        console.error("Project staff assignment failed", {
          code: assignmentError.code,
          message: assignmentError.message,
          details: assignmentError.details,
          hint: assignmentError.hint,
        });
        if (assignmentError.code === "42501") {
          return NextResponse.json(
            { error: "You do not have permission to assign staff to this project." },
            { status: 403, headers: responseHeaders },
          );
        }
        if (["23503", "23514"].includes(assignmentError.code ?? "")) {
          return NextResponse.json(
            {
              error:
                "The selected staff record is no longer active or is not assigned to this company. Refresh the project list and try again.",
            },
            { status: 409, headers: responseHeaders },
          );
        }
        if (["42703", "PGRST204", "42P01", "PGRST205"].includes(assignmentError.code ?? "")) {
          return NextResponse.json(
            {
              error:
                "Project staff assignment is not available in the database yet. Apply the latest project assignment migration.",
            },
            { status: 503, headers: responseHeaders },
          );
        }
        return NextResponse.json(
          { error: "Unable to assign staff to this project." },
          { status: 500, headers: responseHeaders },
        );
      }
      if (!updatedProject) {
        return NextResponse.json(
          { error: "The project could not be found or assigned." },
          { status: 404, headers: responseHeaders },
        );
      }
      return NextResponse.json(
        { project: updatedProject },
        { headers: responseHeaders },
      );
    }

    const statusOnly = changedFields.length === 1 && changedFields[0] === "status";
    if (statusOnly) {
      const status = body.status;
      if (status !== "active" && status !== "inactive" && status !== "cancelled") {
        return NextResponse.json({ error: "Choose a valid project status." }, { status: 400, headers: responseHeaders });
      }
      if (current.status !== status && !await hasProjectPermission(access, "projects.status")) {
        return NextResponse.json({ error: "You do not have permission to change project status." }, { status: 403, headers: responseHeaders });
      }
      const { data, error } = await access.supabase.from("projects").update({ status }).eq("id", projectId).eq("company_id", access.companyId).select("*").single();
      if (error || !data) return NextResponse.json({ error: "Unable to update project status." }, { status: 403, headers: responseHeaders });
      return NextResponse.json({ project: data }, { headers: responseHeaders });
    }

    if (!await hasProjectPermission(access, "projects.edit")) return NextResponse.json({ error: "You do not have permission to edit projects." }, { status: 403, headers: responseHeaders });
    const input = parseProjectInput({
      ...body,
      accountId: body.accountId ?? current.account_id,
      projectSourceType: body.projectSourceType ?? current.project_source_type,
      contractorId: "contractorId" in body ? body.contractorId : current.contractor_id,
      partnerId: "partnerId" in body ? body.partnerId : current.partner_id,
      contractorName: body.contractorName ?? current.contractor_name,
      contractorServiceCharge: body.contractorServiceCharge ?? current.contractor_service_charge,
      partnerServiceCharge: body.partnerServiceCharge ?? current.partner_service_charge,
      candidateServiceCharge: body.candidateServiceCharge ?? current.candidate_service_charge,
      status: body.status ?? current.status,
    });
    if (!input) return NextResponse.json({ error: "Enter valid project details." }, { status: 400, headers: responseHeaders });
    const source = await resolveProjectSource(access, input, current.partner_id);
    if ("error" in source) return NextResponse.json({ error: source.error }, { status: 400, headers: responseHeaders });
    if (input.status !== current.status && !await hasProjectPermission(access, "projects.status")) {
      return NextResponse.json({ error: "You do not have permission to change project status." }, { status: 403, headers: responseHeaders });
    }

    let managerUpdate: { project_manager_user_id: string | null } | null = null;
    if ("projectHandlerId" in body || "projectManagerId" in body) {
      const assignmentContext = await getProjectAssignmentContext(access);
      const canAssignHandler =
        assignmentContext.isChairman ||
        await hasProjectPermission(access, "projects.assign");
      if (!canAssignHandler) {
        return NextResponse.json(
          { error: "You do not have permission to assign a Project Handler." },
          { status: 403, headers: responseHeaders },
        );
      }

      const requestedHandlerValue = body.projectHandlerId ?? body.projectManagerId;
      const requestedHandlerId =
        requestedHandlerValue === null ||
        requestedHandlerValue === ""
          ? ""
          : typeof requestedHandlerValue === "string"
            ? requestedHandlerValue
            : undefined;
      if (requestedHandlerId === undefined) {
        return NextResponse.json(
          { error: "Select an active company member as Project Handler." },
          { status: 400, headers: responseHeaders },
        );
      }
      if (
        requestedHandlerId &&
        !assignmentContext.handlers.some(
          (handler) => handler.id === requestedHandlerId,
        )
      ) {
        return NextResponse.json(
          { error: "Select an active company member as Project Handler." },
          { status: 400, headers: responseHeaders },
        );
      }
      managerUpdate = {
        project_manager_user_id: requestedHandlerId || null,
      };
    }

    let branchId = current.branch_id;
    if (input.accountId !== current.account_id) {
      const account = (await listProjectAccounts(access)).find(({ id }) => id === input.accountId);
      if (!account) {
        return NextResponse.json({ error: "Select an active company account available to your branch." }, { status: 400, headers: responseHeaders });
      }
      branchId = account.branch_id;
    }

    const { data, error } = await access.supabase.from("projects").update({
      ...projectToDatabase(source.input, branchId),
      ...(managerUpdate ?? {}),
    }).eq("id", projectId).eq("company_id", access.companyId).select("*").single();
    if (error || !data) {
      console.error("Project update failed", error);
      return NextResponse.json({ error: "Unable to update this project." }, { status: 500, headers: responseHeaders });
    }
    return NextResponse.json({ project: data }, { headers: responseHeaders });
  } catch (error) {
    console.error("Project update request failed", error);
    return NextResponse.json({ error: "Project update is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const access = await getProjectAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    if (!await hasProjectPermission(access, "projects.delete")) return NextResponse.json({ error: "You do not have permission to delete projects." }, { status: 403, headers: responseHeaders });
    const { projectId } = await context.params;
    const { error } = await access.supabase.from("projects").delete().eq("id", projectId).eq("company_id", access.companyId);
    if (error) return NextResponse.json({ error: "Unable to delete this project." }, { status: 403, headers: responseHeaders });
    return NextResponse.json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Project delete request failed", error);
    return NextResponse.json({ error: "Project deletion is unavailable." }, { status: 503, headers: responseHeaders });
  }
}