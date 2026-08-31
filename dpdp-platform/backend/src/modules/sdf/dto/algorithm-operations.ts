/**
 * Rule 13(3)'s operation list, transcribed verbatim from
 * `DPDP_MVP2_COMPLIANCE_OPERATIONS.md` line 468-469: "HOSTING DISPLAY
 * UPLOADING MODIFICATION PUBLISHING TRANSMISSION STORAGE UPDATING
 * SHARING" -- nine values, space-separated in the spec's own comment
 * rather than already an array, transcribed here in that exact order.
 * Shared between `CreateAlgorithmEntryDto`/`UpdateAlgorithmEntryDto`
 * (`@IsIn(ALGORITHM_OPERATIONS, { each: true })`) and
 * `AlgorithmRegisterService`, so the vocabulary is declared once.
 */
export const ALGORITHM_OPERATIONS = [
  "HOSTING",
  "DISPLAY",
  "UPLOADING",
  "MODIFICATION",
  "PUBLISHING",
  "TRANSMISSION",
  "STORAGE",
  "UPDATING",
  "SHARING",
] as const;

export type AlgorithmOperation = (typeof ALGORITHM_OPERATIONS)[number];
