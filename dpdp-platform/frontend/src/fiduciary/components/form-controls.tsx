import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";
import { Label } from "../../components/ui/label";

/**
 * Small local form primitives shared by every register/purpose form in
 * this task. There is no `<select>`/`<textarea>` in the shared
 * `src/components/ui/` kit yet, so these live here (task directory) per
 * the batch rule: "put a new shared component in your own task's
 * directory; the integrator promotes it later if two tasks converged on
 * it." Styling matches `components/ui/input.tsx` exactly.
 */

const controlClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const SelectControl = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(controlClassName, className)} {...props}>
    {children}
  </select>
));
SelectControl.displayName = "SelectControl";

export const TextareaControl = forwardRef<
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
TextareaControl.displayName = "TextareaControl";

interface FieldShellProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}

export function FieldShell({ label, htmlFor, error, hint, children }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

type CheckboxOptionProps = { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>;

export const CheckboxOption = forwardRef<HTMLInputElement, CheckboxOptionProps>(
  ({ id, label, className, ...props }, ref) => (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-normal">
      <input
        id={id}
        ref={ref}
        type="checkbox"
        className={cn("h-4 w-4 rounded border-input", className)}
        {...props}
      />
      {label}
    </label>
  ),
);
CheckboxOption.displayName = "CheckboxOption";
