/**
 * Small, hand-rolled RFC 4180-style CSV writer.
 *
 * Ruling (task 21 brief): no CSV library exists in this backend and none
 * is being added for one small, well-understood format. This file is the
 * entire dependency: quote a field only when it needs it, escape embedded
 * quotes by doubling them, and join rows with CRLF (the RFC 4180 line
 * terminator most spreadsheet tools expect).
 *
 * A field must be quoted when it contains a comma, a double quote, a
 * line break (`\n` or `\r`), or leading/trailing whitespace -- the last
 * one matters because an unquoted CSV field is trimmed by some readers,
 * silently losing intentional leading/trailing spaces.
 */
function needsQuoting(field: string): boolean {
  if (field === "") {
    return false;
  }
  if (/[",\n\r]/.test(field)) {
    return true;
  }
  return field !== field.trim();
}

/** Quotes and escapes a single CSV field per the rules above. */
export function csvField(value: string): string {
  if (!needsQuoting(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

/** Joins already-individual field values into one properly quoted CSV row (no trailing terminator). */
export function csvRow(fields: readonly string[]): string {
  return fields.map(csvField).join(",");
}

/**
 * Builds a complete CSV document: a stable header row followed by one row
 * per entry in `rows`, all joined with CRLF per RFC 4180.
 */
export function csvDocument(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [csvRow(header), ...rows.map((row) => csvRow(row))];
  return lines.join("\r\n") + "\r\n";
}
