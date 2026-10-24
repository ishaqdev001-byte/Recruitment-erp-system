import { createClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/server/documents";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const appointmentRoles = new Set(["CEO", "Finance Manager", "General Manager", "Medical Officer"]);

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type AvailabilityCheckRequest = {
  doctorUserId: string;
  appointmentAt: string; // ISO 8601 format
};

type AvailabilityResponse = {
  available?: boolean;
  reason?: string; // Why unavailable (all day, time slot, etc.)
  nextAvailableAt?: string; // ISO 8601 format when doctor will be available again
  offlineDetails?: {
    isAllDay: boolean;
    offlineStartTime?: string;
    offlineEndTime?: string;
    offlineReason?: string;
  };
  error?: string;
};

export async function POST(request: Request): Promise<NextResponse<AvailabilityResponse>> {
  const headers = { "Cache-Control": "private, no-store" };

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers }
      );
    }

    const body = await request.json().catch(() => null) as AvailabilityCheckRequest | null;
    if (!body) {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400, headers });
    }
    const { doctorUserId, appointmentAt } = body;

    if (typeof doctorUserId !== "string" || typeof appointmentAt !== "string" || !doctorUserId || !appointmentAt) {
      return NextResponse.json(
        { error: "doctorUserId and appointmentAt are required." },
        { status: 400, headers }
      );
    }

    if (!isUuid(doctorUserId)) {
      return NextResponse.json({ error: "doctorUserId must be a valid user ID." }, { status: 400, headers });
    }
    const appointmentDate = new Date(appointmentAt);
    if (Number.isNaN(appointmentDate.getTime())) {
      return NextResponse.json(
        { error: "appointmentAt must be in ISO 8601 format." },
        { status: 400, headers }
      );
    }

    const appointmentDateStr = appointmentDate.toISOString().split("T")[0];

    // Get user's company membership to verify permission
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id, role_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json(
        { error: "Active company membership not found." },
        { status: 403, headers }
      );
    }

    const canCreateCandidates = await supabase.rpc("current_user_has_company_permission", {
      requested_company_id: membership.company_id,
      requested_permission: "candidates.create",
    });
    const admin = createAdminClient();
    if (canCreateCandidates.error) {
      return NextResponse.json(
        { error: "Unable to verify permissions." },
        { status: 403, headers }
      );
    }

    if (!admin) {
      return NextResponse.json(
        { error: "Doctor availability requires SUPABASE_SERVICE_ROLE_KEY in the server environment." },
        { status: 503, headers }
      );
    }

    const [{ data: company, error: companyError }, { data: callerRole, error: callerRoleError }] = await Promise.all([
      admin.from("companies").select("primary_admin_user_id").eq("id", membership.company_id).maybeSingle(),
      admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
    ]);
    if (companyError || callerRoleError || !company || !callerRole) {
      return NextResponse.json({ error: "Unable to verify the company role." }, { status: 500, headers });
    }

    const canBookAppointments = Boolean(canCreateCandidates.data)
      || company.primary_admin_user_id === user.id
      || appointmentRoles.has(callerRole.name);
    if (!canBookAppointments) {
      return NextResponse.json(
        { error: "You do not have permission to check appointment availability." },
        { status: 403, headers }
      );
    }

    const { data: doctorMembership, error: doctorMembershipError } = await admin.from("company_memberships")
      .select("role_id")
      .eq("company_id", membership.company_id)
      .eq("user_id", doctorUserId)
      .eq("status", "active")
      .maybeSingle();
    if (doctorMembershipError) {
      return NextResponse.json({ error: "Unable to verify the assigned doctor." }, { status: 500, headers });
    }
    if (!doctorMembership) {
      return NextResponse.json({ error: "The selected user is not an active doctor in this company." }, { status: 400, headers });
    }
    const { data: doctorRole, error: doctorRoleError } = await admin.from("company_roles")
      .select("name")
      .eq("id", doctorMembership.role_id)
      .eq("company_id", membership.company_id)
      .maybeSingle();
    if (doctorRoleError) {
      return NextResponse.json({ error: "Unable to verify the assigned doctor's role." }, { status: 500, headers });
    }
    if (!doctorRole || !/doctor|medical officer/i.test(doctorRole.name)) {
      return NextResponse.json({ error: "The selected user is not an active doctor in this company." }, { status: 400, headers });
    }

    // Check if doctor has offline status for this appointment
    const { data: offlineStatus, error: offlineError } = await admin
      .from("doctor_offline_status")
      .select("*")
      .eq("company_id", membership.company_id)
      .eq("doctor_user_id", doctorUserId)
      .eq("offline_date", appointmentDateStr)
      .order("offline_start_time", { ascending: true });

    if (offlineError) {
      console.error("Check offline status error", offlineError);
      return NextResponse.json(
        { error: "Unable to check doctor availability." },
        { status: 500, headers }
      );
    }

    // Check if any offline status matches this appointment time
    let matchingOffline = null;
    if (offlineStatus && offlineStatus.length > 0) {
      for (const offline of offlineStatus) {
        if (offline.is_all_day) {
          // Doctor is offline entire day
          matchingOffline = offline;
          break;
        } else if (offline.offline_start_time && offline.offline_end_time) {
          // Check if appointment falls within offline time range
          const appointmentTime = appointmentDate.getTime();
          const offlineStart = new Date(`${appointmentDateStr}T${offline.offline_start_time}`).getTime();
          const offlineEnd = new Date(`${appointmentDateStr}T${offline.offline_end_time}`).getTime();

          if (appointmentTime >= offlineStart && appointmentTime < offlineEnd) {
            matchingOffline = offline;
            break;
          }
        }
      }
    }

    // If no matching offline status, doctor is available
    if (!matchingOffline) {
      return NextResponse.json(
        { available: true },
        { headers }
      );
    }

    // Doctor is unavailable - determine reason and next available time
    let reason = "";
    if (matchingOffline.is_all_day) {
      reason = "The doctor is unavailable today.";
    } else {
      const startTime = matchingOffline.offline_start_time?.substring(0, 5);
      const endTime = matchingOffline.offline_end_time?.substring(0, 5);
      reason = `The doctor is unavailable from ${startTime} to ${endTime} today.`;
    }

    // Calculate next available time
    const nextAvailableAt = await getNextAvailableTime(
      admin,
      membership.company_id,
      doctorUserId,
      appointmentDate
    );

    const nextAvailableFormatted = nextAvailableAt
      ? nextAvailableAt.toISOString()
      : null;

    return NextResponse.json(
      {
        available: false,
        reason,
        nextAvailableAt: nextAvailableFormatted || undefined,
        offlineDetails: {
          isAllDay: matchingOffline.is_all_day,
          offlineStartTime: matchingOffline.offline_start_time
            ? matchingOffline.offline_start_time.substring(0, 5)
            : undefined,
          offlineEndTime: matchingOffline.offline_end_time
            ? matchingOffline.offline_end_time.substring(0, 5)
            : undefined,
          offlineReason: matchingOffline.reason || undefined,
        },
      },
      { headers }
    );
  } catch (error) {
    console.error("Doctor availability check error", error);
    return NextResponse.json(
      { error: "Unable to check doctor availability." },
      { status: 500, headers }
    );
  }
}

/**
 * Helper function to find the next available time for a doctor
 * Looks ahead up to 30 days for a day when the doctor is not offline all day
 */
async function getNextAvailableTime(
  supabase: AdminClient,
  companyId: string,
  doctorUserId: string,
  fromDate: Date
): Promise<Date | null> {
  const maxDaysToCheck = 30;
  const firstDay = new Date(fromDate);
  firstDay.setUTCDate(firstDay.getUTCDate() + 1);
  const lastDay = new Date(firstDay);
  lastDay.setUTCDate(lastDay.getUTCDate() + maxDaysToCheck - 1);
  const firstDayStr = firstDay.toISOString().slice(0, 10);
  const lastDayStr = lastDay.toISOString().slice(0, 10);

  const { data: offlineDays, error } = await supabase
    .from("doctor_offline_status")
    .select("offline_date")
    .eq("company_id", companyId)
    .eq("doctor_user_id", doctorUserId)
    .eq("is_all_day", true)
    .gte("offline_date", firstDayStr)
    .lte("offline_date", lastDayStr);
  if (error) throw error;

  const unavailableDays = new Set((offlineDays ?? []).map((day) => day.offline_date));
  const checkDate = new Date(firstDay);
  for (let day = 0; day < maxDaysToCheck; day += 1) {
    const dateStr = checkDate.toISOString().slice(0, 10);
    if (!unavailableDays.has(dateStr)) return new Date(`${dateStr}T08:00:00Z`);
    checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  }

  return new Date(`${lastDayStr}T08:00:00Z`);
}
