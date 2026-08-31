/**
 * Normalizes Indian phone numbers. India is the platform default; other
 * countries are intentionally not guessed. An explicitly international
 * number keeps its leading `+`, as required by the normalization contract.
 */
export function normalizePhone(
  raw: unknown,
  countryCode: string | null | undefined = "IN",
): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = (hasLeadingPlus ? trimmed.slice(1) : trimmed).replace(
    /\D/g,
    "",
  );
  if (digits.length === 0) {
    return null;
  }

  if (hasLeadingPlus) {
    return `+${digits}`;
  }

  if ((countryCode ?? "IN").toUpperCase() !== "IN") {
    return null;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+${digits}`;
  }

  return null;
}
