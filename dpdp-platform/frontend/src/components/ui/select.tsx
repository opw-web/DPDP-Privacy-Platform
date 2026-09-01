import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * Promoted from `fiduciary/components/form-controls.tsx`'s `SelectControl`
 * (task 16 -- two tasks converged on it, so it belongs in the shared kit
 * now). Styling matches `components/ui/input.tsx` exactly, unchanged from
 * the original. A native `<select>`, not a Radix combobox: no
 * `@radix-ui/react-select` is installed and none may be added (task 16
 * constraint), so this stays a styled native control on purpose.
 */
const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(selectClassName, className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

// Compatibility name retained for forms that previously imported this
// primitive from `fiduciary/components/form-controls.tsx`.
export const SelectControl = Select;
