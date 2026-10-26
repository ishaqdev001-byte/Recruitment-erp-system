import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware to detect company subdomain/slug and set it in request headers
 * Supports patterns like:
 * - https://recruit.kilaxtech.com/kilax-dammy-recruit/... -> company slug: kilax-dammy-recruit
 * - http://localhost:3000/kilax-dammy-recruit/... -> company slug: kilax-dammy-recruit
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Extract company slug from URL path
  // Pattern: /[company-slug]/... or /[company-slug]
  const pathSegments = pathname.split("/").filter(Boolean);
  
  if (pathSegments.length === 0) {
    // Root path, let it through
    return NextResponse.next();
  }

  const potentialCompanySlug = pathSegments[0];
  
  // Skip if it looks like an API route or special path
  if (potentialCompanySlug.startsWith("api") || potentialCompanySlug.startsWith("_next")) {
    return NextResponse.next();
  }

  // Set company slug in request headers for use in pages/components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-company-slug", potentialCompanySlug);
  
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
