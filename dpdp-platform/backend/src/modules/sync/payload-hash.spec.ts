import { hashPayload } from "./payload-hash";

describe("hashPayload", () => {
  it("hashes two payloads identically when they differ only in key order", () => {
    const a = hashPayload({
      name: "Aman",
      email: "aman@example.test",
      city: "Pune",
    });
    const b = hashPayload({
      city: "Pune",
      name: "Aman",
      email: "aman@example.test",
    });
    expect(a).toBe(b);
  });

  it("hashes nested-object key reordering identically too", () => {
    const a = hashPayload({ id: "1", extra: { z: 1, a: 2 } });
    const b = hashPayload({ extra: { a: 2, z: 1 }, id: "1" });
    expect(a).toBe(b);
  });

  it("produces a different hash when a value actually changes", () => {
    const a = hashPayload({ name: "Aman", city: "Pune" });
    const b = hashPayload({ name: "Aman", city: "Mumbai" });
    expect(a).not.toBe(b);
  });

  it("is sensitive to array order (array order is data, not formatting)", () => {
    const a = hashPayload({ tags: ["a", "b"] });
    const b = hashPayload({ tags: ["b", "a"] });
    expect(a).not.toBe(b);
  });

  it("produces a 64-character hex sha256 digest", () => {
    const hash = hashPayload({ a: 1 });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
