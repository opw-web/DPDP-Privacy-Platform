import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  AgeStatus,
  ConsentChannel,
  ConsentStatus,
  ErasureState,
  LawfulBasis,
  LegitimateUseLimb,
} from "@prisma/client";
import { AccessLogService } from "../../common/audit/access-log.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { LineageService } from "../principals/lineage.service";
import type { ResolvedPrincipalField } from "../principals/lineage.service";
import { PrincipalRecipientsService } from "../principals/principal-recipients.service";
import { splitNonDisclosureRequests } from "./non-disclosure";
import type { PublicInformationRequest } from "./non-disclosure";

export interface AccessReportProcessingActivity {
  purposeId: string;
  purposeCode: string;
  purposeName: string;
  lawfulBasis: LawfulBasis;
  legitimateUseLimb: LegitimateUseLimb | null;
  sourceSystems: string[];
}

export interface AccessReportConsentHistoryEntry {
  fromStatus: ConsentStatus | null;
  toStatus: ConsentStatus;
  channel: ConsentChannel;
  createdAt: Date;
  actorType: string;
  actorLabel: string;
}

export interface AccessReportConsentEntry {
  purposeId: string;
  purposeCode: string | null;
  purposeName: string | null;
  status: ConsentStatus;
  grantedAt: Date | null;
  withdrawnAt: Date | null;
  deniedAt: Date | null;
  channel: ConsentChannel | null;
  noticeVersionId: string | null;
  noticeContentHash: string | null;
  history: AccessReportConsentHistoryEntry[];
}

export interface AccessReportRetentionEntry {
  id: string;
  retentionPolicyId: string | null;
  policyName: string | null;
  retentionValue: number | null;
  retentionUnit: string | null;
  legalBasisForRetention: string | null;
  trigger: string;
  state: ErasureState;
  evaluatedAt: Date;
  preErasureNoticeDueAt: Date | null;
  preErasureNoticeSentAt: Date | null;
  erasureDueAt: Date | null;
  retentionFloorUntil: Date | null;
  legalHoldId: string | null;
  completedAt: Date | null;
}

/** The RT-04 recipient shape `PrincipalRecipientsService.listForPrincipal` resolves. */
export type AccessReportRecipient = Awaited<
  ReturnType<PrincipalRecipientsService["listForPrincipal"]>
>[number];

export interface AccessReportData {
  principal: {
    id: string;
    reference: string;
    displayName: string | null;
    ageStatus: AgeStatus;
  };
  organizationName: string;
  generatedAt: Date;
  /** s.11 section 1: a summary of her personal data, assembled from the canonical profile with lineage. */
  personalData: ResolvedPrincipalField[];
  /** s.11 section 2: the processing activities -- purposes, lawful bases, source systems. */
  processingActivities: AccessReportProcessingActivity[];
  /** s.11(1)(b), section 3: every Data Fiduciary/Processor her data was shared with, filtered to her contributing sources only, with what was shared. */
  recipients: AccessReportRecipient[];
  /** s.11 section 4: consent status and history per purpose. */
  consent: AccessReportConsentEntry[];
  /** s.11 section 5: her retention position and any erasure task. */
  retention: AccessReportRetentionEntry[];
  /** Beyond the five s.11 sections: Board/Government information requests naming her, BD-04-filtered (non-disclosure-suppressed rows never reach this list). */
  governmentRequests: PublicInformationRequest[];
  suppressedRequestCount: number;
}

/**
 * Assembles the s.11 access report (spec lines 696-703, checklist
 * RT-03/04/05, task 12 brief). Every section is built from a small,
 * bounded number of batched queries -- never a loop issuing one query
 * per field/purpose/recipient -- per Check 36's N+1 warning.
 *
 * Section 1 and section 3 are DELIBERATELY not re-derived here:
 * `LineageService.getResolvedFields` (the fail-closed provenance rule)
 * and `PrincipalRecipientsService.listForPrincipal` (the RT-04
 * source-intersection rule, already proven correct and reused by
 * `MeService`) are the one shared implementation of each rule in this
 * codebase; duplicating either here would risk the two read paths
 * silently disagreeing, exactly the defect class `field-provenance.ts`'s
 * own docstring warns about.
 */
@Injectable()
export class AccessReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lineageService: LineageService,
    private readonly recipientsService: PrincipalRecipientsService,
    private readonly auditService: AuditService,
    private readonly accessLogService: AccessLogService,
  ) {}

  async buildReport(dataPrincipalId: string): Promise<AccessReportData> {
    const principal = await this.prisma.scoped.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true, reference: true, ageStatus: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dataPrincipalId}" not found.`,
      );
    }

    const [resolvedFields, rawFields, recipients, consent, retention, organization] =
      await Promise.all([
        this.lineageService.getResolvedFields(dataPrincipalId),
        this.prisma.scoped.principalDataField.findMany({
          where: { dataPrincipalId },
          select: { sourceIds: true, isPrimary: true, canonicalField: true, value: true },
        }),
        this.recipientsService.listForPrincipal(dataPrincipalId),
        this.buildConsentSection(dataPrincipalId),
        this.buildRetentionSection(dataPrincipalId),
        this.prisma.scoped.organization.findFirstOrThrow({ select: { name: true } }),
      ]);

    const contributingSourceIds = [
      ...new Set(rawFields.flatMap((field) => field.sourceIds)),
    ];
    const processingActivities =
      await this.buildProcessingActivities(contributingSourceIds);

    const displayNameField = resolvedFields.find(
      (field) => field.canonicalField === "FULL_NAME" && field.isPrimary,
    );

    return this.prisma.scoped.$transaction(async (tx) => {
      const { visible: governmentRequests, suppressedCount } =
        await splitNonDisclosureRequests(
          tx,
          this.auditService,
          dataPrincipalId,
          "ACCESS_REPORT",
        );

      // The report embeds this principal's full personal-data profile --
      // per AccessLogService's own doc comment ("if an evidence package
      // embeds a specific data principal's personal data, ALSO call
      // recordPersonalDataViewed ... inside the same transaction as the
      // export write"), one PERSONAL_DATA_VIEWED event is recorded here,
      // alongside (not instead of) ACCESS_REPORT_GENERATED below -- the
      // two answer different questions ("was her data looked at" vs "was
      // an access report produced for her").
      await this.accessLogService.recordPersonalDataViewed(tx, {
        subjectPrincipalId: dataPrincipalId,
        resourceType: "DataPrincipal",
        resourceId: dataPrincipalId,
        context: { view: "access-report" },
      });

      await this.auditService.record(tx, {
        action: "ACCESS_REPORT_GENERATED",
        resourceType: "DataPrincipal",
        resourceId: dataPrincipalId,
        subjectPrincipalId: dataPrincipalId,
        metadata: {
          fieldCount: resolvedFields.length,
          recipientCount: recipients.length,
          processingActivityCount: processingActivities.length,
          consentEntryCount: consent.length,
          retentionEntryCount: retention.length,
          suppressedRequestCount: suppressedCount,
        },
      });

      return {
        principal: {
          id: principal.id,
          reference: principal.reference,
          displayName: displayNameField?.value ?? null,
          ageStatus: principal.ageStatus,
        },
        organizationName: organization.name,
        generatedAt: new Date(),
        personalData: resolvedFields,
        processingActivities,
        recipients,
        consent,
        retention,
        governmentRequests,
        suppressedRequestCount: suppressedCount,
      };
    });
  }

  /**
   * Section 2. `sourceIds` is her raw contributing-source set (every
   * source any of her `PrincipalDataField` rows names), the same basis
   * `PrincipalRecipientsService` intersects against -- so "which
   * purposes touch her data" and "which recipients received her data"
   * agree about which systems count as hers.
   *
   * Nested relation selects on `DataSourcePurpose` (an indirectly
   * tenant-scoped join table) are deliberately avoided: the tenant
   * extension does not scope a nested relation read (see
   * `SharingService`'s own comment on the same point), so `DataSource`
   * and `ProcessingPurpose` are each fetched through their own scoped
   * delegate instead, exactly like `RopaExportService`.
   */
  private async buildProcessingActivities(
    sourceIds: readonly string[],
  ): Promise<AccessReportProcessingActivity[]> {
    if (sourceIds.length === 0) {
      return [];
    }
    const links = await this.prisma.scoped.dataSourcePurpose.findMany({
      where: { dataSourceId: { in: [...sourceIds] } },
      select: { dataSourceId: true, purposeId: true },
    });
    if (links.length === 0) {
      return [];
    }
    const purposeIds = [...new Set(links.map((link) => link.purposeId))];
    const [purposes, sources] = await Promise.all([
      this.prisma.scoped.processingPurpose.findMany({
        where: { id: { in: purposeIds } },
        select: {
          id: true,
          code: true,
          name: true,
          lawfulBasis: true,
          legitimateUseLimb: true,
        },
      }),
      this.prisma.scoped.dataSource.findMany({
        where: { id: { in: [...sourceIds] } },
        select: { id: true, name: true },
      }),
    ]);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const purposeById = new Map(purposes.map((purpose) => [purpose.id, purpose]));

    const sourceNamesByPurpose = new Map<string, Set<string>>();
    for (const link of links) {
      const name = sourceById.get(link.dataSourceId)?.name;
      if (!name) {
        continue;
      }
      const set = sourceNamesByPurpose.get(link.purposeId) ?? new Set<string>();
      set.add(name);
      sourceNamesByPurpose.set(link.purposeId, set);
    }

    return purposeIds
      .flatMap((purposeId) => {
        const purpose = purposeById.get(purposeId);
        if (!purpose) {
          return [];
        }
        return [
          {
            purposeId: purpose.id,
            purposeCode: purpose.code,
            purposeName: purpose.name,
            lawfulBasis: purpose.lawfulBasis,
            legitimateUseLimb: purpose.legitimateUseLimb,
            sourceSystems: [...(sourceNamesByPurpose.get(purposeId) ?? [])].sort(),
          },
        ];
      })
      .sort((a, b) => a.purposeCode.localeCompare(b.purposeCode));
  }

  /** Section 4: current status per purpose plus the full append-only `ConsentEvent` history. */
  private async buildConsentSection(
    dataPrincipalId: string,
  ): Promise<AccessReportConsentEntry[]> {
    const records = await this.prisma.scoped.consentRecord.findMany({
      where: { dataPrincipalId },
      select: {
        id: true,
        purposeId: true,
        status: true,
        grantedAt: true,
        withdrawnAt: true,
        deniedAt: true,
        channel: true,
        noticeVersionId: true,
        noticeContentHash: true,
      },
    });
    if (records.length === 0) {
      return [];
    }
    const purposeIds = [...new Set(records.map((record) => record.purposeId))];
    const [purposes, events] = await Promise.all([
      this.prisma.scoped.processingPurpose.findMany({
        where: { id: { in: purposeIds } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.scoped.consentEvent.findMany({
        where: { consentRecordId: { in: records.map((record) => record.id) } },
        orderBy: { createdAt: "asc" },
        select: {
          consentRecordId: true,
          fromStatus: true,
          toStatus: true,
          channel: true,
          createdAt: true,
          actorType: true,
          actorLabel: true,
        },
      }),
    ]);
    const purposeById = new Map(purposes.map((purpose) => [purpose.id, purpose]));
    const eventsByRecord = new Map<string, AccessReportConsentHistoryEntry[]>();
    for (const event of events) {
      const list = eventsByRecord.get(event.consentRecordId) ?? [];
      list.push({
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        channel: event.channel,
        createdAt: event.createdAt,
        actorType: event.actorType,
        actorLabel: event.actorLabel,
      });
      eventsByRecord.set(event.consentRecordId, list);
    }

    return records
      .map((record) => ({
        purposeId: record.purposeId,
        purposeCode: purposeById.get(record.purposeId)?.code ?? null,
        purposeName: purposeById.get(record.purposeId)?.name ?? null,
        status: record.status,
        grantedAt: record.grantedAt,
        withdrawnAt: record.withdrawnAt,
        deniedAt: record.deniedAt,
        channel: record.channel,
        noticeVersionId: record.noticeVersionId,
        noticeContentHash: record.noticeContentHash,
        history: eventsByRecord.get(record.id) ?? [],
      }))
      .sort((a, b) => (a.purposeCode ?? "").localeCompare(b.purposeCode ?? ""));
  }

  /** Section 5: every `ErasureTask` evaluated for her, plus the retention policy it was evaluated against. */
  private async buildRetentionSection(
    dataPrincipalId: string,
  ): Promise<AccessReportRetentionEntry[]> {
    const tasks = await this.prisma.scoped.erasureTask.findMany({
      where: { dataPrincipalId },
      orderBy: { evaluatedAt: "desc" },
      select: {
        id: true,
        retentionPolicyId: true,
        trigger: true,
        state: true,
        evaluatedAt: true,
        preErasureNoticeDueAt: true,
        preErasureNoticeSentAt: true,
        erasureDueAt: true,
        retentionFloorUntil: true,
        legalHoldId: true,
        completedAt: true,
      },
    });
    const policyIds = [
      ...new Set(
        tasks
          .map((task) => task.retentionPolicyId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const policies = policyIds.length
      ? await this.prisma.scoped.retentionPolicy.findMany({
          where: { id: { in: policyIds } },
          select: {
            id: true,
            name: true,
            retentionValue: true,
            retentionUnit: true,
            legalBasisForRetention: true,
          },
        })
      : [];
    const policyById = new Map(policies.map((policy) => [policy.id, policy]));

    return tasks.map((task) => {
      const policy = task.retentionPolicyId
        ? (policyById.get(task.retentionPolicyId) ?? null)
        : null;
      return {
        id: task.id,
        retentionPolicyId: task.retentionPolicyId,
        policyName: policy?.name ?? null,
        retentionValue: policy?.retentionValue ?? null,
        retentionUnit: policy?.retentionUnit ?? null,
        legalBasisForRetention: policy?.legalBasisForRetention ?? null,
        trigger: task.trigger,
        state: task.state,
        evaluatedAt: task.evaluatedAt,
        preErasureNoticeDueAt: task.preErasureNoticeDueAt,
        preErasureNoticeSentAt: task.preErasureNoticeSentAt,
        erasureDueAt: task.erasureDueAt,
        retentionFloorUntil: task.retentionFloorUntil,
        legalHoldId: task.legalHoldId,
        completedAt: task.completedAt,
      };
    });
  }
}
