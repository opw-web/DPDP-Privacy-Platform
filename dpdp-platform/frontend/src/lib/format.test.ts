import { describe, expect, it } from "vitest";
import { formatInOrgTimezone, formatUtcTooltip } from "./format";

describe("formatInOrgTimezone", () => {
  // 2024-01-01T00:00:00.000Z is midnight UTC. Asia/Kolkata is UTC+5:30, so
  // the single correct conversion lands on 05:30 the same day.
  const UTC_MIDNIGHT = "2024-01-01T00:00:00.000Z";

  it("converts a UTC instant into Asia/Kolkata exactly once", () => {
    expect(formatInOrgTimezone(UTC_MIDNIGHT, "Asia/Kolkata")).toBe("01 Jan 2024, 05:30");
  });

  it("does not double-convert the same instant", () => {
    // A buggy implementation that pre-shifts the Date by the target
    // offset (e.g. manually adding 5.5 hours) *before* handing it to a
    // timezone-aware Intl.DateTimeFormat would apply the +5:30 offset
    // TWICE, landing on 11:00 instead of 05:30. Asserting the exact
    // correct string, and explicitly rejecting the double-converted one,
    // catches that class of bug rather than merely tolerating it.
    const result = formatInOrgTimezone(UTC_MIDNIGHT, "Asia/Kolkata");
    expect(result).toBe("01 Jan 2024, 05:30");
    expect(result).not.toBe("01 Jan 2024, 11:00");
  });

  it("renders the same instant differently for a different timezone (no shared mutable state)", () => {
    expect(formatInOrgTimezone(UTC_MIDNIGHT, "UTC")).toBe("01 Jan 2024, 00:00");
    expect(formatInOrgTimezone(UTC_MIDNIGHT, "America/New_York")).toBe("31 Dec 2023, 19:00");
  });

  it("crosses a day boundary correctly", () => {
    // 18:30 UTC + 5:30 = 24:00 = the next day at 00:00.
    expect(formatInOrgTimezone("2026-01-15T18:30:00.000Z", "Asia/Kolkata")).toBe(
      "16 Jan 2026, 00:00",
    );
  });

  it("returns a safe fallback for an unparsable instant instead of throwing", () => {
    expect(formatInOrgTimezone("not-a-date", "Asia/Kolkata")).toBe("Invalid date");
  });
});

describe("formatUtcTooltip", () => {
  it("always shows the raw UTC instant, independent of any display timezone", () => {
    expect(formatUtcTooltip("2024-01-01T00:00:00.000Z")).toBe("2024-01-01 00:00 UTC");
  });
});
