import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getCurrencyMinorUnits, getSmsCurrencyForCountry, getSmsExchangeRate } from "@/lib/server/sms-currency";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function parseAmount(value: unknown) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? amount : null;
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
    }

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

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_company_permission",
      {
        requested_company_id: membership.company_id,
        requested_permission: "communications.sms.credit.manage",
      },
    );
    if (permissionError || !allowed) {
      return NextResponse.json({ error: "You do not have permission to top up SMS credits." }, { status: 403, headers });
    }

    const body = await request.json().catch(() => null) as {
      amount?: unknown;
      method?: unknown;
      phoneNumber?: unknown;
    } | null;
    const amount = parseAmount(body?.amount);
    const method = body?.method === "card" ? "card" : body?.method === "mobile_money" ? "mobile_money" : null;
    if (!amount || !method) {
      return NextResponse.json({ error: "Enter a valid top-up amount and payment method." }, { status: 400, headers });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "SMS payments are not configured on the server." }, { status: 503, headers });
    }

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("country")
      .eq("id", membership.company_id)
      .maybeSingle();
    if (companyError) {
      return NextResponse.json({ error: "Unable to load the company billing country." }, { status: 503, headers });
    }

    const market = getSmsCurrencyForCountry(company?.country);
    if (!market) {
      return NextResponse.json({ error: "Set the company country to a MarzPay-supported country before topping up." }, { status: 400, headers });
    }

    const minorUnits = getCurrencyMinorUnits(market.currency);
    const precision = 10 ** minorUnits;
    if (Math.round(amount * precision) / precision !== amount) {
      return NextResponse.json({ error: `Enter an amount with no more than ${minorUnits} decimal places.` }, { status: 400, headers });
    }

    const marzApiKey = process.env.MARZPAY_API_KEY?.trim();
    const marzApiSecret = process.env.MARZPAY_API_SECRET?.trim();
    const webhookSecret = process.env.MARZPAY_WEBHOOK_SECRET?.trim();
    if (!marzApiKey || !marzApiSecret || !webhookSecret) {
      return NextResponse.json({ error: "MarzPay API credentials and webhook signing secret must be configured on the server." }, { status: 503, headers });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    const reference = crypto.randomUUID();
    let paymentAmount = amount;
    let paymentCurrency = market.currency;
    let creditFxRate = 1;
    let fxRateTimestamp: string | null = null;

    if (method === "card") {
      let exchangeRate: Awaited<ReturnType<typeof getSmsExchangeRate>>;
      try {
        exchangeRate = await getSmsExchangeRate(market.currency);
      } catch (error) {
        return NextResponse.json({
          error: error instanceof Error ? error.message : "Card top-up currency conversion is unavailable.",
        }, { status: 503, headers });
      }
      paymentAmount = Math.ceil(amount / exchangeRate.localPerUgx);
      if (paymentAmount < 500 || paymentAmount > 10_000_000) {
        return NextResponse.json({ error: "Card top-ups must convert to between UGX 500 and UGX 10,000,000." }, { status: 400, headers });
      }
      paymentCurrency = "UGX";
      creditFxRate = exchangeRate.localPerUgx;
      fxRateTimestamp = exchangeRate.timestamp;
    } else if (typeof body?.phoneNumber !== "string" || !/^\+[1-9]\d{6,14}$/.test(body.phoneNumber.trim())) {
      return NextResponse.json({ error: "Enter a valid mobile-money phone number in international format, including its country code." }, { status: 400, headers });
    }

    const { error: walletInsertError } = await admin
      .from("company_sms_wallets")
      .upsert(
        { company_id: membership.company_id, currency: market.currency },
        { onConflict: "company_id", ignoreDuplicates: true },
      );
    if (walletInsertError) {
      console.error("Company SMS wallet initialization failed", walletInsertError);
      return NextResponse.json({ error: "Unable to initialize the company SMS wallet." }, { status: 503, headers });
    }

    const { data: wallet, error: walletError } = await admin
      .from("company_sms_wallets")
      .select("currency")
      .eq("company_id", membership.company_id)
      .maybeSingle();
    if (walletError || wallet?.currency !== market.currency) {
      return NextResponse.json({ error: "The company SMS wallet currency does not match the company country." }, { status: 409, headers });
    }

    const { error: topupError } = await admin.from("company_sms_topups").insert({
      company_id: membership.company_id,
      reference,
      created_by: user.id,
      method,
      wallet_currency: market.currency,
      requested_credit_amount: amount,
      payment_amount: paymentAmount,
      payment_currency: paymentCurrency,
      credit_fx_rate: creditFxRate,
      fx_rate_timestamp: fxRateTimestamp,
    });
    if (topupError) {
      console.error("Company SMS top-up record creation failed", topupError);
      return NextResponse.json({ error: "Unable to safely start this SMS top-up." }, { status: 503, headers });
    }

    const callbackUrl = new URL("/api/communications/sms/credit/callback", siteUrl);
    callbackUrl.searchParams.set("reference", reference);
    const metadata = [{ topup_reference: reference }];
    const authorization = `Basic ${Buffer.from(`${marzApiKey}:${marzApiSecret}`).toString("base64")}`;

    let providerResponse: Response;
    try {
      if (method === "card") {
        providerResponse = await fetch("https://wallet.wearemarz.com/api/v1/collect-money", {
          method: "POST",
          headers: { Authorization: authorization, "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: paymentAmount,
            method: "card",
            reference,
            country: market.countryCode,
            description: "RecruitOS company SMS credit top-up",
            callback_url: callbackUrl.toString(),
            metadata,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
      } else {
        const formData = new FormData();
        formData.set("amount", String(paymentAmount));
        formData.set("method", "mobile_money");
        formData.set("phone_number", (body!.phoneNumber as string).trim());
        formData.set("country", market.countryCode);
        formData.set("reference", reference);
        formData.set("description", "RecruitOS company SMS credit top-up");
        formData.set("callback_url", callbackUrl.toString());
        formData.set("metadata", JSON.stringify(metadata));
        providerResponse = await fetch("https://wallet.wearemarz.com/api/v1/collect-money", {
          method: "POST",
          headers: { Authorization: authorization },
          body: formData,
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
      }
    } catch (error) {
      console.error("MarzPay SMS top-up request failed", error);
      return NextResponse.json({
        error: "MarzPay could not confirm whether the payment request started. Do not retry yet; refresh SMS top-up history first.",
        reference,
        status: "pending",
      }, { status: 503, headers });
    }

    const providerPayload = await providerResponse.json().catch(() => null) as {
      status?: unknown;
      message?: unknown;
      data?: {
        transaction?: { uuid?: unknown; reference?: unknown; status?: unknown };
        redirect_url?: unknown;
      };
    } | null;
    if (!providerResponse.ok || providerPayload?.status !== "success") {
      const { error: updateError } = await admin.from("company_sms_topups")
        .update({ status: "failed" })
        .eq("reference", reference)
        .eq("status", "pending");
      if (updateError) console.error("Failed MarzPay top-up could not be marked failed", updateError);
      const providerMessage = typeof providerPayload?.message === "string"
        ? providerPayload.message.slice(0, 300)
        : "MarzPay rejected the top-up request.";
      return NextResponse.json({ error: providerMessage, reference, status: "failed" }, { status: 502, headers });
    }

    const providerReference = typeof providerPayload.data?.transaction?.reference === "string"
      ? providerPayload.data.transaction.reference
      : reference;
    const providerTransactionId = typeof providerPayload.data?.transaction?.uuid === "string"
      ? providerPayload.data.transaction.uuid
      : null;
    const redirectUrl = typeof providerPayload.data?.redirect_url === "string"
      ? providerPayload.data.redirect_url
      : null;

    if (redirectUrl) {
      const parsedRedirectUrl = new URL(redirectUrl);
      if (parsedRedirectUrl.protocol !== "https:" || parsedRedirectUrl.hostname !== "wallet.wearemarz.com") {
        return NextResponse.json({ error: "MarzPay returned an invalid card redirect URL." }, { status: 502, headers });
      }
    }

    const { error: responseUpdateError } = await admin.from("company_sms_topups")
      .update({
        provider_reference: providerReference,
        provider_transaction_id: providerTransactionId,
        provider_response: {
          provider_status: providerPayload.data?.transaction?.status ?? null,
          redirect_url: redirectUrl,
        },
      })
      .eq("reference", reference)
      .eq("status", "pending");
    if (responseUpdateError) {
      console.error("MarzPay response could not be linked to the SMS top-up", responseUpdateError);
      return NextResponse.json({ error: "Payment was initiated but its reference could not be saved. Do not retry; contact support with the reference.", reference }, { status: 503, headers });
    }

    return NextResponse.json({
      reference,
      status: "pending",
      method,
      walletCurrency: market.currency,
      requestedCreditAmount: amount,
      paymentAmount,
      paymentCurrency,
      redirectUrl,
      message: method === "card"
        ? `Complete the card payment for ${paymentAmount} UGX. The SMS wallet will be credited with MarzPay's net settlement converted to ${market.currency}.`
        : "Approve the mobile-money prompt. The SMS wallet will be credited with MarzPay's net settlement.",
    }, { status: 201, headers });
  } catch (error) {
    console.error("Company SMS top-up request failed", error);
    return NextResponse.json({ error: "Unable to start the SMS top-up." }, { status: 503, headers });
  }
}
