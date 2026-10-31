import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendSmsUg, normalizeUgandanPhone } from "@/lib/server/smsug";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

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

// Safely queue an SMS row using the admin client (bypasses RLS).
async function queueSms(admin: ReturnType<typeof createAdminClient>, row: {
  company_id: string;
  candidate_id: string;
  phone: string;
  sms_title: string;
  message: string;
  sms_type: "visa_received" | "checkin_reminder" | "departure_reminder" | "post_departure_thanks";
  send_at: string;
}) {
  if (!admin) return;
  await admin.from("candidate_travel_sms_queue").insert(row);
}

function logBackgroundInsert(
  operation: () => PromiseLike<{ error: unknown }>,
  context: string,
) {
  void (async () => {
    try {
      const { error } = await operation();
      if (error) console.error(context, error);
    } catch (error) {
      console.error(context, error);
    }
  })();
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
      enjaz?: unknown;
      // ticketing fields
      ticketNumber?: unknown;
      bookingReference?: unknown;
      travelDate?: unknown;
      travelTime?: unknown;
      connectingFlights?: unknown;
    } | null;

    const candidateIds = Array.isArray(body?.candidateIds) ? [...new Set(body.candidateIds)] : [];
    if (!candidateIds.length || candidateIds.length > 100 || candidateIds.some((id) => typeof id !== "string" || !isUuid(id))) {
      return NextResponse.json({ error: "Select between 1 and 100 valid candidates." }, { status: 400, headers });
    }

    const { data: candidates, error: candidatesError } = await supabase.from("candidates")
      .select("id, first_name, last_name, date_of_birth, nationality, position, phone, agent_name, details, visa_locked")
      .eq("company_id", membership.company_id).in("id", candidateIds);
    if (candidatesError || candidates?.length !== candidateIds.length) {
      return NextResponse.json({ error: "One or more selected candidates could not be found in this company." }, { status: 404, headers });
    }

    // ── save-additional-stages ──────────────────────────────────────────────
    if (body?.action === "save-additional-stages") {
      const fields = ["offerLetter", "wakalaReceived", "molReceived", "enjaz"] as const;
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

    // ── submit-to-project ───────────────────────────────────────────────────
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

        // Block re-submission of visa-locked candidates
        if (candidate.visa_locked) {
          rejected.push({ candidateId: candidate.id, name, reasons: ["candidate has already received a visa and cannot be submitted to another project"], kind: "transition" });
          continue;
        }

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

    // ── record-visa-received ────────────────────────────────────────────────
    if (body?.action === "record-visa-received") {
      // Must supply a projectId — used to confirm which project the visa is for
      if (typeof body.projectId !== "string" || !isUuid(body.projectId)) {
        return NextResponse.json({ error: "Select the project the visa was received for." }, { status: 400, headers });
      }

      // Fetch project details including candidate service charge and contractor
      const { data: project, error: projectError } = await supabase.from("projects")
        .select("id, project_name, country, candidate_service_charge, contractor_id")
        .eq("id", body.projectId).eq("company_id", membership.company_id).maybeSingle();
      if (projectError || !project) {
        return NextResponse.json({ error: "Selected project not found in this company." }, { status: 400, headers });
      }

      // Fetch company name for SMS
      const { data: company } = await supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle();
      const companyName = company?.name ?? "Your recruitment agency";

      const admin = createAdminClient();

      const updated: Record<string, unknown>[] = [];
      const rejected: { candidateId: string; name: string; reasons: string[]; kind: "transition" }[] = [];
      const invoices: Record<string, unknown>[] = [];

      for (const candidate of candidates) {
        const details = candidate.details && typeof candidate.details === "object" && !Array.isArray(candidate.details)
          ? candidate.details as Record<string, unknown>
          : {};
        const name = `${candidate.first_name} ${candidate.last_name}`;

        // Must already be submitted to this project
        if (details.assignedProjectId !== body.projectId) {
          rejected.push({ candidateId: candidate.id, name, reasons: [`candidate is not submitted to project ${project.project_name}`], kind: "transition" });
          continue;
        }
        if (candidate.visa_locked) {
          rejected.push({ candidateId: candidate.id, name, reasons: ["visa already recorded for this candidate"], kind: "transition" });
          continue;
        }

        const nextDetails: Record<string, unknown> = {
          ...details,
          stage: "Visa Processing",
          visaStatus: "Received",
          visaProjectId: project.id,
          visaProjectName: project.project_name,
          visaReceivedAt: new Date().toISOString(),
        };

        // Save candidate — the DB trigger creates the invoice automatically
        const { data: saved, error: saveError } = await supabase.from("candidates")
          .update({ details: nextDetails as never, visa_locked: true })
          .eq("id", candidate.id).eq("company_id", membership.company_id)
          .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details, visa_locked")
          .maybeSingle();
        if (saveError || !saved) {
          rejected.push({ candidateId: candidate.id, name, reasons: [saveError?.message ?? "Visa status could not be saved."], kind: "transition" });
          continue;
        }
        updated.push(saved);

        // Fetch the auto-created invoice + any deposit balance
        if (admin) {
          const { data: invoice } = await admin.from("invoices")
            .select("id, invoice_number, amount, status, due_date")
            .eq("visa_candidate_id", candidate.id)
            .eq("company_id", membership.company_id)
            .maybeSingle();
          if (invoice) {
            const { data: deposits } = await admin.from("invoice_deposit_allocations")
              .select("amount").eq("invoice_id", invoice.id).eq("company_id", membership.company_id);
            const depositTotal = (deposits ?? []).reduce((sum, d) => sum + Number(d.amount), 0);
            invoices.push({
              candidateId: candidate.id,
              candidateName: name,
              invoiceNumber: invoice.invoice_number,
              amount: Number(invoice.amount),
              depositPaid: depositTotal,
              balanceDue: Math.max(0, Number(invoice.amount) - depositTotal),
              status: invoice.status,
              dueDate: invoice.due_date,
            });
          }
        }

        // Immediate SMS to candidate
        const phone = normalizeUgandanPhone(candidate.phone ?? "");
        const position = candidate.position || project.project_name;
        const country = project.country;
        const smsMessage = `Dear ${candidate.first_name}, your visa has been issued for ${position} for ${country}. Kindly clear your service charge at the earliest. From ${companyName}.`;

        if (phone && process.env.SMSUG_API_KEY?.trim()) {
          sendSmsUg(companyName.slice(0, 100), smsMessage, [phone]).catch((err) => {
            console.error("Visa SMS send error", err);
          });
          // Also queue in log for audit (fire-and-forget)
          if (admin) {
            logBackgroundInsert(() => admin.from("candidate_travel_sms_queue").insert({
              company_id: membership.company_id,
              candidate_id: candidate.id,
              phone: candidate.phone,
              sms_title: companyName.slice(0, 100),
              message: smsMessage,
              sms_type: "visa_received",
              send_at: new Date().toISOString(),
              status: "sent",
              sent_at: new Date().toISOString(),
            }), "Candidate travel SMS queue insert failed");
          }
        }

      }

      return NextResponse.json({ updated, rejected, invoices }, { headers });
    }

    // ── record-ticketing ────────────────────────────────────────────────────
    if (body?.action === "record-ticketing") {
      const ticketNumber = typeof body.ticketNumber === "string" ? body.ticketNumber.trim() : "";
      const bookingReference = typeof body.bookingReference === "string" ? body.bookingReference.trim() : "";
      const travelDate = typeof body.travelDate === "string" ? body.travelDate.trim() : "";
      const travelTime = typeof body.travelTime === "string" ? body.travelTime.trim() : "";

      if (!ticketNumber || ticketNumber.length > 100) return NextResponse.json({ error: "Enter a ticket number." }, { status: 400, headers });
      if (!bookingReference || bookingReference.length > 100) return NextResponse.json({ error: "Enter a booking reference." }, { status: 400, headers });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate) || Number.isNaN(Date.parse(travelDate))) {
        return NextResponse.json({ error: "Enter a valid travel date (YYYY-MM-DD)." }, { status: 400, headers });
      }
      if (!/^\d{2}:\d{2}$/.test(travelTime)) {
        return NextResponse.json({ error: "Enter a valid departure time (HH:MM, 24-hour)." }, { status: 400, headers });
      }

      // Parse connecting flights array
      type ConnFlight = { from: string; to: string; flightNo: string; depTime: string };
      const rawFlights = Array.isArray(body.connectingFlights) ? body.connectingFlights : [];
      const connectingFlights: ConnFlight[] = rawFlights
        .filter((f): f is Record<string, unknown> => f && typeof f === "object")
        .map((f) => ({
          from: String(f.from ?? "").trim().slice(0, 100),
          to: String(f.to ?? "").trim().slice(0, 100),
          flightNo: String(f.flightNo ?? "").trim().slice(0, 50),
          depTime: String(f.depTime ?? "").trim().slice(0, 10),
        }))
        .filter((f) => f.from && f.to);

      // Build departure datetime in UTC from date + time (assume Africa/Kampala UTC+3)
      const [hh, mm] = travelTime.split(":").map(Number);
      const departureUtc = new Date(`${travelDate}T${travelTime}:00+03:00`);
      if (Number.isNaN(departureUtc.getTime())) {
        return NextResponse.json({ error: "Invalid departure date/time." }, { status: 400, headers });
      }

      // Fetch company name
      const { data: company } = await supabase.from("companies").select("name").eq("id", membership.company_id).maybeSingle();
      const companyName = company?.name ?? "Your recruitment agency";
      const admin = createAdminClient();

      const updated: Record<string, unknown>[] = [];
      const rejected: { candidateId: string; name: string; reasons: string[]; kind: "transition" }[] = [];

      for (const candidate of candidates) {
        const details = candidate.details && typeof candidate.details === "object" && !Array.isArray(candidate.details)
          ? candidate.details as Record<string, unknown>
          : {};
        const name = `${candidate.first_name} ${candidate.last_name}`;

        if (!candidate.visa_locked) {
          rejected.push({ candidateId: candidate.id, name, reasons: ["candidate visa must be received before recording a ticket"], kind: "transition" });
          continue;
        }

        const nextDetails: Record<string, unknown> = {
          ...details,
          stage: "Travel",
          ticketNumber,
          bookingReference,
          travelDate,
          travelTime,
          departureUtc: departureUtc.toISOString(),
          connectingFlights,
        };

        const { data: saved, error: saveError } = await supabase.from("candidates")
          .update({ details: nextDetails as never })
          .eq("id", candidate.id).eq("company_id", membership.company_id)
          .select("id, source_row_number, file_number, first_name, last_name, phone, date_of_birth, place_of_birth, agent_name, religion, position, nationality, father_name, mother_name, details, visa_locked")
          .maybeSingle();
        if (saveError || !saved) {
          rejected.push({ candidateId: candidate.id, name, reasons: [saveError?.message ?? "Ticket details could not be saved."], kind: "transition" });
          continue;
        }
        updated.push(saved);

        if (!admin) continue;

        const phone = candidate.phone ?? "";
        const position = candidate.position || "your position";
        const country = String(details.visaProjectName ?? details.assignedContracts ?? "");

        // Build connecting flight summary for SMS
        const connText = connectingFlights.length
          ? ` Connecting via: ${connectingFlights.map((f) => `${f.from}→${f.to} (${f.flightNo || "no flight no."} at ${f.depTime || "TBC"})`).join(", ")}.`
          : "";

        // 1. Immediate confirmation SMS
        const confirmMsg = `Dear ${candidate.first_name}, your travel for ${position} to ${country} has been confirmed. Ticket: ${ticketNumber}, Ref: ${bookingReference}. Departure: ${travelDate} at ${travelTime}.${connText} From ${companyName}.`;
        await queueSms(admin, {
          company_id: membership.company_id,
          candidate_id: candidate.id,
          phone,
          sms_title: companyName.slice(0, 100),
          message: confirmMsg.slice(0, 480),
          sms_type: "departure_reminder",
          send_at: new Date().toISOString(), // send immediately
        });

        // 2. Online check-in reminder — 24 hours before departure
        const checkInAt = new Date(departureUtc.getTime() - 24 * 60 * 60 * 1000);
        const checkInMsg = `Dear ${candidate.first_name}, online check-in for your flight to ${country} is now open. Departure: ${travelDate} at ${travelTime}. Ticket: ${ticketNumber}, Ref: ${bookingReference}. Have your documents ready. From ${companyName}.`;
        await queueSms(admin, {
          company_id: membership.company_id,
          candidate_id: candidate.id,
          phone,
          sms_title: companyName.slice(0, 100),
          message: checkInMsg.slice(0, 480),
          sms_type: "checkin_reminder",
          send_at: checkInAt.toISOString(),
        });

        // 3. Departure day reminder — 3 hours before departure
        const depReminderAt = new Date(departureUtc.getTime() - 3 * 60 * 60 * 1000);
        const depReminderMsg = `Dear ${candidate.first_name}, your flight departs today at ${travelTime}. Please arrive at the airport at least 3 hours early. Ticket: ${ticketNumber}, Ref: ${bookingReference}. Safe travels! From ${companyName}.`;
        await queueSms(admin, {
          company_id: membership.company_id,
          candidate_id: candidate.id,
          phone,
          sms_title: companyName.slice(0, 100),
          message: depReminderMsg.slice(0, 480),
          sms_type: "departure_reminder",
          send_at: depReminderAt.toISOString(),
        });

        // 4. Post-departure thank-you — 5 minutes after departure
        const thanksAt = new Date(departureUtc.getTime() + 5 * 60 * 1000);
        const thanksMsg = `Dear ${candidate.first_name}, we wish you a safe and comfortable journey to ${country}. Thank you for trusting us. We will keep your family updated. From ${companyName}.`;
        await queueSms(admin, {
          company_id: membership.company_id,
          candidate_id: candidate.id,
          phone,
          sms_title: companyName.slice(0, 100),
          message: thanksMsg.slice(0, 480),
          sms_type: "post_departure_thanks",
          send_at: thanksAt.toISOString(),
        });

      }

      return NextResponse.json({ updated, rejected }, { headers });
    }

    return NextResponse.json({ error: "Choose a valid candidate stage action." }, { status: 400, headers });
  } catch (error) {
    console.error("Candidate stage update failed", error);
    return NextResponse.json({ error: "Candidate stages are unavailable." }, { status: 503, headers });
  }
}
