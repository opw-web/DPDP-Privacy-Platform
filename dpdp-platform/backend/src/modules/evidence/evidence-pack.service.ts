import { Injectable } from "@nestjs/common";
import { AuditReadService } from "../audit/audit-read.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RopaExportService } from "../inventory/ropa-export.service";
import { csvDocument } from "../inventory/csv-writer";
import { AuditExportService } from "./audit-export.service";
import { withCsvLetterhead } from "./pack-letterhead";
import { buildZip, type ZipEntryInput } from "./zip-writer";

const DEADLINE_UNIT_TO_DAYS: Record<string, number> = {
  HOURS: 1 / 24,
  DAYS: 1,
  MONTHS: 30,
  YEARS: 365,
};

/**
 * `GET /api/evidence/pack.zip` (spec line 890, checklist section 16).
 * Bundles the eleven organisation-wide EV artefacts (EV-01, 02, 04-12 --
 * EV-03, the per-PERSON evidence file, is deliberately excluded: it has
 * no single organisation-wide form, and is served on its own route,
 * `GET /api/principals/:id/evidence[.pdf]`).
 *
 * Two artefacts are the OUTPUT of another module's already-built,
 * already-audited service, reused verbatim rather than re-derived here
 * (task 12 brief's own instruction for the RoPA specifically: "already
 * has a CSV writer -- reuse it, do not duplicate"):
 *   - EV-02 RoPA: `RopaExportService.exportCsv()` (`inventory` module).
 *   - EV-08 Access log: `AuditReadService.accessLogCsv()` (`audit` module).
 * Both write their own `EVIDENCE_EXPORTED` audit event as a side effect
 * of being called -- on top of, not instead of, the one this method
 * writes for the pack as a whole.
 *
 * Every other artefact is built here from a small, bounded number of
 * batched `prisma.scoped` queries -- one query per entity type, never a
 * loop issuing one query per row (Check 36).
 */
@Injectable()
export class EvidencePackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly ropaExportService: RopaExportService,
    private readonly auditReadService: AuditReadService,
    private readonly auditExportService: AuditExportService,
  ) {}

  async buildPack(): Promise<Buffer> {
    const organization = await this.prisma.scoped.organization.findFirstOrThrow({
      select: { name: true },
    });
    const generatedAt = new Date();
    const letterhead = (title: string, csv: string) =>
      withCsvLetterhead(title, organization.name, generatedAt, csv);

    const [
      dataInventoryCsv,
      ropaCsv,
      consentLedgerCsv,
      requestRegisterCsv,
      grievanceReportCsv,
      breachFileCsv,
      accessLogCsv,
      sharingRegisterCsv,
      retentionScheduleCsv,
      sdfRecordsCsv,
      auditLogCsv,
    ] = await Promise.all([
      this.buildDataInventoryCsv(),
      this.ropaExportService.exportCsv(),
      this.buildConsentLedgerCsv(),
      this.buildRequestRegisterCsv(),
      this.buildGrievanceReportCsv(),
      this.buildBreachFileCsv(),
      this.auditReadService.accessLogCsv({}),
      this.buildSharingRegisterCsv(),
      this.buildRetentionScheduleCsv(),
      this.buildSdfRecordsCsv(),
      this.auditExportService.exportCsv(),
    ]);

    const entries: ZipEntryInput[] = [
      {
        name: "EV-01-data-inventory.csv",
        content: Buffer.from(letterhead("EV-01 Data inventory", dataInventoryCsv), "utf8"),
        date: generatedAt,
      },
      {
        name: "EV-02-record-of-processing-activities.csv",
        content: Buffer.from(
          letterhead("EV-02 Record of Processing Activities", ropaCsv),
          "utf8",
        ),
        date: generatedAt,
      },
      {
        name: "EV-04-consent-ledger.csv",
        content: Buffer.from(letterhead("EV-04 Consent ledger", consentLedgerCsv), "utf8"),
        date: generatedAt,
      },
      {
        name: "EV-05-rights-request-register.csv",
        content: Buffer.from(
          letterhead("EV-05 Rights request register", requestRegisterCsv),
          "utf8",
        ),
        date: generatedAt,
      },
      {
        name: "EV-06-grievance-response-time-report.csv",
        content: Buffer.from(
          letterhead("EV-06 Grievance response-time report", grievanceReportCsv),
          "utf8",
        ),
        date: generatedAt,
      },
      {
        name: "EV-07-breach-file.csv",
        content: Buffer.from(letterhead("EV-07 Breach file", breachFileCsv), "utf8"),
        date: generatedAt,
      },
      {
        name: "EV-08-access-log.csv",
        content: Buffer.from(letterhead("EV-08 Access log", accessLogCsv), "utf8"),
        date: generatedAt,
      },
      {
        name: "EV-09-processor-and-sharing-register.csv",
        content: Buffer.from(
          letterhead("EV-09 Processor and sharing register", sharingRegisterCsv),
          "utf8",
        ),
        date: generatedAt,
      },
      {
        name: "EV-10-retention-schedule.csv",
        content: Buffer.from(
          letterhead("EV-10 Retention schedule", retentionScheduleCsv),
          "utf8",
        ),
        date: generatedAt,
      },
      {
        name: "EV-11-dpia-and-audit-records.csv",
        content: Buffer.from(
          letterhead("EV-11 DPIA and audit records", sdfRecordsCsv),
          "utf8",
        ),
        date: generatedAt,
      },
      {
        name: "EV-12-immutable-audit-log.csv",
        content: Buffer.from(
          letterhead("EV-12 Immutable audit log", auditLogCsv),
          "utf8",
        ),
        date: generatedAt,
      },
    ];

    await this.prisma.scoped.$transaction(async (tx) => {
      await this.auditService.record(tx, {
        action: "EVIDENCE_EXPORTED",
        resourceType: "EvidencePack",
        metadata: { exportType: "EVIDENCE_PACK", artifactCount: entries.length },
      });
    });

    return buildZip(entries);
  }

  /** EV-01: systems, categories, volumes, purposes, lawful basis. */
  private async buildDataInventoryCsv(): Promise<string> {
    const sources = await this.prisma.scoped.dataSource.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        systemType: true,
        status: true,
        hostingCountry: true,
        containsOnlyPubliclyAvailableData: true,
        _count: { select: { records: true } },
      },
    });
    const sourceIds = sources.map((source) => source.id);
    const links = sourceIds.length
      ? await this.prisma.scoped.dataSourcePurpose.findMany({
          where: { dataSourceId: { in: sourceIds } },
          select: {
            dataSourceId: true,
            purpose: { select: { name: true, lawfulBasis: true, dataCategories: true } },
          },
        })
      : [];

    const purposeNamesBySource = new Map<string, string[]>();
    const lawfulBasesBySource = new Map<string, Set<string>>();
    const categoriesBySource = new Map<string, Set<string>>();
    for (const link of links) {
      const purposeNames = purposeNamesBySource.get(link.dataSourceId) ?? [];
      purposeNames.push(link.purpose.name);
      purposeNamesBySource.set(link.dataSourceId, purposeNames);

      const bases = lawfulBasesBySource.get(link.dataSourceId) ?? new Set<string>();
      bases.add(link.purpose.lawfulBasis);
      lawfulBasesBySource.set(link.dataSourceId, bases);

      const categories = categoriesBySource.get(link.dataSourceId) ?? new Set<string>();
      for (const category of link.purpose.dataCategories) {
        categories.add(category);
      }
      categoriesBySource.set(link.dataSourceId, categories);
    }

    const rows = sources.map((source) => [
      source.name,
      source.systemType,
      source.status,
      source.hostingCountry,
      String(source._count.records),
      [...(categoriesBySource.get(source.id) ?? [])].sort().join("; "),
      (purposeNamesBySource.get(source.id) ?? []).sort().join("; "),
      [...(lawfulBasesBySource.get(source.id) ?? [])].sort().join("; "),
      source.containsOnlyPubliclyAvailableData ? "YES" : "NO",
    ]);

    return csvDocument(
      [
        "Source",
        "System Type",
        "Status",
        "Hosting Country",
        "Record Volume",
        "Data Categories",
        "Purposes",
        "Lawful Basis",
        "Publicly Available Only",
      ],
      rows,
    );
  }

  /** EV-04: status, history, channel, notice version and content hash, evidence metadata. */
  private async buildConsentLedgerCsv(): Promise<string> {
    const [records, events] = await Promise.all([
      this.prisma.scoped.consentRecord.findMany({
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          purposeId: true,
          status: true,
          channel: true,
          grantedAt: true,
          withdrawnAt: true,
          deniedAt: true,
          noticeVersionId: true,
          noticeContentHash: true,
          dataPrincipal: { select: { reference: true } },
        },
      }),
      this.prisma.scoped.consentEvent.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          consentRecordId: true,
          fromStatus: true,
          toStatus: true,
          channel: true,
          createdAt: true,
        },
      }),
    ]);
    const purposeIds = [...new Set(records.map((record) => record.purposeId))];
    const purposes = purposeIds.length
      ? await this.prisma.scoped.processingPurpose.findMany({
          where: { id: { in: purposeIds } },
          select: { id: true, code: true },
        })
      : [];
    const purposeCodeById = new Map(purposes.map((purpose) => [purpose.id, purpose.code]));

    const historyByRecord = new Map<string, string[]>();
    for (const event of events) {
      const list = historyByRecord.get(event.consentRecordId) ?? [];
      list.push(
        `${event.createdAt.toISOString()}: ${event.fromStatus ?? "(none)"}->${event.toStatus} (${event.channel})`,
      );
      historyByRecord.set(event.consentRecordId, list);
    }

    const rows = records.map((record) => [
      record.dataPrincipal.reference,
      purposeCodeById.get(record.purposeId) ?? record.purposeId,
      record.status,
      record.channel ?? "",
      record.grantedAt?.toISOString() ?? "",
      record.withdrawnAt?.toISOString() ?? "",
      record.deniedAt?.toISOString() ?? "",
      record.noticeVersionId ?? "",
      record.noticeContentHash ?? "",
      (historyByRecord.get(record.id) ?? []).join(" | "),
    ]);

    return csvDocument(
      [
        "Principal Reference",
        "Purpose Code",
        "Status",
        "Channel",
        "Granted At",
        "Withdrawn At",
        "Denied At",
        "Notice Version ID",
        "Notice Content Hash",
        "History",
      ],
      rows,
    );
  }

  /** EV-05: type, dates, deadline, rule applied, outcome, reason. */
  private async buildRequestRegisterCsv(): Promise<string> {
    const requests = await this.prisma.scoped.principalRequest.findMany({
      orderBy: { submittedAt: "desc" },
      select: {
        reference: true,
        type: true,
        status: true,
        submittedAt: true,
        dueAt: true,
        completedAt: true,
        isOverdue: true,
        ruleCodeSnapshot: true,
        legalSourceSnapshot: true,
        outcomeCode: true,
        outcome: true,
        rejectionReason: true,
        dataPrincipal: { select: { reference: true } },
      },
    });

    const rows = requests.map((request) => [
      request.reference,
      request.dataPrincipal.reference,
      request.type,
      request.status,
      request.submittedAt.toISOString(),
      request.dueAt?.toISOString() ?? "",
      request.completedAt?.toISOString() ?? "",
      request.isOverdue ? "YES" : "NO",
      request.ruleCodeSnapshot ?? "",
      request.legalSourceSnapshot ?? "",
      request.outcomeCode ?? "",
      request.outcome ?? "",
      request.rejectionReason ?? "",
    ]);

    return csvDocument(
      [
        "Reference",
        "Principal Reference",
        "Type",
        "Status",
        "Submitted At",
        "Due At",
        "Completed At",
        "Overdue",
        "Rule Applied",
        "Legal Source",
        "Outcome Code",
        "Outcome",
        "Rejection Reason",
      ],
      rows,
    );
  }

  /** EV-06: grievance response times against the published period (GRIEVANCE_RESPONSE). */
  private async buildGrievanceReportCsv(): Promise<string> {
    const [grievances, rule] = await Promise.all([
      this.prisma.scoped.principalRequest.findMany({
        where: { type: "GRIEVANCE" },
        orderBy: { submittedAt: "desc" },
        select: {
          reference: true,
          submittedAt: true,
          dueAt: true,
          completedAt: true,
          status: true,
          dataPrincipal: { select: { reference: true } },
        },
      }),
      this.prisma.scoped.complianceRule.findFirst({
        where: { ruleCode: "GRIEVANCE_RESPONSE", enabled: true },
        orderBy: { version: "desc" },
        select: { publishedPeriodText: true, deadlineValue: true, deadlineUnit: true },
      }),
    ]);

    const deadlineDays = rule
      ? rule.deadlineValue * (DEADLINE_UNIT_TO_DAYS[rule.deadlineUnit] ?? 0)
      : null;
    const publishedPeriod = rule?.publishedPeriodText ?? "";

    const rows = grievances.map((grievance) => {
      const responseDays = grievance.completedAt
        ? (grievance.completedAt.getTime() - grievance.submittedAt.getTime()) /
          (1000 * 60 * 60 * 24)
        : null;
      const withinPeriod =
        responseDays === null || deadlineDays === null
          ? ""
          : responseDays <= deadlineDays
            ? "YES"
            : "NO";

      return [
        grievance.reference,
        grievance.dataPrincipal.reference,
        grievance.status,
        grievance.submittedAt.toISOString(),
        grievance.completedAt?.toISOString() ?? "",
        responseDays === null ? "" : responseDays.toFixed(2),
        publishedPeriod,
        withinPeriod,
      ];
    });

    return csvDocument(
      [
        "Reference",
        "Principal Reference",
        "Status",
        "Submitted At",
        "Completed At",
        "Response Time (days)",
        "Published Period",
        "Within Published Period",
      ],
      rows,
    );
  }

  /** EV-07: awareness time, both Board intimations, per-person delivery evidence (count), remediation. */
  private async buildBreachFileCsv(): Promise<string> {
    const breaches = await this.prisma.scoped.breachIncident.findMany({
      orderBy: { becameAwareAt: "desc" },
      select: {
        reference: true,
        title: true,
        status: true,
        occurredAt: true,
        becameAwareAt: true,
        closedAt: true,
        closureNote: true,
        obligations: { select: { code: true, status: true, dueAt: true, completedAt: true } },
        affected: { select: { notifiedAt: true } },
      },
    });

    const rows = breaches.map((breach) => {
      const boardInitial = breach.obligations.find((o) => o.code === "BOARD_INITIAL");
      const boardDetail = breach.obligations.find((o) => o.code === "BOARD_DETAIL");
      const notifiedCount = breach.affected.filter((row) => row.notifiedAt !== null).length;

      return [
        breach.reference,
        breach.title,
        breach.status,
        breach.occurredAt?.toISOString() ?? "",
        breach.becameAwareAt.toISOString(),
        boardInitial ? `${boardInitial.status} (due ${boardInitial.dueAt.toISOString()})` : "",
        boardDetail ? `${boardDetail.status} (due ${boardDetail.dueAt.toISOString()})` : "",
        `${notifiedCount}/${breach.affected.length}`,
        breach.closedAt?.toISOString() ?? "",
        breach.closureNote ?? "",
      ];
    });

    return csvDocument(
      [
        "Reference",
        "Title",
        "Status",
        "Occurred At",
        "Became Aware At",
        "Board Initial Intimation",
        "Board Detailed Report",
        "Principals Notified/Affected",
        "Closed At",
        "Remediation / Closure Note",
      ],
      rows,
    );
  }

  /** EV-09: processor/recipient register with contracts and security clauses. */
  private async buildSharingRegisterCsv(): Promise<string> {
    const recipients = await this.prisma.scoped.dataRecipient.findMany({
      orderBy: { name: "asc" },
      select: {
        name: true,
        type: true,
        country: true,
        active: true,
        contractExists: true,
        contractReference: true,
        contractHasSecurityClause: true,
        contractHasErasureClause: true,
        contractHasAuditRights: true,
        subProcessorsDisclosed: true,
        _count: { select: { sharing: true } },
      },
    });

    const rows = recipients.map((recipient) => [
      recipient.name,
      recipient.type,
      recipient.country,
      recipient.active ? "ACTIVE" : "INACTIVE",
      recipient.contractExists ? "YES" : "NO",
      recipient.contractReference ?? "",
      recipient.contractHasSecurityClause ? "YES" : "NO",
      recipient.contractHasErasureClause ? "YES" : "NO",
      recipient.contractHasAuditRights ? "YES" : "NO",
      recipient.subProcessorsDisclosed ? "YES" : "NO",
      String(recipient._count.sharing),
    ]);

    return csvDocument(
      [
        "Recipient",
        "Type",
        "Country",
        "Status",
        "Contract Exists",
        "Contract Reference",
        "Security Clause",
        "Erasure Clause (s.8(7)(b))",
        "Audit Rights",
        "Sub-processors Disclosed",
        "Sharing Activities",
      ],
      rows,
    );
  }

  /** EV-10: retention schedule with legal basis and erasure execution records. */
  private async buildRetentionScheduleCsv(): Promise<string> {
    const [policies, tasks] = await Promise.all([
      this.prisma.scoped.retentionPolicy.findMany({
        orderBy: { name: "asc" },
        select: {
          name: true,
          triggerType: true,
          retentionValue: true,
          retentionUnit: true,
          legalBasisForRetention: true,
          legalBasisType: true,
          minimumRetentionValue: true,
          minimumRetentionUnit: true,
          accountAccessCarveOut: true,
          active: true,
          purpose: { select: { code: true, name: true } },
        },
      }),
      this.prisma.scoped.erasureTask.findMany({ select: { state: true } }),
    ]);

    const rows: string[][] = policies.map((policy) => [
      policy.name,
      `${policy.purpose.name} (${policy.purpose.code})`,
      policy.triggerType,
      `${policy.retentionValue} ${policy.retentionUnit}`,
      `${policy.legalBasisForRetention} (${policy.legalBasisType})`,
      `${policy.minimumRetentionValue} ${policy.minimumRetentionUnit}`,
      policy.accountAccessCarveOut ? "YES" : "NO",
      policy.active ? "ACTIVE" : "INACTIVE",
    ]);

    const taskCounts = new Map<string, number>();
    for (const task of tasks) {
      taskCounts.set(task.state, (taskCounts.get(task.state) ?? 0) + 1);
    }
    for (const [state, count] of [...taskCounts.entries()].sort()) {
      rows.push([
        `Erasure task execution summary: ${state}`,
        "",
        "",
        "",
        "",
        "",
        "",
        String(count),
      ]);
    }

    return csvDocument(
      [
        "Policy",
        "Purpose",
        "Trigger",
        "Retention Period",
        "Legal Basis",
        "Minimum Retention Floor",
        "Third Schedule Carve-out",
        "Status / Task Count",
      ],
      rows,
    );
  }

  /** EV-11: DPIA and audit records for SDFs, with the 12-month clock. */
  private async buildSdfRecordsCsv(): Promise<string> {
    const assessments = await this.prisma.scoped.sdfAssessment.findMany({
      orderBy: { cycleStartedAt: "desc" },
      select: {
        kind: true,
        cycleStartedAt: true,
        dueAt: true,
        conductedBy: true,
        isIndependent: true,
        completedAt: true,
        significantObservations: true,
        furnishedToBoardAt: true,
      },
    });

    const rows = assessments.map((assessment) => [
      assessment.kind,
      assessment.cycleStartedAt.toISOString(),
      assessment.dueAt.toISOString(),
      assessment.conductedBy,
      assessment.isIndependent ? "YES" : "NO",
      assessment.completedAt?.toISOString() ?? "",
      assessment.significantObservations ?? "",
      assessment.furnishedToBoardAt?.toISOString() ?? "",
    ]);

    return csvDocument(
      [
        "Kind",
        "Cycle Started At",
        "Due At",
        "Conducted By",
        "Independent",
        "Completed At",
        "Significant Observations",
        "Furnished To Board At",
      ],
      rows,
    );
  }
}
