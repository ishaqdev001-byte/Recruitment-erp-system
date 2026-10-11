import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeUgandanPhone } from "@/lib/server/smsug";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type GroupContact = { candidateId?: string; name: string; phone: string; contactType?: string };

async function getSmsAccess() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 as const };
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 as const };
  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: "communications.sms.send",
  });
  if (permissionError || !allowed) return { error: "You do not have permission to manage SMS contacts.", status: 403 as const };
  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function GET() {
  try {
    const access = await getSmsAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const { data: groups, error: groupsError } = await access.supabase.from("sms_contact_groups")
      .select("id, name, created_at").eq("company_id", access.companyId).order("name");
    if (groupsError) throw groupsError;
    const groupIds = (groups ?? []).map((group) => group.id);
    const { data: members, error: membersError } = groupIds.length
      ? await access.supabase.from("sms_contact_group_members").select("id, group_id, display_name, phone, contact_type, candidate_id")
        .eq("company_id", access.companyId).in("group_id", groupIds).order("display_name")
      : { data: [], error: null };
    if (membersError) throw membersError;
    return NextResponse.json({ groups: (groups ?? []).map((group) => ({
      ...group,
      members: (members ?? []).filter((member) => member.group_id === group.id),
    })) }, { headers });
  } catch (error) {
    console.error("SMS groups request failed", error);
    return NextResponse.json({ error: "SMS groups are unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const access = await getSmsAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const body = await request.json().catch(() => null) as { name?: unknown; contacts?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const contacts = Array.isArray(body?.contacts) ? body.contacts as GroupContact[] : [];
  if (name.length < 1 || name.length > 120 || !contacts.length || contacts.length > 3000) {
    return NextResponse.json({ error: "Enter a group name and add between 1 and 3,000 contacts." }, { status: 400, headers });
  }
  if (contacts.some((contact) => !contact || typeof contact.name !== "string" || typeof contact.phone !== "string")) {
    return NextResponse.json({ error: "One or more group contacts are invalid." }, { status: 400, headers });
  }

  try {
    const candidateIds = [...new Set(contacts.flatMap((contact) => contact.candidateId ? [contact.candidateId] : []))];
    if (candidateIds.some((id) => !uuidPattern.test(id))) return NextResponse.json({ error: "A candidate reference is invalid." }, { status: 400, headers });
    const candidatesById = new Map<string, { first_name: string; last_name: string; phone: string | null }>();
    if (candidateIds.length) {
      const { data, error } = await access.supabase.from("candidates").select("id, first_name, last_name, phone")
        .eq("company_id", access.companyId).in("id", candidateIds);
      if (error) throw error;
      for (const candidate of data ?? []) candidatesById.set(candidate.id, candidate);
      if (candidatesById.size !== candidateIds.length) return NextResponse.json({ error: "A candidate is not in your company." }, { status: 400, headers });
    }

    const normalized = contacts.map((contact) => {
      const candidate = contact.candidateId ? candidatesById.get(contact.candidateId) : undefined;
      const rawPhone = candidate?.phone ?? contact.phone;
      const phone = normalizeUgandanPhone(rawPhone);
      if (!phone) throw new Error("Use Ugandan phone formats 2567XXXXXXXX, 07XXXXXXXX, or 7XXXXXXXX.");
      return {
        company_id: access.companyId,
        display_name: candidate ? `${candidate.first_name} ${candidate.last_name}`.trim() : contact.name.trim().slice(0, 200),
        phone,
        contact_type: candidate ? "Candidate" : ["Candidate", "Employer", "Staff", "Other"].includes(String(contact.contactType)) ? contact.contactType : "Other",
        candidate_id: contact.candidateId ?? null,
      };
    });
    const uniqueMembers = [...new Map(normalized.map((member) => [member.phone, member])).values()];
    if (!uniqueMembers.length) return NextResponse.json({ error: "The group has no valid phone numbers." }, { status: 400, headers });

    const { data: group, error: groupError } = await access.supabase.from("sms_contact_groups")
      .insert({ company_id: access.companyId, created_by: access.userId, name })
      .select("id, name, created_at").single();
    if (groupError) {
      if (groupError.code === "23505") return NextResponse.json({ error: "A group with that name already exists." }, { status: 409, headers });
      throw groupError;
    }
    const { error: memberError } = await access.supabase.from("sms_contact_group_members")
      .insert(uniqueMembers.map((member) => ({ ...member, group_id: group.id })));
    if (memberError) {
      await access.supabase.from("sms_contact_groups").delete().eq("id", group.id).eq("company_id", access.companyId);
      throw memberError;
    }
    return NextResponse.json({ group: { ...group, members: uniqueMembers } }, { status: 201, headers });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Use Ugandan phone formats")) {
      return NextResponse.json({ error: error.message }, { status: 400, headers });
    }
    console.error("SMS group save failed", error);
    return NextResponse.json({ error: "Unable to save this contact group." }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  const access = await getSmsAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !uuidPattern.test(id)) return NextResponse.json({ error: "Choose a valid contact group." }, { status: 400, headers });
  const { error } = await access.supabase.from("sms_contact_groups").delete().eq("id", id).eq("company_id", access.companyId);
  if (error) {
    console.error("SMS group delete failed", error);
    return NextResponse.json({ error: "Unable to delete this contact group." }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}