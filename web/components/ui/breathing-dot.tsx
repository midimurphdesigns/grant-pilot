"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Breathing dot — a single cyan pulse for "live" status indicators.
 *
 * Memoized + isolated client component so the perpetual animation
 * doesn't trigger parent re-renders (per design-taste-frontend
 * §4 perpetual-motion performance rule).
 */
function BreathingDotBase({ className }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      animate={{ opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      className={cn(
        "inline-block size-1.5 rounded-full bg-[var(--color-primary)]",
        "shadow-[0_0_8px_var(--color-primary)]",
        className,
      )}
    />
  );
}

export const BreathingDot = memo(BreathingDotBase);
