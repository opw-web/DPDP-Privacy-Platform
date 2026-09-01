import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, SdfAssessmentKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { ComplianceService } from "../compliance/compliance.service";
import type { ComplianceDeadlineSnapshot } from "../compliance/compliance.service";
import { CreateSdfAssessmentDto } from "./dto/create-sdf-assessment.dto";
import { CompleteSdfAssessmentDto } from "./dto/complete-sdf-assessment.dto";

/**
 * `ComplianceService.resolveRule`'s lookup key for `SDF_ASSESSMENT_CYCLE`
 * (seeded annual cycle, statutory warning lead, STATUTORY, Rule 13(1) --
 * `prisma/seed/compliance-rules.ts`). Every cycle-length computation in
 * this module goes through this key -- never a cycle-length literal (task
 * brief: "Resolve the cycle length from the rule -- never hard-code it").
 */
export const SDF_CYCLE_APPLIES_TO = "SDF:DPIA_AUDIT";

/** Rule 13(1)'s citation, used verbatim in both SD-02 (independence) and
 * SD-04 (Board report) rejections -- spec line 1122: "both rejected with
 * the Rule 13 citations". */
export const SDF_RULE_13_CITATION =
  "DPDP Rules, 2025 -- Rule 13(1): the Data Protection Impact Assessment " +
  "and the audit must each be undertaken once in every period of twelve " +
  "months, the audit conducted by an independent data auditor, and a " +
  "report -- with its significant observations -- furnished to the Board " +
  "of Directors of the Significant Data Fiduciary.";

/** `SdfAssessment.conductedBy`'s placeholder value for a row opened
 * automatically (by `sdf-cycle-scan` or a manual `POST` with no
 * `conductedBy` supplied) before an auditor/assessor has been assigned.
 * Deliberately an empty string, not `null` -- the column is
 * non-nullable -- and deliberately falsy under `.trim()`, so
 * `complete()`'s independence check (SD-02) treats an unassigned AUDIT
 * row exactly like a missing auditor name. */
const CONDUCTOR_UNASSIGNED = "";

export const SDF_ASSESSMENT_PUBLIC_SELECT = {
  id: true,
  kind: true,
  cycleStartedAt: true,
  dueAt: true,
  conductedBy: true,
  isIndependent: true,
  completedAt: true,
  significantObservations: true,
  reportReference: true,
  furnishedToBoardAt: true,
  furnishedReference: true,
  createdAt: true,
} satisfies Prisma.SdfAssessmentSelect;

export type PublicSdfAssessment = Prisma.SdfAssessmentGetPayload<{
  select: typeof SDF_ASSESSMENT_PUBLIC_SELECT;
}>;

export interface SdfReadiness {
  isSignificantDataFiduciary: boolean;
  sdfNotifiedAt: Date | null;
  sdfNotificationRef: string | null;
  dpoIsIndiaBased: boolean;
}

/**
 * `SdfAssessment` CRUD plus the SD-02/SD-04 completion gates. Visible
 * always (spec §4.11: "a non-SDF sees it as a readiness view, not an
 * error") -- nothing in this service throws when
 * `Organization.isSignificantDataFiduciary` is false; `listWithReadiness`
 * simply returns the org's current SDF status fields alongside whatever
 * (possibly empty) assessment rows exist, so the frontend can render a
 * readiness screen instead of an error page. Only the WRITE paths
 * (`create`, and transitively `SdfCycleScanService`) require the org to
 * actually be a declared SDF with a notification date -- there is no
 * cycle to open otherwise.
 */
@Injectable()
export class SdfAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complianceService: ComplianceService,
    private readonly auditService: AuditService,
  ) {}

  async listWithReadiness(): Promise<{
    organization: SdfReadiness;
    assessments: PublicSdfAssessment[];
  }> {
    const [org, assessments] = await Promise.all([
      this.prisma.scoped.organization.findFirstOrThrow({
        select: {
          isSignificantDataFiduciary: true,
          sdfNotifiedAt: true,
          sdfNotificationRef: true,
          dpoIsIndiaBased: true,
        },
      }),
      this.prisma.scoped.sdfAssessment.findMany({
        orderBy: [{ cycleStartedAt: "desc" }, { kind: "asc" }],
        select: SDF_ASSESSMENT_PUBLIC_SELECT,
      }),
    ]);
    return { organization: org, assessments };
  }

  async getById(id: string): Promise<PublicSdfAssessment> {
    const row = await this.prisma.scoped.sdfAssessment.findFirst({
      where: { id },
      select: SDF_ASSESSMENT_PUBLIC_SELECT,
    });
    if (!row) {
      throw new NotFoundException(`SDF assessment "${id}" not found.`);
    }
    return row;
  }

  /**
   * Resolves `SDF_ASSESSMENT_CYCLE` and computes `{ dueAt, warningAt }`
   * from `cycleStartedAt` -- the one place this module ever derives a
   * cycle length, reused by both a manual `create()` call and
   * `SdfCycleScanService`. Throws if the rule is not configured, rather
   * than falling back to a literal 12 months (spec §4.1's "callers MUST
   * accept `null` ... rather than falling back to a hard-coded number",
   * applied here as a hard rejection because an SDF cycle with no
   * resolvable due date is not a state this module will create).
   */
  async resolveCycleDeadline(
    cycleStartedAt: Date,
  ): Promise<{ dueAt: Date; warningAt: Date; snapshot: ComplianceDeadlineSnapshot }> {
    const rule = await this.complianceService.resolveRule(SDF_CYCLE_APPLIES_TO, cycleStartedAt);
    if (!rule) {
      throw new BadRequestException(
        `No enabled compliance rule resolves for "${SDF_CYCLE_APPLIES_TO}" ` +
          "(expected SDF_ASSESSMENT_CYCLE) -- cannot open an SDF assessment " +
          "cycle without a configured cycle length.",
      );
    }
    const { dueAt, warningAt } = this.complianceService.computeDeadline(rule, cycleStartedAt);
    const snapshot: Partial<ComplianceDeadlineSnapshot> = {};
    this.complianceService.snapshotOnto(snapshot, rule, dueAt, warningAt);
    return { dueAt, warningAt, snapshot: snapshot as ComplianceDeadlineSnapshot };
  }

  /**
   * Opens one `SdfAssessment` row. Requires the org to be a declared SDF
   * with `sdfNotifiedAt` set -- per spec §4.11 the cycle itself runs
   * "from `sdfNotifiedAt`", so there is no cycle to open without it, even
   * though the pack's GET routes stay open to every org (readiness
   * view). `dueAt` is always computed from `resolveCycleDeadline`, never
   * accepted from the caller (see `CreateSdfAssessmentDto`'s doc
   * comment).
   *
   * Creation is audited in the same transaction as the assessment row so a
   * failed audit append can never leave an unaccountable cycle behind.
   */
  async create(dto: CreateSdfAssessmentDto): Promise<PublicSdfAssessment> {
    const org = await this.prisma.scoped.organization.findFirstOrThrow({
      select: { isSignificantDataFiduciary: true, sdfNotifiedAt: true },
    });
    if (!org.isSignificantDataFiduciary || !org.sdfNotifiedAt) {
      throw new BadRequestException(
        "Cannot open an SDF assessment cycle: the organization is not " +
          "currently declared a Significant Data Fiduciary with " +
          "`sdfNotifiedAt` set.",
      );
    }

    const cycleStartedAt = dto.cycleStartedAt ? new Date(dto.cycleStartedAt) : org.sdfNotifiedAt;
    const { dueAt } = await this.resolveCycleDeadline(cycleStartedAt);

    return this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.sdfAssessment.create({
        data: {
          kind: dto.kind,
          cycleStartedAt,
          dueAt,
          conductedBy: dto.conductedBy ?? CONDUCTOR_UNASSIGNED,
          isIndependent: dto.isIndependent ?? false,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: SDF_ASSESSMENT_PUBLIC_SELECT,
      });
      await this.auditService.record(tx, {
        action: "SDF_ASSESSMENT_CREATED",
        resourceType: "SdfAssessment",
        resourceId: created.id,
        metadata: {
          kind: created.kind,
          cycleStartedAt: created.cycleStartedAt,
          dueAt: created.dueAt,
          source: "manual",
        },
      });
      return created;
    });
  }

  /**
   * SD-02 (independence) and SD-04 (Board report), both enforced HERE --
   * not as a conditional DTO validator -- against the EFFECTIVE state
   * (existing row merged with this patch), so the citation (Rule 13(1))
   * reaches the rejection body and ordering is this method's to control
   * (task brief's known-bug-class warning).
   */
  async complete(id: string, dto: CompleteSdfAssessmentDto): Promise<PublicSdfAssessment> {
    const existing = await this.prisma.scoped.sdfAssessment.findFirst({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`SDF assessment "${id}" not found.`);
    }

    const effectiveConductedBy = dto.conductedBy ?? existing.conductedBy;
    const effectiveIsIndependent = dto.isIndependent ?? existing.isIndependent;
    const effectiveSignificantObservations =
      dto.significantObservations !== undefined
        ? dto.significantObservations
        : existing.significantObservations;
    const effectiveFurnishedToBoardAt = dto.furnishedToBoardAt
      ? new Date(dto.furnishedToBoardAt)
      : existing.furnishedToBoardAt;
    const effectiveReportReference =
      dto.reportReference !== undefined ? dto.reportReference : existing.reportReference;
    const effectiveFurnishedReference =
      dto.furnishedReference !== undefined ? dto.furnishedReference : existing.furnishedReference;

    // SD-02: an AUDIT row cannot be marked complete without
    // `isIndependent = true` AND a non-blank auditor name.
    if (
      existing.kind === SdfAssessmentKind.AUDIT &&
      (!effectiveIsIndependent || effectiveConductedBy.trim().length === 0)
    ) {
      throw new BadRequestException(
        `Cannot complete this AUDIT assessment: it requires isIndependent = true ` +
          `and a named independent auditor (conductedBy). ${SDF_RULE_13_CITATION}`,
      );
    }

    // SD-04: no cycle row closes without significant observations and a
    // Board furnishing date.
    if (
      !effectiveSignificantObservations ||
      effectiveSignificantObservations.trim().length === 0 ||
      !effectiveFurnishedToBoardAt
    ) {
      throw new BadRequestException(
        "Cannot close this assessment: significantObservations and " +
          `furnishedToBoardAt are both required. ${SDF_RULE_13_CITATION}`,
      );
    }

    return this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.sdfAssessment.update({
        where: { id },
        data: {
          conductedBy: effectiveConductedBy,
          isIndependent: effectiveIsIndependent,
          significantObservations: effectiveSignificantObservations,
          reportReference: effectiveReportReference,
          furnishedToBoardAt: effectiveFurnishedToBoardAt,
          furnishedReference: effectiveFurnishedReference,
          completedAt: new Date(),
        },
        select: SDF_ASSESSMENT_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "SDF_ASSESSMENT_COMPLETED",
        resourceType: "SdfAssessment",
        resourceId: id,
        metadata: {
          kind: existing.kind,
          isIndependent: effectiveIsIndependent,
          conductedBy: effectiveConductedBy,
          furnishedToBoardAt: effectiveFurnishedToBoardAt,
        },
      });

      return updated;
    });
  }
}
