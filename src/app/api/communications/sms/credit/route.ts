import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatSmsCurrency } from "@/lib/server/sms-currency";
import { getCompanySmsPricing } from "@/lib/server/sms-billing";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("company_memberships")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "Active company membership not found." }, { status: 403, headers });
    }

    const [viewPermission, managePermission, sendPermission] = await Promise.all([
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "communications.sms.credit.view",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "communications.sms.credit.manage",
      }),
      supabase.rpc("current_user_has_company_permission", {
        requested_company_id: membership.company_id,
        requested_permission: "communications.sms.send",
      }),
    ]);
    if (viewPermission.error || managePermission.error || sendPermission.error) {
      return NextResponse.json({ error: "Unable to verify company SMS permissions." }, { status: 503, headers });
    }

    const canView = Boolean(viewPermission.data || managePermission.data);
    const canSend = Boolean(sendPermission.data);
    if (!canView && !canSend) {
      return NextResponse.json({ error: "You do not have permission to view SMS credit or send SMS." }, { status: 403, headers });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Company SMS billing is not configured on the server." }, { status: 503, headers });
    }

    let pricing: Awaited<ReturnType<typeof getCompanySmsPricing>> | null = null;
    let pricingError: string | null = null;
    try {
      pricing = await getCompanySmsPricing(admin, membership.company_id);
    } catch (error) {
      pricingError = error instanceof Error ? error.message : "SMS pricing is unavailable.";
    }

    if (!canView) {
      return NextResponse.json({
        canSend,
        canView: false,
        canManage: false,
        currency: pricing?.currency ?? null,
        unitPrice: pricing?.unitPrice ?? null,
        pricingError,
      }, { headers });
    }

    const [companyResult, walletResult, ledgerResult, topupsResult] = await Promise.all([
      admin.from("companies").select("country").eq("id", membership.company_id).maybeSingle(),
      admin.from("company_sms_wallets")
        .select("currency, balance, reserved_balance, updated_at")
        .eq("company_id", membership.company_id)
        .maybeSingle(),
      admin.from("company_sms_credit_ledger")
        .select("id, reference, entry_type, status, amount, currency, unit_price, fx_rate, segment_count, recipient_count, source, provider_token, details, created_at, settled_at")
        .eq("company_id", membership.company_id)
        .order("created_at", { ascending: false })
        .limit(100),
      admin.from("company_sms_topups")
        .select("id, reference, method, status, wallet_currency, requested_credit_amount, payment_amount, payment_currency, provider_gross_amount, provider_fee_amount, provider_net_amount, credited_amount, created_at, settled_at")
        .eq("company_id", membership.company_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const queryError = companyResult.error ?? walletResult.error ?? ledgerResult.error ?? topupsResult.error;
    if (queryError) {
      console.error("Company SMS credit query failed", queryError);
      return NextResponse.json({ error: "Unable to load company SMS credit records." }, { status: 503, headers });
    }

    const wallet = walletResult.data;
    return NextResponse.json({
      canSend,
      canView: true,
      canManage: Boolean(managePermission.data),
      country: companyResult.data?.country ?? null,
      currency: wallet?.currency ?? pricing?.currency ?? null,
      balance: wallet ? Number(wallet.balance) : 0,
      reservedBalance: wallet ? Number(wallet.reserved_balance) : 0,
      availableBalance: wallet ? Number(wallet.balance) - Number(wallet.reserved_balance) : 0,
      unitPrice: pricing?.unitPrice ?? null,
      fxTimestamp: pricing?.timestamp ?? null,
      pricingError,
      ledger: ledgerResult.data ?? [],
      topups: topupsResult.data ?? [],
      formattedBalance: wallet?.currency
        ? formatSmsCurrency(Number(wallet.balance) - Number(wallet.reserved_balance), wallet.currency)
        : null,
    }, { headers });
  } catch (error) {
    console.error("Company SMS credit request failed", error);
    return NextResponse.json({ error: "Company SMS credit is unavailable." }, { status: 503, headers });
  }
}
