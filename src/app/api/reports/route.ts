import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRecruitmentAgentRole } from "@/lib/role-access-settings";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const pageSize = 1000;

type StaffActivity = {
  id: string;
  name: string;
  candidatesRegistered: number;
  inquiriesReceived: number;
  inquiryReminders: number;
  tasksCreated: number;
  tasksCompleted: number;
};

type Period = { start: string; end: string; endExclusive: string };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeCandidateStage(stage: string) {
  return stage === "Project Submission" ? "Submitted to Project" : stage;
}

function isCalendarDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getDefaultPeriod(now: Date) {
  const end = now.toISOString().slice(0, 10);
  return { start: `${end.slice(0, 7)}-01`, end };
}

function datePeriod(start: string, end: string): Period {
  return {
    start,
    end,
    endExclusive: new Date(Date.parse(`${end}T00:00:00.000Z`) + 86_400_000).toISOString(),
  };
}

function getPreviousPeriod(period: Period): Period {
  const days = Math.round(
    (Date.parse(`${period.end}T00:00:00.000Z`) - Date.parse(`${period.start}T00:00:00.000Z`)) / 86_400_000,
  ) + 1;
  const endDate = new Date(Date.parse(`${period.start}T00:00:00.000Z`) - 86_400_000);
  const startDate = new Date(endDate.getTime() - (days - 1) * 86_400_000);
  return datePeriod(startDate.toISOString().slice(0, 10), endDate.toISOString().slice(0, 10));
}

function isWithinPeriod(value: string, period: Period) {
  return value >= `${period.start}T00:00:00.000Z` && value < period.endExclusive;
}

function staffActivityFor(
  activity: Map<string, StaffActivity>,
  staffByUserId: Map<string, string>,
  staffByName: Map<string, string | null>,
  id: string | null | undefined,
  name: string | null | undefined,
) {
  const staffId = (id ? staffByUserId.get(id) : undefined)
    ?? (name?.trim() ? staffByName.get(name.trim().toLocaleLowerCase()) : undefined);
  return staffId ? activity.get(staffId) : undefined;
}

async function loadAll<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, branch_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    const { data: canViewReports, error: reportsPermissionError } = await supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: membership.company_id,
        requested_permission: "reports.view",
      },
    );
    if (reportsPermissionError) {
      return NextResponse.json({ error: "Unable to verify report permissions." }, { status: 503, headers });
    }
    if (!canViewReports) {
      return NextResponse.json({ error: "You do not have permission to access reports." }, { status: 403, headers });
    }

    const [
      { data: canViewCandidates, error: candidatesPermissionError },
      { data: canViewInquiries, error: inquiriesPermissionError },
      { data: canViewTasks, error: tasksPermissionError },
      { data: canViewFinance, error: financePermissionError },
      { data: canViewAudit, error: auditPermissionError },
      { data: canViewSuppliers, error: suppliersPermissionError },
      { data: canViewEmployers, error: employersPermissionError },
      { data: canViewProjects, error: projectsPermissionError },
    ] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidate_inquiries.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "tasks.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "finance.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "audit.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "suppliers.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "employers.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "projects.view",
      }),
    ]);
    if (candidatesPermissionError || inquiriesPermissionError || tasksPermissionError || financePermissionError || auditPermissionError
      || suppliersPermissionError || employersPermissionError || projectsPermissionError) {
      return NextResponse.json({ error: "Unable to verify report permissions." }, { status: 503, headers });
    }

    const canReadCandidates = Boolean(canViewCandidates);
    const canReadInquiries = Boolean(canViewInquiries || canViewCandidates);
    const canReadTasks = Boolean(canViewTasks);
    const canReadSuppliers = Boolean(canViewSuppliers);
    const canReadEmployers = Boolean(canViewEmployers);
    const canReadProjects = Boolean(canViewProjects);
    const canReadStaffActivity = canReadCandidates || canReadInquiries || canReadTasks;
    const { data: canViewAllBranches, error: branchAccessError } = await supabase.rpc(
      "current_user_is_main_branch_user",
      { requested_company_id: membership.company_id },
    );
    if (branchAccessError) {
      return NextResponse.json({ error: "Unable to verify your company branch." }, { status: 503, headers });
    }
    if (!canViewAllBranches && !membership.branch_id) {
      return NextResponse.json({ error: "Your account must be assigned to a branch." }, { status: 403, headers });
    }
    const admin = canReadStaffActivity || canReadCandidates ? createAdminClient() : null;
    if ((canReadStaffActivity || canReadCandidates) && !admin) {
      return NextResponse.json(
        { error: "Reports require SUPABASE_SERVICE_ROLE_KEY in the server environment to load company rosters." },
        { status: 503, headers },
      );
    }
    const url = new URL(request.url);
    const requestedStart = url.searchParams.get("start");
    const requestedEnd = url.searchParams.get("end");
    const defaultPeriod = getDefaultPeriod(new Date());
    const start = requestedStart ?? defaultPeriod.start;
    const end = requestedEnd ?? defaultPeriod.end;
    if (!isCalendarDate(start) || !isCalendarDate(end) || start > end) {
      return NextResponse.json({ error: "A valid report date range is required." }, { status: 400, headers });
    }
    const currentPeriod = datePeriod(start, end);
    const previousPeriod = start === "1900-01-01" ? null : getPreviousPeriod(currentPeriod);
    const companyId = membership.company_id;
    const activity = new Map<string, StaffActivity>();
    const [
      staffRows,
      agentMemberships,
    ] = await Promise.all([
      canReadStaffActivity
        ? loadAll((from, to) => {
            let query = admin!.from("company_staff_members")
              .select("id, linked_user_id, name, branch_id")
              .eq("company_id", companyId)
              .eq("status", "Active")
              .order("name", { ascending: true })
              .range(from, to);
            if (!canViewAllBranches) query = query.eq("branch_id", membership.branch_id!);
            return query;
          })
        : Promise.resolve([]),
      canReadStaffActivity
        ? loadAll((from, to) => {
            let query = admin!.from("company_memberships")
              .select("user_id, branch_id, role:company_roles(name)")
              .eq("company_id", companyId)
              .eq("status", "active")
              .order("user_id", { ascending: true })
              .range(from, to);
            if (!canViewAllBranches) query = query.eq("branch_id", membership.branch_id!);
            return query;
          })
        : Promise.resolve([]),
    ]);
    const recruitmentAgentUserIds = new Set(agentMemberships.flatMap((agent) => {
      const role = Array.isArray(agent.role) ? agent.role[0] : agent.role;
      return role && isRecruitmentAgentRole(role.name) ? [agent.user_id] : [];
    }));
    const staffByUserId = new Map<string, string>();
    const staffByName = new Map<string, string | null>();
    for (const staff of staffRows) {
      if (staff.linked_user_id && recruitmentAgentUserIds.has(staff.linked_user_id)) continue;
      activity.set(staff.id, {
        id: staff.id,
        name: staff.name,
        candidatesRegistered: 0,
        inquiriesReceived: 0,
        inquiryReminders: 0,
        tasksCreated: 0,
        tasksCompleted: 0,
      });
      if (staff.linked_user_id) staffByUserId.set(staff.linked_user_id, staff.id);
      if (staff.name.trim()) {
        const key = staff.name.trim().toLocaleLowerCase();
        staffByName.set(key, staffByName.has(key) ? null : staff.id);
      }
    }
    const agentUserIds = canReadCandidates ? [...recruitmentAgentUserIds] : [];
    const [
      candidateResult,
      inquiryRows,
      taskRows,
      supplierRows,
      employerRows,
      projectRows,
    ] = await Promise.all([
      canReadCandidates
        ? Promise.all([
            supabase.from("candidates")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId),
            loadAll((from, to) => supabase.from("candidates")
              .select("created_at, created_by, agent_user_id, details")
              .eq("company_id", companyId)
              .order("created_at", { ascending: true })
              .order("id", { ascending: true })
              .range(from, to)),
          ])
        : Promise.resolve(null),
      canReadInquiries
        ? loadAll((from, to) => supabase.from("candidate_inquiries")
            .select("created_at, last_reminded_at, handled_by_user_id, handled_by_name")
            .eq("company_id", companyId)
            .gte("created_at", `${previousPeriod?.start ?? start}T00:00:00.000Z`)
            .lt("created_at", currentPeriod.endExclusive)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to))
        : Promise.resolve([]),
      canReadTasks
        ? loadAll((from, to) => supabase.from("tasks")
            .select("assigned_to, created_by, created_at, updated_at, due_at, is_completed")
            .eq("company_id", companyId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to))
        : Promise.resolve([]),
      canReadSuppliers
        ? loadAll((from, to) => supabase.from("suppliers")
            .select("id, supplier_name, status, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to))
        : Promise.resolve([]),
      canReadEmployers
        ? loadAll((from, to) => supabase.from("employers")
            .select("id, company_name, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
            .range(from, to))
        : Promise.resolve([]),
      canReadProjects
        ? loadAll((from, to) => supabase.from("projects")
            .select("id, contractor_id, created_at")
            .eq("company_id", companyId)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to))
        : Promise.resolve([]),
    ]);
    if (candidateResult?.[0].error) throw candidateResult[0].error;
    const agentProfilesResult = agentUserIds.length
      ? await admin!.from("profiles").select("id, display_name").in("id", agentUserIds)
      : { data: [], error: null };
    if (agentProfilesResult.error) throw agentProfilesResult.error;
    const agentNames = new Map((agentProfilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
    const totalCandidates = candidateResult?.[0].count ?? null;
    const candidateRows = candidateResult?.[1] ?? [];
    const agents = new Map(agentUserIds.map((id) => [id, {
      id,
      name: agentNames.get(id) || `Agent ${id.slice(0, 8)}`,
      totalCandidates: 0,
      newCandidates: 0,
      previousCandidates: 0,
      placements: 0,
    }]));
    let inquirySummary: { received: number; reminders: number } | null = null;
    let taskSummary: { created: number; completed: number; overdue: number } | null = null;

    if (canReadInquiries) {
      inquirySummary = { received: 0, reminders: 0 };
      for (const inquiry of inquiryRows) {
        if (!isWithinPeriod(inquiry.created_at, currentPeriod)) continue;
        inquirySummary.received += 1;
        const item = staffActivityFor(activity, staffByUserId, staffByName, inquiry.handled_by_user_id, inquiry.handled_by_name);
        if (item) item.inquiriesReceived += 1;
        if (inquiry.last_reminded_at && isWithinPeriod(inquiry.last_reminded_at, currentPeriod)) {
          inquirySummary.reminders += 1;
          if (item) item.inquiryReminders += 1;
        }
      }
    }

    const stageCounts = new Map<string, number>();
    if (canReadCandidates) {
      for (const candidate of candidateRows) {
        const stage = typeof candidate.details?.stage === "string" && candidate.details.stage.trim()
          ? normalizeCandidateStage(candidate.details.stage.trim())
          : "Registration";
        stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
        if (isWithinPeriod(candidate.created_at, currentPeriod)) {
          const item = staffActivityFor(activity, staffByUserId, staffByName, candidate.created_by, null);
          if (item) item.candidatesRegistered += 1;
        }
        if (candidate.agent_user_id) {
          const agent = agents.get(candidate.agent_user_id);
          if (agent) {
            agent.totalCandidates += 1;
            if (isWithinPeriod(candidate.created_at, currentPeriod)) agent.newCandidates += 1;
            if (previousPeriod && isWithinPeriod(candidate.created_at, previousPeriod)) agent.previousCandidates += 1;
            if (candidate.details?.stage === "Travelled" || candidate.details?.travelStatus === "Travelled") {
              agent.placements += 1;
            }
          }
        }
      }
    }

    if (canReadTasks) {
      const now = new Date().toISOString();
      taskSummary = { created: 0, completed: 0, overdue: 0 };
      for (const task of taskRows) {
        if (!task.is_completed && task.due_at && task.due_at < now) taskSummary.overdue += 1;
        if (isWithinPeriod(task.created_at, currentPeriod)) {
          taskSummary.created += 1;
          const item = staffActivityFor(activity, staffByUserId, staffByName, task.created_by, null);
          if (item) item.tasksCreated += 1;
        }
        if (task.is_completed && isWithinPeriod(task.updated_at, currentPeriod)) {
          taskSummary.completed += 1;
          const item = staffActivityFor(activity, staffByUserId, staffByName, task.assigned_to, null);
          if (item) item.tasksCompleted += 1;
        }
      }
    }

    return NextResponse.json({
      period: { start, end },
      permissions: {
        candidates: canReadCandidates,
        inquiries: canReadInquiries,
        tasks: canReadTasks,
        finance: Boolean(canViewFinance),
        suppliers: canReadSuppliers,
        employers: canReadEmployers,
        projects: canReadProjects,
      },
      previousPeriod,
      candidates: canReadCandidates
        ? {
            total: totalCandidates ?? 0,
            registered: candidateRows.filter((candidate) => isWithinPeriod(candidate.created_at, currentPeriod)).length,
            previousRegistrations: previousPeriod
              ? candidateRows.filter((candidate) => isWithinPeriod(candidate.created_at, previousPeriod)).length
              : null,
            stages: [...stageCounts].map(([stage, count]) => ({ stage, count })).sort((left, right) => right.count - left.count),
            agents: [...agents.values()].sort((left, right) => right.newCandidates - left.newCandidates || left.name.localeCompare(right.name)),
          }
        : null,
      inquiries: inquirySummary,
      tasks: taskSummary,
      suppliers: canReadSuppliers ? {
        total: supplierRows.length,
        active: supplierRows.filter((supplier) => supplier.status === "active").length,
        registered: supplierRows.filter((supplier) => isWithinPeriod(supplier.created_at, currentPeriod)).length,
        previousRegistrations: previousPeriod
          ? supplierRows.filter((supplier) => isWithinPeriod(supplier.created_at, previousPeriod)).length
          : null,
        items: supplierRows.map((supplier) => ({
          id: supplier.id,
          name: supplier.supplier_name,
          status: supplier.status,
          registeredAt: supplier.created_at,
        })),
      } : null,
      contractors: canReadEmployers ? {
        total: employerRows.length,
        registered: employerRows.filter((employer) => isWithinPeriod(employer.created_at, currentPeriod)).length,
        previousRegistrations: previousPeriod
          ? employerRows.filter((employer) => isWithinPeriod(employer.created_at, previousPeriod)).length
          : null,
        items: employerRows.map((employer) => ({
          id: employer.id,
          name: employer.company_name,
          registeredAt: employer.created_at,
          projects: projectRows.filter((project) => project.contractor_id === employer.id).length,
        })),
      } : null,
      growth: {
        candidates: canReadCandidates ? {
          current: candidateRows.filter((candidate) => isWithinPeriod(candidate.created_at, currentPeriod)).length,
          previous: previousPeriod
            ? candidateRows.filter((candidate) => isWithinPeriod(candidate.created_at, previousPeriod)).length
            : null,
        } : null,
        inquiries: inquirySummary ? {
          current: inquiryRows.filter((inquiry) => isWithinPeriod(inquiry.created_at, currentPeriod)).length,
          previous: previousPeriod
            ? inquiryRows.filter((inquiry) => isWithinPeriod(inquiry.created_at, previousPeriod)).length
            : null,
        } : null,
        tasks: taskSummary ? {
          current: taskRows.filter((task) => isWithinPeriod(task.created_at, currentPeriod)).length,
          previous: previousPeriod
            ? taskRows.filter((task) => isWithinPeriod(task.created_at, previousPeriod)).length
            : null,
        } : null,
        suppliers: canReadSuppliers ? {
          current: supplierRows.filter((supplier) => isWithinPeriod(supplier.created_at, currentPeriod)).length,
          previous: previousPeriod
            ? supplierRows.filter((supplier) => isWithinPeriod(supplier.created_at, previousPeriod)).length
            : null,
        } : null,
        contractors: canReadEmployers ? {
          current: employerRows.filter((employer) => isWithinPeriod(employer.created_at, currentPeriod)).length,
          previous: previousPeriod
            ? employerRows.filter((employer) => isWithinPeriod(employer.created_at, previousPeriod)).length
            : null,
        } : null,
        projects: canReadProjects ? {
          current: projectRows.filter((project) => isWithinPeriod(project.created_at, currentPeriod)).length,
          previous: previousPeriod
            ? projectRows.filter((project) => isWithinPeriod(project.created_at, previousPeriod)).length
            : null,
        } : null,
      },
      staffActivity: [...activity.values()].sort((left, right) => right.candidatesRegistered + right.inquiriesReceived + right.tasksCreated + right.tasksCompleted
        - left.candidatesRegistered - left.inquiriesReceived - left.tasksCreated - left.tasksCompleted),
    }, { headers });
  } catch (error) {
    console.error("Reports data request failed", error);
    return NextResponse.json({ error: "Reports data is unavailable." }, { status: 503, headers });
  }
}
