/**
 * Returns a comparison-safe email value without applying provider-specific
 * heuristics. In particular, dots and plus tags are meaningful identifiers
 * to this platform and must never be removed.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const normalized = raw.trim().normalize("NFKC").toLowerCase();
  if (
    normalized.length === 0 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)
  ) {
    return null;
  }

  return normalized;
}
