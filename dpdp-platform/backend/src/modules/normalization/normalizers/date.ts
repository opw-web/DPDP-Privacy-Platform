/** Parses only real calendar dates, never turning invalid values into dates. */
export function normalizeDate(raw: unknown): Date | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : new Date(raw.getTime());
  }

  if (typeof raw === "number") {
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }

  const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (calendarDate) {
    const [, year, month, day] = calendarDate;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() + 1 !== Number(month) ||
      parsed.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
