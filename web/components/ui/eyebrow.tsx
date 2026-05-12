import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Eyebrow — Geist Mono metadata label.
 *
 * The portfolio brand's third type tier (per ADR-023): uppercase,
 * letter-spaced, mono. Used sparingly for section labels, status
 * indicators, and run metadata.
 *
 * Use this instead of inline `text-[10px] font-mono uppercase
 * tracking-wider` to keep the eyebrow voice consistent across the
 * app and avoid the "label spam" AI-design tell.
 */
export const Eyebrow = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("type-eyebrow", className)} {...props} />
));
Eyebrow.displayName = "Eyebrow";
