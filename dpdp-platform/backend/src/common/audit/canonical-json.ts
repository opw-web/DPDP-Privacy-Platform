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
 * here than it would through `JSON.stringify` -- and, critically, so it
 * never disagrees with how PRISMA serializes the same value into the
 * `Json` column (see the `Date` note below, fix-round-1 Important 1):
 *   - Object keys: sorted lexicographically, recursively. `undefined`-valued
 *     keys are omitted (matches `JSON.stringify`).
 *   - Arrays: order preserved as-is (arrays are already ordered data).
 *     An `undefined` array element serializes as `null` (matches
 *     `JSON.stringify`).
 *   - `NaN` / `Infinity` / `-Infinity`: serialize as `null` (matches
 *     `JSON.stringify`).
 *   - `Date`: serializes as the JSON-quoted ISO string
 *     (`JSON.stringify(value.toISOString())`), matching `JSON.stringify`'s
 *     own behaviour (`Date.prototype.toJSON` calls `toISOString()`).
 *     Getting this wrong is exactly how a chain silently breaks forever:
 *     `canonicalJson({ at: new Date() })` used to return `"{}"` (a `Date`
 *     has no own enumerable keys, so the old generic object branch saw an
 *     empty object) while Prisma stores that same value in the `metadata`
 *     `Json` column as `{"at":"2026-08-30T12:00:00.000Z"}` -- so hashing
 *     at write time and recomputing from the stored row at verify time
 *     would disagree forever, discoverable only when someone ran a chain
 *     check. Fixed by special-casing `Date` here instead of falling
 *     through to the generic object branch.
 *   - `undefined` at the top level (not inside an object/array): there is
 *     no JSON representation for this at all -- `JSON.stringify(undefined)`
 *     returns `undefined`, not a string. Since this function must always
 *     return a string (its result is concatenated straight into a SHA-256
 *     hash input), top-level `undefined` serializes to the literal string
 *     `"null"`.
 *   - Anything else with no faithful JSON representation -- a class
 *     instance (`Map`, `Set`, `RegExp`, a custom class with hidden state
 *     `Object.keys` won't see), a function, a symbol, a bigint -- THROWS,
 *     rather than silently emitting `"null"` or `"{}"`. The `Date` bug
 *     above is exactly what an uncaught silent-wrong-serialization looks
 *     like; the defensive choice here is to fail loudly at the
 *     `AuditService.record` call site the moment a caller passes something
 *     this function cannot faithfully round-trip, instead of writing a
 *     hash nothing can ever verify against the stored value. A plain
 *     object is detected by prototype (`Object.prototype` or `null`), so
 *     ordinary object literals and `Object.create(null)` objects are
 *     unaffected; only actual class instances and exotic objects trip it.
 */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function typeLabel(value: unknown): string {
  return Object.prototype.toString.call(value);
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

  if (value instanceof Date) {
    // Matches JSON.stringify's own Date handling (Date.prototype.toJSON
    // -> toISOString()) and, critically, matches how Prisma serializes a
    // Date into a Json column -- see the Date note in the doc comment
    // above. An invalid Date's toISOString() throws, same as
    // JSON.stringify(new Date(NaN)) does; that is the correct behaviour
    // here too rather than silently coercing to null.
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stringify(item));
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new Error(
        `canonicalJson: unsupported value of type ${typeLabel(value)} -- ` +
          "only plain objects, arrays, Dates, and JSON primitives are " +
          "supported. Convert it to a plain value before putting it in " +
          "audit metadata.",
      );
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((key) => obj[key] !== undefined)
      .sort();
    const entries = keys.map(
      (key) => `${JSON.stringify(key)}:${stringify(obj[key])}`,
    );
    return `{${entries.join(",")}}`;
  }

  // function, symbol, bigint -- no JSON representation. Throw rather than
  // silently emit "null": see the doc comment's defensive-throw rationale.
  throw new Error(
    `canonicalJson: unsupported value of type "${type}" -- only plain ` +
      "objects, arrays, Dates, and JSON primitives are supported.",
  );
}
