/**
 * Render an optional evidence timestamp without turning an unknown historical
 * value into an empty cell.  A missing value is a fact about the source record,
 * not a date that can safely be inferred from another breach timestamp.
 */
export function formatEvidenceTimestamp(value: Date | null | undefined): string {
  return value === null || value === undefined ? "not recorded" : value.toISOString();
}
