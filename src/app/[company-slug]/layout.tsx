import type { Metadata } from "next";
import { headers } from "next/headers";

type CompanyMetadata = {
  name: string;
  slug: string;
  logo_url: string | null;
  city: string | null;
  country: string | null;
  office_address: string | null;
};

async function getRequestOrigin() {
  const requestHeaders = await headers();
  const host = (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000"
  )
    .split(",")[0]
    .trim();
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    .trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return new URL(`${protocol}://${host}`).origin;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "company-slug": string }>;
}): Promise<Metadata> {
  const { "company-slug": slug } = await params;

  try {
    const requestOrigin = await getRequestOrigin();
    const origin = process.env.NEXT_PUBLIC_SITE_URL
      ? new URL(process.env.NEXT_PUBLIC_SITE_URL).origin
      : requestOrigin;
    const response = await fetch(
      new URL(`/api/companies/${encodeURIComponent(slug)}`, requestOrigin),
      {
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Company metadata request failed (${response.status}).`);
    }

    const company = (await response.json()) as CompanyMetadata;
    const location = [
      company.office_address,
      company.city,
      company.country,
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(", ");
    const title = `${company.name} | Company Login`;
    const description = location
      ? `Sign in to ${company.name}'s recruitment workspace in ${location}.`
      : `Sign in to ${company.name}'s recruitment workspace.`;
    let logoUrl = new URL("/branding/kilax-icon.svg", origin).toString();
    if (company.logo_url?.startsWith("data:image/")) {
      logoUrl = new URL(
        `/api/companies/${encodeURIComponent(slug)}/logo`,
        origin,
      ).toString();
    } else if (company.logo_url?.startsWith("https://")) {
      logoUrl = company.logo_url;
    }
    const loginUrl = new URL(
      `/${encodeURIComponent(slug)}/login`,
      origin,
    ).toString();

    return {
      metadataBase: new URL(origin),
      title,
      description,
      alternates: { canonical: loginUrl },
      openGraph: {
        title: company.name,
        description,
        url: loginUrl,
        siteName: company.name,
        type: "website",
        images: [{ url: logoUrl, alt: `${company.name} logo` }],
      },
      twitter: {
        card: "summary",
        title: company.name,
        description,
        images: [logoUrl],
      },
    };
  } catch (error) {
    console.error("Error fetching company metadata:", error);

    return {
      title: "Kilax Smart Recruit | Company Login",
      description: "Sign in to your company's recruitment workspace",
    };
  }
}

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ "company-slug": string }>;
}) {
  return children;
}
