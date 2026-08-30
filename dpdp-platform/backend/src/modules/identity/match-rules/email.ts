import type { MatchSignal } from "../matching.service";

/** Rule 2: normalized email equality only; no aliases or transformations. */
export function emailSignal(
  emailNormalized: string | null,
): MatchSignal | null {
  return emailNormalized
    ? {
        rule: "EMAIL",
        identifierType: "EMAIL",
        value: emailNormalized,
        confidence: "EXACT",
        order: 2,
      }
    : null;
}
