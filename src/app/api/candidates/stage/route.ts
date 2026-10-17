import { NextResponse } from "next/server";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
function projectAgeRange(value: string) {
  const range = value.match(/(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})/i);
  if (range) {
    const minimum = Number(range[1]);
    const maximum = Number(range[2]);
    return minimum <= maximum ? { minimum, maximum } : null;
  }
  const minimumOnly = value.match(/(\d{1,3})\s*\+/);
  if (minimumOnly) return { minimum: Number(minimumOnly[1]), maximum: 120 };
  const maximumOnly = value.match(/(?:under|below|up to|maximum|max)\s*(\d{1,3})/i);
  if (maximumOnly) return { minimum: 0, maximum: Number(maximumOnly[1]) };
  return null;
}

function candidateAge(candidate: { date_of_birth: string | null; details: Record<string, unknown> | null }) {
  const storedAge = candidate.details?.age;
  if (typeof storedAge === "number" && Number.isFinite(storedAge) && storedAge > 0) return Math.floor(storedAge);
  if (!candidate.date_of_birth) return null;
  const birthDate = new Date(`${candidate.date_of_birth}T00:00:00Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  if (today.getUTCMonth() < birthDate.getUTCMonth()
    || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });

    const { data: membership, error: membershipError } = await supabase.from("company_memberships")
      .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });

    const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "candidates.edit",
    });
    if (permissionError || !allowed) return NextResponse.json({ error: "You do not have permission to advance candidate stages." }, { status: 403, headers });

    const body = await request.json().catch(() => null) as {
      action?: unknown;
      candidateIds?: unknown;
      projectId?: unknown;
      offerLetter?: unknown;
      wakalaReceived?: unknown;
      molReceived?: unknown;
    } | null;
    const candidateIds = Array.isArray(body?.candidateIds) ? [...new Set(body.candidateIds)] : [];
    if (!candidateIds.length || candidateIds.length > 100 || candidateIds.some((id) => typeof id !== "string" || !isUuid(id))) {
      return NextResponse.json({ error: "Select between 1 and 100 valid candidates." }, { status: 400, headers });
    }

    const { data: candidates, error: candidatesError } = await supabase.from("candidates")
      .select("id, first_name, last_name, date_of_birth, nationality, position, details")
      .eq("company_id", membership.company_id).in("id", candidateIds);
    if (candidatesError || candidates?.length !== candidateIds.length) {
      return NextResponse.json({ error: "One or more selected candidates could not be found in this company." }, { status: 404, headers });
    }

    if (body?.action === "save-additional-stages") {
      const fields = ["offerLetter", "wakalaReceived", "molReceived"] as const;
      const answers: Partial<Record<(typeof fields)[number], "Yes" | "No">> = {};
      for (const field of fields) {
        if (body[field] === undefined || body[field] === "") continue;
        if (body[field] !== "Yes" && body[field] !== "No") {
          return NextResponse.json({ error: `Choose Yes or No for ${field}.` }, { status: 400, headers });
        }
        answers[field] = body[field];
      }
      if (!Object.keys(answers).length) return NextResponse.json({ error: "Choose at least one stage value." }, { status: 400, headers });

      const updated: Record<string, unknown>[] = [];
      const rejected: { candidateId: string; name: string; reasons: string[]; kind: "transition" }[] = [];
      for (const candidate of candidates) {
        const details = candidate.details && typeof candidate.details === "object" && !Array.isArray(candidate.details)
          ? candidate.details as Record<string, unknown>
          : {};
        const name = `${candidate.first_name} ${candidate.last_name}`;
        if (details.stage !== "Submitted to Project") {
          rejected.push({ candidateId: candidate.id, name, reasons: ["candidate must be submitted to a project first"], kind: "transition" });
          continue;
        }
        const { data, error } = await supabase.from("candidates").update({ details: { ...details, ...answers } as never })
          .eq("id", candidate.id).eq("company_id", membership.company_id)
          .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details")
          .maybeSingle();
        if (error || !data) {
          rejected.push({ candidateId: candidate.id, name, reasons: ["stage details could not be saved; verify edit access and try again"], kind: "transition" });
          continue;
        }
        updated.push(data);
      }
      return NextResponse.json({ updated, rejected }, { headers });
    }

    if (body?.action === "submit-to-project") {
      if (typeof body.projectId !== "string" || !isUuid(body.projectId)) {
        return NextResponse.json({ error: "Select an active project before advancing the stage." }, { status: 400, headers });
      }
      const { data: project, error: projectError } = await supabase.from("projects")
        .select("id, project_name, country, age_bracket")
        .eq("id", body.projectId).eq("company_id", membership.company_id).eq("status", "active").maybeSingle();
      if (projectError || !project) return NextResponse.json({ error: "Select an active project belonging to this company." }, { status: 400, headers });
      const range = projectAgeRange(project.age_bracket);
      if (!range) return NextResponse.json({ error: `Project ${project.project_name} has an age requirement that cannot be validated. Update its age bracket first.` }, { status: 400, headers });

      const updated: Record<string, unknown>[] = [];
      const rejected: { candidateId: string; name: string; reasons: string[]; kind: "qualification" | "transition" }[] = [];
      for (const candidate of candidates) {
        const details = candidate.details && typeof candidate.details === "object" && !Array.isArray(candidate.details)
          ? candidate.details as Record<string, unknown>
          : {};
        const name = `${candidate.first_name} ${candidate.last_name}`;
        if (!new Set(["Registration", "Project Submission", "Submitted to Project"]).has(String(details.stage ?? "Registration"))) {
          rejected.push({ candidateId: candidate.id, name, reasons: [`candidate is currently at ${String(details.stage)}`], kind: "transition" });
          continue;
        }
        const reasons: string[] = [];
        const age = candidateAge(candidate);
        if (age === null) reasons.push("candidate age is missing");
        else if (age < range.minimum || age > range.maximum) reasons.push(`age ${age} is outside the project requirement ${project.age_bracket}`);
        const preferredCountries = Array.isArray(details.preferredCountries)
          ? details.preferredCountries.filter((country): country is string => typeof country === "string")
          : [];
        if (!preferredCountries.length) reasons.push("deployment country preference is missing");
        else if (!preferredCountries.some((country) => country.trim().toLocaleLowerCase() === project.country.trim().toLocaleLowerCase())) {
          reasons.push(`country of deployment ${project.country} is not in the candidate's preferred countries`);
        }
        if (reasons.length) {
          rejected.push({ candidateId: candidate.id, name, reasons, kind: "qualification" });
          continue;
        }

        const nextDetails: Record<string, unknown> = {
          ...details,
          stage: "Submitted to Project",
          assignedProjectId: project.id,
          assignedContracts: project.project_name,
          contracts: project.project_name,
        };
        const { data, error } = await supabase.from("candidates").update({ details: nextDetails as never })
          .eq("id", candidate.id).eq("company_id", membership.company_id)
          .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details")
          .maybeSingle();
        if (error || !data) {
          rejected.push({ candidateId: candidate.id, name, reasons: ["project submission could not be saved; verify edit access and try again"], kind: "transition" });
          continue;
        }
        updated.push(data);
      }
      return NextResponse.json({ updated, rejected }, { headers });
    }

    return NextResponse.json({ error: "Choose a valid candidate stage action." }, { status: 400, headers });
  } catch (error) {
    console.error("Candidate stage update failed", error);
    return NextResponse.json({ error: "Candidate stages are unavailable." }, { status: 503, headers });
  }
}