import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full border p-3 text-xs leading-5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg+div]:translate-y-[-3px] [&>svg]:text-current [&>svg~*]:pl-6",
  {
    variants: {
      variant: {
        default:
          "border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)]",
        accent:
          "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 text-[var(--color-foreground)]",
        warning: "border-yellow-400/40 bg-yellow-400/5 text-yellow-200",
        destructive: "border-red-400/40 bg-red-400/5 text-red-200",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 text-xs font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-xs leading-5", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
