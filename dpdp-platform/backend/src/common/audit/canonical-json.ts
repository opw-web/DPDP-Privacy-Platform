/**
 * Deterministic JSON serialization used to feed `AuditEvent.metadata` into
 * the audit hash chain (`AuditService.record`, spec line 876).
 *
 * `JSON.stringify` on an arbitrary object is NOT safe for hashing: key
 * order follows insertion order, so `{a:1,b:2}` and `{b:2,a:1}` -- the same
 * logical metadata, built in a different order by two call sites -- would
 * hash differently. `canonicalJson` recursively sorts object keys so the
 * same logical value always serializes to the same string, regardless of
 * how it was constructed.
 *
 * Rules, chosen to match `JSON.stringify`'s own handling of values a real
 * `JSON.stringify` call cannot represent, so callers never get surprised
 * by a metadata object that "looks like JSON" round-tripping differently
 * here than it would through `JSON.stringify`:
 *   - Object keys: sorted lexicographically, recursively. `undefined`-valued
 *     keys are omitted (matches `JSON.stringify`).
 *   - Arrays: order preserved as-is (arrays are already ordered data).
 *     An `undefined` array element serializes as `null` (matches
 *     `JSON.stringify`).
 *   - `NaN` / `Infinity` / `-Infinity`: serialize as `null` (matches
 *     `JSON.stringify`).
 *   - `undefined` at the top level (not inside an object/array): there is
 *     no JSON representation for this at all -- `JSON.stringify(undefined)`
 *     returns `undefined`, not a string. Since this function must always
 *     return a string (its result is concatenated straight into a SHA-256
 *     hash input), top-level `undefined` serializes to the literal string
 *     `"null"`. Functions, symbols and bigints are treated the same way
 *     wherever they appear, since none of them have a JSON representation
 *     either.
 */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }

  const type = typeof value;

  if (type === "number") {
    return Number.isFinite(value as number) ? String(value) : "null";
  }

  if (type === "boolean") {
    return String(value);
  }

  if (type === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stringify(item));
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${stringify(obj[key])}`,
    );
    return `{${entries.join(",")}}`;
  }

  // function, symbol, bigint -- no JSON representation.
  return "null";
}
