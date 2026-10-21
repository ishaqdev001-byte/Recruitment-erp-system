// View paths that the SPA handles client-side.
// Next.js rewrites them all to "/" so the root page serves every view.
const viewPaths = [
  "dashboard",
  "candidates",
  "candidate-inquiries",
  "agents",
  "suppliers",
  "finance",
  "accounts",
  "payments",
  "paychecks",
  "invoices",
  "passport",
  "documents",
  "ai",
  "reports",
  "users",
  "settings",
  "contractors",
  "projects",
  "tasks",
  "communications",
  "auditlog",
  "attendance",
  "leave",
  "human-resources",
  "medical-appointments",
  "medical-management",
  "requisitions",
  "branches",
  "approvals",
  "drive",
];

const nextConfig = {
  async headers() {
    return [
      {
        // Apply PWA-friendly headers to all routes
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Cache the service worker without caching so browsers always get latest
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Cache the manifest
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
  async rewrites() {
    return viewPaths.map((path) => ({
      source: `/${path}`,
      destination: "/",
    }));
  },
};

export default nextConfig;
