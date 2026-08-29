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

  it("handles primitives and null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson("hi")).toBe('"hi"');
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson({})).toBe("{}");
    expect(canonicalJson([])).toBe("[]");
  });
});
