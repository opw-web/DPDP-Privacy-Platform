import type { NormalizedRecord } from "@prisma/client";

export type SupportingSignal = "POSTAL_CODE" | "DATE_OF_BIRTH" | "PHONE_LAST_6";

const SCORE_BY_SIGNAL: Record<SupportingSignal, number> = {
  POSTAL_CODE: 0.6,
  DATE_OF_BIRTH: 0.7,
  PHONE_LAST_6: 0.8,
};

function sameDate(left: Date | null, right: Date | null): boolean {
  return left !== null && right !== null && left.getTime() === right.getTime();
}

function lastSix(phone: string | null): string | null {
  return phone && phone.length >= 6 ? phone.slice(-6) : null;
}

/** Rule 4. Name equality is only a gate: one deterministic supporting
 * attribute is also mandatory, and this rule can only create a review
 * candidate -- never an active identity link. */
export function supportingSignals(
  record: Pick<
    NormalizedRecord,
    "nameKey" | "postalCode" | "dateOfBirth" | "phoneNormalized"
  >,
  existing: Pick<
    NormalizedRecord,
    "nameKey" | "postalCode" | "dateOfBirth" | "phoneNormalized"
  >,
): SupportingSignal[] {
  if (!record.nameKey || record.nameKey !== existing.nameKey) {
    return [];
  }

  const signals: SupportingSignal[] = [];
  if (record.postalCode && record.postalCode === existing.postalCode) {
    signals.push("POSTAL_CODE");
  }
  if (sameDate(record.dateOfBirth, existing.dateOfBirth)) {
    signals.push("DATE_OF_BIRTH");
  }
  if (
    lastSix(record.phoneNormalized) === lastSix(existing.phoneNormalized) &&
    lastSix(record.phoneNormalized)
  ) {
    signals.push("PHONE_LAST_6");
  }
  return signals;
}

export function supportingScore(signals: readonly SupportingSignal[]): number {
  return signals.reduce(
    (score, signal) => Math.max(score, SCORE_BY_SIGNAL[signal]),
    0.5,
  );
}
