import * as React from "react";
import { cn } from "@/lib/utils";

// A plain styled <select> for use inside server-rendered forms (no client JS),
// where the shadcn/base-ui Select's controlled API would be overkill.
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
