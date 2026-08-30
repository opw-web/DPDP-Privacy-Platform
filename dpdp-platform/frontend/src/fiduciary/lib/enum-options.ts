/**
 * Every enumeration on this page is transcribed VERBATIM from the
 * backend's own types -- `@prisma/client` enums for `LawfulBasis`,
 * `LegitimateUseLimb`, `DataCategory`, `RecipientType`
 * (`dpdp-platform/backend/prisma/schema.prisma`), and the string-literal
 * tuples exported by the registers DTOs (`create-security-measure.dto.ts`,
 * `create-retention-policy.dto.ts`) for the two enumerations Prisma does
 * not model as native enums. The frontend cannot import backend source,
 * so each list below is a manual, verbatim copy -- if the backend adds or
 * renames a value, this file must be updated to match, not the other way
 * round.
 *
 * `label` is a mechanical SNAKE_CASE -> Title Case rendering with no
 * legal wording added, EXCEPT for the Rule 6(1)(x) references, which are
 * already the exact citation and are used unchanged as both value and
 * label.
 */

export interface EnumOption {
  value: string;
  label: string;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toOptions(values: readonly string[]): EnumOption[] {
  return values.map((value) => ({ value, label: titleCase(value) }));
}

/** `LawfulBasis` (schema.prisma). */
export const LAWFUL_BASIS_VALUES = ["CONSENT", "LEGITIMATE_USE"] as const;
export const LAWFUL_BASIS_OPTIONS: EnumOption[] = toOptions(LAWFUL_BASIS_VALUES);

/** `LegitimateUseLimb` -- s.7(a)-(i) (schema.prisma). */
export const LEGITIMATE_USE_LIMB_VALUES = [
  "VOLUNTARY_PROVISION",
  "STATE_SUBSIDY_BENEFIT",
  "STATE_FUNCTION",
  "MEDICAL_EMERGENCY",
  "EPIDEMIC_PUBLIC_HEALTH",
  "DISASTER_PUBLIC_ORDER",
  "EMPLOYMENT",
  "SAFEGUARD_EMPLOYER_LOSS",
  "OTHER_S7",
] as const;
export const LEGITIMATE_USE_LIMB_OPTIONS: EnumOption[] = toOptions(
  LEGITIMATE_USE_LIMB_VALUES,
);

/** `DataCategory` (schema.prisma). */
export const DATA_CATEGORY_VALUES = [
  "IDENTITY",
  "CONTACT",
  "DEMOGRAPHIC",
  "FINANCIAL",
  "TRANSACTIONAL",
  "BEHAVIOURAL",
  "LOCATION",
  "HEALTH",
  "BIOMETRIC",
  "GOVT_ID",
  "OTHER",
] as const;
export const DATA_CATEGORY_OPTIONS: EnumOption[] = toOptions(DATA_CATEGORY_VALUES);

/** `RecipientType` (schema.prisma). */
export const RECIPIENT_TYPE_VALUES = ["DATA_PROCESSOR", "OTHER_DATA_FIDUCIARY"] as const;
export const RECIPIENT_TYPE_OPTIONS: EnumOption[] = toOptions(RECIPIENT_TYPE_VALUES);

/** `SECURITY_RULE_REFERENCES`, Rule 6(1)(a)-(g) (create-security-measure.dto.ts). Already the citation -- used verbatim, not title-cased. */
export const SECURITY_RULE_REFERENCE_VALUES = [
  "Rule 6(1)(a)",
  "Rule 6(1)(b)",
  "Rule 6(1)(c)",
  "Rule 6(1)(d)",
  "Rule 6(1)(e)",
  "Rule 6(1)(f)",
  "Rule 6(1)(g)",
] as const;
export const SECURITY_RULE_REFERENCE_OPTIONS: EnumOption[] =
  SECURITY_RULE_REFERENCE_VALUES.map((value) => ({ value, label: value }));

/** `SECURITY_MEASURE_TYPES` (create-security-measure.dto.ts). */
export const SECURITY_MEASURE_TYPE_VALUES = [
  "ENCRYPTION",
  "MASKING",
  "TOKENISATION",
  "ACCESS_CONTROL",
  "LOGGING",
  "BACKUP",
  "CONTRACT_CLAUSE",
  "ORG_MEASURE",
] as const;
export const SECURITY_MEASURE_TYPE_OPTIONS: EnumOption[] = toOptions(
  SECURITY_MEASURE_TYPE_VALUES,
);

/** `RETENTION_TRIGGER_TYPES` (create-retention-policy.dto.ts). */
export const RETENTION_TRIGGER_TYPE_VALUES = [
  "PURPOSE_SERVED",
  "CONSENT_WITHDRAWN",
  "INACTIVITY",
  "FIXED_PERIOD",
] as const;
export const RETENTION_TRIGGER_TYPE_OPTIONS: EnumOption[] = toOptions(
  RETENTION_TRIGGER_TYPE_VALUES,
);

/** `RETENTION_UNITS` (create-retention-policy.dto.ts). */
export const RETENTION_UNIT_VALUES = ["DAYS", "MONTHS", "YEARS"] as const;
export const RETENTION_UNIT_OPTIONS: EnumOption[] = toOptions(RETENTION_UNIT_VALUES);

/** `RETENTION_LEGAL_BASIS_TYPES` (create-retention-policy.dto.ts). */
export const RETENTION_LEGAL_BASIS_TYPE_VALUES = [
  "STATUTORY",
  "SECTORAL",
  "ORG_POLICY",
] as const;
export const RETENTION_LEGAL_BASIS_TYPE_OPTIONS: EnumOption[] = toOptions(
  RETENTION_LEGAL_BASIS_TYPE_VALUES,
);

export function humanizeEnum(value: string): string {
  return titleCase(value);
}
