/**
 * Labelling rules for the personal-data items a notice lists.
 *
 * Kept as a plain module with no Nest dependencies so the demo seed can
 * reuse it: a notice built by the seed must itemise data exactly the way a
 * notice built through the UI does, or the two drift apart.
 */

/** The sentinel `canonicalField` for a source column with no canonical meaning. */
export const UNMAPPED_CANONICAL_FIELD = "IGNORE";

/**
 * "DATE_OF_BIRTH" -> "Date of birth". Used ONLY as the default itemised
 * field label when the admin ticking the field does not supply one --
 * never overrides an admin-supplied label.
 */
export function humanizeCanonicalField(field: string): string {
  const words = field.toLowerCase().split("_");
  return words
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Whether a mapping can be itemised in a notice at all.
 *
 * A notice is read by the person the data is about, so an item has to mean
 * something to them. `IGNORE` marks a column the mapping workflow found no
 * canonical meaning for; it would reach the reader as the literal word
 * "Ignore", which is worse than omitting it.
 */
export function isItemisableCanonicalField(field: string): boolean {
  return field !== UNMAPPED_CANONICAL_FIELD;
}
