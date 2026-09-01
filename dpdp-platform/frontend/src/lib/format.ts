import { differenceInCalendarDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Timezone discipline (spec, global constraint #7): every timestamp in
 * this system is `timestamptz` in UTC in storage and in transit. It is
 * converted to the organization's timezone EXACTLY ONCE, here, at the
 * render boundary -- never earlier (no shifting the value before it
 * reaches a component) and never twice (no formatting an already-shifted
 * string again).
 *
 * `Intl.DateTimeFormat` does the single conversion: `new Date(utcIso)`
 * holds one absolute instant (epoch milliseconds -- there is no timezone
 * attached to it yet), and passing `timeZone` to the formatter is the one
 * and only place that instant is projected into a local wall-clock time.
 * Callers must never pre-shift `utcIso` (e.g. by adding a UTC offset by
 * hand) before calling this -- doing so would double-convert.
 */
export function formatInOrgTimezone(utcIso: string, timeZone: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** The UTC instant, for the tooltip every rendered date must carry alongside its org-timezone display (spec line 872). */
export function formatUtcTooltip(utcIso: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}

/**
 * Date-only projection (no time-of-day) of a UTC instant into an
 * organization's timezone -- `date-fns-tz`'s `formatInTimeZone` does the
 * conversion, but it is still exactly ONE projection of the absolute
 * instant into wall-clock terms, same discipline as `formatInOrgTimezone`
 * above: never pre-shift `utcIso` before calling this. For displays that
 * only need a day (a notice version's publish date, a deadline's calendar
 * date) rather than a full timestamp.
 */
export function formatDateOnlyInOrgTimezone(utcIso: string, timeZone: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return formatInTimeZone(date, timeZone, "dd MMM yyyy");
}

/**
 * Deadline countdown text -- "in 43 days" / "due today" / "3 days
 * overdue" (spec line 920: a deadline pill "always carries the text too",
 * colour is never the only signal). Computed with `date-fns`'
 * `differenceInCalendarDays` (DST/month-length safe) between `dueAtIso`
 * and `nowMs` (defaults to `Date.now()`, overridable so callers -- and
 * tests -- can pin "now"). Pure text only: it does not decide colour,
 * `DeadlinePill` (components/shared) owns the fraction-of-window-
 * remaining banding separately.
 */
export function formatDeadlineText(dueAtIso: string, nowMs: number = Date.now()): string {
  const due = new Date(dueAtIso);
  if (Number.isNaN(due.getTime())) {
    return "Invalid date";
  }
  const days = differenceInCalendarDays(due, nowMs);
  if (due.getTime() <= nowMs) {
    const overdueDays = Math.abs(days);
    if (overdueDays === 0) return "Due today (overdue)";
    return overdueDays === 1 ? "1 day overdue" : `${overdueDays} days overdue`;
  }
  if (days === 0) return "Due today";
  return days === 1 ? "in 1 day" : `in ${days} days`;
}
