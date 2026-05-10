import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "border border-[var(--color-border)] text-[var(--color-foreground)]",
        muted: "border border-[var(--color-border)] text-[var(--color-muted-foreground)]",
        accent:
          "border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
        success:
          "border border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
        warning:
          "border border-yellow-400/40 bg-yellow-400/10 text-yellow-300",
        destructive:
          "border border-red-400/40 bg-red-400/10 text-red-300",
        outline: "border border-[var(--color-border)] text-[var(--color-muted-foreground)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
