import { NextResponse } from "next/server";
import { getInvoiceAccess } from "@/lib/server/invoices";
import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const access = await getInvoiceAccess("finance.view");
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status, headers: responseHeaders });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Invoice recipients require SUPABASE_SERVICE_ROLE_KEY in the server environment.", status: 503 as const }, { status: 503, headers: responseHeaders });

    const [{ data: recipientData, error: recipientError }, { data: company, error: companyError }] = await Promise.all([
      access.supabase.rpc("list_invoice_recipients", { requested_company_id: access.companyId }),
      admin.from("companies")
        .select("name, email, phone, office_address, city, country, registration_number, website, logo_url")
        .eq("id", access.companyId)
        .maybeSingle(),
    ]);

    if (recipientError || companyError) {
      console.error("Invoice recipient query failed", recipientError ?? companyError);
      return NextResponse.json({ error: "Unable to search invoice recipients." }, { status: 500, headers: responseHeaders });
    }

    // Get agents from company_memberships who have Recruitment Agent role
    const { data: agents, error: agentError } = await admin
      .from("company_memberships")
      .select(`
        user_id,
        user_id,
        role:company_roles!company_memberships_role_id_fkey(name),
        profile:profiles!company_memberships_user_id_fkey(first_name, last_name, phone)
      `)
      .eq("company_id", access.companyId)
      .eq("status", "active")
      .match({ "role.name": "Recruitment Agent" });

    if (agentError) {
      console.error("Agent query failed", agentError);
    }

    const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
    
    // Filter recipients from RPC
    const recipients = (recipientData ?? []).filter((recipient: { recipient_name: string }) => 
      recipient.recipient_name.toLocaleLowerCase().includes(query)
    );

    // Format agents and filter
    const formattedAgents = (agents ?? [])
      .map((agent: any) => ({
        id: agent.user_id,
        name: `${agent.profile?.first_name || ""} ${agent.profile?.last_name || ""}`.trim() || "Agent",
        phone: agent.profile?.phone || "",
      }))
      .filter((agent) => agent.name.toLocaleLowerCase().includes(query));
    
    return NextResponse.json(
      {
        recipients: recipients.map((r: any) => ({
          type: r.recipient_type,
          id: r.recipient_id,
          name: r.recipient_name,
        })),
        agents: formattedAgents,
        company: {
          name: company?.name || "",
          email: company?.email || "",
          phone: company?.phone || "",
          office_address: company?.office_address || "",
          city: company?.city || "",
          country: company?.country || "",
          registration_number: company?.registration_number || "",
          website: company?.website || "",
          logo: company?.logo_url || "",
        },
      },
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error("Invoice recipient request failed", error);
    return NextResponse.json({ error: "Invoice recipient search is unavailable." }, { status: 503, headers: responseHeaders });
  }
}