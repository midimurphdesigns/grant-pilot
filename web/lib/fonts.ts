import { Space_Grotesk, Geist_Mono, Instrument_Serif } from "next/font/google";

/**
 * Type stack — mirrors kevinmurphywebdev.com so the hosted demos read
 * as deliberate extensions of the portfolio brand, not generic shadcn.
 *
 *   --font-display: Instrument Serif italic — ≥32px display only
 *                    (Migra is the portfolio's licensed display face;
 *                    Instrument Serif is the documented free fallback
 *                    and is what the portfolio itself falls through to
 *                    when Migra files aren't present).
 *   --font-body:    Space Grotesk — body, nav, all functional UI text.
 *   --font-mono:    Geist Mono — metadata only (eyebrows, labels,
 *                    dates, tags, captions, footnotes).
 */

export const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-instrument-serif",
});
