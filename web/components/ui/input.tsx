import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full border border-[var(--color-border)] bg-transparent px-3 py-1 text-sm transition-colors file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
