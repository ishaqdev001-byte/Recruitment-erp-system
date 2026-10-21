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
  "requisitions",
  "drive",
];

const nextConfig = {
  async rewrites() {
    return viewPaths.map((path) => ({
      source: `/${path}`,
      destination: "/",
    }));
  },
};

export default nextConfig;
