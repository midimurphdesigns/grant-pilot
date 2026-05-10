"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="dark"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group toast group-[.toaster]:border group-[.toaster]:border-[var(--color-border)] group-[.toaster]:bg-[var(--color-popover)] group-[.toaster]:text-[var(--color-foreground)] group-[.toaster]:shadow-lg",
        description: "group-[.toast]:text-[var(--color-muted-foreground)]",
        actionButton:
          "group-[.toast]:bg-[var(--color-primary)] group-[.toast]:text-[var(--color-primary-foreground)]",
        cancelButton:
          "group-[.toast]:bg-white/5 group-[.toast]:text-[var(--color-muted-foreground)]",
      },
    }}
    {...props}
  />
);

export { Toaster };
