import { normalizeName } from "./name";

describe("normalizeName", () => {
  it("collapses whitespace and title-cases the display value", () => {
    expect(normalizeName("  aman   SHARMA ")).toEqual({
      display: "Aman Sharma",
      nameKey: "aman sharma",
    });
  });

  it("sorts alphanumeric tokens for the supporting name key", () => {
    expect(normalizeName("A. Sharma")).toEqual({
      display: "A. Sharma",
      nameKey: "a sharma",
    });
    expect(normalizeName("Sharma Aman").nameKey).toBe("aman sharma");
    expect(normalizeName("Aman Sharma").nameKey).toBe("aman sharma");
  });

  it("strips punctuation from the key without mutating the display", () => {
    expect(normalizeName("  Dr.   A-MAN, Sharma! ")).toEqual({
      display: "Dr. A-man, Sharma!",
      nameKey: "a dr man sharma",
    });
  });

  it.each([[""], ["   "], [null], [undefined], [42]])(
    "returns empty display and key for non-name input %#",
    (raw) => {
      expect(normalizeName(raw)).toEqual({ display: "", nameKey: "" });
    },
  );
});
