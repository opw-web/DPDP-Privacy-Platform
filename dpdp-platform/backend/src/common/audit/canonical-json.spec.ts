import { canonicalJson } from "./canonical-json";

describe("canonicalJson", () => {
  it("is independent of top-level key order", () => {
    const a = canonicalJson({ a: 1, b: 2, c: 3 });
    const b = canonicalJson({ c: 3, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":1,"b":2,"c":3}');
  });

  it("sorts keys recursively in nested objects, regardless of insertion order", () => {
    const a = canonicalJson({
      outer: { z: 1, y: { b: 2, a: 1 } },
      first: true,
    });
    const b = canonicalJson({
      first: true,
      outer: { y: { a: 1, b: 2 }, z: 1 },
    });
    expect(a).toBe(b);
    expect(a).toBe('{"first":true,"outer":{"y":{"a":1,"b":2},"z":1}}');
  });

  it("preserves array element order, unlike object keys", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
    // Sanity: array order must NOT be sorted -- reversing it must change
    // the output.
    expect(canonicalJson([1, 2, 3])).not.toBe(canonicalJson([3, 2, 1]));
  });

  it("omits object keys whose value is undefined, matching JSON.stringify", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson({ a: undefined })).toBe("{}");
  });

  it("serializes an undefined array element as null, matching JSON.stringify", () => {
    expect(canonicalJson([1, undefined, 3])).toBe("[1,null,3]");
  });

  it('serializes a top-level undefined as the literal string "null"', () => {
    // Unlike JSON.stringify(undefined) (which returns `undefined`, not a
    // string), canonicalJson always returns a string since its result is
    // concatenated directly into a hash input.
    expect(canonicalJson(undefined)).toBe("null");
  });

  it("is stable across repeated calls on the same logical value", () => {
    const value = { z: [1, { b: 2, a: 1 }], a: "x", nested: { k: null } };
    const first = canonicalJson(value);
    const second = canonicalJson(value);
    expect(first).toBe(second);
    // And again from a freshly-built, differently-ordered equivalent.
    const rebuilt = { a: "x", nested: { k: null }, z: [1, { a: 1, b: 2 }] };
    expect(canonicalJson(rebuilt)).toBe(first);
  });

  it("serializes a Date the same way JSON.stringify/Prisma would (fix-round-1 Important 1)", () => {
    const date = new Date("2026-08-30T12:34:56.789Z");
    expect(canonicalJson(date)).toBe('"2026-08-30T12:34:56.789Z"');
    // Exactly what JSON.stringify does with a Date -- this is the
    // contract that matters: canonicalJson must never disagree with how
    // Prisma serializes the same value into the `metadata` Json column.
    expect(canonicalJson(date)).toBe(JSON.stringify(date));
    expect(canonicalJson({ at: date })).toBe(
      `{"at":${JSON.stringify(date.toISOString())}}`,
    );
    // The bug this guards against: a Date has no own enumerable keys, so
    // treating it as a generic object used to silently produce "{}".
    expect(canonicalJson({ at: date })).not.toBe('{"at":{}}');
  });

  it("throws on values with no faithful JSON representation instead of silently miscoding them", () => {
    expect(() => canonicalJson(new Map([["a", 1]]))).toThrow(/canonicalJson/);
    expect(() => canonicalJson(new Set([1, 2]))).toThrow(/canonicalJson/);
    expect(() => canonicalJson(() => {})).toThrow(/canonicalJson/);
    expect(() => canonicalJson(Symbol("x"))).toThrow(/canonicalJson/);
    expect(() => canonicalJson(10n)).toThrow(/canonicalJson/);

    class Custom {
      x = 1;
    }
    expect(() => canonicalJson(new Custom())).toThrow(/canonicalJson/);

    // A plain object (including one with a null prototype) is NOT
    // affected by this guard.
    expect(canonicalJson({ x: 1 })).toBe('{"x":1}');
    expect(canonicalJson(Object.assign(Object.create(null), { x: 1 }))).toBe(
      '{"x":1}',
    );
  });

  it("handles primitives and null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hi")).toBe('"hi"');
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });
});
