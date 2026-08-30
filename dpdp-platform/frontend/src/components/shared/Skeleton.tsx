import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * The one loading affordance this codebase uses. Per the UI rules (spec
 * line 872): "skeleton loaders, never a bare spinner over a table" -- so
 * this, not a spinner, is what every list/table/panel shows while its
 * query is pending.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
