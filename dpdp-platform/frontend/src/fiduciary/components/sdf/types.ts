import type { RuleBasis } from "../../../lib/mvp2-api";

/**
 * Mirrors `backend/src/modules/sdf/dto/algorithm-operations.ts`'s
 * `ALGORITHM_OPERATIONS` verbatim (Rule 13(3)'s nine operations). The
 * frontend cannot import backend source, so this vocabulary is a manual,
 * verbatim copy -- same discipline as `fiduciary/lib/enum-options.ts`. If
 * the backend list changes, this one must be updated to match, not the
 * other way round.
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

/** Mirrors `AlgorithmRegisterService.ALGORITHM_ENTRY_PUBLIC_SELECT`'s response shape -- `GET/POST/PATCH /sdf/algorithms` (SD-05, Rule 13(3)). */
export interface AlgorithmEntry {
  id: string;
  name: string;
  description: string;
  operations: string[];
  riskAssessment: string | null;
  riskToRightsIdentified: boolean;
  mitigations: string | null;
  lastReviewedAt: string | null;
  reviewedByEmployeeId: string | null;
}

/** Mirrors `SdfGapsService.getGaps()`'s response shape -- `GET /sdf/gaps` (SD-06, SD-05, SD-01). The platform flags; it never blocks or claims compliance. */
export interface SdfGapsData {
  localisationRequiredTransfers: {
    id: string;
    recipientId: string;
    destinationCountry: string;
    purposeDescription: string;
  }[];
  unreviewedAlgorithms: { id: string; name: string; lastReviewedAt: string | null }[];
  dpoNotIndiaBased: boolean;
}

/**
 * The subset of `ComplianceService.COMPLIANCE_RULE_PUBLIC_SELECT` (`GET
 * /compliance-rules`) this page needs to show a rule's provenance through
 * `RuleBasisChip`/`UnreviewedRuleChip` -- same "declare a local subset,
 * don't guess the shape" convention as `RequestDetailPage`'s own
 * `ComplianceRule` interface.
 */
export interface ComplianceRuleSummary {
  ruleCode: string;
  appliesTo: string;
  basis: RuleBasis;
  legalSource: string;
  isReviewed: boolean;
}

/**
 * Mirrors `SdfAssessmentService.SDF_CYCLE_APPLIES_TO` verbatim -- the
 * `ComplianceRule.appliesTo` key the seeded `SDF_ASSESSMENT_CYCLE` rule
 * carries (`prisma/seed/compliance-rules.ts`). Both the assessment
 * cycle's due date AND the algorithm register's "needs review" gap
 * (`SdfGapsService.getGaps`) are computed from this one rule on the
 * backend, so the frontend resolves it once here and reuses the result
 * for both sections' provenance chips.
 */
export const SDF_CYCLE_APPLIES_TO = "SDF:DPIA_AUDIT";

export function findSdfCycleRule(
  rules: ComplianceRuleSummary[] | undefined,
): ComplianceRuleSummary | undefined {
  return rules?.find((rule) => rule.appliesTo === SDF_CYCLE_APPLIES_TO);
}
