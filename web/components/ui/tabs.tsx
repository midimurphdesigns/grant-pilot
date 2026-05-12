"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "relative inline-flex items-stretch border-b border-[var(--color-border)]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * Tab trigger — segmented-tab pattern with an unambiguous active state.
 *
 * Active state combines three signals so the current tab is obvious
 * even on a dark canvas:
 *   1. Cyan label color + medium font weight (typographic emphasis)
 *   2. Faint cyan tint background (visual weight)
 *   3. A 2px cyan rail along the bottom edge that overlaps the
 *      TabsList's 1px divider (structural "current page" indicator)
 *
 * Inactive: muted-foreground text, no background, no rail. Hover
 * lifts the text to bone.
 */
const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    // The active state is handled in globals.css via the
    // `[data-state="active"]` attribute selector on this class, NOT via
    // Tailwind data- modifiers. The Tailwind JIT in v4 was unreliable
    // about emitting `data-[state=active]:*` utilities for this exact
    // component (they appeared in the source but never made it into the
    // generated CSS), so the rule was missing at render time. Real CSS
    // sidesteps the JIT entirely.
    className={cn(
      "gp-tabs-trigger",
      "relative inline-flex items-center justify-center whitespace-nowrap px-5 py-2.5 -mb-px",
      "text-xs uppercase tracking-wider font-medium",
      "transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]",
      "disabled:pointer-events-none disabled:opacity-40",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
