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
    
    // Build dynamic title and description
    const companyName = company.name || "Recruitment Portal";
    const title = `${companyName} | Recruitment Dashboard`;
    const shortDescription = location
      ? `${companyName} recruitment operations in ${location}.`
      : `${companyName} recruitment operations.`;
    const fullDescription = location
      ? `Access ${companyName}'s recruitment workspace. Manage candidates, track applications, and oversee deployment operations in ${location}. Powered by Kilax Smart Recruit.`
      : `Access ${companyName}'s recruitment workspace. Manage candidates, track applications, and oversee deployment operations. Powered by Kilax Smart Recruit.`;
    
    // Determine logo URL
    let logoUrl = new URL("/branding/kilax-icon.svg", origin).toString();
    let ogImageUrl = new URL(
      `/api/companies/${encodeURIComponent(slug)}/og-image`,
      origin
    ).toString();
    
    if (company.logo_url?.startsWith("data:image/")) {
      logoUrl = new URL(
        `/api/companies/${encodeURIComponent(slug)}/logo`,
        origin,
      ).toString();
    } else if (company.logo_url?.startsWith("https://")) {
      logoUrl = company.logo_url;
    }
    
    const companyUrl = new URL(
      `/${encodeURIComponent(slug)}`,
      origin,
    ).toString();

    return {
      metadataBase: new URL(origin),
      title,
      description: fullDescription,
      alternates: { canonical: companyUrl },
      keywords: [
        companyName,
        "recruitment",
        "candidate management",
        "hiring",
        location || "international recruitment",
        "workforce management",
      ].filter(Boolean),
      openGraph: {
        type: "website",
        locale: "en_US",
        url: companyUrl,
        siteName: `${companyName} - Recruitment Portal`,
        title: `${companyName} Recruitment Dashboard`,
        description: fullDescription,
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `${companyName} Recruitment Portal`,
            type: "image/svg+xml",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${companyName} Recruitment Portal`,
        description: shortDescription,
        images: [ogImageUrl],
      },
      robots: {
        index: false, // Company workspaces should not be indexed by search engines
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      },
    };
  } catch (error) {
    console.error("Error fetching company metadata:", error);

    return {
      title: "Kilax Smart Recruit | Company Workspace",
      description: "Access your company's recruitment workspace powered by Kilax Smart Recruit",
      robots: {
        index: false,
        follow: false,
      },
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
