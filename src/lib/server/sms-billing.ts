import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSmsSegmentInfo } from "@/lib/sms-segments";
import { getSmsCurrencyForCountry, getSmsExchangeRate, calculateSmsSegmentPrice } from "./sms-currency";
import { sendSmsUg, type SmsUgResult } from "./smsug";

type ServiceClient = SupabaseClient;

type SmsBillingDetails = {
  currency: string;
  amount: number;
  unitPrice: number;
  segments: number;
  recipients: number;
  availableBalance: number | null;
  settled: boolean;
};

export type CompanySmsResult =
  | (Extract<SmsUgResult, { ok: true }> & {
      ok: true;
      billing: SmsBillingDetails;
    })
  | Extract<SmsUgResult, { ok: false }>;

type SendCompanySmsOptions = {
  admin: ServiceClient;
  companyId: string;
  reference: string;
  title: string;
  message: string;
  contacts: string[];
  source: string;
  createdBy?: string | null;
};

function failure(status: number, code: string, message: string): CompanySmsResult {
  return { ok: false, status, code, message };
}

function rpcRow(data: unknown) {
  if (Array.isArray(data)) return data[0] as Record<string, unknown> | undefined;
  return data && typeof data === "object" ? data as Record<string, unknown> : undefined;
}

export async function getCompanySmsPricing(admin: ServiceClient, companyId: string) {
  const { data: company, error } = await admin
    .from("companies")
    .select("country")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error("Unable to load the company country for SMS billing.");

  const market = getSmsCurrencyForCountry(company?.country);
  if (!market) {
    throw new Error("Set the company country to a MarzPay-supported country before using SMS credits.");
  }

  const exchangeRate = await getSmsExchangeRate(market.currency);
  const unitPrice = calculateSmsSegmentPrice(market.currency, exchangeRate.localPerUgx);
  return { ...market, ...exchangeRate, unitPrice };
}

export async function sendCompanySms(options: SendCompanySmsOptions): Promise<CompanySmsResult> {
  const { admin, companyId, reference, title, message, contacts, source, createdBy = null } = options;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) {
    return failure(400, "sms_invalid_reference", "A valid, unique SMS request reference is required.");
  }
  if (!contacts.length || contacts.length > 3000 || contacts.some((contact) => !contact)) {
    return failure(400, "sms_invalid_recipients", "Provide between 1 and 3,000 valid SMS recipients.");
  }
  if (!message.trim() || message.length > 480) {
    return failure(400, "sms_invalid_message", "SMS messages must contain 1-480 characters.");
  }

  const segmentCount = getSmsSegmentInfo(message).segments;
  if (!segmentCount) return failure(400, "sms_invalid_message", "The SMS message is empty.");

  let pricing: Awaited<ReturnType<typeof getCompanySmsPricing>>;
  try {
    pricing = await getCompanySmsPricing(admin, companyId);
  } catch (error) {
    return failure(
      503,
      "sms_pricing_unavailable",
      error instanceof Error ? error.message : "Company SMS pricing is unavailable.",
    );
  }

  const estimatedAmount = Number(
    (pricing.unitPrice * segmentCount * contacts.length).toFixed(6),
  );
  const { data: reservationData, error: reserveError } = await admin.rpc(
    "reserve_company_sms_credit",
    {
      requested_company_id: companyId,
      requested_reference: reference,
      requested_amount: estimatedAmount,
      requested_currency: pricing.currency,
      requested_unit_price: pricing.unitPrice,
      requested_fx_rate: pricing.localPerUgx,
      requested_fx_rate_timestamp: pricing.timestamp,
      requested_segments: segmentCount,
      requested_recipients: contacts.length,
      requested_source: source.slice(0, 80),
      requested_created_by: createdBy,
    },
  );
  if (reserveError) {
    console.error("Company SMS credit reservation failed", reserveError);
    return failure(503, "sms_credit_unavailable", "SMS credit could not be reserved. No message was sent.");
  }

  const reservation = rpcRow(reservationData);
  if (!reservation || reservation.outcome !== "reserved") {
    const availableBalance = Number(reservation?.available_balance ?? 0);
    if (reservation?.outcome === "insufficient") {
      return failure(
        402,
        "sms_insufficient_credit",
        `Insufficient SMS credit. Available: ${availableBalance.toFixed(2)} ${pricing.currency}; estimated charge: ${estimatedAmount.toFixed(2)} ${pricing.currency}.`,
      );
    }
    return failure(
      409,
      "sms_request_already_processed",
      "This SMS request was already reserved or processed. Check SMS history before retrying.",
    );
  }

  const ledgerId = String(reservation.ledger_id ?? "");
  const providerResult = await sendSmsUg(title, message, contacts);
  if (!providerResult.ok) {
    const unresolved = providerResult.code === "sms_network_error";
    const { error: releaseError } = await admin.rpc("release_company_sms_credit", {
      requested_ledger_id: ledgerId,
      requested_status: unresolved ? "unknown" : "failed",
      requested_details: { provider_error: providerResult.message, provider_code: providerResult.code },
    });
    if (releaseError) console.error("Company SMS reservation status update failed", releaseError);
    return providerResult;
  }

  const recipients = providerResult.recipients;
  if (!Number.isSafeInteger(recipients) || recipients < 1 || recipients > contacts.length) {
    const { error: markUnknownError } = await admin.rpc("release_company_sms_credit", {
      requested_ledger_id: ledgerId,
      requested_status: "unknown",
      requested_details: { provider_recipients: recipients, requested_recipients: contacts.length },
    });
    if (markUnknownError) console.error("Company SMS reservation status update failed", markUnknownError);
    return {
      ...providerResult,
      billing: {
        currency: pricing.currency,
        amount: estimatedAmount,
        unitPrice: pricing.unitPrice,
        segments: segmentCount,
        recipients: contacts.length,
        availableBalance: null,
        settled: false,
      },
    };
  }

  const actualAmount = Number((pricing.unitPrice * segmentCount * recipients).toFixed(6));
  const { data: settledData, error: settlementError } = await admin.rpc(
    "settle_company_sms_credit",
    {
      requested_ledger_id: ledgerId,
      requested_actual_amount: actualAmount,
      requested_segments: segmentCount,
      requested_recipients: recipients,
      requested_provider_token: providerResult.token,
    },
  );
  const settled = !settlementError && settledData === true;
  if (settlementError) console.error("SMS was sent but its credit settlement failed", settlementError);

  let availableBalance: number | null = null;
  if (settled) {
    const { data: wallet, error: walletError } = await admin
      .from("company_sms_wallets")
      .select("balance, reserved_balance")
      .eq("company_id", companyId)
      .maybeSingle();
    if (walletError) console.error("SMS was sent but the wallet balance could not be refreshed", walletError);
    else if (wallet) availableBalance = Number(wallet.balance) - Number(wallet.reserved_balance);
  }

  return {
    ...providerResult,
    billing: {
      currency: pricing.currency,
      amount: actualAmount,
      unitPrice: pricing.unitPrice,
      segments: segmentCount,
      recipients,
      availableBalance,
      settled,
    },
  };
}
