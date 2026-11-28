import "server-only";

export type SmsCurrencyInfo = {
  countryCode: string;
  currency: string;
};

export type SmsExchangeRate = {
  localPerUgx: number;
  timestamp: string;
};

type OpenExchangeRatesResponse = {
  timestamp?: unknown;
  rates?: Record<string, unknown>;
};

const countryMap: Record<string, SmsCurrencyInfo> = {
  uganda: { countryCode: "UG", currency: "UGX" },
  ug: { countryCode: "UG", currency: "UGX" },
  kenya: { countryCode: "KE", currency: "KES" },
  ke: { countryCode: "KE", currency: "KES" },
  rwanda: { countryCode: "RW", currency: "RWF" },
  rw: { countryCode: "RW", currency: "RWF" },
  "democratic republic of the congo": { countryCode: "CD", currency: "CDF" },
  "democratic republic of congo": { countryCode: "CD", currency: "CDF" },
  drc: { countryCode: "CD", currency: "CDF" },
  cd: { countryCode: "CD", currency: "CDF" },
  zambia: { countryCode: "ZM", currency: "ZMW" },
  zm: { countryCode: "ZM", currency: "ZMW" },
  cameroon: { countryCode: "CM", currency: "XAF" },
  cm: { countryCode: "CM", currency: "XAF" },
  benin: { countryCode: "BJ", currency: "XOF" },
  bj: { countryCode: "BJ", currency: "XOF" },
  "cote d'ivoire": { countryCode: "CI", currency: "XOF" },
  "cote d ivoire": { countryCode: "CI", currency: "XOF" },
  "ivory coast": { countryCode: "CI", currency: "XOF" },
  ci: { countryCode: "CI", currency: "XOF" },
  gabon: { countryCode: "GA", currency: "XAF" },
  ga: { countryCode: "GA", currency: "XAF" },
  "republic of the congo": { countryCode: "CG", currency: "XAF" },
  "congo-brazzaville": { countryCode: "CG", currency: "XAF" },
  cg: { countryCode: "CG", currency: "XAF" },
  senegal: { countryCode: "SN", currency: "XOF" },
  sn: { countryCode: "SN", currency: "XOF" },
  "sierra leone": { countryCode: "SL", currency: "SLE" },
  sl: { countryCode: "SL", currency: "SLE" },
};

export function getSmsCurrencyForCountry(country: string | null | undefined) {
  const normalized = (country ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return countryMap[normalized] ?? null;
}

export function getCurrencyMinorUnits(currency: string): number {
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
    if (digits === undefined || !Number.isInteger(digits)) {
      throw new Error(`Unsupported SMS wallet currency: ${currency}`);
    }
    return digits;
  } catch {
    throw new Error(`Unsupported SMS wallet currency: ${currency}`);
  }
}

export async function getSmsExchangeRate(currency: string): Promise<SmsExchangeRate> {
  if (currency === "UGX") {
    return { localPerUgx: 1, timestamp: new Date().toISOString() };
  }

  const appId = process.env.OPENEXCHANGERATES_APP_ID?.trim();
  if (!appId) {
    throw new Error("SMS foreign-exchange pricing is not configured. Set OPENEXCHANGERATES_APP_ID on the server.");
  }

  const url = new URL("https://openexchangerates.org/api/latest.json");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("symbols", `UGX,${currency}`);

  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error("The daily SMS exchange rate is currently unavailable.");
  }

  const payload = (await response.json()) as OpenExchangeRatesResponse;
  const ugxPerUsd = Number(payload.rates?.UGX);
  const localPerUsd = Number(payload.rates?.[currency]);
  const timestamp = Number(payload.timestamp);
  const localPerUgx = localPerUsd / ugxPerUsd;
  if (
    !Number.isFinite(ugxPerUsd) ||
    ugxPerUsd <= 0 ||
    !Number.isFinite(localPerUsd) ||
    localPerUsd <= 0 ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(localPerUgx) ||
    localPerUgx <= 0
  ) {
    throw new Error(`A valid daily exchange rate for ${currency} was not returned.`);
  }

  return {
    localPerUgx,
    timestamp: new Date(timestamp * 1000).toISOString(),
  };
}

export function calculateSmsSegmentPrice(currency: string, localPerUgx: number) {
  const minorUnits = getCurrencyMinorUnits(currency);
  const precision = 10 ** minorUnits;
  return Math.ceil((30 * localPerUgx - Number.EPSILON) * precision) / precision;
}

export function formatSmsCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: getCurrencyMinorUnits(currency),
  }).format(amount);
}
