import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  id: string | null | undefined,
  name: string | null | undefined,
) {
  const key = id || (name?.trim() ? `name:${name.trim()}` : "unassigned");
  const resolvedName = name?.trim() || (id ? `Staff ${id.slice(0, 8)}` : "Unassigned");
  let item = activity.get(key);
  if (!item) {
    item = {
      id: key,
      name: resolvedName,
      candidatesRegistered: 0,
      inquiriesReceived: 0,
      inquiryReminders: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
    };
    activity.set(key, item);
  } else if (name?.trim() && item.name.startsWith("Staff ")) {
    item.name = name.trim();
  }
  return item;
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
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
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
    if (!canReadCandidates && !canReadInquiries && !canReadTasks && !canViewFinance && !canViewAudit
      && !canReadSuppliers && !canReadEmployers) {
      return NextResponse.json({ error: "You do not have permission to access reports." }, { status: 403, headers });
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
              .select("created_at, created_by, agent_name, agent_user_id, details")
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
    const totalCandidates = candidateResult?.[0].count ?? null;
    const candidateRows = candidateResult?.[1] ?? [];
    let inquirySummary: { received: number; reminders: number } | null = null;
    let taskSummary: { created: number; completed: number; overdue: number } | null = null;

    if (canReadInquiries) {
      inquirySummary = { received: 0, reminders: 0 };
      for (const inquiry of inquiryRows) {
        if (!isWithinPeriod(inquiry.created_at, currentPeriod)) continue;
        inquirySummary.received += 1;
        const item = staffActivityFor(activity, inquiry.handled_by_user_id, inquiry.handled_by_name);
        item.inquiriesReceived += 1;
        if (inquiry.last_reminded_at && isWithinPeriod(inquiry.last_reminded_at, currentPeriod)) {
          inquirySummary.reminders += 1;
          item.inquiryReminders += 1;
        }
      }
    }

    const stageCounts = new Map<string, number>();
    if (canReadCandidates) {
      for (const candidate of candidateRows) {
        const stage = typeof candidate.details?.stage === "string" && candidate.details.stage.trim()
          ? candidate.details.stage.trim()
          : "Registration";
        stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
        if (isWithinPeriod(candidate.created_at, currentPeriod)) {
          staffActivityFor(activity, candidate.created_by, null).candidatesRegistered += 1;
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
          staffActivityFor(activity, task.created_by, null).tasksCreated += 1;
        }
        if (task.is_completed && isWithinPeriod(task.updated_at, currentPeriod)) {
          taskSummary.completed += 1;
          staffActivityFor(activity, task.assigned_to, null).tasksCompleted += 1;
        }
      }
    }

    const staffIds = [...new Set([...activity.keys()].filter((id) => !id.startsWith("name:") && id !== "unassigned"))];
    if (staffIds.length) {
      const { data: profiles, error: profilesError } = await supabase.from("profiles")
        .select("id, display_name")
        .in("id", staffIds);
      if (profilesError) throw profilesError;
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
      for (const item of activity.values()) {
        const name = names.get(item.id);
        if (name) item.name = name;
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
            agents: [...candidateRows.reduce((agents, candidate) => {
              const agentId = candidate.agent_user_id || `name:${candidate.agent_name || "unassigned"}`;
              const current = agents.get(agentId) ?? {
                id: agentId,
                name: candidate.agent_name || "Unassigned",
                totalCandidates: 0,
                newCandidates: 0,
                previousCandidates: 0,
                placements: 0,
              };
              current.totalCandidates += 1;
              if (isWithinPeriod(candidate.created_at, currentPeriod)) current.newCandidates += 1;
              if (previousPeriod && isWithinPeriod(candidate.created_at, previousPeriod)) current.previousCandidates += 1;
              const details = candidate.details ?? {};
              if (details.stage === "Travelled" || details.travelStatus === "Travelled") current.placements += 1;
              agents.set(agentId, current);
              return agents;
            }, new Map<string, { id: string; name: string; totalCandidates: number; newCandidates: number; previousCandidates: number; placements: number }>()).values()]
              .sort((left, right) => right.newCandidates - left.newCandidates),
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
      staffActivity: [...activity.values()].filter((item) =>
        item.candidatesRegistered || item.inquiriesReceived || item.inquiryReminders || item.tasksCreated || item.tasksCompleted,
      ).sort((left, right) => right.candidatesRegistered + right.inquiriesReceived + right.tasksCreated + right.tasksCompleted
        - left.candidatesRegistered - left.inquiriesReceived - left.tasksCreated - left.tasksCompleted),
    }, { headers });
  } catch (error) {
    console.error("Reports data request failed", error);
    return NextResponse.json({ error: "Reports data is unavailable." }, { status: 503, headers });
  }
}
