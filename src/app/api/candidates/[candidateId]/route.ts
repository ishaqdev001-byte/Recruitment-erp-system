import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const candidateFields = [
  "file_number", "first_name", "last_name", "phone", "date_of_birth",
  "place_of_birth", "agent_name", "religion", "position", "nationality",
  "father_name", "mother_name",
] as const;

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

export async function PATCH(request: Request, context: RouteContext<"/api/candidates/[candidateId]">) {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const { candidateId } = await context.params;
    if (!isUuid(candidateId)) return NextResponse.json({ error: "Candidate not found." }, { status: 404, headers });

    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid candidate update." }, { status: 400, headers });

    const updates: Record<string, string | null | Record<string, string | number | string[]>> = {};
    for (const field of candidateFields) {
      if (!(field in body)) continue;
      const value = body[field];
      if (field === "date_of_birth") {
        if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) {
          return NextResponse.json({ error: "Date of birth is invalid." }, { status: 400, headers });
        }
        updates[field] = value as string | null;
        continue;
      }
      if (typeof value !== "string" || value.length > (field === "file_number" ? 100 : 200)) {
        return NextResponse.json({ error: `The ${field.replace(/_/g, " ")} value is invalid.` }, { status: 400, headers });
      }
      updates[field] = value.trim();
    }
    if ("details" in body) {
      const details = readCandidateDetails(body.details);
      if (!details) return NextResponse.json({ error: "One or more extended candidate details are invalid." }, { status: 400, headers });
      const assignedAgent = typeof updates.agent_name === "string" ? updates.agent_name : "";
      const passportError = passportSetupError(details, assignedAgent);
      if (passportError) return NextResponse.json({ error: passportError }, { status: 400, headers });
      updates.details = details;
    }
    if (!Object.keys(updates).length) return NextResponse.json({ error: "Provide at least one candidate field to update." }, { status: 400, headers });

    const { data, error } = await supabase
      .from("candidates")
      .update(updates as never)
      .eq("id", candidateId)
      .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details")
      .maybeSingle();
    if (error || !data) {
      console.error("Candidate update failed", error);
      return NextResponse.json({ error: "Unable to update this candidate. Check your edit permission." }, { status: 403, headers });
    }

    return NextResponse.json({ candidate: data }, { headers });
  } catch (error) {
    console.error("Candidate update request failed", error);
    return NextResponse.json({ error: "Candidate update is unavailable." }, { status: 503, headers });
  }
}