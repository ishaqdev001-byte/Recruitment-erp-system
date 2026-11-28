import { NextRequest, NextResponse } from "next/server";
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const requestOrigin = await getRequestOrigin();

    // Fetch company data
    const response = await fetch(
      new URL(`/api/companies/${encodeURIComponent(slug)}`, requestOrigin),
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return new NextResponse("Company not found", { status: 404 });
    }

    const company = (await response.json()) as CompanyMetadata;

    // Generate a simple SVG Open Graph image with company info
    const location = [company.city, company.country]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(", ");

    const svg = `
      <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
        <!-- Background Gradient -->
        <defs>
          <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
          </linearGradient>
          <linearGradient id="accent-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="1200" height="630" fill="url(#bg-gradient)"/>
        
        <!-- Accent bar -->
        <rect width="1200" height="8" y="0" fill="url(#accent-gradient)"/>
        
        <!-- Company Name -->
        <text x="600" y="280" font-family="Arial, sans-serif" font-size="72" font-weight="bold" fill="#ffffff" text-anchor="middle">
          ${escapeXml(company.name)}
        </text>
        
        <!-- Location -->
        ${
          location
            ? `<text x="600" y="340" font-family="Arial, sans-serif" font-size="32" fill="#94a3b8" text-anchor="middle">
          ${escapeXml(location)}
        </text>`
            : ""
        }
        
        <!-- Subtitle -->
        <text x="600" y="${location ? "400" : "360"}" font-family="Arial, sans-serif" font-size="28" fill="#cbd5e1" text-anchor="middle">
          Recruitment Operations Portal
        </text>
        
        <!-- Powered by -->
        <text x="600" y="560" font-family="Arial, sans-serif" font-size="20" fill="#64748b" text-anchor="middle">
          Powered by Kilax Smart Recruit
        </text>
      </svg>
    `;

    return new NextResponse(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new NextResponse("Error generating image", { status: 500 });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
