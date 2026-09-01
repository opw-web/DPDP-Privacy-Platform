import { DeadlineUnit, RuleBasis } from "@prisma/client";
import type { PrismaService } from "../../src/common/prisma/prisma.service";

/**
 * The seeded compliance rule set, transcribed verbatim from
 * DPDP_MVP2_COMPLIANCE_OPERATIONS.md §2.4 (lines 555-575) -- every
 * `ruleCode`, `appliesTo`, value, unit, warning lead, basis and
 * `legalSource` string copied exactly as the table gives it.
 *
 * FIDELITY NOTE (mirrors the already-flagged 35-vs-33 audit-action count
 * and 22-vs-23 permission-code count elsewhere in this project): the
 * spec's own prose calls this "the fifteen seeded rules", and the table
 * does have exactly 15 ROWS -- but its 10th row packs TWO distinct rule
 * codes into one row ("REQUEST_NOMINATION / REQUEST_OTHER", both "30
 * DAYS, warn 7, ORG_POLICY, Company service level", differing only in
 * their `appliesTo`: REQUEST:NOMINATION vs REQUEST:OTHER). `ruleCode` is
 * a single string per `ComplianceRule` row -- there is no way to seed
 * "REQUEST_NOMINATION / REQUEST_OTHER" as one row -- so this file
 * transcribes that row as two separate seeded rules, giving **16**
 * `ComplianceRule` rows from the table's 15. Flagged here rather than
 * silently reconciled to 15, per the project's standing instruction to
 * transcribe and count from the spec's table, not its prose.
 */
export interface ComplianceRuleSeed {
  readonly ruleCode: string;
  readonly name: string;
  readonly legalSource: string;
  readonly basis: RuleBasis;
  readonly appliesTo: string;
  readonly deadlineValue: number;
  readonly deadlineUnit: DeadlineUnit;
  readonly warningLead: number;
  /**
   * CERT_IN_INCIDENT and RETENTION_INACTIVITY are "disabled by default"
   * per the spec table's own legalSource text; every other row is
   * enabled. `RETENTION_INACTIVITY` is additionally gated by
   * `Organization.thirdScheduleClass` in `ComplianceService.resolveRule()`
   * regardless of this flag.
   */
  readonly enabled: boolean;
}

/**
 * This row is enforcement data, not an organization-configurable rule.
 * `ComplianceService` deliberately keeps it off the public compliance-rule
 * surface and refuses every public mutation attempt against its code.  Its
 * period and citation intentionally live here, with the other seed data,
 * rather than in application source.
 */
export const GRIEVANCE_STATUTORY_BASELINE_RULE_CODE =
  "GRIEVANCE_STATUTORY_BASELINE";

export const COMPLIANCE_RULE_SEEDS: readonly ComplianceRuleSeed[] = [
  {
    ruleCode: GRIEVANCE_STATUTORY_BASELINE_RULE_CODE,
    name: "Statutory grievance response ceiling",
    appliesTo: "SYSTEM:GRIEVANCE_STATUTORY_BASELINE",
    deadlineValue: 90,
    deadlineUnit: "DAYS",
    warningLead: 0,
    basis: "STATUTORY",
    legalSource:
      "DPDP Rules, 2025 — Rule 14(3): published period must not exceed ninety days",
    enabled: true,
  },
  {
    ruleCode: "GRIEVANCE_RESPONSE",
    name: "Published grievance response period",
    appliesTo: "REQUEST:GRIEVANCE",
    deadlineValue: 90,
    deadlineUnit: "DAYS",
    warningLead: 14,
    basis: "ORG_POLICY",
    legalSource: "Organization-published grievance response period",
    enabled: true,
  },
  {
    ruleCode: "BREACH_PRINCIPAL_NOTICE",
    name: "Breach notice to affected principals",
    appliesTo: "BREACH:PRINCIPAL_NOTICE",
    deadlineValue: 24,
    deadlineUnit: "HOURS",
    warningLead: 6,
    basis: "INTERNAL_TARGET",
    legalSource:
      'Rule 7(1) requires intimation "without delay"; 24h is the company\'s operational target, not a statutory figure',
    enabled: true,
  },
  {
    ruleCode: "BREACH_BOARD_INITIAL",
    name: "Initial breach intimation to the Board",
    appliesTo: "BREACH:BOARD_INITIAL",
    deadlineValue: 6,
    deadlineUnit: "HOURS",
    warningLead: 2,
    basis: "INTERNAL_TARGET",
    legalSource:
      'Rule 7(2)(a) requires intimation "without delay"; the number is the company\'s target',
    enabled: true,
  },
  {
    ruleCode: "BREACH_BOARD_DETAIL",
    name: "Detailed breach information to the Board",
    appliesTo: "BREACH:BOARD_DETAIL",
    deadlineValue: 72,
    deadlineUnit: "HOURS",
    warningLead: 12,
    basis: "STATUTORY",
    legalSource:
      "Rule 7(2)(b): detailed information within 72 hours of becoming aware, unless the Board allows longer on written request",
    enabled: true,
  },
  {
    ruleCode: "CERT_IN_INCIDENT",
    name: "CERT-In incident reporting",
    appliesTo: "BREACH:CERT_IN_INCIDENT",
    deadlineValue: 6,
    deadlineUnit: "HOURS",
    warningLead: 2,
    basis: "SECTORAL",
    legalSource:
      "CERT-In Directions, 28 April 2022 — a separate obligation under a different law, disabled by default",
    enabled: false,
  },
  {
    ruleCode: "REQUEST_ACCESS",
    name: "Access request response",
    appliesTo: "REQUEST:ACCESS",
    deadlineValue: 30,
    deadlineUnit: "DAYS",
    warningLead: 7,
    basis: "ORG_POLICY",
    legalSource:
      "Company service level — the Rules set no separate figure for access",
    enabled: true,
  },
  {
    ruleCode: "REQUEST_CORRECTION",
    name: "Correction request response",
    appliesTo: "REQUEST:CORRECTION",
    deadlineValue: 30,
    deadlineUnit: "DAYS",
    warningLead: 7,
    basis: "ORG_POLICY",
    legalSource: "Company service level",
    enabled: true,
  },
  {
    ruleCode: "REQUEST_ERASURE",
    name: "Erasure request response",
    appliesTo: "REQUEST:ERASURE",
    deadlineValue: 30,
    deadlineUnit: "DAYS",
    warningLead: 7,
    basis: "ORG_POLICY",
    legalSource: "Company service level",
    enabled: true,
  },
  {
    ruleCode: "REQUEST_CONSENT_WITHDRAWAL",
    name: "Consent withdrawal request response",
    appliesTo: "REQUEST:CONSENT_WITHDRAWAL",
    deadlineValue: 7,
    deadlineUnit: "DAYS",
    warningLead: 2,
    basis: "ORG_POLICY",
    legalSource:
      "Withdrawal must take effect within a reasonable time (s.6(6))",
    enabled: true,
  },
  {
    // Spec table row 10 ("REQUEST_NOMINATION / REQUEST_OTHER") split in
    // two -- see the file-level FIDELITY NOTE.
    ruleCode: "REQUEST_NOMINATION",
    name: "Nomination request response",
    appliesTo: "REQUEST:NOMINATION",
    deadlineValue: 30,
    deadlineUnit: "DAYS",
    warningLead: 7,
    basis: "ORG_POLICY",
    legalSource: "Company service level",
    enabled: true,
  },
  {
    ruleCode: "REQUEST_OTHER",
    name: "Other request response",
    appliesTo: "REQUEST:OTHER",
    deadlineValue: 30,
    deadlineUnit: "DAYS",
    warningLead: 7,
    basis: "ORG_POLICY",
    legalSource: "Company service level",
    enabled: true,
  },
  {
    ruleCode: "RETENTION_INACTIVITY",
    name: "Inactivity-triggered retention review",
    appliesTo: "RETENTION:INACTIVITY",
    deadlineValue: 3,
    deadlineUnit: "YEARS",
    warningLead: 30,
    basis: "STATUTORY",
    legalSource:
      "Rule 8(1) + Third Schedule — only applies if the org's thirdScheduleClass is not NONE; disabled by default",
    enabled: false,
  },
  {
    ruleCode: "PRE_ERASURE_NOTICE",
    name: "Pre-erasure notice",
    appliesTo: "RETENTION:PRE_ERASURE_NOTICE",
    deadlineValue: 48,
    deadlineUnit: "HOURS",
    warningLead: 0,
    basis: "STATUTORY",
    legalSource: "Rule 8(2): at least forty-eight hours before erasure",
    enabled: true,
  },
  {
    ruleCode: "LOG_RETENTION_MINIMUM",
    name: "Minimum log retention floor",
    appliesTo: "RETENTION:LOG_FLOOR",
    deadlineValue: 1,
    deadlineUnit: "YEARS",
    warningLead: 0,
    basis: "STATUTORY",
    legalSource: "Rule 6(1)(e) and Rule 8(3): minimum one year",
    enabled: true,
  },
  {
    ruleCode: "SDF_ASSESSMENT_CYCLE",
    name: "SDF DPIA/audit cycle",
    appliesTo: "SDF:DPIA_AUDIT",
    deadlineValue: 12,
    deadlineUnit: "MONTHS",
    warningLead: 30,
    basis: "STATUTORY",
    legalSource: "Rule 13(1): once in every period of twelve months",
    enabled: true,
  },
  {
    ruleCode: "LEGACY_CONSENT_NOTICE",
    name: "Legacy data notice",
    appliesTo: "NOTICE:LEGACY_CONSENT",
    deadlineValue: 90,
    deadlineUnit: "DAYS",
    warningLead: 30,
    basis: "INTERNAL_TARGET",
    legalSource:
      's.5(2) requires notice "as soon as reasonably practicable"; the number is the company\'s target',
    enabled: true,
  },
];

/**
 * Idempotent: upserts version 1 of every seeded rule for `organizationId`,
 * keyed on the `@@unique([organizationId, ruleCode, version])` constraint
 * -- re-running seeds no new rows and never overwrites a row a DPO may
 * already have edited (a real edit creates version 2+, which this
 * function never touches). Every seeded rule carries
 * `reviewedByEmployeeId: null` so the UI's amber "not yet reviewed" chip
 * shows until a DPO confirms it.
 *
 * Run with a RAW (unscoped) `PrismaService`, same as `seedPermissions`/
 * `seedRoles` in `prisma/seed.ts` -- there is no tenant context at seed
 * time.
 */
export async function seedComplianceRules(
  prisma: PrismaService,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  for (const seed of COMPLIANCE_RULE_SEEDS) {
    await prisma.complianceRule.upsert({
      where: {
        organizationId_ruleCode_version: {
          organizationId,
          ruleCode: seed.ruleCode,
          version: 1,
        },
      },
      create: {
        organizationId,
        ruleCode: seed.ruleCode,
        version: 1,
        name: seed.name,
        legalSource: seed.legalSource,
        basis: seed.basis,
        appliesTo: seed.appliesTo,
        deadlineValue: seed.deadlineValue,
        deadlineUnit: seed.deadlineUnit,
        warningLead: seed.warningLead,
        enabled: seed.enabled,
        effectiveFrom: now,
        reviewedByEmployeeId: null,
      },
      update: {},
    });
  }
}

/** Seeds only the hidden statutory grievance baseline for focused fixtures. */
export async function seedGrievanceStatutoryBaseline(
  prisma: PrismaService,
  organizationId: string,
  now: Date = new Date(),
): Promise<void> {
  const seed = COMPLIANCE_RULE_SEEDS.find(
    ({ ruleCode }) => ruleCode === GRIEVANCE_STATUTORY_BASELINE_RULE_CODE,
  );
  if (!seed) {
    throw new Error("Grievance statutory baseline seed is missing.");
  }

  await prisma.complianceRule.upsert({
    where: {
      organizationId_ruleCode_version: {
        organizationId,
        ruleCode: seed.ruleCode,
        version: 1,
      },
    },
    create: {
      organizationId,
      ruleCode: seed.ruleCode,
      version: 1,
      name: seed.name,
      legalSource: seed.legalSource,
      basis: seed.basis,
      appliesTo: seed.appliesTo,
      deadlineValue: seed.deadlineValue,
      deadlineUnit: seed.deadlineUnit,
      warningLead: seed.warningLead,
      enabled: seed.enabled,
      effectiveFrom: now,
      reviewedByEmployeeId: null,
    },
    update: {},
  });
}
