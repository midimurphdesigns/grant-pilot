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
    className={cn(
      "relative inline-flex items-center justify-center whitespace-nowrap px-5 py-2.5 -mb-px",
      "text-xs uppercase tracking-wider font-medium",
      "text-[var(--color-muted-foreground)]",
      "transition-colors",
      "hover:text-[var(--color-foreground)]",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]",
      "disabled:pointer-events-none disabled:opacity-40",
      "data-[state=active]:text-[var(--color-primary)]",
      "data-[state=active]:bg-[var(--color-primary)]/[0.06]",
      // The 2px cyan rail. -mb-px on the trigger overlaps the TabsList's
      // bottom border so the rail visually replaces it for the active tab.
      "after:absolute after:left-0 after:right-0 after:bottom-0 after:h-[2px] after:bg-transparent",
      "data-[state=active]:after:bg-[var(--color-primary)]",
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
