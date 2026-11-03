import { NextResponse } from "next/server";
import { getLinkedStaffAccess } from "@/lib/server/staff-profile";
import {
  getStaffProfileReminder,
  markStaffPersonalDetailsSaved,
} from "@/lib/server/staff-profile-reminders";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const sexOptions = ["Female", "Male", "Other", "Prefer not to say"] as const;

type Qualification = { qualification: string; institution: string; year: number };
type Experience = { employer: string; position: string; location: string; startDate: string; endDate: string; responsibilities: string };
type ProfileSection =
  | "personal"
  | "identification"
  | "academicQualifications"
  | "professionalQualifications"
  | "workExperience"
  | "languages";

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

function parseQualifications(value: unknown): Qualification[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const result: Qualification[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const item = row as Record<string, unknown>;
    const qualification = typeof item.qualification === "string" ? item.qualification.trim() : "";
    const institution = typeof item.institution === "string" ? item.institution.trim() : "";
    if (!qualification && !institution && (item.year === "" || item.year === null || item.year === undefined)) continue;
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
    if (
      [item.employer, item.position, item.location, item.startDate, item.endDate, item.responsibilities]
        .every((field) => typeof field !== "string" || !field.trim())
    ) continue;
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

function parseProfileSection(
  body: Record<string, unknown>,
  section: unknown,
): Record<string, unknown> | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
  const sex = body.sex;
  const localAddress = typeof body.localAddress === "string" ? body.localAddress.trim() : "";
  const permanentAddress = typeof body.permanentAddress === "string" ? body.permanentAddress.trim() : "";
  const nextOfKin = typeof body.nextOfKin === "string" ? body.nextOfKin.trim() : "";
  const nextOfKinPhone = typeof body.nextOfKinPhone === "string" ? body.nextOfKinPhone.trim() : "";
  const emergencyContactAddress = typeof body.emergencyContactAddress === "string" ? body.emergencyContactAddress.trim() : "";
  if (section === "personal") {
    if (!name || name.length > 200 || !phone || phone.length > 60 || !validDate(dateOfBirth)
      || !sexOptions.includes(sex as (typeof sexOptions)[number])
      || !localAddress || localAddress.length > 500
      || permanentAddress.length > 500 || !nextOfKin || nextOfKin.length > 200
      || !nextOfKinPhone || nextOfKinPhone.length > 60
      || !emergencyContactAddress || emergencyContactAddress.length > 500) return null;
    return {
      name, phone, dateOfBirth, sex, localAddress, permanentAddress, nextOfKin,
      nextOfKinPhone, emergencyContactAddress,
    };
  }

  if (section === "identification") {
    const passportNumber = typeof body.passportNumber === "string" ? body.passportNumber.trim() : "";
    const passportExpiry = typeof body.passportExpiry === "string" ? body.passportExpiry : "";
    const nationalIdNumber = typeof body.nationalIdNumber === "string" ? body.nationalIdNumber.trim() : "";
    const nationalIdExpiry = typeof body.nationalIdExpiry === "string" ? body.nationalIdExpiry : "";
    if (passportNumber.length > 30 || (passportExpiry && !validDate(passportExpiry))
      || nationalIdNumber.length > 40 || (nationalIdExpiry && !validDate(nationalIdExpiry))) return null;
    return { passportNumber, passportExpiry, nationalIdNumber, nationalIdExpiry };
  }

  if (section === "academicQualifications" || section === "professionalQualifications") {
    const qualifications = parseQualifications(body[section]);
    return qualifications ? { [section]: qualifications } : null;
  }

  if (section === "workExperience") {
    const workExperience = parseExperience(body.workExperience);
    return workExperience === null ? null : { workExperience };
  }

  if (section === "languages") {
    const languages = Array.isArray(body.languages)
      ? body.languages.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : null;
    const hasCriminalRecord = body.hasCriminalRecord;
    const criminalCaseType = typeof body.criminalCaseType === "string" ? body.criminalCaseType.trim() : "";
    const criminalCaseYear = body.criminalCaseYear === "" || body.criminalCaseYear === null ? null : Number(body.criminalCaseYear);
    const criminalCaseStatus = typeof body.criminalCaseStatus === "string" ? body.criminalCaseStatus.trim() : "";
    if (!languages || languages.length > 30 || languages.some((language) => language.length > 60)
      || typeof hasCriminalRecord !== "boolean"
      || (hasCriminalRecord && (!criminalCaseType || criminalCaseType.length > 200
        || !Number.isInteger(criminalCaseYear) || Number(criminalCaseYear) < 1900
        || Number(criminalCaseYear) > new Date().getFullYear()
        || !criminalCaseStatus || criminalCaseStatus.length > 200))) return null;
    return {
      languages,
      hasCriminalRecord,
      criminalCaseType: hasCriminalRecord ? criminalCaseType : "",
      criminalCaseYear: hasCriminalRecord ? criminalCaseYear : null,
      criminalCaseStatus: hasCriminalRecord ? criminalCaseStatus : "",
    };
  }

  return null;
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

function hasRequiredPersonalDetails(profile: ReturnType<typeof mapProfile>) {
  return Boolean(
    profile.name.trim()
    && profile.phone.trim()
    && profile.dateOfBirth
    && profile.sex
    && profile.localAddress.trim()
    && profile.nextOfKin.trim()
    && profile.nextOfKinPhone.trim()
    && profile.emergencyContactAddress.trim()
  );
}

export async function GET() {
  try {
    const access = await getLinkedStaffAccess(false);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const { data, error } = await access.admin.from("company_staff_members").select(selection)
      .eq("company_id", access.companyId).eq("id", access.staffId).single();
    if (error) return NextResponse.json({ error: "Unable to load your HR profile." }, { status: 500, headers });
    const profile = mapProfile(data as Record<string, unknown>);
    const personalDetailsComplete = hasRequiredPersonalDetails(profile);
    const reminder = await getStaffProfileReminder(access, personalDetailsComplete);
    return NextResponse.json({
      profile,
      personalDetailsComplete,
      reminder,
    }, { headers });
  } catch (err) {
    console.error("Error in GET /api/workspace/staff/profile:", err);
    return NextResponse.json({ error: "An unexpected error occurred while loading your HR profile." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getLinkedStaffAccess(false);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const section = body?.section as ProfileSection | undefined;
    const profile = body ? parseProfileSection(body, section) : null;
    if (!profile) return NextResponse.json({ error: "Review this section and complete any fields you started." }, { status: 400, headers });

    const { data: reminderState, error: reminderStateError } = await access.admin
      .from("staff_hr_profile_reminders")
      .select("update_required, updated_at")
      .eq("company_id", access.companyId)
      .eq("staff_id", access.staffId)
      .eq("user_id", access.userId)
      .maybeSingle();
    if (reminderStateError) {
      return NextResponse.json({ error: "Unable to verify your HR profile review status." }, { status: 500, headers });
    }
    if (reminderState?.update_required && section !== "personal") {
      return NextResponse.json(
        { error: "Update your personal details before returning to the workspace." },
        { status: 403, headers },
      );
    }
    if (reminderState?.update_required) {
      const { data: current, error: currentError } = await access.admin
        .from("company_staff_members")
        .select("name, phone, local_address, permanent_address, next_of_kin, next_of_kin_phone, emergency_contact_address, updated_at")
        .eq("company_id", access.companyId)
        .eq("id", access.staffId)
        .eq("linked_user_id", access.userId)
        .single();
      if (currentError) {
        return NextResponse.json({ error: "Unable to verify your personal details." }, { status: 500, headers });
      }

      const comparableFields: [string, keyof typeof current][] = [
        ["name", "name"],
        ["phone", "phone"],
        ["localAddress", "local_address"],
        ["permanentAddress", "permanent_address"],
        ["nextOfKin", "next_of_kin"],
        ["nextOfKinPhone", "next_of_kin_phone"],
        ["emergencyContactAddress", "emergency_contact_address"],
      ];
      const changed = comparableFields.some(([profileKey, column]) => {
        const nextValue =
          typeof profile[profileKey] === "string"
            ? String(profile[profileKey]).trim()
            : "";
        const previousValue =
          typeof current[column] === "string" ? current[column].trim() : "";
        return nextValue !== previousValue;
      });
      const savedAfterReview =
        typeof current.updated_at === "string" &&
        typeof reminderState.updated_at === "string" &&
        Date.parse(current.updated_at) > Date.parse(reminderState.updated_at);
      if (!changed && !savedAfterReview) {
        return NextResponse.json(
          { error: "Update at least one contact or address field before continuing." },
          { status: 409, headers },
        );
      }
    }

    const updates: Record<string, unknown> = {
      updated_by: access.userId,
      updated_at: new Date().toISOString(),
    };
    if (section === "personal") {
      Object.assign(updates, {
        name: profile.name,
        phone: profile.phone,
        date_of_birth: profile.dateOfBirth,
        sex: profile.sex,
        local_address: profile.localAddress,
        permanent_address: profile.permanentAddress,
        next_of_kin: profile.nextOfKin,
        next_of_kin_phone: profile.nextOfKinPhone,
        emergency_contact_address: profile.emergencyContactAddress,
      });
    } else if (section === "identification") {
      Object.assign(updates, {
        passport_number: profile.passportNumber,
        passport_expiry: profile.passportExpiry || null,
        national_id_number: profile.nationalIdNumber,
        national_id_expiry: profile.nationalIdExpiry || null,
      });
    } else if (section === "academicQualifications") {
      updates.academic_qualifications = profile["academicQualifications"];
    } else if (section === "professionalQualifications") {
      updates.professional_qualifications = profile["professionalQualifications"];
    } else if (section === "workExperience") {
      updates.work_experience = profile.workExperience;
    } else if (section === "languages") {
      Object.assign(updates, {
        languages: profile.languages,
        has_criminal_record: profile.hasCriminalRecord,
        criminal_case_type: profile.criminalCaseType,
        criminal_case_year: profile.criminalCaseYear,
        criminal_case_status: profile.criminalCaseStatus,
      });
    }

    const { data, error } = await access.admin.from("company_staff_members").update({
      ...updates,
      updated_by: access.userId,
    }).eq("company_id", access.companyId).eq("id", access.staffId).eq("linked_user_id", access.userId)
      .select(selection).single();
    if (error) return NextResponse.json({ error: "Unable to save your HR profile." }, { status: 500, headers });
    const updatedProfile = mapProfile(data as Record<string, unknown>);
    const personalDetailsComplete = hasRequiredPersonalDetails(updatedProfile);
    const reminder = section === "personal" && personalDetailsComplete
      ? await markStaffPersonalDetailsSaved(access)
      : await getStaffProfileReminder(access, personalDetailsComplete);
    return NextResponse.json({
      profile: updatedProfile,
      personalDetailsComplete,
      reminder,
    }, { headers });
  } catch (err) {
    console.error("Error in PATCH /api/workspace/staff/profile:", err);
    return NextResponse.json({ error: "An unexpected error occurred while saving your HR profile." }, { status: 500, headers });
  }
}