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
