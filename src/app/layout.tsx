import type { Metadata, Viewport } from "next";
import "../index.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://recruit.kilaxtech.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Kilax Smart Recruit | Recruitment ERP",
  description: "Kilax Smart Recruit — intelligent recruitment operations management system for streamlined hiring, candidate tracking, and workforce management. Manage your entire recruitment workflow from inquiry to deployment.",
  keywords: ["recruitment", "ERP", "HR management", "candidate tracking", "workforce management", "recruitment software", "hiring platform"],
  icons: {
    icon: "/branding/kilax-icon.svg",
    shortcut: "/branding/kilax-icon.svg",
    apple: "/branding/kilax-icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Kilax Smart Recruit",
    title: "Kilax Smart Recruit | Intelligent Recruitment Operations Management",
    description: "Streamline your entire recruitment process with Kilax Smart Recruit. Manage candidates, track applications, handle documentation, and oversee deployments all in one powerful ERP system.",
    images: [
      {
        url: "/branding/kilax-og-image.svg",
        width: 1200,
        height: 630,
        alt: "Kilax Smart Recruit - Recruitment ERP System",
        type: "image/svg+xml",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kilax Smart Recruit | Recruitment ERP",
    description: "Intelligent recruitment operations management system for streamlined hiring and workforce management.",
    images: ["/branding/kilax-og-image.svg"],
    creator: "@kilaxtech",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
