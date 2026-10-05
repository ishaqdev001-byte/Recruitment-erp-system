import { NextResponse } from "next/server";
import { getProjectAccess, hasProjectPermission, parseProjectInput, projectToDatabase } from "@/lib/server/projects";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const access = await getProjectAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    const { projectId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || Array.isArray(body)) return NextResponse.json({ error: "Project changes are required." }, { status: 400, headers: responseHeaders });

    const { data: current, error: currentError } = await access.supabase.from("projects").select("status").eq("id", projectId).eq("company_id", access.companyId).maybeSingle();
    if (currentError || !current) return NextResponse.json({ error: "Project not found." }, { status: 404, headers: responseHeaders });

    const changedFields = Object.keys(body);
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
    const input = parseProjectInput({ ...body, status: body.status ?? current.status });
    if (!input) return NextResponse.json({ error: "Enter valid project details." }, { status: 400, headers: responseHeaders });
    if (input.status !== current.status && !await hasProjectPermission(access, "projects.status")) {
      return NextResponse.json({ error: "You do not have permission to change project status." }, { status: 403, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.from("projects").update(projectToDatabase(input)).eq("id", projectId).eq("company_id", access.companyId).select("*").single();
    if (error || !data) return NextResponse.json({ error: "Unable to update this project." }, { status: 403, headers: responseHeaders });
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