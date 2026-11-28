import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function amountRaw(value: unknown) {
  if (!isRecord(value)) return null;
  const amount = Number(value.raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export async function GET() {
  return new Response(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Payment processing</title><body style=\"font-family:system-ui,sans-serif;max-width:38rem;margin:10vh auto;padding:1rem\"><h1>Payment processing</h1><p>MarzPay is confirming your payment. Return to your company SMS workspace and refresh the balance in a moment.</p></body></html>",
    { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function POST(request: Request) {
  const secret = process.env.MARZPAY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Payment callback verification is not configured." }, { status: 503, headers });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-marzpay-timestamp") ?? "";
  const signature = request.headers.get("x-marzpay-signature") ?? "";
  const signatureMatch = signature.match(/(?:^|,)v1=([a-f0-9]{64})(?:,|$)/i);
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || !signatureMatch) {
    return NextResponse.json({ error: "Invalid MarzPay signature." }, { status: 401, headers });
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(signatureMatch[1], "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ error: "Invalid MarzPay signature." }, { status: 401, headers });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payment callback payload." }, { status: 400, headers });
  }
  if (!isRecord(payload) || !isRecord(payload.transaction)) {
    return NextResponse.json({ error: "Invalid payment callback payload." }, { status: 400, headers });
  }

  const transaction = payload.transaction;
  const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
  const providerStatus = typeof transaction.status === "string" ? transaction.status : "";
  const reference = typeof transaction.reference === "string" ? transaction.reference : "";
  if (!reference) {
    return NextResponse.json({ error: "Payment callback reference is missing." }, { status: 400, headers });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Payment callback storage is unavailable." }, { status: 503, headers });
  }

  let topupQuery = admin.from("company_sms_topups")
    .select("reference, provider_reference, method, payment_amount, payment_currency, credit_fx_rate, status")
    .eq("reference", reference);
  let { data: topup, error: topupError } = await topupQuery.maybeSingle();
  if (!topup && !topupError) {
    const providerReference = reference;
    const lookup = await admin.from("company_sms_topups")
      .select("reference, provider_reference, method, payment_amount, payment_currency, credit_fx_rate, status")
      .eq("provider_reference", providerReference)
      .maybeSingle();
    topup = lookup.data;
    topupError = lookup.error;
  }
  if (topupError) {
    console.error("SMS top-up callback lookup failed", topupError);
    return NextResponse.json({ error: "Unable to verify the SMS top-up." }, { status: 503, headers });
  }
  if (!topup) {
    return NextResponse.json({ error: "SMS top-up reference was not found." }, { status: 404, headers });
  }
  if (topup.status !== "pending") {
    return NextResponse.json({ received: true, duplicate: true }, { headers });
  }

  if (eventType === "collection.completed" && providerStatus === "completed") {
    const collection = isRecord(payload.collection) ? payload.collection : transaction;
    const grossAmount = amountRaw(collection.amount) ?? amountRaw(transaction.amount);
    const netAmount = amountRaw(collection.net_amount) ?? amountRaw(transaction.net_amount);
    const feeAmount = amountRaw(collection.charge) ?? amountRaw(transaction.charge);
    const currencyValue = isRecord(collection.amount) ? collection.amount.currency : null;
    const currency = typeof currencyValue === "string" ? currencyValue : "";
    const providerTransactionId = typeof collection.provider_transaction_id === "string"
      ? collection.provider_transaction_id
      : typeof transaction.uuid === "string" ? transaction.uuid : null;

    if (
      grossAmount === null ||
      netAmount === null ||
      feeAmount === null ||
      !currency ||
      !providerTransactionId
    ) {
      return NextResponse.json({ error: "MarzPay settlement details are incomplete." }, { status: 400, headers });
    }

    const { data, error } = await admin.rpc("finalize_company_sms_topup", {
      requested_reference: topup.reference,
      requested_status: "paid",
      requested_gross_amount: grossAmount,
      requested_net_amount: netAmount,
      requested_currency: currency,
      requested_fee_amount: feeAmount,
      requested_provider_transaction_id: providerTransactionId,
    });
    if (error) {
      console.error("SMS top-up settlement failed", error);
      return NextResponse.json({ error: "Unable to settle the SMS top-up." }, { status: 503, headers });
    }
    return NextResponse.json({ received: true, credited: data === true }, { headers });
  }

  const finalStatus = eventType === "collection.cancelled" || providerStatus === "cancelled"
    ? "cancelled"
    : eventType === "collection.failed" || providerStatus === "failed"
      ? "failed"
      : null;
  if (!finalStatus) {
    return NextResponse.json({ received: true, ignored: true }, { headers });
  }

  const { data, error } = await admin.rpc("finalize_company_sms_topup", {
    requested_reference: topup.reference,
    requested_status: finalStatus,
    requested_gross_amount: null,
    requested_net_amount: null,
    requested_currency: null,
    requested_fee_amount: null,
    requested_provider_transaction_id: typeof transaction.uuid === "string" ? transaction.uuid : null,
  });
  if (error) {
    console.error("Failed SMS top-up callback could not be recorded", error);
    return NextResponse.json({ error: "Unable to record the SMS top-up status." }, { status: 503, headers });
  }
  return NextResponse.json({ received: true, updated: data === true }, { headers });
}
