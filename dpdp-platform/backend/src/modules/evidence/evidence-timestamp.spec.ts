import { formatEvidenceTimestamp } from "./evidence-timestamp";

describe("formatEvidenceTimestamp", () => {
  it("labels an unknown historical timestamp explicitly", () => {
    expect(formatEvidenceTimestamp(null)).toBe("not recorded");
    expect(formatEvidenceTimestamp(undefined)).toBe("not recorded");
  });

  it("preserves real timestamps in canonical ISO form", () => {
    expect(formatEvidenceTimestamp(new Date("2026-08-31T12:34:56.000Z"))).toBe(
      "2026-08-31T12:34:56.000Z",
    );
  });
});
