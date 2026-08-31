/**
 * The audience DSL types, transcribed from
 * DPDP_MVP2_COMPLIANCE_OPERATIONS.md §4.7 lines 728-745 (the fenced JSON
 * block IS the contract -- see that file's comment for why prose counts
 * are not trusted in this project).
 *
 * A filter is either a group (`op` + nested `rules`) or a leaf rule
 * (`field` + `operator` + `value`, with `purposeId` required only when
 * `field === "consent"`). At the HTTP boundary this arrives as untyped
 * JSON (`AudiencePreviewDto.filter: unknown`) -- `compileAudience` is the
 * one place that validates and narrows it, so these types describe the
 * WELL-FORMED shape `compileAudience` produces internally after
 * validation, not something callers are trusted to hand in pre-typed.
 */

/** Exactly the eleven fields the DSL allows -- transcribed and counted
 * from the spec's fenced JSON block, not from prose. */
export const AUDIENCE_FILTER_FIELDS = [
  "consent",
  "hasEmail",
  "dataSource",
  "breachAffected",
  "requestStatus",
  "ageStatus",
  "country",
  "city",
  "lastContactAt",
  "hasField",
  "erasureState",
] as const;

export type AudienceFilterField = (typeof AUDIENCE_FILTER_FIELDS)[number];

export const AUDIENCE_FILTER_OPERATORS = [
  "eq",
  "neq",
  "in",
  "notIn",
  "before",
  "after",
] as const;

export type AudienceFilterOperator = (typeof AUDIENCE_FILTER_OPERATORS)[number];

export interface AudienceFilterRule {
  field: AudienceFilterField;
  operator: AudienceFilterOperator;
  value: unknown;
  /** Required, and required to be a non-empty string, only when `field === "consent"`. */
  purposeId?: string;
}

export interface AudienceFilterGroup {
  op: "AND" | "OR";
  rules: AudienceFilterNode[];
}

export type AudienceFilterNode = AudienceFilterGroup | AudienceFilterRule;

/** The top level a caller submits is always a group (matches the spec
 * example's `{ "op": "AND", "rules": [...] }` shape). */
export type AudienceFilter = AudienceFilterGroup;
