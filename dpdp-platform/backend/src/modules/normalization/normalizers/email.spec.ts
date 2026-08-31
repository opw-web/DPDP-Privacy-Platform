import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("trims, NFKC-normalizes and lowercases a valid email", () => {
    expect(normalizeEmail("  ALICE@EXAMPLE.COM  ")).toBe("alice@example.com");
    expect(normalizeEmail("ＡＬＩＣＥ@Ｅxample.com")).toBe("alice@example.com");
  });

  it("does not apply provider-specific Gmail aliases or dot rules", () => {
    expect(normalizeEmail("a.b+tag@gmail.com")).toBe("a.b+tag@gmail.com");
    expect(normalizeEmail("a.b+tag@gmail.com")).not.toBe("ab@gmail.com");
  });

  it.each([
    [""],
    ["   "],
    ["not-an-email"],
    ["alice@"],
    ["alice@example"],
    ["alice @example.com"],
    [null],
    [undefined],
    [42],
  ])("returns null for invalid email input %#", (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });
});
