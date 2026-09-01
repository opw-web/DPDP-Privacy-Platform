import type { ReactNode } from "react";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { CheckboxOption as PromotedCheckboxOption } from "../../components/ui/checkbox";

/**
 * Task 16 re-point: `SelectControl`/`TextareaControl`/`CheckboxOption` were
 * promoted into the shared `components/ui/` kit (`select.tsx`,
 * `textarea.tsx`, `checkbox.tsx`) as their own task converged with this
 * one. This file now re-exports the SAME names, built on the promoted
 * primitives, so every existing importer (`PurposeForm`, `SettingsPage`,
 * the register tabs, the wizard steps, `SdfDeclarationCard`, `AuditPage`)
 * needs zero changes -- behaviour-preserving by construction: same DOM,
 * same classNames, same props, just one implementation instead of two.
 * `FieldShell` had nowhere else to go (it isn't a primitive, it's a
 * label+control+hint+error layout) and stays here unchanged.
 */

export const SelectControl = Select;
export const TextareaControl = Textarea;
export const CheckboxOption = PromotedCheckboxOption;

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
