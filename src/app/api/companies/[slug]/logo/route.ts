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
        { error: "Company logo is unavailable." },
        { status: 404 },
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: company, error } = await admin
      .from("companies")
      .select("logo_url")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!company?.logo_url) {
      return NextResponse.json(
        { error: "Company logo is unavailable." },
        { status: 404 },
      );
    }

    const logoUrl = company.logo_url;
    const match =
      /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(logoUrl);
    if (!match) {
      return NextResponse.json(
        { error: "Company logo is unavailable." },
        { status: 404 },
      );
    }

    const image = Buffer.from(match[2], "base64");
    const mimeType = match[1] === "png" ? "image/png" : "image/jpeg";
    const validPng =
      mimeType === "image/png" &&
      image
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const validJpeg =
      mimeType === "image/jpeg" &&
      image[0] === 0xff &&
      image[1] === 0xd8 &&
      image[2] === 0xff;

    if (!image.length || image.length > 256 * 1024 || (!validPng && !validJpeg)) {
      return NextResponse.json(
        { error: "Company logo is unavailable." },
        { status: 404 },
      );
    }

    return new Response(image, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(image.length),
        "Content-Type": mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Company logo request failed", error);
    return NextResponse.json(
      { error: "Unable to load the company logo." },
      { status: 503 },
    );
  }
}
