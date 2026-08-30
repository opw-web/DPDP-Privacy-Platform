export type SourceRef = { id: string; name: string };

/**
 * The read-side enforcement of spec line 31: a personal value must never be
 * returned unless every one of its recorded `sourceIds` resolves to a
 * same-tenant `DataSource`. This is the platform's single implementation of
 * that fail-closed rule -- `PrincipalsService` (detail, list) and
 * `LineageService` all call it instead of re-deriving the same de-dup/sort/
 * drop-if-incomplete logic independently, which previously let list and
 * detail apply the rule in different orders (see Task 20 fix round 3,
 * Important 6: list picked its winning field before checking whether that
 * field's sources resolved; detail resolved first and picked second).
 *
 * `sourceById` must be a lookup already scoped to the caller's tenant (built
 * from a `dataSource.findMany` issued through the tenant-scoped client or
 * transaction), so a same-tenant `id` collision cannot smuggle in an
 * out-of-tenant source name.
 */
export function resolveProvenance<T extends { sourceIds: readonly string[] }>(
  fields: readonly T[],
  sourceById: ReadonlyMap<string, SourceRef>,
): Array<T & { sources: SourceRef[] }> {
  return fields.flatMap((field) => {
    const resolvedSources = field.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source): source is SourceRef => source !== undefined)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          left.id.localeCompare(right.id),
      );
    if (
      resolvedSources.length !== field.sourceIds.length ||
      resolvedSources.length === 0
    ) {
      return [];
    }
    return [{ ...field, sources: resolvedSources }];
  });
}

/**
 * The list/detail display-name tie-break, shared so the two read paths
 * cannot disagree. Callers MUST pass only provenance-resolved (i.e. already
 * run through `resolveProvenance`), primary `FULL_NAME` candidates -- this
 * function only performs the deterministic tie-break, never the provenance
 * filtering, so that filtering always happens first by construction.
 */
export function pickDisplayName<T extends { value: string }>(
  attributedFullNameFields: readonly T[],
): T | undefined {
  return [...attributedFullNameFields].sort((left, right) =>
    left.value.localeCompare(right.value),
  )[0];
}
