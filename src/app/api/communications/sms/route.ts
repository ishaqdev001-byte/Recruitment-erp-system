import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidSmsTitle, normalizeUgandanPhone, sendSmsUg } from "@/lib/server/smsug";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type SmsAccess = { supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>; companyId: string; userId: string };

async function getSmsAccess(): Promise<SmsAccess | { error: string; status: 401 | 403 }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Authentication required.", status: 401 };
  const { data: membership, error: membershipError } = await supabase.from("company_memberships")
    .select("company_id").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (membershipError || !membership) return { error: "Active company membership not found.", status: 403 };
  const { data: allowed, error: permissionError } = await supabase.rpc("current_user_has_company_permission", {
    requested_company_id: membership.company_id,
    requested_permission: "communications.sms.send",
  });
  if (permissionError || !allowed) return { error: "You do not have permission to send SMS. Ask an administrator to grant communications.sms.send." , status: 403 };
  return { supabase, companyId: membership.company_id, userId: user.id };
}

export async function GET() {
  try {
    const access = await getSmsAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const { data, error } = await access.supabase.from("sms_message_logs")
      .select("id, title, message, contacts, contact_name, contact_type, provider_status, provider_error, provider_token, recipients, cost, balance, created_at")
      .eq("company_id", access.companyId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ messages: data ?? [], configured: Boolean(process.env.SMSUG_API_KEY?.trim()) }, { headers });
  } catch (error) {
    console.error("SMS history request failed", error);
    return NextResponse.json({ error: "SMS history is unavailable." }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSmsAccess();
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers });
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const contactName = typeof body?.contactName === "string" ? body.contactName.trim().slice(0, 200) : "Manual numbers";
    const contactType = ["Candidate", "Employer", "Staff", "Other"].includes(String(body?.contactType)) ? String(body?.contactType) : "Other";
    const rawContacts = Array.isArray(body?.contacts)
      ? body.contacts
      : typeof body?.contacts === "string" ? body.contacts.split(/[\n,;]+/) : [];
    if (!uuidPattern.test(requestId)) return NextResponse.json({ error: "Invalid SMS request ID." }, { status: 400, headers });
    if (!isValidSmsTitle(title)) return NextResponse.json({ error: "Title must be 1-100 characters and cannot contain ^ $ % & * ( ) { } @ # ~ ? < > | = _ +." }, { status: 400, headers });
    if (!message || message.length > 480) return NextResponse.json({ error: "Message must be between 1 and 480 characters." }, { status: 400, headers });
    if (!rawContacts.length || rawContacts.length > 3000 || rawContacts.some((item) => typeof item !== "string")) {
      return NextResponse.json({ error: "Provide between 1 and 3,000 valid Ugandan phone numbers." }, { status: 400, headers });
    }
    const normalizedContacts = rawContacts.map((item) => normalizeUgandanPhone(item as string));
    if (normalizedContacts.some((contact) => !contact)) return NextResponse.json({ error: "Use Ugandan phone formats 2567XXXXXXXX, 07XXXXXXXX, or 7XXXXXXXX." }, { status: 400, headers });
    const contacts = [...new Set(normalizedContacts as string[])];

    const { data: claimed, error: claimError } = await access.supabase.from("sms_message_logs").insert({
      company_id: access.companyId,
      request_id: requestId,
      created_by: access.userId,
      title,
      message,
      contacts,
      contact_name: contactName || "Manual numbers",
      contact_type: contactType,
      provider_status: "sending",
    }).select("id").maybeSingle();
    if (claimError) {
      if (claimError.code === "23505") {
        const { data: existing } = await access.supabase.from("sms_message_logs")
          .select("id, provider_status, provider_error, provider_token, recipients, cost, balance")
          .eq("company_id", access.companyId).eq("request_id", requestId).maybeSingle();
        if (existing?.provider_status === "sent") return NextResponse.json({ message: existing, duplicate: true }, { headers });
        return NextResponse.json({ error: existing?.provider_error || "This SMS request was already processed or is still in progress. Check SMS history before sending again.", status: existing?.provider_status ?? "unknown", duplicate: true }, { status: 409, headers });
      }
      console.error("SMS send claim failed", claimError);
      return NextResponse.json({ error: "Unable to safely record this SMS request. No message was sent." }, { status: 503, headers });
    }
    if (!claimed) return NextResponse.json({ error: "Unable to safely record this SMS request. No message was sent." }, { status: 503, headers });

    const result = await sendSmsUg(title, message, contacts);
    if (result.ok) {
      const { data: sent, error: updateError } = await access.supabase.from("sms_message_logs").update({
        provider_status: "sent",
        provider_token: result.token,
        recipients: result.recipients,
        cost: result.cost,
        balance: result.balance,
      }).eq("id", claimed.id).eq("company_id", access.companyId)
        .select("id, title, message, contacts, contact_name, contact_type, provider_status, provider_token, recipients, cost, balance, created_at").single();
      if (updateError) console.error("SMS sent but receipt update failed", updateError);
      return NextResponse.json({ message: sent ?? { ...claimed, provider_status: "sent", provider_token: result.token, recipients: result.recipients, cost: result.cost, balance: result.balance } }, { status: 201, headers });
    }

    const providerStatus = result.code === "sms_network_error" || result.code === "sms_not_configured" ? "unknown" : "failed";
    await access.supabase.from("sms_message_logs").update({ provider_status: providerStatus, provider_error: result.message })
      .eq("id", claimed.id).eq("company_id", access.companyId);
    return NextResponse.json({ error: result.message, code: result.code, retryAfter: result.retryAfter }, { status: result.status, headers });
  } catch (error) {
    console.error("SMS request failed", error);
    return NextResponse.json({ error: "SMS sending is unavailable. Check Sent Messages before retrying." }, { status: 503, headers });
  }
}
