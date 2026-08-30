import type { MatchSignal } from "../matching.service";

/** Rule 3: normalized phone equality only. */
export function phoneSignal(
  phoneNormalized: string | null,
): MatchSignal | null {
  return phoneNormalized
    ? {
        rule: "PHONE",
        identifierType: "PHONE",
        value: phoneNormalized,
        confidence: "HIGH",
        order: 3,
      }
    : null;
}
