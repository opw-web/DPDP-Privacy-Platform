import { normalizeDate } from "./date";

describe("normalizeDate", () => {
  it.each([
    "2023-02-29",
    "2024-02-30",
    "2024-04-31",
    "2023-02-29T00:00:00.000Z",
    "2024-02-30T12:30:00Z",
    "2024-04-31T23:59:59+05:30",
  ])("rejects impossible calendar date %s", (raw) => {
    expect(normalizeDate(raw)).toBeNull();
  });

  it.each([
    ["2024-02-29", "2024-02-29T00:00:00.000Z"],
    ["2024-02-29T12:30:45.123Z", "2024-02-29T12:30:45.123Z"],
    ["2024-02-29T12:30:45+05:30", "2024-02-29T07:00:45.000Z"],
  ])("keeps valid leap-day input %s", (raw, expected) => {
    expect(normalizeDate(raw)?.toISOString()).toBe(expected);
  });

  it("preserves the existing Date and timestamp inputs", () => {
    const source = new Date("1990-05-12T00:00:00.000Z");
    const fromDate = normalizeDate(source);

    expect(fromDate?.toISOString()).toBe("1990-05-12T00:00:00.000Z");
    expect(fromDate).not.toBe(source);
    expect(normalizeDate(source.getTime())).toEqual(source);
  });

  it.each([null, undefined, "", "12/03/2024", "2024-02-29T12:30:45"])(
    "rejects unsupported or ambiguous date input %p",
    (raw) => {
      expect(normalizeDate(raw)).toBeNull();
    },
  );
});
