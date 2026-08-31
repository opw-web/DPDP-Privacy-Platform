import { addDays, addMonths, addYears } from "date-fns";

/**
 * `RetentionPolicy.retentionValue`/`retentionUnit` is a plain
 * `Int`/`String` pair carried over from MVP 1 (`DAYS | MONTHS | YEARS` --
 * no `HOURS`, unlike `ComplianceRule.deadlineUnit`), so it cannot reuse
 * `addByDeadlineUnit` from `compliance.service.ts` directly. Same
 * calendar-aware `date-fns` arithmetic discipline as that function:
 * never millisecond multiplication, so a policy period crossing a leap
 * day or DST boundary lands on the correct calendar date.
 */
export function addByRetentionUnit(from: Date, value: number, unit: string): Date {
  switch (unit) {
    case "DAYS":
      return addDays(from, value);
    case "MONTHS":
      return addMonths(from, value);
    case "YEARS":
      return addYears(from, value);
    default:
      throw new Error(
        `Unknown RetentionPolicy.retentionUnit: "${unit}" (expected DAYS, MONTHS or YEARS).`,
      );
  }
}
