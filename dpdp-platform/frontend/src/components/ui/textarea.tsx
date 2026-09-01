import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * Promoted from `fiduciary/components/form-controls.tsx`'s
 * `TextareaControl` (task 16). Markup and className are unchanged from the
 * original -- this is a rename/relocation only, not a redesign.
 */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[4.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

// Compatibility name retained for forms that previously imported this
// primitive from `fiduciary/components/form-controls.tsx`.
export const TextareaControl = Textarea;
