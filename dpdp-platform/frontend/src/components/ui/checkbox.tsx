import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * The bare styled checkbox input, promoted out of
 * `fiduciary/components/form-controls.tsx`'s `CheckboxOption` (task 16).
 * Both the input and its established label/text composition live here now;
 * `form-controls.tsx` simply re-exports `CheckboxOption`, so every existing
 * call site keeps its name, DOM and behaviour. Native
 * `<input type="checkbox">`, not `@radix-ui/react-checkbox`: none is
 * installed and none may be added (task 16 constraint).
 */
export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn("h-4 w-4 rounded border-input", className)}
      {...props}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export type CheckboxOptionProps = { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>;

/** The behavior-preserving label + checkbox composition used by existing forms. */
export const CheckboxOption = forwardRef<HTMLInputElement, CheckboxOptionProps>(
  ({ id, label, className, ...props }, ref) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-normal">
      <Checkbox id={id} ref={ref} className={className} {...props} />
      {label}
    </label>
  ),
);
CheckboxOption.displayName = "CheckboxOption";
