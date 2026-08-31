import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91-98765-43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["9876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+919876543210", "+919876543210"],
  ])("normalizes India fixture %#", (raw, expected) => {
    expect(normalizePhone(raw, "IN")).toBe(expected);
  });

  it("does not create a double India prefix", () => {
    expect(normalizePhone("+91-98765-43210", "IN")).not.toContain("+91+91");
  });

  it.each([["123"], [""], ["   "], [null], [undefined], ["123456789012345"]])(
    "returns null for an unparseable India number %#",
    (raw) => {
      expect(normalizePhone(raw, "IN")).toBeNull();
    },
  );
});
