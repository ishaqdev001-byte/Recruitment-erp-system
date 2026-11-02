import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { canViewCandidateFinance } from "@/lib/server/candidate-finance-access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureInterServerCandidateFolders } from "@/lib/storage/interserver";
import { isPassportNumberValid, normalizePassportNumber, passportNumberRule } from "@/lib/passport-number";

export const runtime = "nodejs";

const candidateDetailFields = new Set([
  "otherNames", "secondaryPhone", "otherPhone", "age", "gender", "maritalStatus", "abroadStatus", "abroadExperience", "source", "mediaChannel", "nationality",
  "nin", "passportNumber", "passportIssue", "passportExpiry", "passportStatus", "passportBranch", "passportStorageLocation", "height", "weight", "shirtSize", "shoeSize", "waistSize", "preferredCities",
  "physicalAddress", "residenceCountry", "residenceState", "district", "county", "subCounty", "parish", "fatherPhone", "fatherStatus", "motherPhone", "motherStatus",
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
  const passportNumber = typeof details.passportNumber === "string" ? normalizePassportNumber(details.passportNumber) : "";
  if (!passportNumber) return "Enter the candidate passport number.";
  const nationality = typeof details.nationality === "string" ? details.nationality : "";
  if (!nationality) return "Select the candidate nationality.";
  if (!isPassportNumberValid(nationality, passportNumber)) return passportNumberRule(nationality);
  if (details.passportStatus !== "Available" && details.passportStatus !== "With Agent") return "Choose whether the passport is available or with the assigned agent.";
  if (details.passportStatus === "Available" && (
    typeof details.passportBranch !== "string" || !details.passportBranch.trim()
    || typeof details.passportStorageLocation !== "string" || !details.passportStorageLocation.trim()
  )) return "Select a storage branch and location for an available passport.";
  if (details.passportStatus === "With Agent" && !agentName.trim()) return "Assign an agent when the passport is with an agent.";
  return "";
}

function candidateAge(dateOfBirth: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day
  ) return null;

  const today = new Date();
  if (birthDate > new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))) return null;

  let age = today.getUTCFullYear() - year;
  if (today.getUTCMonth() < month - 1 || (today.getUTCMonth() === month - 1 && today.getUTCDate() < day)) age -= 1;
  return age;
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
    const [{ data: roleData, error: roleError }, { data: company, error: companyError }] = await Promise.all([
      supabase.from("company_roles").select("name").eq("id", membership.role_id).maybeSingle(),
      supabase.from("companies").select("primary_admin_user_id").eq("id", membership.company_id).maybeSingle(),
    ]);
    if (roleError || !roleData || companyError || !company) {
      if (roleError || companyError) console.error("Candidate role access lookup failed", roleError ?? companyError);
      return NextResponse.json({ error: "Unable to verify your company role." }, { status: 503, headers });
    }

    const [
      { data: hasFinancePermission, error: financePermissionError },
      { data: canEditCandidates, error: editPermissionError },
      { data: canRegisterCandidates, error: registerPermissionError },
      { data: canCreateCandidates, error: legacyCreatePermissionError },
      { data: candidateScope, error: scopeError },
      { data: canViewAgentFinance, error: agentFinancePermissionError },
      { data: canManageCandidateSources, error: sourcePermissionError },
      { data: canUpdateCandidateStages, error: stagePermissionError },
      { data: canSubmitCandidatesToProjects, error: projectSubmissionPermissionError },
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
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.sources.manage",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.stage",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "candidates.project_submit",
      }),
    ]);
    if (financePermissionError || editPermissionError || registerPermissionError || legacyCreatePermissionError || scopeError || agentFinancePermissionError || sourcePermissionError || stagePermissionError || projectSubmissionPermissionError) {
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
    const canManagePassportStatus = company.primary_admin_user_id === user.id
      || ["chairman", "company owner / primary administrator", "general manager", "supervisor"]
        .includes(roleName.trim().toLocaleLowerCase());
    const canViewFinance = canViewCandidateFinance(roleName, Boolean(hasFinancePermission));
    const isAgent = candidateScope === "assigned";
    const canRegister = Boolean(canRegisterCandidates) && candidateRegistration === "true";

    let query = supabase
      .from("candidates")
      .select("id, source_row_number, branch_id, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, agent_user_id, religion, position, nationality, father_name, mother_name, details, created_at, created_by, updated_at, updated_by")
      .eq("company_id", membership.company_id)
      .order("created_at", { ascending: false });

    const [{ data, error }, { data: people, error: peopleError }] = await Promise.all([
      query,
      supabase.rpc("list_candidate_inquiry_people", { requested_company_id: membership.company_id }),
    ]);
    if (error || peopleError) {
      console.error("Candidate list query failed", error ?? peopleError);
      return NextResponse.json({ error: "Unable to load candidates." }, { status: 403, headers });
    }
    const names = new Map((people ?? []).map((person: { user_id: string; display_name: string }) => [person.user_id, person.display_name]));

    return NextResponse.json({
      candidates: (data ?? []).map((candidate) => ({
        ...candidate,
        created_by_name: candidate.created_by ? names.get(candidate.created_by) ?? "Former team member" : null,
        updated_by_name: candidate.updated_by ? names.get(candidate.updated_by) ?? "Former team member" : null,
      })),
      permissions: {
        canViewFinance: Boolean(canViewFinance),
        canViewAgentFinance: Boolean(canViewAgentFinance),
        canViewActivityLogs,
        canEditCandidates: Boolean(canEditCandidates),
        canUpdateCandidateStages: Boolean(canUpdateCandidateStages),
        canSubmitCandidatesToProjects: Boolean(canSubmitCandidatesToProjects),
        canRegisterCandidates: (Boolean(canRegisterCandidates) || Boolean(canCreateCandidates)) && canRegister,
        canManageCandidateSources: Boolean(canManageCandidateSources),
        canManagePassportStatus,
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
    const passportNumber = typeof details.passportNumber === "string"
      ? normalizePassportNumber(details.passportNumber)
      : "";
    if (passportNumber) {
      const { data: passportCheck, error: passportCheckError } = await supabase.rpc(
        "lookup_candidate_passport_registration",
        { requested_passport_number: passportNumber },
      );
      if (passportCheckError || !passportCheck?.length) {
        console.error("Candidate passport duplicate check failed", passportCheckError);
        return NextResponse.json({ error: "Unable to validate this passport number." }, { status: 503, headers });
      }
      if (passportCheck[0].is_registered) {
        const registeredBy = passportCheck[0].registered_by ?? "a former team member";
        return NextResponse.json({
          error: `Sorry, this passport number was already captured by ${registeredBy}.`,
          registeredBy,
        }, { status: 409, headers });
      }
    }
    const source = typeof details.source === "string" ? details.source.trim() : "";
    if (candidateScope !== "assigned" && !source) {
      return NextResponse.json({ error: "Select a candidate source before registering." }, { status: 400, headers });
    }
    if (source) {
      const { data: sourceOption, error: sourceError } = await supabase
        .from("candidate_source_options")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("source", source)
        .maybeSingle();
      if (sourceError) {
        console.error("Candidate source validation failed", sourceError);
        return NextResponse.json({ error: "Unable to verify the selected candidate source." }, { status: 503, headers });
      }
      if (!sourceOption) {
        return NextResponse.json({ error: "Select a source configured for this company." }, { status: 400, headers });
      }
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
    const passportError = passportSetupError(details, agentName);
    if (passportError) return NextResponse.json({ error: passportError }, { status: 400, headers });

    const branchId = typeof body.branchId === "string" && isUuid(body.branchId) ? body.branchId : "";
    if (!branchId) return NextResponse.json({ error: "Select an active company branch." }, { status: 400, headers });
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceUrl || !serviceRoleKey) {
      return NextResponse.json({ error: "Candidate branch verification is not configured on the server." }, { status: 503, headers });
    }
    const admin = createClient(serviceUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: selectedBranch, error: branchError } = await admin.from("company_branches")
      .select("id, name")
      .eq("id", branchId)
      .eq("company_id", membership.company_id)
      .eq("status", "active")
      .maybeSingle();
    if (branchError || !selectedBranch) {
      if (branchError) console.error("Candidate branch validation failed", branchError);
      return NextResponse.json({ error: "Select an active branch registered by this company." }, { status: 400, headers });
    }
    details.branch = selectedBranch.name;
    if (details.passportStatus === "Available" && details.passportBranch !== selectedBranch.name) {
      return NextResponse.json({ error: "Passport storage branch must be selected from this company's active branches." }, { status: 400, headers });
    }

    const dateOfBirth = typeof body.dob === "string" && body.dob ? body.dob : null;
    const age = dateOfBirth ? candidateAge(dateOfBirth) : null;
    if (dateOfBirth && age === null) {
      return NextResponse.json({ error: "Date of birth is invalid." }, { status: 400, headers });
    }
    details.age = age ?? 0;
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
      branch_id: branchId,
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
    }).select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, agent_user_id, religion, position, nationality, father_name, mother_name, details, created_at, created_by, updated_at, updated_by").single();

    if (error || !data) {
      console.error("Candidate registration failed", error);
      const duplicateError = `${error?.message ?? ""} ${error?.details ?? ""}`.toLocaleLowerCase();
      const duplicatePassport = error?.code === "23505" && (
        duplicateError.includes("passportnumber") ||
        duplicateError.includes("passport_number_unique_idx")
      );
      if (duplicatePassport) {
        const { data: passportCheck, error: passportCheckError } = await supabase.rpc(
          "lookup_candidate_passport_registration",
          { requested_passport_number: passportNumber },
        );
        if (passportCheckError || !passportCheck?.[0]?.is_registered) {
          console.error("Candidate passport owner lookup failed", passportCheckError);
          return NextResponse.json({
            error: "This passport number is already registered, but its registrar could not be verified. Please try again.",
          }, { status: 503, headers });
        }
        const registeredBy = passportCheck?.[0]?.registered_by ?? "another team member";
        return NextResponse.json({
          error: `Sorry, this passport number was already captured by ${registeredBy}.`,
          registeredBy,
        }, { status: 409, headers });
      }
      return NextResponse.json({
        error: error?.code === "23505"
            ? "That file number already exists in this company."
            : "Unable to register this candidate. Check your create permission.",
      }, { status: error?.code === "23505" ? 409 : 403, headers });
    }
    const actorNames = new Map((people ?? []).map((person: { user_id: string; display_name: string }) => [person.user_id, person.display_name]));
    return NextResponse.json({
      candidate: {
        ...data,
        created_by_name: data.created_by ? actorNames.get(data.created_by) ?? "Former team member" : null,
        updated_by_name: data.updated_by ? actorNames.get(data.updated_by) ?? "Former team member" : null,
      },
    }, { status: 201, headers });
  } catch (error) {
    console.error("Candidate registration request failed", error);
    return NextResponse.json({ error: "Candidate registration is unavailable." }, { status: 503, headers });
  }
}