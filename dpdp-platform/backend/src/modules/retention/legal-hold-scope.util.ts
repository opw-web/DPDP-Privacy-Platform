/**
 * `LegalHold.scope` is a loosely-typed `Json @default("{}")` column (spec
 * line 320: `scope Json @default("{}") // {principalIds?, purposeIds?,
 * categories?}`) -- this is this codebase's own interpretation of how
 * those three optional keys combine to decide whether a given hold
 * covers a given principal/purpose, since the spec does not spell out
 * the matching rule itself.
 *
 * Interpretation committed to here: an EMPTY scope (no key present, or
 * every present key an empty array) is an organization-wide hold --
 * "hold everything until this is resolved" is a legitimate real-world
 * use (e.g. a Board inquiry). A non-empty scope covers a principal if
 * EITHER her id is listed directly, OR the task's governing purpose is
 * listed. `categories` (data categories) is accepted in the shape for
 * forward compatibility but not matched against here -- nothing in this
 * module's model graph ties an `ErasureTask` to a `DataCategory` (that
 * lives on `PrincipalDataField`, per-field, not per-task), so matching
 * on it would require a field-level scan this task's scope does not
 * call for. Report this as a known gap rather than fabricate a
 * best-effort field-level match.
 */
export interface LegalHoldScope {
  principalIds?: string[];
  purposeIds?: string[];
  categories?: string[];
}

export function legalHoldCovers(
  scope: unknown,
  dataPrincipalId: string,
  purposeId: string | null,
): boolean {
  const parsed = (scope ?? {}) as LegalHoldScope;
  const hasAnyScope =
    (parsed.principalIds?.length ?? 0) > 0 ||
    (parsed.purposeIds?.length ?? 0) > 0 ||
    (parsed.categories?.length ?? 0) > 0;
  if (!hasAnyScope) {
    return true;
  }
  if (parsed.principalIds?.includes(dataPrincipalId)) {
    return true;
  }
  if (purposeId && parsed.purposeIds?.includes(purposeId)) {
    return true;
  }
  return false;
}
