import { SourceChip } from "../../components/shared/SourceChip";
import { cn } from "../../lib/utils";

/** Mirrors `SourceRef` in `field-provenance.ts` -- a resolved, same-tenant `DataSource` a value's lineage names. */
export interface SourceRef {
  id: string;
  name: string;
}

interface LineageChipProps {
  /**
   * Required, with no default. This is the structural half of "a lineage
   * chip on every single displayed value" (spec lines 855-857; Check 8):
   * there is no way to render this component without first having a
   * `sources` array in hand, so a call site cannot forget to pass
   * provenance -- it fails to typecheck instead.
   *
   * The other half -- refusing to show a value that genuinely has none --
   * is enforced here too: an empty array renders nothing. Callers should
   * treat that as "do not render the value either" (see `AttributedValue`
   * in `PrincipalDetailPage.tsx`, which never calls this component at all
   * unless `sources.length > 0`), not as "show the value with no chip".
   */
  sources: readonly SourceRef[];
  className?: string;
}

/**
 * One badge per contributing system -- e.g. a phone value mapped from both
 * Marketing and Support renders two chips, "Marketing" and "Support"
 * (Check 8: "the phone value's lineage chip names Marketing and Support").
 * Sources already arrive de-duplicated and sorted from
 * `resolveProvenance` (`field-provenance.ts`), so this component only
 * renders -- it never re-derives or re-sorts attribution itself.
 */
export function LineageChip({ sources, className }: LineageChipProps) {
  if (sources.length === 0) {
    return null;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {sources.map((source) => (
        <SourceChip key={source.id} label={source.name} />
      ))}
    </span>
  );
}
