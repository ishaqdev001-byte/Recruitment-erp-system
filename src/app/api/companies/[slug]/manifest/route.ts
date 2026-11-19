import { createClient } from "@supabase/supabase-js";

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug: slugParam } = await params;
    const slug = slugParam?.trim().toLowerCase();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!slug || !url || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Company app manifest is unavailable." },
        { status: 404 },
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: company, error } = await admin
      .from("companies")
      .select("name, slug, logo_url")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 },
      );
    }

    const companyPath = `/${encodeURIComponent(company.slug)}`;
    const logoMimeType =
      company.logo_url?.match(/^data:(image\/(?:png|jpeg));/i)?.[1];
    let iconSource = "/branding/kilax-icon.svg";
    if (logoMimeType) {
      iconSource = `/api/companies/${encodeURIComponent(company.slug)}/logo`;
    } else if (company.logo_url?.startsWith("https://")) {
      iconSource = company.logo_url;
    }
    const icon = {
      src: iconSource,
      sizes: "any",
      type: logoMimeType ?? (iconSource.endsWith(".svg") ? "image/svg+xml" : undefined),
    };
    const manifest = {
      id: companyPath,
      name: company.name,
      short_name: Array.from(company.name).slice(0, 12).join(""),
      description: `${company.name} recruitment workspace`,
      start_url: companyPath,
      scope: "/",
      display: "standalone",
      display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
      orientation: "portrait-primary",
      background_color: "#0f172a",
      theme_color: "#0f172a",
      icons: [icon],
      shortcuts: [
        {
          name: "Dashboard",
          short_name: "Dashboard",
          url: companyPath,
          icons: [icon],
        },
        {
          name: "Candidates",
          short_name: "Candidates",
          url: `${companyPath}/candidates`,
          icons: [icon],
        },
        {
          name: "Tasks",
          short_name: "Tasks",
          url: `${companyPath}/tasks`,
          icons: [icon],
        },
      ],
      categories: ["business", "productivity"],
      lang: "en",
    };

    return NextResponse.json(manifest, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": "application/manifest+json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Company app manifest request failed", error);
    return NextResponse.json(
      { error: "Unable to load the company app manifest." },
      { status: 503 },
    );
  }
}
