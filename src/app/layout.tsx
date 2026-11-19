import type { Metadata, Viewport } from "next";
import "../index.css";

export const metadata: Metadata = {
  title: "Kilax Smart Recruit | Recruitment ERP",
  description: "Kilax Smart Recruit — intelligent recruitment operations management system",
  icons: {
    icon: "/branding/kilax-icon.svg",
    shortcut: "/branding/kilax-icon.svg",
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
