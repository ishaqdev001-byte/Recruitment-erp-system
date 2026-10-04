import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const candidateDetailFields = new Set([
  "otherNames", "secondaryPhone", "otherPhone", "age", "gender", "maritalStatus", "abroadStatus", "abroadExperience", "source", "mediaChannel",
  "nin", "passportNumber", "passportIssue", "passportExpiry", "passportStatus", "height", "weight", "shirtSize", "shoeSize", "waistSize", "preferredCities",
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
    if (typeof fieldValue === "string" && fieldValue.length <= 4000) details[key] = fieldValue;
    else if (typeof fieldValue === "number" && key === "age" && Number.isFinite(fieldValue) && fieldValue >= 0 && fieldValue <= 120) details[key] = fieldValue;
    else if (Array.isArray(fieldValue) && fieldValue.length <= 50 && fieldValue.every((item) => typeof item === "string" && item.length <= 200)) details[key] = fieldValue;
    else return null;
  }
  return details;
}

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data, error } = await supabase
      .from("candidates")
      .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Candidate list query failed", error);
      return NextResponse.json({ error: "Unable to load candidates." }, { status: 403, headers });
    }

    return NextResponse.json({ candidates: data }, { headers });
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

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });

    const dateOfBirth = typeof body.dob === "string" && body.dob ? body.dob : null;
    if (dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(Date.parse(dateOfBirth)))) {
      return NextResponse.json({ error: "Date of birth is invalid." }, { status: 400, headers });
    }
    const { data, error } = await supabase.from("candidates").insert({
      company_id: membership.company_id,
      created_by: user.id,
      file_number: fileNumber,
      first_name: firstName,
      last_name: lastName,
      phone,
      date_of_birth: dateOfBirth,
      place_of_birth: typeof body.placeOfBirth === "string" ? body.placeOfBirth.trim() : "",
      agent_name: typeof body.agent === "string" ? body.agent.trim() : "",
      religion: typeof body.religion === "string" ? body.religion.trim() : "",
      position: Array.isArray(body.jobOfInterest) ? body.jobOfInterest.join(", ") : "",
      nationality: typeof body.nationality === "string" ? body.nationality.trim() : "",
      father_name: typeof body.fatherName === "string" ? body.fatherName.trim() : "",
      mother_name: typeof body.motherName === "string" ? body.motherName.trim() : "",
      details,
    }).select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details").single();

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