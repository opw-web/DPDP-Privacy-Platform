import { AlertTriangle } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { LineageChip, type SourceRef } from "./LineageChip";

export interface ConflictingValue {
  value: string;
  /** Required, same as `LineageChip` -- a conflicting value shown with no source would be exactly the unattributable render Check 8 forbids, just doubled. */
  sources: readonly SourceRef[];
}

interface ConflictBadgeProps {
  /** Human-readable canonical field name, e.g. "Phone", "City". */
  fieldLabel: string;
  /**
   * The competing values for one canonical field, each with its own
   * lineage. Amber, both values, both sources -- never a single winner
   * (Check 10 / GO-03 / s.8(3)): picking one would be the silent
   * resolution the spec forbids.
   */
  values: readonly ConflictingValue[];
}

/**
 * Renders a `PrincipalDataField` group where `conflict === true` -- always
 * 2+ rows sharing one canonical field (see `assembly.service.ts`: a
 * canonical field is marked `conflict` exactly when it collected more than
 * one distinct value). Fewer than two values is not a conflict by
 * definition, so this deliberately renders nothing for that case rather
 * than a lone amber box around a single value.
 */
export function ConflictBadge({ fieldLabel, values }: ConflictBadgeProps) {
  if (values.length < 2) {
    return null;
  }
  return (
    <div
      className="rounded-md border border-amber/40 bg-amber/10 p-3"
      data-testid="conflict-badge"
    >
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-foreground" aria-hidden="true" />
        <Badge variant="amber">{fieldLabel}: conflicting values</Badge>
      </div>
      <ul className="space-y-2">
        {values.map((entry) => (
          <li key={entry.value} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{entry.value}</span>
            <LineageChip sources={entry.sources} />
          </li>
        ))}
      </ul>
    </div>
  );
}
