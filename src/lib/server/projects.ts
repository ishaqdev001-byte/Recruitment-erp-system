import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProjectPermission = "projects.view" | "projects.create" | "projects.edit" | "projects.delete" | "projects.status";
export type ProjectSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type ProjectAccess =
  | { supabase: ProjectSupabase; companyId: string; userId: string }
  | { error: string; status: 401 | 403 };

export async function getProjectAccess(): Promise<ProjectAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 };

  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function hasProjectPermission(access: ProjectAccess, permission: ProjectPermission) {
  if ("error" in access) return false;
  const { data, error } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: permission,
  });
  return !error && Boolean(data);
}

export type ProjectInput = {
  projectName: string;
  contractorId: string | null;
  contractorName: string;
  country: string;
  salaryRange: string;
  ageBracket: string;
  totalDemand: number;
  serviceCharge: number;
  interviewMode: "Face to face" | "Online" | "Direct submission";
  status: "active" | "inactive" | "cancelled";
  submittedCount: number;
  visaCount: number;
  ticketCount: number;
};

const interviewModes = new Set(["Face to face", "Online", "Direct submission"]);
const projectStatuses = new Set(["active", "inactive", "cancelled"]);

export function parseProjectInput(value: unknown): ProjectInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
  const contractorName = typeof body.contractorName === "string" ? body.contractorName.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim() : "";
  const salaryRange = typeof body.salaryRange === "string" ? body.salaryRange.trim() : "";
  const ageBracket = typeof body.ageBracket === "string" ? body.ageBracket.trim() : "";
  const contractorId = typeof body.contractorId === "string" && body.contractorId ? body.contractorId : null;
  const totalDemand = Number(body.totalDemand);
  const serviceCharge = Number(body.serviceCharge);
  const submittedCount = body.submittedCount === undefined ? 0 : Number(body.submittedCount);
  const visaCount = body.visaCount === undefined ? 0 : Number(body.visaCount);
  const ticketCount = body.ticketCount === undefined ? 0 : Number(body.ticketCount);
  const interviewMode = typeof body.interviewMode === "string" ? body.interviewMode : "";
  const status = typeof body.status === "string" ? body.status : "active";

  if (!projectName || projectName.length > 200 || !contractorName || contractorName.length > 200
    || !country || country.length > 200 || !salaryRange || salaryRange.length > 200
    || !ageBracket || ageBracket.length > 100 || !Number.isInteger(totalDemand) || totalDemand < 1
    || !Number.isFinite(serviceCharge) || serviceCharge < 0
    || !Number.isInteger(submittedCount) || submittedCount < 0
    || !Number.isInteger(visaCount) || visaCount < 0
    || !Number.isInteger(ticketCount) || ticketCount < 0
    || !interviewModes.has(interviewMode) || !projectStatuses.has(status)) return null;

  return {
    projectName,
    contractorId,
    contractorName,
    country,
    salaryRange,
    ageBracket,
    totalDemand,
    serviceCharge,
    interviewMode: interviewMode as ProjectInput["interviewMode"],
    status: status as ProjectInput["status"],
    submittedCount,
    visaCount,
    ticketCount,
  };
}

export function projectToDatabase(input: ProjectInput) {
  return {
    contractor_id: input.contractorId,
    contractor_name: input.contractorName,
    project_name: input.projectName,
    country: input.country,
    salary_range: input.salaryRange,
    age_bracket: input.ageBracket,
    total_demand: input.totalDemand,
    service_charge: input.serviceCharge,
    interview_mode: input.interviewMode,
    status: input.status,
    submitted_count: input.submittedCount,
    visa_count: input.visaCount,
    ticket_count: input.ticketCount,
  };
}