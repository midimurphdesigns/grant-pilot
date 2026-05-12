"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

/**
 * Tab active-state styling is rendered as an inline <style> tag inside
 * TabsList. Plain stylesheet rules in globals.css were not applying
 * reliably on the deployed grant-pilot.kevinmurphywebdev.com — verified
 * the rules were in the built CSS and the HTML referenced the right
 * file, but the styles didn't render in the browser anyway (most
 * likely a stale local cache that no amount of hard-reload would
 * clear because the asset hash kept getting re-shipped under the same
 * client-side cache key).
 *
 * Inline <style> is the nuclear option: the rules ship inside the HTML
 * payload itself, bypass any external stylesheet caching entirely, and
 * cannot be overridden by an earlier-cached version of globals.css
 * because they're not in globals.css.
 *
 * The styles are namespaced under `data-gp-tabs-list` so they only
 * affect the triggers that are descendants of THIS TabsList instance.
 */
const TABS_INLINE_CSS = `
[data-gp-tabs-list] [data-gp-tabs-trigger] {
  color: rgb(156 163 175);
}
[data-gp-tabs-list] [data-gp-tabs-trigger]:hover {
  color: rgb(245 241 234);
}
[data-gp-tabs-list] [data-gp-tabs-trigger][aria-selected="true"],
[data-gp-tabs-list] [data-gp-tabs-trigger][data-state="active"] {
  color: #4dffff !important;
  background-color: rgba(77, 255, 255, 0.14) !important;
}
[data-gp-tabs-list] [data-gp-tabs-trigger][aria-selected="true"]::after,
[data-gp-tabs-list] [data-gp-tabs-trigger][data-state="active"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  background-color: #4dffff;
  box-shadow: 0 0 10px rgba(77, 255, 255, 0.6);
}
`.trim();

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <>
    <style dangerouslySetInnerHTML={{ __html: TABS_INLINE_CSS }} />
    <TabsPrimitive.List
      ref={ref}
      data-gp-tabs-list=""
      className={cn(
        "relative inline-flex items-stretch border-b border-[var(--color-border)]",
        className,
      )}
      {...props}
    />
  </>
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
    data-gp-tabs-trigger=""
    className={cn(
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
