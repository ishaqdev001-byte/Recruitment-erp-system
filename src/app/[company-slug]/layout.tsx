import type { Metadata } from "next";
import { headers } from "next/headers";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "company-slug": string }>;
}): Promise<Metadata> {
  const { "company-slug": slug } = await params;
  
  // Fetch company info for metadata
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/companies/${slug}`, {
      headers: { "Cache-Control": "max-age=3600" },
    });

    if (response.ok) {
      const company = await response.json();
      return {
        title: `${company.name} | Kilax Smart Recruit`,
        description: `Sign in to ${company.name}'s recruitment workspace`,
      };
    }
  } catch (error) {
    console.error("Error fetching company metadata:", error);
  }

  return {
    title: "Kilax Smart Recruit | Company Login",
    description: "Sign in to your company's recruitment workspace",
  };
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
