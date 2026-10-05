import { NextResponse } from "next/server";
import { getProjectAccess, hasProjectPermission, projectToDatabase, parseProjectInput } from "@/lib/server/projects";

export const runtime = "nodejs";

const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const access = await getProjectAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    if (!await hasProjectPermission(access, "projects.view")) {
      return NextResponse.json({ error: "You do not have permission to view projects. Apply the latest Supabase migration if project setup is incomplete." }, { status: 403, headers: responseHeaders });
    }

    const { data, error } = await access.supabase.from("projects").select("*").eq("company_id", access.companyId).order("created_at", { ascending: false });
    if (error) {
      console.error("Project list query failed", error);
      return NextResponse.json({ error: "Unable to load projects." }, { status: 500, headers: responseHeaders });
    }
    const [canCreate, canEdit, canDelete, canChangeStatus] = await Promise.all([
      hasProjectPermission(access, "projects.create"),
      hasProjectPermission(access, "projects.edit"),
      hasProjectPermission(access, "projects.delete"),
      hasProjectPermission(access, "projects.status"),
    ]);
    return NextResponse.json({ projects: data ?? [], permissions: { canCreate, canEdit, canDelete, canChangeStatus } }, { headers: responseHeaders });
  } catch (error) {
    console.error("Project list request failed", error);
    return NextResponse.json({ error: "Project data is unavailable." }, { status: 503, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getProjectAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });
    if (!await hasProjectPermission(access, "projects.create")) return NextResponse.json({ error: "You do not have permission to create projects." }, { status: 403, headers: responseHeaders });

    const input = parseProjectInput(await request.json().catch(() => null));
    if (!input) return NextResponse.json({ error: "Enter valid project details and at least one vacancy." }, { status: 400, headers: responseHeaders });
    const { data, error } = await access.supabase.from("projects").insert({
      ...projectToDatabase(input),
      company_id: access.companyId,
      created_by: access.userId,
    }).select("*").single();
    if (error || !data) {
      console.error("Project creation failed", error);
      return NextResponse.json({ error: "Unable to create this project." }, { status: 403, headers: responseHeaders });
    }
    return NextResponse.json({ project: data }, { status: 201, headers: responseHeaders });
  } catch (error) {
    console.error("Project creation request failed", error);
    return NextResponse.json({ error: "Project creation is unavailable." }, { status: 503, headers: responseHeaders });
  }
}