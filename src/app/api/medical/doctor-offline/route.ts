import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type DoctorOfflineRequest = {
  offlineDate: string; // YYYY-MM-DD format
  isAllDay: boolean;
  offlineStartTime?: string; // HH:MM format (24-hour)
  offlineEndTime?: string; // HH:MM format (24-hour)
  reason?: string;
  action: "set" | "remove"; // set = create/update, remove = delete
};

type DoctorOfflineResponse = {
  offlineStatus?: {
    id: string;
    offlineDate: string;
    isAllDay: boolean;
    offlineStartTime?: string;
    offlineEndTime?: string;
    reason?: string;
  };
  message?: string;
  error?: string;
};

export async function POST(request: Request): Promise<NextResponse<DoctorOfflineResponse>> {
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

    const body = (await request.json()) as DoctorOfflineRequest;
    const { offlineDate, isAllDay, offlineStartTime, offlineEndTime, reason, action } = body;

    // Validate required fields
    if (!offlineDate || !action) {
      return NextResponse.json(
        { error: "offlineDate and action are required." },
        { status: 400, headers }
      );
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(offlineDate)) {
      return NextResponse.json(
        { error: "offlineDate must be in YYYY-MM-DD format." },
        { status: 400, headers }
      );
    }

    // Validate times format
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!isAllDay && (offlineStartTime || offlineEndTime)) {
      if (offlineStartTime && !timeRegex.test(offlineStartTime)) {
        return NextResponse.json(
          { error: "offlineStartTime must be in HH:MM format." },
          { status: 400, headers }
        );
      }
      if (offlineEndTime && !timeRegex.test(offlineEndTime)) {
        return NextResponse.json(
          { error: "offlineEndTime must be in HH:MM format." },
          { status: 400, headers }
        );
      }
      if (offlineStartTime && offlineEndTime) {
        if (offlineStartTime >= offlineEndTime) {
          return NextResponse.json(
            { error: "offlineStartTime must be before offlineEndTime." },
            { status: 400, headers }
          );
        }
      }
    }

    // Get user's company membership to verify they're a doctor
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

    // Verify user has doctor.manage permission
    const { data: roleData, error: roleError } = await supabase
      .from("company_roles")
      .select("permissions")
      .eq("id", membership.role_id)
      .single();

    if (roleError) {
      return NextResponse.json(
        { error: "Unable to verify permissions." },
        { status: 403, headers }
      );
    }

    const permissions = (roleData?.permissions as Record<string, unknown> | null) || {};
    if (!permissions["doctor.manage"]) {
      return NextResponse.json(
        { error: "Insufficient permissions. doctor.manage required." },
        { status: 403, headers }
      );
    }

    // Handle remove action - delete offline status
    if (action === "remove") {
      const { error: deleteError } = await supabase
        .from("doctor_offline_status")
        .delete()
        .eq("company_id", membership.company_id)
        .eq("doctor_user_id", user.id)
        .eq("offline_date", offlineDate);

      if (deleteError) {
        console.error("Delete offline status error", deleteError);
        return NextResponse.json(
          { error: "Unable to remove offline status." },
          { status: 500, headers }
        );
      }

      return NextResponse.json(
        { message: "Offline status removed successfully." },
        { headers }
      );
    }

    // Handle set action - create or update offline status
    if (action === "set") {
      // Convert time strings to time with timezone format
      const startTime = isAllDay ? null : offlineStartTime ? `${offlineStartTime}:00+00` : null;
      const endTime = isAllDay ? null : offlineEndTime ? `${offlineEndTime}:00+00` : null;

      const { data: offlineStatus, error: upsertError } = await supabase
        .from("doctor_offline_status")
        .upsert(
          {
            company_id: membership.company_id,
            doctor_user_id: user.id,
            offline_date: offlineDate,
            is_all_day: isAllDay,
            offline_start_time: startTime,
            offline_end_time: endTime,
            reason: reason || null,
            created_by: user.id,
          },
          {
            onConflict: "company_id,doctor_user_id,offline_date,coalesce(offline_start_time, '00:00:00'::time),coalesce(offline_end_time, '23:59:59'::time)",
          }
        )
        .select()
        .single();

      if (upsertError) {
        console.error("Upsert offline status error", upsertError);
        return NextResponse.json(
          { error: "Unable to set offline status." },
          { status: 500, headers }
        );
      }

      return NextResponse.json(
        {
          offlineStatus: {
            id: offlineStatus.id,
            offlineDate: offlineStatus.offline_date,
            isAllDay: offlineStatus.is_all_day,
            offlineStartTime: offlineStatus.offline_start_time
              ? offlineStatus.offline_start_time.substring(0, 5)
              : undefined,
            offlineEndTime: offlineStatus.offline_end_time
              ? offlineStatus.offline_end_time.substring(0, 5)
              : undefined,
            reason: offlineStatus.reason,
          },
          message: "Offline status saved successfully.",
        },
        { headers }
      );
    }

    return NextResponse.json(
      { error: "Invalid action. Must be 'set' or 'remove'." },
      { status: 400, headers }
    );
  } catch (error) {
    console.error("Doctor offline endpoint error", error);
    return NextResponse.json(
      { error: "Unable to process offline status request." },
      { status: 500, headers }
    );
  }
}

export async function GET(request: Request): Promise<NextResponse<{ offlineStatuses?: unknown[]; error?: string }>> {
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

    // Get company membership
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

    // Get doctor's offline statuses for today and future
    const { data: offlineStatuses, error: queryError } = await supabase
      .from("doctor_offline_status")
      .select("*")
      .eq("company_id", membership.company_id)
      .eq("doctor_user_id", user.id)
      .gte("offline_date", new Date().toISOString().split("T")[0])
      .order("offline_date", { ascending: true });

    if (queryError) {
      console.error("Get offline statuses error", queryError);
      return NextResponse.json(
        { error: "Unable to retrieve offline statuses." },
        { status: 500, headers }
      );
    }

    return NextResponse.json(
      {
        offlineStatuses: offlineStatuses?.map((os) => ({
          id: os.id,
          offlineDate: os.offline_date,
          isAllDay: os.is_all_day,
          offlineStartTime: os.offline_start_time
            ? os.offline_start_time.substring(0, 5)
            : null,
          offlineEndTime: os.offline_end_time
            ? os.offline_end_time.substring(0, 5)
            : null,
          reason: os.reason,
        })),
      },
      { headers }
    );
  } catch (error) {
    console.error("Get offline statuses error", error);
    return NextResponse.json(
      { error: "Unable to retrieve offline statuses." },
      { status: 500, headers }
    );
  }
}
