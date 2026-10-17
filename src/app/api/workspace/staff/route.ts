import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const statuses = ["Active", "On Leave", "Inactive"] as const;
const payTypes = ["payroll", "project", "no_payroll"] as const;

type StaffInput = {
  name: string;
  position: string;
  status: (typeof statuses)[number];
  dateJoined: string;
  linkedUserId: string | null;
  payType: (typeof payTypes)[number];
  baseSalary: number;
  weeklyTransportAllowance: number;
  transportAccountId: string | null;
};

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getStaffAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabase
    .from("company_memberships")
    .select("company_id, role_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };

  const admin = createAdminClient();
  if (!admin) return { error: "Set SUPABASE_SERVICE_ROLE_KEY in the server environment to enable staff management.", status: 503 as const };

  const [{ data: company, error: companyError }, { data: role, error: roleError }] = await Promise.all([
    admin.from("companies").select("primary_admin_user_id").eq("id", membership.company_id).maybeSingle(),
    admin.from("company_roles").select("name").eq("id", membership.role_id).eq("company_id", membership.company_id).maybeSingle(),
  ]);
  if (companyError || roleError || !company || !role) return { error: "Unable to verify staff-management access.", status: 500 as const };

  const isPrimaryAdmin = company.primary_admin_user_id === user.id;
  const allowedRoles = ["CEO", "General Manager"];
  if (!isPrimaryAdmin && !allowedRoles.includes(role.name)) {
    return { error: "Staff records are limited to the company owner, CEO, and General Manager.", status: 403 as const };
  }

  return { admin, companyId: membership.company_id, userId: user.id, primaryAdminId: company.primary_admin_user_id, isPrimaryAdmin };
}

function ownerInitials(name: string) {
  const initials = name.trim().split(/\s+/).map((part) => part[0] ?? "").join("").replace(/[^a-z]/gi, "").toUpperCase().slice(0, 6);
  return initials || "STAFF";
}

function mapStaff(record: Record<string, unknown>) {
  return {
    id: String(record.id),
    staffId: String(record.staff_id),
    name: String(record.name),
    position: String(record.position),
    phone: String(record.phone ?? ""),
    status: String(record.status),
    dateJoined: String(record.date_joined),
    linkedUserId: String(record.linked_user_id ?? ""),
    payType: String(record.pay_type ?? "payroll"),
    baseSalary: Number(record.base_salary ?? 0),
    weeklyTransportAllowance: Number(record.weekly_transport_allowance ?? 0),
    transportAccountId: String(record.transport_account_id ?? ""),
  };
}

function parseStaffInput(body: Record<string, unknown>): StaffInput | null {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const position = typeof body.position === "string" ? body.position.trim() : "";
  const dateJoined = typeof body.dateJoined === "string" ? body.dateJoined : "";
  const status = body.status;
  const payType = body.payType;
  const baseSalary = Number(body.baseSalary ?? 0);
  const weeklyTransportAllowance = Number(body.weeklyTransportAllowance ?? 0);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
  const linkedUserId = typeof body.linkedUserId === "string" && body.linkedUserId ? body.linkedUserId : null;
  const transportAccountId = typeof body.transportAccountId === "string" && body.transportAccountId ? body.transportAccountId : null;

  if (!name || name.length > 200 || !position || position.length > 150 || !validDate(dateJoined)
    || !statuses.includes(status as (typeof statuses)[number])
    || !payTypes.includes(payType as (typeof payTypes)[number])
    || !Number.isFinite(baseSalary) || baseSalary < 0 || baseSalary > 999999999999.99
    || !Number.isFinite(weeklyTransportAllowance) || weeklyTransportAllowance < 0 || weeklyTransportAllowance > 999999999999.99
    || (payType === "payroll" && baseSalary <= 0)
    || (payType !== "payroll" && (baseSalary !== 0 || weeklyTransportAllowance !== 0 || transportAccountId !== null))
    || (weeklyTransportAllowance > 0 && (payType !== "payroll" || !transportAccountId))
    || (transportAccountId !== null && !/^[0-9a-f-]{36}$/i.test(transportAccountId))
    || (linkedUserId !== null && !/^[0-9a-f-]{36}$/i.test(linkedUserId))) return null;

  return {
    name,
    position,
    status: status as StaffInput["status"],
    dateJoined,
    linkedUserId,
    payType: payType as StaffInput["payType"],
    baseSalary: Math.round(baseSalary * 100) / 100,
    weeklyTransportAllowance: Math.round(weeklyTransportAllowance * 100) / 100,
    transportAccountId: weeklyTransportAllowance > 0 ? transportAccountId : null,
  };
}

export async function GET() {
  try {
    const access = await getStaffAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });

    const { data: profile } = await access.admin.from("profiles").select("display_name").eq("id", access.primaryAdminId).maybeSingle();
    const { data: ownerAuth } = await access.admin.auth.admin.getUserById(access.primaryAdminId);
    const ownerName = profile?.display_name || String(ownerAuth.user?.user_metadata?.full_name ?? ownerAuth.user?.email?.split("@")[0] ?? "");
    let { data: settings, error: settingsError } = await access.admin.from("company_staff_id_settings")
      .select("staff_id_prefix, next_sequence")
      .eq("company_id", access.companyId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) {
      const inserted = await access.admin.from("company_staff_id_settings")
        .insert({ company_id: access.companyId, staff_id_prefix: ownerInitials(ownerName), next_sequence: 1 })
        .select("staff_id_prefix, next_sequence")
        .single();
      if (inserted.error?.code === "23505") {
        const current = await access.admin.from("company_staff_id_settings").select("staff_id_prefix, next_sequence").eq("company_id", access.companyId).single();
        if (current.error) throw current.error;
        settings = current.data;
      } else {
        if (inserted.error) throw inserted.error;
        settings = inserted.data;
      }
    }

    const [{ data: staff, error: staffError }, { data: accounts, error: accountsError }] = await Promise.all([
      access.admin.from("company_staff_members")
        .select("id, staff_id, name, position, phone, status, date_joined, linked_user_id, pay_type, base_salary, weekly_transport_allowance, transport_account_id")
        .eq("company_id", access.companyId)
        .order("created_at", { ascending: false }),
      access.admin.from("company_accounts")
        .select("id, name, account_type, account_number")
        .eq("company_id", access.companyId)
        .eq("status", "active")
        .order("name"),
    ]);
    if (staffError || accountsError) throw staffError ?? accountsError;

    return NextResponse.json({
      staff: (staff ?? []).map((record) => mapStaff(record as Record<string, unknown>)),
      accounts: accounts ?? [],
      settings: { prefix: settings.staff_id_prefix, nextSequence: settings.next_sequence, canChangeSequence: access.isPrimaryAdmin },
    }, { headers });
  } catch (error) {
    console.error("Company staff request failed", error);
    return NextResponse.json({ error: "Staff records are unavailable. Apply the company staff and accounts migrations and try again." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getStaffAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const input = body ? parseStaffInput(body) : null;
    if (!input) return NextResponse.json({ error: "Choose a pay arrangement. Payroll staff need a positive base salary; a weekly transport allowance needs an active funding account." }, { status: 400, headers });

    const { data: allocation, error: allocationError } = await access.admin.rpc("allocate_company_staff_sequence", { requested_company_id: access.companyId });
    if (allocationError) throw allocationError;
    const sequence = (Array.isArray(allocation) ? allocation[0] : allocation) as { staff_id_prefix: string; sequence_number: number | string } | null;
    if (!sequence) throw new Error("Staff ID sequence is not configured.");
    const staffId = `${sequence.staff_id_prefix}-${String(sequence.sequence_number).padStart(4, "0")}`;
    if (input.linkedUserId) {
      const { data: membership } = await access.admin.from("company_memberships").select("user_id")
        .eq("company_id", access.companyId).eq("user_id", input.linkedUserId).eq("status", "active").maybeSingle();
      if (!membership) return NextResponse.json({ error: "Link an active user in this company." }, { status: 400, headers });
    }
    if (input.transportAccountId) {
      const { data: account } = await access.admin.from("company_accounts").select("id")
        .eq("id", input.transportAccountId).eq("company_id", access.companyId).eq("status", "active").maybeSingle();
      if (!account) return NextResponse.json({ error: "Choose an active funding account from this company." }, { status: 400, headers });
    }
    const { data: staff, error } = await access.admin.from("company_staff_members").insert({
      company_id: access.companyId,
      staff_id: staffId,
      linked_user_id: input.linkedUserId,
      ...{
        name: input.name,
        position: input.position,
        status: input.status,
        date_joined: input.dateJoined,
        pay_type: input.payType,
        base_salary: input.baseSalary,
        weekly_transport_allowance: input.weeklyTransportAllowance,
        transport_account_id: input.transportAccountId,
        created_by: access.userId,
      },
    }).select("id, staff_id, name, position, phone, status, date_joined, linked_user_id, pay_type, base_salary, weekly_transport_allowance, transport_account_id").single();
    if (error?.code === "23505") return NextResponse.json({ error: "That user is already linked to a staff record." }, { status: 409, headers });
    if (error || !staff) throw error ?? new Error("Staff record was not created.");
    return NextResponse.json({ staff: mapStaff(staff as Record<string, unknown>) }, { status: 201, headers });
  } catch (error) {
    console.error("Company staff creation failed", error);
    return NextResponse.json({ error: "Unable to add the staff member." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await getStaffAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid staff update." }, { status: 400, headers });

    if (body.action === "configure-ids") {
      if (!access.isPrimaryAdmin) return NextResponse.json({ error: "Only the primary company owner can change staff ID settings." }, { status: 403, headers });
      const prefix = typeof body.prefix === "string" ? body.prefix.trim().toUpperCase() : "";
      const nextSequence = Number(body.nextSequence);
      if (!/^[A-Z][A-Z0-9]{0,9}$/.test(prefix) || !Number.isInteger(nextSequence) || nextSequence < 1 || nextSequence > 999999) {
        return NextResponse.json({ error: "Enter a 1-10 character prefix and a sequence between 1 and 999999." }, { status: 400, headers });
      }
      const { data: existing, error: existingError } = await access.admin.from("company_staff_members").select("staff_id").eq("company_id", access.companyId);
      if (existingError) throw existingError;
      const highestUsed = (existing ?? []).reduce((highest, record) => {
        const match = new RegExp(`^${prefix}-(\\d+)$`).exec(record.staff_id);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      if (nextSequence <= highestUsed) return NextResponse.json({ error: `Choose a sequence greater than the highest existing ${prefix} staff ID (${highestUsed}).` }, { status: 409, headers });

      const { data: settings, error } = await access.admin.from("company_staff_id_settings").upsert({
        company_id: access.companyId,
        staff_id_prefix: prefix,
        next_sequence: nextSequence,
      }).select("staff_id_prefix, next_sequence").single();
      if (error || !settings) throw error ?? new Error("Staff ID settings were not updated.");
      return NextResponse.json({ settings: { prefix: settings.staff_id_prefix, nextSequence: settings.next_sequence, canChangeSequence: true } }, { headers });
    }

    const id = typeof body.id === "string" ? body.id : "";
    const input = parseStaffInput(body);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !input) return NextResponse.json({ error: "Choose a pay arrangement. Payroll staff need a positive base salary; a weekly transport allowance needs an active funding account." }, { status: 400, headers });
    if (input.linkedUserId) {
      const { data: membership } = await access.admin.from("company_memberships").select("user_id")
        .eq("company_id", access.companyId).eq("user_id", input.linkedUserId).eq("status", "active").maybeSingle();
      if (!membership) return NextResponse.json({ error: "Link an active user in this company." }, { status: 400, headers });
    }
    if (input.transportAccountId) {
      const { data: account } = await access.admin.from("company_accounts").select("id")
        .eq("id", input.transportAccountId).eq("company_id", access.companyId).eq("status", "active").maybeSingle();
      if (!account) return NextResponse.json({ error: "Choose an active funding account from this company." }, { status: 400, headers });
    }
    const { data: staff, error } = await access.admin.from("company_staff_members").update({
      name: input.name,
      position: input.position,
      status: input.status,
      date_joined: input.dateJoined,
      linked_user_id: input.linkedUserId,
      pay_type: input.payType,
      base_salary: input.baseSalary,
      weekly_transport_allowance: input.weeklyTransportAllowance,
      transport_account_id: input.transportAccountId,
      updated_by: access.userId,
    }).eq("company_id", access.companyId).eq("id", id)
      .select("id, staff_id, name, position, phone, status, date_joined, linked_user_id, pay_type, base_salary, weekly_transport_allowance, transport_account_id")
      .maybeSingle();
    if (error?.code === "23505") return NextResponse.json({ error: "That user is already linked to a staff record." }, { status: 409, headers });
    if (error) throw error;
    if (!staff) return NextResponse.json({ error: "Staff member not found." }, { status: 404, headers });
    return NextResponse.json({ staff: mapStaff(staff as Record<string, unknown>) }, { headers });
  } catch (error) {
    console.error("Company staff update failed", error);
    return NextResponse.json({ error: "Unable to update staff record." }, { status: 500, headers });
  }
}