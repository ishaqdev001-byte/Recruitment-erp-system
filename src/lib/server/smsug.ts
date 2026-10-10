import "server-only";

export type SmsUgResult =
  | { ok: true; token: string; recipients: number; cost: number; balance: number }
  | { ok: false; status: number; code: string; message: string; retryAfter?: string };

export function normalizeUgandanPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!/^\+?(?:2567\d{8}|07\d{8}|7\d{8})$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, "");
  if (digits.startsWith("256")) return digits;
  if (digits.startsWith("0")) return `256${digits.slice(1)}`;
  return `256${digits}`;
}

export function isValidSmsTitle(value: string) {
  return value.length > 0 && value.length <= 100 && !/[\^$%&*(){}@#~?<>|=+_]/.test(value);
}

export async function sendSmsUg(title: string, message: string, contacts: string[]): Promise<SmsUgResult> {
  const apiKey = process.env.SMSUG_API_KEY?.trim();
  if (!apiKey) return { ok: false, status: 503, code: "sms_not_configured", message: "SMS is not configured. Set SMSUG_API_KEY in the server environment and restart the app." };

  let response: Response;
  try {
    response = await fetch("https://sms.ug/api/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, message, contacts }),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("SMSUG request failed", error);
    return { ok: false, status: 503, code: "sms_network_error", message: "The SMS provider could not be reached. The result may be unknown; check Sent Messages before trying again." };
  }

  const payload = await response.json().catch(() => null) as {
    status?: unknown;
    token?: unknown;
    recipients?: unknown;
    cost?: unknown;
    balance?: unknown;
    error?: unknown;
    message?: unknown;
    invalid_contacts?: unknown;
  } | null;
  if (response.ok && payload?.status === "success" && typeof payload.token === "string") {
    return {
      ok: true,
      token: payload.token,
      recipients: Number(payload.recipients ?? contacts.length),
      cost: Number(payload.cost ?? 0),
      balance: Number(payload.balance ?? 0),
    };
  }

  const code = typeof payload?.error === "string" ? payload.error : `http_${response.status}`;
  const safeMessages: Record<string, string> = {
    insufficient_balance: "SMSUG reports insufficient balance. Nothing was charged.",
    api_disabled: "SMSUG API access is turned off. Enable it in SMSUG Settings > API Settings.",
    unauthorized: "SMSUG rejected the server API key. Check or rotate the key in SMSUG Settings.",
    rate_limited: "SMSUG rate limit reached. Wait before sending again.",
    restricted_content: "SMSUG rejected this message because it contains restricted verification-code content.",
    message_too_long: "SMSUG rejected the message because it exceeds 480 characters.",
    invalid_title: "SMSUG rejected the title because it contains unsupported characters.",
    invalid_contacts: "SMSUG rejected one or more recipient phone numbers.",
    too_many_contacts: "SMSUG accepts at most 3,000 contacts per request.",
    gateway_failed: "The SMS gateway rejected the message. SMSUG says you were not charged.",
    payload_too_large: "The SMS request exceeded the provider's payload limit.",
    internal_error: "SMSUG encountered an internal error. Check Sent Messages before retrying.",
  };
  return {
    ok: false,
    status: response.status,
    code,
    message: safeMessages[code] ?? (typeof payload?.message === "string" ? payload.message.slice(0, 500) : "SMSUG could not send this message."),
    retryAfter: response.headers.get("Retry-After") ?? undefined,
  };
}
