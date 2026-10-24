import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

    const body = (await request.json()) as AvailabilityCheckRequest;
    const { doctorUserId, appointmentAt } = body;

    if (!doctorUserId || !appointmentAt) {
      return NextResponse.json(
        { error: "doctorUserId and appointmentAt are required." },
        { status: 400, headers }
      );
    }

    // Validate ISO 8601 format
    try {
      new Date(appointmentAt);
    } catch {
      return NextResponse.json(
        { error: "appointmentAt must be in ISO 8601 format." },
        { status: 400, headers }
      );
    }

    const appointmentDate = new Date(appointmentAt);
    const appointmentDateStr = appointmentDate.toISOString().split("T")[0];
    const appointmentTimeStr = appointmentDate.toISOString().split("T")[1].substring(0, 8);

    // Get user's company membership to verify permission
    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
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

    // Check if user has finance.view permission to check doctor availability
    const { data: roleData, error: roleError } = await supabase
      .from("company_memberships")
      .select("company_roles(permissions)")
      .eq("user_id", user.id)
      .eq("company_id", membership.company_id)
      .single();

    if (roleError) {
      return NextResponse.json(
        { error: "Unable to verify permissions." },
        { status: 403, headers }
      );
    }

    const roleRecord = roleData as unknown as { company_roles: { permissions: Record<string, unknown> } | null };
    const permissions = roleRecord?.company_roles?.permissions || {};
    if (!permissions["finance.view"] && !permissions["finance.create"]) {
      return NextResponse.json(
        { error: "Insufficient permissions. finance.view or finance.create required." },
        { status: 403, headers }
      );
    }

    // Check if doctor has offline status for this appointment
    const { data: offlineStatus, error: offlineError } = await supabase
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
      supabase,
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
  supabase: ReturnType<typeof createSupabaseServerClient> extends Promise<infer T> ? T : never,
  companyId: string,
  doctorUserId: string,
  fromDate: Date
): Promise<Date | null> {
  const maxDaysToCheck = 30;
  let checkDate = new Date(fromDate);
  checkDate.setDate(checkDate.getDate() + 1); // Start checking from next day

  for (let i = 0; i < maxDaysToCheck; i++) {
    const checkDateStr = checkDate.toISOString().split("T")[0];

    // Check if doctor has all-day offline for this date
    const { data: allDayOffline, error: offlineError } = await supabase
      .from("doctor_offline_status")
      .select("id")
      .eq("company_id", companyId)
      .eq("doctor_user_id", doctorUserId)
      .eq("offline_date", checkDateStr)
      .eq("is_all_day", true)
      .limit(1)
      .maybeSingle();

    if (offlineError) {
      console.error("Error checking offline status", offlineError);
      continue;
    }

    // If no all-day offline, doctor is available on this day
    if (!allDayOffline) {
      // Return 8:00 AM on this date
      const availableDate = new Date(`${checkDateStr}T08:00:00Z`);
      return availableDate;
    }

    // Move to next day
    checkDate.setDate(checkDate.getDate() + 1);
  }

  // If no availability found in 30 days, return 30 days from now at 8 AM
  checkDate.setDate(fromDate.getDate() + maxDaysToCheck);
  checkDate.setHours(8, 0, 0, 0);
  return checkDate;
}
