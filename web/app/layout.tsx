import type { Metadata } from "next";
import { spaceGrotesk, geistMono, instrumentSerif } from "@/lib/fonts";
import "./globals.css";
import Cursor from "@/components/Cursor";

const SITE_URL = "https://grant-pilot.kevinmurphywebdev.com";
const TITLE = "grant-pilot — federal grants agent";
const DESCRIPTION =
  "An agent that helps small businesses and nonprofits find federal grants they qualify for and drafts an application skeleton. Sub-agent orchestration over grants.gov + SAM.gov.";

/* Reuse the main portfolio's /og route so every property in the trilogy
 * shares one canvas. Per-property query string distinguishes them. */
const OG_IMAGE = `https://kevinmurphywebdev.com/og?title=${encodeURIComponent(
  "grant-pilot",
)}&subtitle=${encodeURIComponent(
  "An agent that finds federal grants for a small business or nonprofit and drafts an application skeleton.",
)}&eyebrow=${encodeURIComponent("DEMO — GRANT-PILOT")}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Kevin Murphy",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: TITLE }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
    creator: "@midimurphdesigns",
    site: "@midimurphdesigns",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body><Cursor />{children}</body>
    </html>
  );
}
