import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  addDays,
  addHours,
  addMonths,
  addYears,
  subDays,
  subHours,
} from "date-fns";
import { Prisma } from "@prisma/client";
import type { ComplianceRule, DeadlineUnit, RuleBasis } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { CreateComplianceRuleDto } from "./dto/create-compliance-rule.dto";
import { UpdateComplianceRuleDto } from "./dto/update-compliance-rule.dto";

/**
 * The ONLY shape of `ComplianceRule` this service (or the controller
 * behind it) ever returns. Same "one canonical response shape" discipline
 * as `PURPOSE_PUBLIC_SELECT` in `purposes.service.ts`.
 */
export const COMPLIANCE_RULE_PUBLIC_SELECT = {
  id: true,
  ruleCode: true,
  version: true,
  name: true,
  jurisdiction: true,
  legalSource: true,
  basis: true,
  appliesTo: true,
  deadlineValue: true,
  deadlineUnit: true,
  warningLead: true,
  escalateOnBreach: true,
  publishedPeriodText: true,
  effectiveFrom: true,
  effectiveUntil: true,
  enabled: true,
  reviewedByEmployeeId: true,
  reviewedAt: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.ComplianceRuleSelect;

type ComplianceRuleRow = Prisma.ComplianceRuleGetPayload<{
  select: typeof COMPLIANCE_RULE_PUBLIC_SELECT;
}>;

/** Same `isReviewed` derivation convention as `PublicPurpose`. */
export type PublicComplianceRule = ComplianceRuleRow & { isReviewed: boolean };

export function toPublicComplianceRule(
  row: ComplianceRuleRow,
): PublicComplianceRule {
  return { ...row, isReviewed: row.reviewedByEmployeeId !== null };
}

/**
 * The shape `snapshotOnto()` writes onto a caller-supplied plain object.
 * Deliberately NOT typed against any specific consuming Prisma model
 * (`PrincipalRequest`, `BreachObligation`, ...) -- those models (owned by
 * Tasks 6/9/13/14) do not even use the same field names as each other for
 * this snapshot (`PrincipalRequest.ruleBasisSnapshot` vs
 * `BreachObligation.basisSnapshot`, and `BreachObligation` has no `ruleId`
 * field at all). `snapshotOnto` writes these five GENERIC keys plus
 * `dueAt`/`warningAt` onto whatever object it is given; each caller then
 * copies from this generic shape into its own model's actual column
 * names when it builds its `create()` data. See task-2-report.md for the
 * explicit mapping every consumer needs.
 */
export interface ComplianceDeadlineSnapshot {
  ruleId: string;
  ruleCode: string;
  ruleVersion: number;
  ruleBasis: RuleBasis;
  legalSource: string;
  dueAt: Date;
  warningAt: Date;
}

/**
 * The lookup key `RETENTION_INACTIVITY` is seeded against (spec §2.4).
 * `resolveRule()` special-cases exactly this input value -- not the
 * resolved rule's `ruleCode` -- because `appliesTo` is the caller-facing
 * contract of this function and stays true even if a DPO later creates a
 * differently-named rule pointed at the same lookup key.
 */
const RETENTION_INACTIVITY_APPLIES_TO = "RETENTION:INACTIVITY";

const GRIEVANCE_RULE_CODE = "GRIEVANCE_RESPONSE";

/**
 * Seed-only statutory enforcement data. This is intentionally distinct from
 * the organization-published grievance rule, which remains versioned and
 * editable subject to this baseline.
 */
const GRIEVANCE_STATUTORY_BASELINE_RULE_CODE = "GRIEVANCE_STATUTORY_BASELINE";

/**
 * Fields compared for the `COMPLIANCE_RULE_CHANGED` audit event's
 * before/after diff. Deliberately excludes `id`, `organizationId`,
 * `createdAt`, `version` (the version bump itself is recorded
 * separately) and the review fields (reviewed state is its own audit
 * action, `COMPLIANCE_RULE_REVIEWED`).
 */
const DIFF_FIELDS = [
  "name",
  "jurisdiction",
  "legalSource",
  "basis",
  "appliesTo",
  "deadlineValue",
  "deadlineUnit",
  "warningLead",
  "escalateOnBreach",
  "publishedPeriodText",
  "effectiveFrom",
  "effectiveUntil",
  "enabled",
  "notes",
] as const;

function serializeDiffValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function diffRules(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of DIFF_FIELDS) {
    const b = serializeDiffValue(before ? before[field] : null);
    const a = serializeDiffValue(after[field]);
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diff[field] = { before: b, after: a };
    }
  }
  return diff;
}

/**
 * The LONGEST possible day count `value` of `unit` could ever amount to,
 * for the sole purpose of checking the statutory grievance ceiling
 * (`validateGrievanceCeiling` below) -- deliberately NOT calendar-average
 * arithmetic. Calendar months and years vary in length, so a naive
 * per-unit check (the original
 * bug: it only ever looked at `deadlineUnit === "DAYS"`) or even an
 * average-length conversion can let some MONTHS/YEARS values silently
 * exceed the statutory period.
 * Rounding every unit UP to its longest possible interpretation instead
 * means a rejection is always safe to appeal (re-express the same period
 * in DAYS and it may well fit) while an acceptance is never a
 * contravention. Do not "optimise" this into average month/year
 * lengths later -- that swap is exactly what would reopen the hole this
 * function exists to close. HOURS rounds UP to the next whole day
 * (`ceil`, not `floor`) for the same reason: a deadline spanning a partial
 * day must round up rather than down.
 */
function worstCaseDeadlineDays(value: number, unit: DeadlineUnit): number {
  switch (unit) {
    case "HOURS":
      return Math.ceil(value / 24);
    case "DAYS":
      return value;
    case "MONTHS":
      return value * 31;
    case "YEARS":
      return value * 366;
    /* istanbul ignore next -- exhaustive switch over a Prisma enum */
    default: {
      const exhaustive: never = unit;
      throw new Error(`Unknown DeadlineUnit: ${String(exhaustive)}`);
    }
  }
}

/**
 * Adds `value` of `unit` to `from` using calendar-aware `date-fns`
 * arithmetic -- never millisecond multiplication. `addMonths`/`addYears`
 * clip an overflowing day to the last day of the resulting month (a
 * month-based deadline from the end of a month clips to the final day), and
 * `addHours`/`addDays` operate on the local calendar so a 1-day deadline
 * across a DST boundary keeps the same wall-clock time the next day
 * rather than drifting by the lost/gained hour.
 */
export function addByDeadlineUnit(
  from: Date,
  value: number,
  unit: DeadlineUnit,
): Date {
  switch (unit) {
    case "HOURS":
      return addHours(from, value);
    case "DAYS":
      return addDays(from, value);
    case "MONTHS":
      return addMonths(from, value);
    case "YEARS":
      return addYears(from, value);
    /* istanbul ignore next -- exhaustive switch over a Prisma enum */
    default: {
      const exhaustive: never = unit;
      throw new Error(`Unknown DeadlineUnit: ${String(exhaustive)}`);
    }
  }
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Resolves the current, enabled `ComplianceRule` for `appliesTo` as of
   * `at` -- the highest `version` among rows whose effective window
   * covers `at`. Returns `null` if nothing matches; callers MUST accept
   * `null` and create their entity with `dueAt: null` ("No deadline rule
   * configured" in the UI) rather than falling back to a hard-coded
   * number (spec §4.1).
   *
   * `RETENTION_INACTIVITY`'s lookup key (`RETENTION:INACTIVITY`) resolves
   * to `null` unless the organization's `thirdScheduleClass` is set --
   * the three-year inactivity rule applies only to Third Schedule
   * classes. This lives here, not in any caller, so every future
   */
  async resolveRule(
    appliesTo: string,
    at: Date,
  ): Promise<ComplianceRule | null> {
    const rows = await this.prisma.scoped.complianceRule.findMany({
      where: {
        appliesTo,
        enabled: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      orderBy: { version: "desc" },
    });
    const rule = rows[0] ?? null;
    if (!rule) {
      return null;
    }

    if (appliesTo === RETENTION_INACTIVITY_APPLIES_TO) {
      const org = await this.prisma.scoped.organization.findFirstOrThrow();
      if (org.thirdScheduleClass === "NONE") {
        return null;
      }
    }

    return rule;
  }

  /**
   * Pure calendar-time computation, no I/O. `warningLead`'s unit is
   * `deadlineUnit` itself for HOURS-unit rules (an hours-denominated rule's
   * warning lead means hours before `dueAt`) and DAYS for every other unit
   * (DAYS/MONTHS/YEARS) -- matching every row of the spec's seed table
   * exactly, including the two MONTHS/YEARS rules that spell out a
   * day-based warning explicitly because a months-or-years-denominated warning
   * lead would be nonsensical. The schema carries no separate
   * `warningLeadUnit` column, so this mapping is the interpretation this
   * service commits to; see task-2-report.md for the full reasoning.
   */
  computeDeadline(
    rule: Pick<
      ComplianceRule,
      "deadlineValue" | "deadlineUnit" | "warningLead"
    >,
    from: Date,
  ): { dueAt: Date; warningAt: Date } {
    const dueAt = addByDeadlineUnit(
      from,
      rule.deadlineValue,
      rule.deadlineUnit,
    );
    const warningAt =
      rule.deadlineUnit === "HOURS"
        ? subHours(dueAt, rule.warningLead)
        : subDays(dueAt, rule.warningLead);
    return { dueAt, warningAt };
  }

  /**
   * Writes the five generic snapshot keys (see `ComplianceDeadlineSnapshot`)
   * plus `dueAt`/`warningAt` onto `entity` in place. Synchronous, no I/O --
   * safe to call before or after the caller's own `$transaction`, as long
   * as the caller persists the mutated object itself.
   */
  snapshotOnto(
    entity: Partial<ComplianceDeadlineSnapshot>,
    rule: Pick<
      ComplianceRule,
      "id" | "ruleCode" | "version" | "basis" | "legalSource"
    >,
    dueAt: Date,
    warningAt: Date,
  ): void {
    entity.ruleId = rule.id;
    entity.ruleCode = rule.ruleCode;
    entity.ruleVersion = rule.version;
    entity.ruleBasis = rule.basis;
    entity.legalSource = rule.legalSource;
    entity.dueAt = dueAt;
    entity.warningAt = warningAt;
  }

  /**
   * The published grievance rule is bounded by a separate, seed-only
   * statutory baseline. A missing or disabled baseline is an unsafe
   * configuration, so validation fails closed rather than accepting an
   * unbounded published period. Both values are normalised through one
   * calendar-safe conversion before comparison.
   */
  private async validateGrievanceCeiling(
    ruleCode: string,
    deadlineValue: number,
    deadlineUnit: DeadlineUnit,
  ): Promise<void> {
    if (ruleCode !== GRIEVANCE_RULE_CODE) {
      return;
    }
    const ceilingRule = await this.prisma.scoped.complianceRule.findFirst({
      where: {
        ruleCode: GRIEVANCE_STATUTORY_BASELINE_RULE_CODE,
        enabled: true,
      },
      select: { deadlineValue: true, deadlineUnit: true, legalSource: true },
    });
    if (!ceilingRule) {
      throw new BadRequestException(
        "The statutory grievance baseline is unavailable; the published grievance period cannot be changed.",
      );
    }
    const worstCaseDays = worstCaseDeadlineDays(deadlineValue, deadlineUnit);
    const ceilingDays = worstCaseDeadlineDays(
      ceilingRule.deadlineValue,
      ceilingRule.deadlineUnit,
    );
    if (worstCaseDays > ceilingDays) {
      throw new BadRequestException(
        `A ${GRIEVANCE_RULE_CODE} deadline of ${deadlineValue} ${deadlineUnit} is ` +
          `at least ${worstCaseDays} days under worst-case calendar arithmetic, which ` +
          `exceeds the configured statutory ceiling. ${ceilingRule.legalSource}.`,
      );
    }
  }

  /** Latest version of every `ruleCode` in the organization, regardless of `enabled`. */
  async list(): Promise<PublicComplianceRule[]> {
    const rows = await this.prisma.scoped.complianceRule.findMany({
      where: { ruleCode: { not: GRIEVANCE_STATUTORY_BASELINE_RULE_CODE } },
      orderBy: [{ ruleCode: "asc" }, { version: "desc" }],
      select: COMPLIANCE_RULE_PUBLIC_SELECT,
    });
    const latestByCode = new Map<string, ComplianceRuleRow>();
    for (const row of rows) {
      if (!latestByCode.has(row.ruleCode)) {
        latestByCode.set(row.ruleCode, row);
      }
    }
    return Array.from(latestByCode.values()).map(toPublicComplianceRule);
  }

  async getById(id: string): Promise<PublicComplianceRule> {
    const row = await this.prisma.scoped.complianceRule.findFirst({
      where: { id },
      select: COMPLIANCE_RULE_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`Compliance rule "${id}" not found.`);
    }
    if (row.ruleCode === GRIEVANCE_STATUTORY_BASELINE_RULE_CODE) {
      throw new NotFoundException(`Compliance rule "${id}" not found.`);
    }
    return toPublicComplianceRule(row);
  }

  /** Creates version 1 of a brand-new `ruleCode`. */
  async create(dto: CreateComplianceRuleDto): Promise<PublicComplianceRule> {
    if (dto.ruleCode === GRIEVANCE_STATUTORY_BASELINE_RULE_CODE) {
      throw new BadRequestException(
        "The statutory grievance baseline is seed-managed.",
      );
    }
    await this.validateGrievanceCeiling(
      dto.ruleCode,
      dto.deadlineValue,
      dto.deadlineUnit,
    );

    const existing = await this.prisma.scoped.complianceRule.findFirst({
      where: { ruleCode: dto.ruleCode },
    });
    if (existing) {
      throw new ConflictException(
        `A compliance rule with code "${dto.ruleCode}" already exists in this ` +
          "organization. PATCH it to create a new version instead.",
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.complianceRule.create({
        data: {
          ruleCode: dto.ruleCode,
          version: 1,
          name: dto.name,
          jurisdiction: dto.jurisdiction ?? "IN",
          legalSource: dto.legalSource,
          basis: dto.basis,
          appliesTo: dto.appliesTo,
          deadlineValue: dto.deadlineValue,
          deadlineUnit: dto.deadlineUnit,
          warningLead: dto.warningLead,
          escalateOnBreach: dto.escalateOnBreach ?? false,
          publishedPeriodText: dto.publishedPeriodText ?? null,
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : new Date(),
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : null,
          enabled: dto.enabled ?? true,
          reviewedByEmployeeId: null,
          reviewedAt: null,
          notes: dto.notes ?? null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (same convention as
          // EmployeesService.create / DataSourcesService.create).
        } as never,
        select: COMPLIANCE_RULE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "COMPLIANCE_RULE_CHANGED",
        resourceType: "ComplianceRule",
        resourceId: created.id,
        metadata: {
          ruleCode: created.ruleCode,
          toVersion: created.version,
          diff: diffRules(null, created),
        },
      });

      return toPublicComplianceRule(created);
    });
  }

  /**
   * Creates version N+1 of the rule identified by `id` and NEVER mutates
   * the row `id` points at (no `UPDATE` is issued against it anywhere in
   * this method). `id` must be the CURRENT (highest-version) row for its
   * `ruleCode` -- editing a superseded version is rejected, so there is
   * never a fork in a rule's version history. `ruleCode` and `appliesTo`
   * are immutable across an edit, same discipline as `code` on
   * `ProcessingPurpose`. The new version starts unreviewed
   * (`reviewedByEmployeeId: null`) regardless of the edited row's review
   * state -- a changed rule needs the DPO's eyes again.
   */
  async update(
    id: string,
    dto: UpdateComplianceRuleDto,
  ): Promise<PublicComplianceRule> {
    const target = await this.prisma.scoped.complianceRule.findFirst({
      where: { id },
    });
    if (!target) {
      throw new NotFoundException(`Compliance rule "${id}" not found.`);
    }
    if (target.ruleCode === GRIEVANCE_STATUTORY_BASELINE_RULE_CODE) {
      throw new BadRequestException(
        "The statutory grievance baseline is seed-managed.",
      );
    }

    const latest = await this.prisma.scoped.complianceRule.findFirst({
      where: { ruleCode: target.ruleCode },
      orderBy: { version: "desc" },
    });
    if (!latest || latest.id !== target.id) {
      throw new ConflictException(
        `"${id}" is not the current version of rule "${target.ruleCode}" ` +
          `(current is version ${latest?.version ?? "unknown"}). Edit the current version instead.`,
      );
    }

    const effective = {
      name: dto.name ?? target.name,
      jurisdiction: dto.jurisdiction ?? target.jurisdiction,
      legalSource: dto.legalSource ?? target.legalSource,
      basis: dto.basis ?? target.basis,
      appliesTo: target.appliesTo,
      deadlineValue: dto.deadlineValue ?? target.deadlineValue,
      deadlineUnit: dto.deadlineUnit ?? target.deadlineUnit,
      warningLead: dto.warningLead ?? target.warningLead,
      escalateOnBreach: dto.escalateOnBreach ?? target.escalateOnBreach,
      publishedPeriodText:
        dto.publishedPeriodText !== undefined
          ? dto.publishedPeriodText
          : target.publishedPeriodText,
      effectiveFrom: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : new Date(),
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
      enabled: dto.enabled ?? target.enabled,
      notes: dto.notes !== undefined ? dto.notes : target.notes,
    };

    await this.validateGrievanceCeiling(
      target.ruleCode,
      effective.deadlineValue,
      effective.deadlineUnit,
    );

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.complianceRule.create({
        data: {
          ruleCode: target.ruleCode,
          version: target.version + 1,
          ...effective,
          reviewedByEmployeeId: null,
          reviewedAt: null,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime (same convention as
          // EmployeesService.create / DataSourcesService.create).
        } as never,
        select: COMPLIANCE_RULE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "COMPLIANCE_RULE_CHANGED",
        resourceType: "ComplianceRule",
        resourceId: created.id,
        metadata: {
          ruleCode: target.ruleCode,
          fromVersion: target.version,
          toVersion: created.version,
          diff: diffRules(target, created),
        },
      });

      return toPublicComplianceRule(created);
    });
  }

  /**
   * Marks the specific row `id` reviewed -- an in-place update, not a new
   * version, because reviewing changes no substantive deadline/basis
   * term (same precedent as `PurposesService.review()`).
   * `reviewedByEmployeeId`/`reviewedAt` come only from the verified actor
   * and the server clock, never the request body.
   */
  async review(
    id: string,
    actor: AccessTokenPayload,
  ): Promise<PublicComplianceRule> {
    const existing = await this.prisma.scoped.complianceRule.findFirst({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Compliance rule "${id}" not found.`);
    }
    if (existing.ruleCode === GRIEVANCE_STATUTORY_BASELINE_RULE_CODE) {
      throw new BadRequestException(
        "The statutory grievance baseline is seed-managed.",
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const reviewedAt = new Date();
      const updated = await tx.complianceRule.update({
        where: { id },
        data: { reviewedByEmployeeId: actor.sub, reviewedAt },
        select: COMPLIANCE_RULE_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "COMPLIANCE_RULE_REVIEWED",
        resourceType: "ComplianceRule",
        resourceId: id,
        metadata: {
          ruleCode: updated.ruleCode,
          version: updated.version,
          reviewedByEmployeeId: updated.reviewedByEmployeeId,
          reviewedAt,
        },
      });

      return toPublicComplianceRule(updated);
    });
  }
}
