import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * The five shortfall counts spec lines 831-835/849 name explicitly. Kept
 * as one shared shape so `summary()` and `gaps()` are guaranteed to agree
 * with each other -- both are built from exactly this object, never two
 * independently-written query sets that could silently drift apart.
 *
 * - `conflictCount` (GO-03): distinct `DataPrincipal`s carrying at least
 *   one `PrincipalDataField.conflict = true` row -- a principal-level
 *   count, consistent with `uniquePrincipalCount` and
 *   `unknownAgeStatusCount` being principal-level too, rather than a raw
 *   conflicting-field count.
 * - `unknownAgeStatusCount` (CH-01): `DataPrincipal.ageStatus = UNKNOWN`.
 * - `purposesWithoutReviewedLawfulBasisCount` (LB-02):
 *   `ProcessingPurpose.reviewedAt IS NULL`, across every purpose
 *   (active or not) -- a register finding is not hidden by an
 *   `active` filter (task brief: "a blank is a finding; hiding it would
 *   be the failure" -- the same principle this module applies to every
 *   shortfall, not only the RoPA's blank columns).
 * - `processorsWithoutContractCount` (GO-02): `DataRecipient` rows with
 *   `type = DATA_PROCESSOR AND contractExists = false`, across every
 *   recipient (active or not), same reasoning. In practice this can only
 *   ever count INACTIVE recipients: migration
 *   `20260829183100_constraints_and_triggers` adds a DB check constraint
 *   (`processor_requires_contract`) that forbids an active
 *   `DATA_PROCESSOR` row from having `contractExists = false` at all, so
 *   not filtering on `active` here does not hide an active gap -- there
 *   is no active gap the database will let exist. It surfaces
 *   deactivated processor engagements that never had a contract on file.
 */
interface ShortfallCounts {
  conflictCount: number;
  unknownAgeStatusCount: number;
  purposesWithoutReviewedLawfulBasisCount: number;
  processorsWithoutContractCount: number;
}

export interface InventorySummary extends ShortfallCounts {
  sourceCount: number;
  rawRecordCount: number;
  uniquePrincipalCount: number;
  matchedPrincipalCount: number;
  pendingReviewCount: number;
  recentAuditEvents: RecentAuditEvent[];
}

export interface RecentAuditEvent {
  id: string;
  action: string;
  actorType: string;
  actorLabel: string;
  resourceType: string;
  resourceId: string | null;
  subjectPrincipalId: string | null;
  createdAt: Date;
}

export interface InventoryGap {
  /** The spec's own shortfall code -- GO-03, CH-01, LB-02, GO-02. */
  code: "GO-03" | "CH-01" | "LB-02" | "GO-02";
  label: string;
  count: number;
  /**
   * Plain-language statement of the obligation this shortfall bears on.
   * Global Constraint: "supports"/"evidences"/"tracks" only -- never a
   * claim that the organization "is compliant". This text describes what
   * CANNOT yet be evidenced, not a verdict on the organization overall.
   */
  explanation: string;
}

/** How many recent events the dashboard's "recent audit strip" shows. */
const RECENT_AUDIT_STRIP_SIZE = 10;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private async computeShortfallCounts(): Promise<ShortfallCounts> {
    const [
      conflictCount,
      unknownAgeStatusCount,
      purposesWithoutReviewedLawfulBasisCount,
      processorsWithoutContractCount,
    ] = await Promise.all([
      this.prisma.scoped.dataPrincipal.count({
        where: { fields: { some: { conflict: true } } },
      }),
      this.prisma.scoped.dataPrincipal.count({
        where: { ageStatus: "UNKNOWN" },
      }),
      this.prisma.scoped.processingPurpose.count({
        where: { reviewedAt: null },
      }),
      this.prisma.scoped.dataRecipient.count({
        where: { type: "DATA_PROCESSOR", contractExists: false },
      }),
    ]);
    return {
      conflictCount,
      unknownAgeStatusCount,
      purposesWithoutReviewedLawfulBasisCount,
      processorsWithoutContractCount,
    };
  }

  async getSummary(): Promise<InventorySummary> {
    const [
      sourceCount,
      rawRecordCount,
      uniquePrincipalCount,
      matchedPrincipalCount,
      pendingReviewCount,
      shortfalls,
      recentAuditEvents,
    ] = await Promise.all([
      this.prisma.scoped.dataSource.count(),
      this.prisma.scoped.sourceRecord.count(),
      this.prisma.scoped.dataPrincipal.count(),
      this.prisma.scoped.dataPrincipal.count({
        where: { links: { some: { status: "ACTIVE" } } },
      }),
      this.prisma.scoped.matchCandidate.count({ where: { status: "PENDING" } }),
      this.computeShortfallCounts(),
      this.prisma.scoped.auditEvent.findMany({
        orderBy: { sequence: "desc" },
        take: RECENT_AUDIT_STRIP_SIZE,
        select: {
          id: true,
          action: true,
          actorType: true,
          actorLabel: true,
          resourceType: true,
          resourceId: true,
          subjectPrincipalId: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      sourceCount,
      rawRecordCount,
      uniquePrincipalCount,
      matchedPrincipalCount,
      pendingReviewCount,
      ...shortfalls,
      recentAuditEvents,
    };
  }

  async getGaps(): Promise<InventoryGap[]> {
    const counts = await this.computeShortfallCounts();
    return [
      {
        code: "CH-01",
        label: "Unknown age status",
        count: counts.unknownAgeStatusCount,
        explanation:
          `${counts.unknownAgeStatusCount} data principal(s) have an ` +
          "unknown age status. Without a declared or DOB-derived age " +
          "status, s.9 obligations toward children cannot be evidenced " +
          "as tracked for these principals.",
      },
      {
        code: "LB-02",
        label: "Purposes without a reviewed lawful basis",
        count: counts.purposesWithoutReviewedLawfulBasisCount,
        explanation:
          `${counts.purposesWithoutReviewedLawfulBasisCount} processing ` +
          "purpose(s) have never had their lawful basis reviewed by an " +
          "employee. Until a purpose is marked reviewed, its s.4/s.7 " +
          "lawful-basis record is not evidenced as checked.",
      },
      {
        code: "GO-02",
        label: "Processors without a contract",
        count: counts.processorsWithoutContractCount,
        explanation:
          `${counts.processorsWithoutContractCount} data processor(s) ` +
          "have no contract on file. s.8(2) permits engaging a " +
          "processor only under a valid contract; this platform " +
          "supports recording that contract, and these recipients do " +
          "not yet have one recorded.",
      },
      {
        code: "GO-03",
        label: "Principals with a field conflict",
        count: counts.conflictCount,
        explanation:
          `${counts.conflictCount} data principal(s) have a field flagged ` +
          "with a source conflict (two sources disagree on the same " +
          "value). Accuracy and consistency of personal data cannot be " +
          "evidenced for these principals until the conflict is resolved.",
      },
    ];
  }
}
