"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BreathingDot } from "@/components/ui/breathing-dot";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { PartialEligibility } from "@/lib/types";

/**
 * In-flight Eligibility tile.
 *
 * The verdict typically settles within ~50 tokens, so the pass/fail/
 * uncertain badge renders almost immediately. Reasons + blockers
 * stream in below, each fading into view as the model emits them.
 *
 * SAM registration is hoisted into the partial server-side, so a SAM
 * inactive blocker can render before the model has finished writing
 * its first reason.
 */
export function EligibilityPartialTile({
  partial,
}: {
  partial: PartialEligibility;
}) {
  const verdictBadge = partial.verdict
    ? {
        pass: <Badge variant="success">PASS</Badge>,
        fail: <Badge variant="destructive">FAIL</Badge>,
        uncertain: <Badge variant="warning">UNCERTAIN</Badge>,
      }[partial.verdict]
    : (
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
          weighing…
        </span>
      );

  const samBadge = !partial.samRegistration.checked ? (
    <Badge variant="muted">SAM not checked</Badge>
  ) : partial.samRegistration.active ? (
    <Badge variant="success">SAM active</Badge>
  ) : partial.samRegistration.active === false ? (
    <Badge variant="destructive">SAM inactive</Badge>
  ) : (
    <Badge variant="warning">SAM unknown</Badge>
  );

  const reasons = partial.reasons ?? [];
  const blockers = partial.blockers ?? [];

  return (
    <Card className="border-[var(--color-primary)]/30">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-[var(--color-primary)]" />
          <h3 className="text-base font-medium tracking-tight">Eligibility</h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {partial.opportunityNumber}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {samBadge}
            {verdictBadge}
            <span className="inline-flex items-center gap-1.5">
              <BreathingDot />
              <Eyebrow>streaming</Eyebrow>
            </span>
          </span>
        </div>
        {partial.title && (
          <p className="text-xs text-[var(--color-muted-foreground)] leading-5">
            {decodeHtml(partial.title)}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {reasons.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Grounded reasons
            </p>
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {reasons.map((r, i) => (
                  <motion.li
                    key={i}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 240, damping: 28 }}
                    className="text-xs leading-5 text-[var(--color-foreground)] pl-4 relative"
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-2 size-1 bg-[var(--color-primary)]/60"
                    />
                    {r}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}

        {blockers.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {blockers.length} hard blocker{blockers.length === 1 ? "" : "s"}
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-1">
                {blockers.map((b, i) => (
                  <li key={i}>• {b}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {partial.notes && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="text-xs leading-5 text-[var(--color-muted-foreground)] italic border-l-2 border-[var(--color-primary)]/30 pl-3"
          >
            {partial.notes}
          </motion.p>
        )}

        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-muted-foreground)]">
          SAM check · {partial.samRegistration.message}
        </p>
      </CardContent>
    </Card>
  );
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}
