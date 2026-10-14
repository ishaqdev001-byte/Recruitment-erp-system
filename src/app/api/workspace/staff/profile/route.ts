import { NextResponse } from "next/server";
import { getLinkedStaffAccess } from "@/lib/server/staff-profile";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const sexOptions = ["Female", "Male", "Other", "Prefer not to say"] as const;

type Qualification = { qualification: string; institution: string; year: number };
type Experience = { employer: string; position: string; location: string; startDate: string; endDate: string; responsibilities: string };

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function parseQualifications(value: unknown): Qualification[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) return null;
  const result: Qualification[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    const qualification = typeof item.qualification === "string" ? item.qualification.trim() : "";
    const institution = typeof item.institution === "string" ? item.institution.trim() : "";
    const year = Number(item.year);
    if (!qualification || qualification.length > 200 || !institution || institution.length > 200
      || !Number.isInteger(year) || year < 1900 || year > new Date().getFullYear()) return null;
    result.push({ qualification, institution, year });
  }
  return result;
}

function parseExperience(value: unknown): Experience[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const result: Experience[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    const experience = {
      employer: typeof item.employer === "string" ? item.employer.trim() : "",
      position: typeof item.position === "string" ? item.position.trim() : "",
      location: typeof item.location === "string" ? item.location.trim() : "",
      startDate: typeof item.startDate === "string" ? item.startDate : "",
      endDate: typeof item.endDate === "string" ? item.endDate : "",
      responsibilities: typeof item.responsibilities === "string" ? item.responsibilities.trim() : "",
    };
    if (!experience.employer || !experience.position || !experience.location || !validDate(experience.startDate)
      || (experience.endDate && !validDate(experience.endDate)) || experience.responsibilities.length > 2000) return null;
    result.push(experience);
  }
  return result.sort((first, second) => (second.endDate || second.startDate).localeCompare(first.endDate || first.startDate));
}

function parseProfile(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
  const sex = body.sex;
  const localAddress = typeof body.localAddress === "string" ? body.localAddress.trim() : "";
  const permanentAddress = typeof body.permanentAddress === "string" ? body.permanentAddress.trim() : "";
  const nextOfKin = typeof body.nextOfKin === "string" ? body.nextOfKin.trim() : "";
  const nextOfKinPhone = typeof body.nextOfKinPhone === "string" ? body.nextOfKinPhone.trim() : "";
  const emergencyContactAddress = typeof body.emergencyContactAddress === "string" ? body.emergencyContactAddress.trim() : "";
  const passportNumber = typeof body.passportNumber === "string" ? body.passportNumber.trim() : "";
  const passportExpiry = typeof body.passportExpiry === "string" ? body.passportExpiry : "";
  const nationalIdNumber = typeof body.nationalIdNumber === "string" ? body.nationalIdNumber.trim() : "";
  const nationalIdExpiry = typeof body.nationalIdExpiry === "string" ? body.nationalIdExpiry : "";
  const academicQualifications = parseQualifications(body.academicQualifications);
  const professionalQualifications = parseQualifications(body.professionalQualifications);
  const workExperience = parseExperience(body.workExperience);
  const languages = Array.isArray(body.languages) ? body.languages.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
  const hasCriminalRecord = body.hasCriminalRecord;
  const criminalCaseType = typeof body.criminalCaseType === "string" ? body.criminalCaseType.trim() : "";
  const criminalCaseYear = body.criminalCaseYear === "" || body.criminalCaseYear === null ? null : Number(body.criminalCaseYear);
  const criminalCaseStatus = typeof body.criminalCaseStatus === "string" ? body.criminalCaseStatus.trim() : "";

  if (!name || name.length > 200 || !phone || phone.length > 60 || !validDate(dateOfBirth)
    || !sexOptions.includes(sex as (typeof sexOptions)[number])
    || !localAddress || localAddress.length > 500 || !permanentAddress || permanentAddress.length > 500
    || !nextOfKin || nextOfKin.length > 200 || !nextOfKinPhone || nextOfKinPhone.length > 60
    || !emergencyContactAddress || emergencyContactAddress.length > 500
    || !passportNumber || passportNumber.length > 30 || !validDate(passportExpiry)
    || !nationalIdNumber || nationalIdNumber.length > 40 || !validDate(nationalIdExpiry)
    || !academicQualifications || !professionalQualifications || workExperience === null
    || languages.length === 0 || languages.length > 30 || languages.some((language) => language.length > 60)
    || typeof hasCriminalRecord !== "boolean"
    || (hasCriminalRecord && (!criminalCaseType || criminalCaseType.length > 200 || !Number.isInteger(criminalCaseYear) || Number(criminalCaseYear) < 1900 || Number(criminalCaseYear) > new Date().getFullYear() || !criminalCaseStatus || criminalCaseStatus.length > 200))) return null;

  return {
    name, phone, dateOfBirth, sex, localAddress, permanentAddress, nextOfKin, nextOfKinPhone,
    emergencyContactAddress, passportNumber, passportExpiry, nationalIdNumber, nationalIdExpiry,
    academicQualifications, professionalQualifications, workExperience, languages, hasCriminalRecord,
    criminalCaseType: hasCriminalRecord ? criminalCaseType : "",
    criminalCaseYear: hasCriminalRecord ? criminalCaseYear : null,
    criminalCaseStatus: hasCriminalRecord ? criminalCaseStatus : "",
  };
}

function mapProfile(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    name: String(record.name ?? ""),
    position: String(record.position ?? ""),
    phone: String(record.phone ?? ""),
    dateOfBirth: record.date_of_birth ? String(record.date_of_birth) : "",
    sex: String(record.sex ?? ""),
    localAddress: String(record.local_address ?? ""),
    permanentAddress: String(record.permanent_address ?? ""),
    nextOfKin: String(record.next_of_kin ?? ""),
    nextOfKinPhone: String(record.next_of_kin_phone ?? ""),
    emergencyContactAddress: String(record.emergency_contact_address ?? ""),
    passportNumber: String(record.passport_number ?? ""),
    passportExpiry: record.passport_expiry ? String(record.passport_expiry) : "",
    nationalIdNumber: String(record.national_id_number ?? ""),
    nationalIdExpiry: record.national_id_expiry ? String(record.national_id_expiry) : "",
    academicQualifications: record.academic_qualifications ?? [],
    professionalQualifications: record.professional_qualifications ?? [],
    workExperience: record.work_experience ?? [],
    languages: record.languages ?? [],
    hasCriminalRecord: Boolean(record.has_criminal_record),
    criminalCaseType: String(record.criminal_case_type ?? ""),
    criminalCaseYear: record.criminal_case_year ?? "",
    criminalCaseStatus: String(record.criminal_case_status ?? ""),
  };
}

const selection = "id, name, position, phone, date_of_birth, sex, local_address, permanent_address, next_of_kin, next_of_kin_phone, emergency_contact_address, passport_number, passport_expiry, national_id_number, national_id_expiry, academic_qualifications, professional_qualifications, work_experience, languages, has_criminal_record, criminal_case_type, criminal_case_year, criminal_case_status";

export async function GET() {
  const access = await getLinkedStaffAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const { data, error } = await access.admin.from("company_staff_members").select(selection)
    .eq("company_id", access.companyId).eq("id", access.staffId).single();
  if (error) return NextResponse.json({ error: "Unable to load your HR profile." }, { status: 500, headers });
  return NextResponse.json({ profile: mapProfile(data as Record<string, unknown>) }, { headers });
}

export async function PATCH(request: Request) {
  const access = await getLinkedStaffAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const profile = body ? parseProfile(body) : null;
  if (!profile) return NextResponse.json({ error: "Complete all required personal details and provide at least two academic and two professional qualifications." }, { status: 400, headers });

  const { data, error } = await access.admin.from("company_staff_members").update({
    name: profile.name,
    phone: profile.phone,
    date_of_birth: profile.dateOfBirth,
    sex: profile.sex,
    local_address: profile.localAddress,
    permanent_address: profile.permanentAddress,
    next_of_kin: profile.nextOfKin,
    next_of_kin_phone: profile.nextOfKinPhone,
    emergency_contact_address: profile.emergencyContactAddress,
    passport_number: profile.passportNumber,
    passport_expiry: profile.passportExpiry,
    national_id_number: profile.nationalIdNumber,
    national_id_expiry: profile.nationalIdExpiry,
    academic_qualifications: profile.academicQualifications,
    professional_qualifications: profile.professionalQualifications,
    work_experience: profile.workExperience,
    languages: profile.languages,
    has_criminal_record: profile.hasCriminalRecord,
    criminal_case_type: profile.criminalCaseType,
    criminal_case_year: profile.criminalCaseYear,
    criminal_case_status: profile.criminalCaseStatus,
    updated_by: access.userId,
  }).eq("company_id", access.companyId).eq("id", access.staffId).eq("linked_user_id", access.userId)
    .select(selection).single();
  if (error) return NextResponse.json({ error: "Unable to save your HR profile." }, { status: 500, headers });
  return NextResponse.json({ profile: mapProfile(data as Record<string, unknown>) }, { headers });
}