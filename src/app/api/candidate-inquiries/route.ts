import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const sources = new Set(["radio", "television", "friend_referral", "walk_in", "sign_post", "agent"]);

async function getInquiryAccess(permission: "candidate_inquiries.view" | "candidate_inquiries.create") {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id, branch_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const legacyPermission = permission === "candidate_inquiries.view" ? "candidates.view" : "candidates.create";
  const [
    { data: allowed, error: permissionError },
    { data: legacyAllowed, error: legacyPermissionError },
  ] = await Promise.all([
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: permission,
    }),
    supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: legacyPermission,
    }),
  ]);
  if (permissionError || legacyPermissionError) {
    return { error: "Unable to verify candidate inquiry permissions.", status: 503 as const };
  }
  if (!allowed && !legacyAllowed) {
    return { error: "You do not have permission to access candidate inquiries.", status: 403 as const };
  }
  const { data: inquiryScope, error: scopeError } = await supabase.rpc("current_user_role_setting", {
    requested_company_id: membership.company_id,
    requested_setting: "inquiry_scope",
    fallback_value: "company",
  });
  if (scopeError) return { error: "Unable to verify inquiry access settings.", status: 503 as const };
  return {
    supabase,
    companyId: membership.company_id,
    userId: user.id,
    branchId: membership.branch_id ?? null,
    inquiryScope: inquiryScope === "created" ? "created" as const : "company" as const,
  };
}

export async function GET() {
  try {
    const access = await getInquiryAccess("candidate_inquiries.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const [{ data: inquiries, error: inquiryError }, { data: people, error: peopleError }] = await Promise.all([
      access.supabase.from("candidate_inquiries").select("*")
        .eq("company_id", access.companyId).eq("status", "inquiry").order("created_at", { ascending: false }),
      access.supabase.rpc("list_candidate_inquiry_people", { requested_company_id: access.companyId }),
    ]);
    if (inquiryError || peopleError) throw inquiryError ?? peopleError;
    const users = people ?? [];
    const names = new Map(users.map((person: { user_id: string; display_name: string }) => [person.user_id, person.display_name]));
    return NextResponse.json({
      inquiries: (inquiries ?? []).map((inquiry) => ({
        ...inquiry,
        agent_name: inquiry.agent_name || (inquiry.agent_user_id ? names.get(inquiry.agent_user_id) ?? "" : ""),
        handled_by_name: inquiry.handled_by_name || names.get(inquiry.handled_by_user_id) || "Company user",
      })),
      agents: users.filter((person: { role_name: string }) => person.role_name.toLocaleLowerCase().includes("agent")),
      handlers: users,
    }, { headers });
  } catch (error) {
    console.error("Candidate inquiries request failed", error);
    return NextResponse.json({ error: "Candidate inquiries are unavailable. Apply the candidate inquiries migration and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getInquiryAccess("candidate_inquiries.create");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const discoverySource = typeof body?.discoverySource === "string" ? body.discoverySource : "";
    const agentUserId = typeof body?.agentUserId === "string" ? body.agentUserId : "";
    const countries = Array.isArray(body?.desiredCountries)
      ? body.desiredCountries.map((country) => typeof country === "string" ? country.trim() : "")
      : [];
    const requestedJobs = Array.isArray(body?.jobOfInterest)
      ? body.jobOfInterest.map((job) => typeof job === "string" ? job.trim() : "")
      : typeof body?.jobOfInterest === "string" ? [body.jobOfInterest.trim()] : [];
    const jobOfInterest = [...new Map(requestedJobs.filter(Boolean).map((job) => [job.toLocaleLowerCase(), job])).values()];
    const hasExperience = body?.hasExperience;
    const experienceDescription = typeof body?.experienceDescription === "string" ? body.experienceDescription.trim() : "";
    const communicationMethod = body?.communicationMethod;
    const requestedHandledByUserId = typeof body?.handledByUserId === "string" ? body.handledByUserId : "";
    const handledByUserId = access.inquiryScope === "created" ? access.userId : requestedHandledByUserId;
    const remarks = typeof body?.remarks === "string" ? body.remarks.trim() : "";

    if (!firstName || firstName.length > 200 || !lastName || lastName.length > 200
      || !phone || phone.length > 100 || !sources.has(discoverySource)
      || countries.length < 1 || countries.length > 20 || countries.some((country) => !country || country.length > 100)
      || jobOfInterest.length < 1 || jobOfInterest.length > 20 || jobOfInterest.some((job) => job.length > 200)
      || typeof hasExperience !== "boolean" || (hasExperience && (!experienceDescription || experienceDescription.length > 2000))
      || (communicationMethod !== "call" && communicationMethod !== "text" && communicationMethod !== "both")
      || !isUuid(handledByUserId) || remarks.length > 4000
      || (discoverySource === "agent" && access.inquiryScope !== "created" && !isUuid(agentUserId))
      || (discoverySource !== "agent" && Boolean(agentUserId))) {
      return NextResponse.json({ error: "Complete the required inquiry details and choose valid options." }, { status: 400, headers });
    }

    const { data: people, error: peopleError } = await access.supabase.rpc("list_candidate_inquiry_people", {
      requested_company_id: access.companyId,
    });
    if (peopleError) throw peopleError;
    const actors = people ?? [];
    const handler = actors.find((person: { user_id: string }) => person.user_id === handledByUserId);
    const requestedAgentUserId = access.inquiryScope === "created" && discoverySource === "agent"
      ? access.userId
      : agentUserId;
    const agent = discoverySource === "agent"
      ? actors.find((person: { user_id: string; role_name: string }) => person.user_id === requestedAgentUserId && person.role_name.toLocaleLowerCase().includes("agent"))
      : null;
    if (!handler || (discoverySource === "agent" && !agent)) {
      return NextResponse.json({ error: "Choose an active handler and a registered agent for agent referrals." }, { status: 400, headers });
    }

    const { data: inquiry, error } = await access.supabase.from("candidate_inquiries").insert({
      company_id: access.companyId,
      branch_id: access.branchId,
      created_by: access.userId,
      first_name: firstName,
      last_name: lastName,
      phone,
      discovery_source: discoverySource,
      agent_user_id: agent?.user_id ?? null,
      agent_name: agent?.display_name ?? "",
      desired_countries: [...new Set(countries)],
      job_of_interest: jobOfInterest,
      has_experience: hasExperience,
      experience_description: hasExperience ? experienceDescription : "",
      communication_method: communicationMethod,
      handled_by_user_id: handledByUserId,
      handled_by_name: handler.display_name,
      remarks,
    }).select("*").single();
    if (error || !inquiry) {
      console.error("Candidate inquiry creation failed", error);
      return NextResponse.json({ error: "Unable to save this candidate inquiry." }, { status: 403, headers });
    }
    return NextResponse.json({ inquiry }, { status: 201, headers });
  } catch (error) {
    console.error("Candidate inquiry creation request failed", error);
    return NextResponse.json({ error: "Candidate inquiry service is unavailable." }, { status: 503, headers });
  }
}