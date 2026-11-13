import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ProjectPermission = "projects.view" | "projects.create" | "projects.edit" | "projects.delete" | "projects.status" | "projects.assign";
export type ProjectSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
export type ProjectAccess =
  | { supabase: ProjectSupabase; companyId: string; userId: string; branchId: string | null }
  | { error: string; status: 401 | 403 };

export type ProjectAccount = { id: string; name: string; branch_id: string | null };
export type ProjectManagerOption = {
  id: string;
  name: string;
  position: string;
};
export type ProjectStaffOption = { id: string; name: string; position: string; status: string };
export type ProjectAssignmentContext = {
  isChairman: boolean;
  isProjectManager: boolean;
  managers: ProjectManagerOption[];
  staff: ProjectStaffOption[];
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getProjectAccess(): Promise<ProjectAccess> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, branch_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return { error: "Active company membership not found.", status: 403 };

  return {
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id,
  };
}

export async function hasProjectPermission(access: ProjectAccess, permission: ProjectPermission) {
  if ("error" in access) return false;
  const { data, error } = await access.supabase.rpc("current_user_has_company_permission", {
    requested_company_id: access.companyId,
    requested_permission: permission,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function listProjectAccounts(access: ProjectAccess): Promise<ProjectAccount[]> {
  if ("error" in access) throw new Error(access.error);

  const admin = createAdminClient();
  if (!admin) throw new Error("Project account selection requires the server service-role configuration.");

  const { data: isMainBranch, error: branchError } = await access.supabase.rpc(
    "current_user_is_main_branch_user",
    { requested_company_id: access.companyId },
  );
  if (branchError) throw branchError;
  if (!isMainBranch && !access.branchId) {
    throw new Error("Unable to verify the user's company branch for project account selection.");
  }

  let query = admin
    .from("company_accounts")
    .select("id, name, branch_id")
    .eq("company_id", access.companyId)
    .eq("status", "active")
    .order("name");
  if (!isMainBranch) query = query.eq("branch_id", access.branchId!);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getProjectAssignmentContext(
  access: ProjectAccess,
): Promise<ProjectAssignmentContext> {
  if ("error" in access) throw new Error(access.error);

  const admin = createAdminClient();
  if (!admin)
    throw new Error(
      "Project assignments require the server service-role configuration.",
    );

  const [
    { data: company, error: companyError },
    { data: memberships, error: membershipError },
    { data: roles, error: roleError },
    { data: staff, error: staffError },
  ] = await Promise.all([
    admin
      .from("companies")
      .select("primary_admin_user_id")
      .eq("id", access.companyId)
      .maybeSingle(),
    admin
      .from("company_memberships")
      .select("user_id, role_id")
      .eq("company_id", access.companyId)
      .eq("status", "active"),
    admin
      .from("company_roles")
      .select("id, name, is_system_default")
      .eq("company_id", access.companyId),
    admin
      .from("company_staff_members")
      .select("id, name, position, status, linked_user_id")
      .eq("company_id", access.companyId)
      .order("name"),
  ]);
  if (companyError || membershipError || roleError || staffError) {
    throw companyError ?? membershipError ?? roleError ?? staffError;
  }
  if (!company) throw new Error("Unable to verify company project assignments.");

  const projectManagerRoleIds = new Set(
    (roles ?? [])
      .filter(
        (role) =>
          role.is_system_default &&
          ["projects manager", "project manager"].includes(
            role.name.trim().toLowerCase(),
          ),
      )
      .map((role) => role.id),
  );
  const managerIds = (memberships ?? [])
    .filter((membership) => projectManagerRoleIds.has(membership.role_id))
    .map((membership) => membership.user_id);
  const managerProfilesResult = managerIds.length
    ? await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", managerIds)
    : { data: [], error: null };
  if (managerProfilesResult.error) throw managerProfilesResult.error;
  const profileNameById = new Map(
    (managerProfilesResult.data ?? []).map((profile) => [
      profile.id,
      profile.display_name,
    ]),
  );
  const managerIdsSet = new Set(managerIds);
  const managers = (staff ?? [])
    .filter(
      (record) =>
        record.status === "Active" &&
        Boolean(record.linked_user_id) &&
        managerIdsSet.has(record.linked_user_id ?? ""),
    )
    .map((record) => ({
      id: record.linked_user_id ?? "",
      name:
        record.name ||
        profileNameById.get(record.linked_user_id ?? "") ||
        "Projects Manager",
      position: record.position,
    }))
    .filter(
      (manager, index, options) =>
        options.findIndex((option) => option.id === manager.id) === index,
    );

  return {
    isChairman: company.primary_admin_user_id === access.userId,
    isProjectManager: managerIdsSet.has(access.userId),
    managers,
    staff: (staff ?? []).map((record) => ({
      id: record.id,
      name: record.name,
      position: record.position,
      status: record.status,
    })),
  };
}

export type ProjectInput = {
  projectName: string;
  accountId: string;
  contractorId: string | null;
  contractorName: string;
  country: string;
  salaryRange: string;
  ageBracket: string;
  totalDemand: number;
  contractorServiceCharge: number;
  candidateServiceCharge: number;
  interviewMode: "Face to face" | "Online" | "Direct submission";
  status: "active" | "inactive" | "cancelled";
  visaCount: number;
  ticketCount: number;
};

const interviewModes = new Set(["Face to face", "Online", "Direct submission"]);
const projectStatuses = new Set(["active", "inactive", "cancelled"]);

export function parseProjectInput(value: unknown): ProjectInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const contractorName = typeof body.contractorName === "string" ? body.contractorName.trim() : "";
  const country = typeof body.country === "string" ? body.country.trim() : "";
  const salaryRange = typeof body.salaryRange === "string" ? body.salaryRange.trim() : "";
  const ageBracket = typeof body.ageBracket === "string" ? body.ageBracket.trim() : "";
  const contractorId = typeof body.contractorId === "string" && body.contractorId ? body.contractorId : null;
  const totalDemand = Number(body.totalDemand);
  const contractorServiceCharge = Number(body.contractorServiceCharge);
  const candidateServiceCharge = Number(body.candidateServiceCharge);
  const visaCount = body.visaCount === undefined ? 0 : Number(body.visaCount);
  const ticketCount = body.ticketCount === undefined ? 0 : Number(body.ticketCount);
  const interviewMode = typeof body.interviewMode === "string" ? body.interviewMode : "";
  const status = typeof body.status === "string" ? body.status : "active";

  if (!projectName || projectName.length > 200 || !accountId || !contractorName || contractorName.length > 200
    || !country || country.length > 200 || !salaryRange || salaryRange.length > 200
    || !ageBracket || ageBracket.length > 100 || !Number.isInteger(totalDemand) || totalDemand < 1
    || !Number.isFinite(contractorServiceCharge) || contractorServiceCharge < 0
    || !Number.isFinite(candidateServiceCharge) || candidateServiceCharge < 0
    || !Number.isInteger(visaCount) || visaCount < 0
    || !Number.isInteger(ticketCount) || ticketCount < 0
    || !interviewModes.has(interviewMode) || !projectStatuses.has(status)) return null;

  return {
    projectName,
    accountId,
    contractorId,
    contractorName,
    country,
    salaryRange,
    ageBracket,
    totalDemand,
    contractorServiceCharge,
    candidateServiceCharge,
    interviewMode: interviewMode as ProjectInput["interviewMode"],
    status: status as ProjectInput["status"],
    visaCount,
    ticketCount,
  };
}

export function projectToDatabase(input: ProjectInput, branchId: string | null) {
  return {
    account_id: input.accountId,
    branch_id: branchId,
    contractor_id: input.contractorId,
    contractor_name: input.contractorName,
    project_name: input.projectName,
    country: input.country,
    salary_range: input.salaryRange,
    age_bracket: input.ageBracket,
    total_demand: input.totalDemand,
    contractor_service_charge: input.contractorServiceCharge,
    candidate_service_charge: input.candidateServiceCharge,
    interview_mode: input.interviewMode,
    status: input.status,
    visa_count: input.visaCount,
    ticket_count: input.ticketCount,
  };
}