import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "grant-pilot — federal grants agent",
  description:
    "An agent that helps small businesses and nonprofits find federal grants they qualify for and drafts an application skeleton. Sub-agent orchestration over grants.gov + SAM.gov.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
