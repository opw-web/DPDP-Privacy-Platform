import { Database } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";

interface SourceChipProps {
  /** The connected system's display name, e.g. "Marketing Database". Never a raw internal id. */
  label: string;
  className?: string;
}

/**
 * Names the system a value came from -- the small unit lineage is built
 * from (spec: "lineage chip on every value", "Held in: Marketing
 * Database, Sales CRM"). Task 26's `LineageChip` and Task 29's portal
 * pages compose one or more of these per attributed value.
 */
export function SourceChip({ label, className }: SourceChipProps) {
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", className)}>
      <Database className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
