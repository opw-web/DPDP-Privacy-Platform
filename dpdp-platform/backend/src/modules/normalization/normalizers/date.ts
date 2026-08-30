const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(.*)$/u;
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/u;

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= (daysInMonth[month - 1] ?? 0);
}

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

  const calendarDate = ISO_DATE.exec(value);
  if (calendarDate) {
    const [, yearText, monthText, dayText] = calendarDate;
    const suffix = calendarDate[4] ?? "";
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (!isRealCalendarDate(year, month, day)) {
      return null;
    }

    if (suffix.length === 0) {
      return new Date(`${value}T00:00:00.000Z`);
    }

    // A date-time without an explicit zone would be interpreted in the
    // process's local timezone. Reject it rather than shifting DOB by the
    // machine on which normalization happens.
    if (!ISO_DATE_TIME.test(value)) {
      return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}
