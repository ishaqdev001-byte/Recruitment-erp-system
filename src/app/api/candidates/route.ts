import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureInterServerCandidateFolders } from "@/lib/storage/interserver";

export const runtime = "nodejs";

const candidateDetailFields = new Set([
  "otherNames", "secondaryPhone", "otherPhone", "age", "gender", "maritalStatus", "abroadStatus", "abroadExperience", "source", "mediaChannel",
  "nin", "passportNumber", "passportIssue", "passportExpiry", "passportStatus", "passportBranch", "passportStorageLocation", "height", "weight", "shirtSize", "shoeSize", "waistSize", "preferredCities",
  "physicalAddress", "district", "county", "subCounty", "parish", "fatherPhone", "fatherStatus", "motherPhone", "motherStatus",
  "kinFirstName", "kinLastName", "kinPhone", "kinRelationship", "emergencyFirstName", "emergencyLastName", "emergencyPhone", "emergencyRelationship",
  "jobOfInterest", "preferredCountries", "assignedContracts", "stage", "travelStatus", "visaStatus", "acceptance", "contracts", "contractManager", "branch", "verification", "photo",
  "educationQualification", "educationInstitution", "educationYearCompleted", "educationField", "lastEmployer", "previousJobTitle", "employmentFrom", "employmentTo", "employmentDuties", "keySkills", "languagesSpoken", "certifications", "recruiterNotes",
]);

function readCandidateDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const details: Record<string, string | number | string[]> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!candidateDetailFields.has(key)) continue;
    if ((key === "passportIssue" || key === "passportExpiry") && typeof fieldValue === "string" && fieldValue
      && (!/^\d{4}-\d{2}-\d{2}$/.test(fieldValue) || Number.isNaN(Date.parse(`${fieldValue}T00:00:00Z`)))) return null;
    if (typeof fieldValue === "string" && fieldValue.length <= 4000) details[key] = fieldValue;
    else if (typeof fieldValue === "number" && key === "age" && Number.isFinite(fieldValue) && fieldValue >= 0 && fieldValue <= 120) details[key] = fieldValue;
    else if (Array.isArray(fieldValue) && fieldValue.length <= 50 && fieldValue.every((item) => typeof item === "string" && item.length <= 200)) details[key] = fieldValue;
    else return null;
  }
  return details;
}

function passportSetupError(details: Record<string, string | number | string[]>, agentName: string) {
  const passportNumber = typeof details.passportNumber === "string" ? details.passportNumber.trim() : "";
  if (!passportNumber) return "";
  if (details.passportStatus !== "Available" && details.passportStatus !== "With Agent") return "Choose whether the passport is available or with the assigned agent.";
  if (details.passportStatus === "Available" && (
    typeof details.passportBranch !== "string" || !details.passportBranch.trim()
    || typeof details.passportStorageLocation !== "string" || !details.passportStorageLocation.trim()
  )) return "Select a storage branch and location for an available passport.";
  if (details.passportStatus === "With Agent" && !agentName.trim()) return "Assign an agent when the passport is with an agent.";
  return "";
}

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    // Get user's company membership and role
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, role_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    // Check if user has finance.view permission
    const { data: roleData, error: roleError } = await supabase
      .from("company_roles")
      .select("name")
      .eq("id", membership.role_id)
      .single();
    if (roleError || !roleData) {
      return NextResponse.json({ error: "Unable to verify your company role." }, { status: 503, headers });
    }

    const [
      { data: canViewFinance, error: financePermissionError },
      { data: canEditCandidates, error: editPermissionError },
      { data: canRegisterCandidates, error: registerPermissionError },
      { data: canCreateCandidates, error: legacyCreatePermissionError },
      { data: candidateScope, error: scopeError },
      { data: canViewAgentFinance, error: agentFinancePermissionError },
    ] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "finance.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.edit",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.register",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.create",
      }),
      supabase.rpc("current_user_role_setting", {
        requested_company_id: membership.company_id,
        requested_setting: "candidate_scope",
        fallback_value: "company",
      }),
      supabase.rpc("current_user_can_view_agent_finance", {
        requested_company_id: membership.company_id,
      }),
    ]);
    if (financePermissionError || editPermissionError || registerPermissionError || legacyCreatePermissionError || scopeError || agentFinancePermissionError) {
      return NextResponse.json({ error: "Unable to verify candidate access." }, { status: 503, headers });
    }
    const { data: candidateRegistration, error: registrationSettingError } = await supabase.rpc(
      "current_user_role_setting",
      {
        requested_company_id: membership.company_id,
        requested_setting: "candidate_registration",
        fallback_value: "true",
      },
    );
    if (registrationSettingError) {
      return NextResponse.json({ error: "Unable to verify candidate registration access." }, { status: 503, headers });
    }

    const roleName = roleData?.name || "";
    const canViewActivityLogs = roleName.includes("Chairman") || roleName.includes("General Manager");
    const isAgent = candidateScope === "assigned";
    const canRegister = Boolean(canRegisterCandidates) && candidateRegistration === "true";

    let query = supabase
      .from("candidates")
      .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, agent_user_id, religion, position, nationality, father_name, mother_name, details, created_at, created_by")
      .eq("company_id", membership.company_id)
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      console.error("Candidate list query failed", error);
      return NextResponse.json({ error: "Unable to load candidates." }, { status: 403, headers });
    }

    return NextResponse.json({
      candidates: data,
      permissions: {
        canViewFinance: Boolean(canViewFinance),
        canViewAgentFinance: Boolean(canViewAgentFinance),
        canViewActivityLogs,
        canEditCandidates: Boolean(canEditCandidates),
        canRegisterCandidates: (Boolean(canRegisterCandidates) || Boolean(canCreateCandidates)) && canRegister,
        isAgent,
      },
    }, { headers });
  } catch (error) {
    console.error("Candidate list request failed", error);
    return NextResponse.json({ error: "Candidate data is unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Candidate information is required." }, { status: 400, headers });
    const fileNumber = typeof body.fileNumber === "string" ? body.fileNumber.trim() : "";
    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!fileNumber || fileNumber.length > 100 || !firstName || firstName.length > 200 || !lastName || lastName.length > 200 || !phone || phone.length > 100) {
      return NextResponse.json({ error: "File number, first name, last name, and phone are required." }, { status: 400, headers });
    }
    const details = readCandidateDetails(body.details);
    if (!details) return NextResponse.json({ error: "One or more extended candidate details are invalid." }, { status: 400, headers });
    const inquiryId = body.inquiryId === undefined || body.inquiryId === null || body.inquiryId === ""
      ? null
      : typeof body.inquiryId === "string" && isUuid(body.inquiryId) ? body.inquiryId : false;
    if (inquiryId === false) return NextResponse.json({ error: "The candidate inquiry is invalid." }, { status: 400, headers });
    details.stage = "Registration";
    details.assignedContracts = "";
    details.contracts = "";
    const passportError = passportSetupError(details, typeof body.agent === "string" ? body.agent.trim() : "");
    if (passportError) return NextResponse.json({ error: passportError }, { status: 400, headers });

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, branch_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });

    const [
      { data: canRegister, error: registerPermissionError },
      { data: canCreate, error: legacyCreatePermissionError },
      { data: registrationSetting, error: registrationSettingError },
      { data: candidateScope, error: scopeError },
    ] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.register",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.create",
      }),
      supabase.rpc("current_user_role_setting", {
        requested_company_id: membership.company_id,
        requested_setting: "candidate_registration",
        fallback_value: "true",
      }),
      supabase.rpc("current_user_role_setting", {
        requested_company_id: membership.company_id,
        requested_setting: "candidate_scope",
        fallback_value: "company",
      }),
    ]);
    if (registerPermissionError || legacyCreatePermissionError || registrationSettingError || scopeError) {
      return NextResponse.json({ error: "Unable to verify candidate registration access." }, { status: 503, headers });
    }
    if (!(canRegister || canCreate) || registrationSetting !== "true") {
      return NextResponse.json({ error: "You do not have permission to register candidates." }, { status: 403, headers });
    }

    let inquiryAgentUserId: string | null = null;
    let inquiryCreatedBy: string | null = null;
    if (inquiryId) {
      const { data: inquiry, error: inquiryError } = await supabase.from("candidate_inquiries")
        .select("id, agent_user_id, created_by").eq("id", inquiryId).eq("company_id", membership.company_id).eq("status", "inquiry").maybeSingle();
      if (inquiryError || !inquiry) return NextResponse.json({ error: "This inquiry is no longer open for registration." }, { status: 409, headers });
      inquiryAgentUserId = inquiry.agent_user_id;
      inquiryCreatedBy = inquiry.created_by;
    }

    const requestedAgentUserId = typeof body.agentUserId === "string" && body.agentUserId
      ? body.agentUserId
      : null;
    if (requestedAgentUserId && !isUuid(requestedAgentUserId)) {
      return NextResponse.json({ error: "The assigned agent is invalid." }, { status: 400, headers });
    }

    const { data: people, error: peopleError } = await supabase.rpc(
      "list_candidate_inquiry_people",
      { requested_company_id: membership.company_id },
    );
    if (peopleError) {
      console.error("Candidate agent lookup failed", peopleError);
      return NextResponse.json({ error: "Unable to verify the assigned agent." }, { status: 503, headers });
    }
    const agents = (people ?? []).filter((person: { role_name: string }) =>
      person.role_name.toLocaleLowerCase().includes("agent"),
    );
    const requestedAgentName = typeof body.agent === "string" ? body.agent.trim() : "";
    let assignedAgent = requestedAgentUserId
      ? agents.find((person: { user_id: string }) => person.user_id === requestedAgentUserId)
      : agents.find((person: { display_name: string }) =>
        person.display_name.trim().toLocaleLowerCase() === requestedAgentName.toLocaleLowerCase(),
      );
    if (requestedAgentUserId && !assignedAgent) {
      return NextResponse.json({ error: "Select an active agent in this company." }, { status: 400, headers });
    }
    if (candidateScope === "assigned") {
      if (requestedAgentUserId && requestedAgentUserId !== user.id) {
        return NextResponse.json({ error: "You can only assign candidates to your own agent account." }, { status: 403, headers });
      }
      assignedAgent = agents.find((person: { user_id: string }) => person.user_id === user.id);
    } else if (!assignedAgent && inquiryAgentUserId) {
      assignedAgent = agents.find((person: { user_id: string }) => person.user_id === inquiryAgentUserId);
    } else if (!assignedAgent && inquiryCreatedBy === user.id) {
      assignedAgent = agents.find((person: { user_id: string }) => person.user_id === user.id);
    }
    if (requestedAgentName && !assignedAgent && candidateScope !== "assigned") {
      return NextResponse.json({ error: "Choose an active agent from the company roster." }, { status: 400, headers });
    }
    const agentUserId = assignedAgent?.user_id ?? null;
    const agentName = assignedAgent?.display_name ?? requestedAgentName;

    const dateOfBirth = typeof body.dob === "string" && body.dob ? body.dob : null;
    if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth)))) {
      return NextResponse.json({ error: "Date of birth is invalid." }, { status: 400, headers });
    }
    const candidateId = randomUUID();
    try {
      await ensureInterServerCandidateFolders(membership.company_id, candidateId, `${firstName} ${lastName}`);
    } catch (error) {
      console.error("Candidate InterServer folder could not be created", error);
      return NextResponse.json({ error: "Unable to create the candidate folder in InterServer. Check the FTP connection and remote base path." }, { status: 503, headers });
    }
    const { data, error } = await supabase.from("candidates").insert({
      id: candidateId,
      company_id: membership.company_id,
      branch_id: membership.branch_id ?? null,
      created_by: user.id,
      inquiry_id: inquiryId,
      file_number: fileNumber,
      first_name: firstName,
      last_name: lastName,
      phone,
      date_of_birth: dateOfBirth,
      place_of_birth: typeof body.placeOfBirth === "string" ? body.placeOfBirth.trim() : "",
      agent_name: agentName,
      agent_user_id: agentUserId,
      religion: typeof body.religion === "string" ? body.religion.trim() : "",
      position: Array.isArray(body.jobOfInterest) ? body.jobOfInterest.join(", ") : "",
      nationality: typeof body.nationality === "string" ? body.nationality.trim() : "",
      father_name: typeof body.fatherName === "string" ? body.fatherName.trim() : "",
      mother_name: typeof body.motherName === "string" ? body.motherName.trim() : "",
      details,
    }).select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, agent_user_id, religion, position, nationality, father_name, mother_name, details").single();

    if (error || !data) {
      console.error("Candidate registration failed", error);
      return NextResponse.json({ error: error?.code === "23505" ? "That file number already exists in this company." : "Unable to register this candidate. Check your create permission." }, { status: 403, headers });
    }
    return NextResponse.json({ candidate: data }, { status: 201, headers });
  } catch (error) {
    console.error("Candidate registration request failed", error);
    return NextResponse.json({ error: "Candidate registration is unavailable." }, { status: 503, headers });
  }
}