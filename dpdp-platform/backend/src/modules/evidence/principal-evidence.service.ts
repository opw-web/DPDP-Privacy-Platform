import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ActorType,
  AgeStatus,
  BreachStatus,
  ConsentChannel,
  ConsentStatus,
  DeliveryChannel,
  DeliveryStatus,
  MessageCategory,
  RequestStatus,
  RequestType,
} from "@prisma/client";
import { AccessLogService } from "../../common/audit/access-log.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { splitNonDisclosureRequests } from "./non-disclosure";
import type { PublicInformationRequest } from "./non-disclosure";

export interface EvidenceConsentEvent {
  purposeId: string;
  purposeCode: string | null;
  purposeName: string | null;
  fromStatus: ConsentStatus | null;
  toStatus: ConsentStatus;
  channel: ConsentChannel;
  noticeVersionId: string | null;
  noticeContentHash: string | null;
  actorType: ActorType;
  actorLabel: string;
  createdAt: Date;
}

export interface EvidenceNoticeVersionShown {
  noticeVersionId: string;
  noticeCode: string | null;
  noticeName: string | null;
  version: number | null;
  contentHash: string | null;
  publishedAt: Date | null;
}

export interface EvidenceRequestEvent {
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus | null;
  actorType: ActorType;
  actorLabel: string;
  note: string | null;
  visibleToPrincipal: boolean;
  createdAt: Date;
}

export interface EvidenceRequest {
  id: string;
  reference: string;
  type: RequestType;
  status: RequestStatus;
  submittedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  outcomeCode: string | null;
  outcome: string | null;
  rejectionReason: string | null;
  events: EvidenceRequestEvent[];
}

export interface EvidenceMessageReceived {
  campaignReference: string;
  campaignName: string;
  category: MessageCategory;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  suppressReason: string | null;
  renderedSubject: string | null;
  sentAt: Date | null;
}

export interface EvidenceBreachInclusion {
  breachReference: string;
  breachTitle: string;
  breachStatus: BreachStatus;
  becameAwareAt: Date;
  notifiedAt: Date | null;
  notificationChannel: DeliveryChannel | null;
}

export interface PrincipalEvidenceFile {
  principal: {
    id: string;
    reference: string;
    displayName: string | null;
    ageStatus: AgeStatus;
  };
  organizationName: string;
  generatedAt: Date;
  /** EV-03: "every consent event". */
  consentEvents: EvidenceConsentEvent[];
  /** EV-03: "notice version shown" -- every distinct NoticeVersion any of her consent events/records reference. */
  noticeVersionsShown: EvidenceNoticeVersionShown[];
  /** EV-03: "request". */
  requests: EvidenceRequest[];
  /** EV-03: "message received". */
  messagesReceived: EvidenceMessageReceived[];
  /** EV-03: "breach inclusion". */
  breachInclusions: EvidenceBreachInclusion[];
  /** BD-04: Board/Government requests naming her, non-disclosure-filtered (never leaked here). */
  governmentRequests: PublicInformationRequest[];
  suppressedRequestCount: number;
}

/**
 * EV-03: "Per-person evidence file -- every consent event, notice
 * version shown, request, message received, breach inclusion" (checklist
 * line ~301). Unlike `AccessReportService` (the principal-FACING s.11
 * summary, five sections), this is the internal, complete evidentiary
 * trail an auditor or Board inquiry would need for one person -- raw
 * events, not a summarised current-status view.
 *
 * Every section is a small, bounded number of batched queries (Check
 * 36): one query per entity type, keyed by ids collected from the
 * principal's own rows, never a loop issuing one query per event.
 *
 * BD-04 non-disclosure exclusion applies here exactly as it does to the
 * access report -- `splitNonDisclosureRequests` is the one shared
 * implementation (see `non-disclosure.ts`'s doc comment).
 */
@Injectable()
export class PrincipalEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly accessLogService: AccessLogService,
  ) {}

  async buildEvidenceFile(dataPrincipalId: string): Promise<PrincipalEvidenceFile> {
    const principal = await this.prisma.scoped.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true, reference: true, displayName: true, ageStatus: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dataPrincipalId}" not found.`,
      );
    }

    const [
      organization,
      consentRecords,
      requests,
      campaignRecipients,
      breachAffected,
    ] = await Promise.all([
      this.prisma.scoped.organization.findFirstOrThrow({ select: { name: true } }),
      this.prisma.scoped.consentRecord.findMany({
        where: { dataPrincipalId },
        select: { id: true, purposeId: true },
      }),
      this.prisma.scoped.principalRequest.findMany({
        where: { dataPrincipalId },
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          submittedAt: true,
          dueAt: true,
          completedAt: true,
          outcomeCode: true,
          outcome: true,
          rejectionReason: true,
        },
      }),
      this.prisma.scoped.campaignRecipient.findMany({
        where: { dataPrincipalId },
        orderBy: { id: "asc" },
        select: {
          channel: true,
          status: true,
          suppressReason: true,
          renderedSubject: true,
          sentAt: true,
          campaign: {
            select: { reference: true, name: true, category: true },
          },
        },
      }),
      this.prisma.scoped.breachAffectedPrincipal.findMany({
        where: { dataPrincipalId },
        orderBy: { addedAt: "asc" },
        select: {
          notifiedAt: true,
          notificationChannel: true,
          breach: {
            select: {
              reference: true,
              title: true,
              status: true,
              becameAwareAt: true,
            },
          },
        },
      }),
    ]);

    const consentRecordIds = consentRecords.map((record) => record.id);
    const purposeIds = [...new Set(consentRecords.map((record) => record.purposeId))];
    const requestIds = requests.map((request) => request.id);

    const [events, purposes, requestEvents] = await Promise.all([
      consentRecordIds.length
        ? this.prisma.scoped.consentEvent.findMany({
            where: { consentRecordId: { in: consentRecordIds } },
            orderBy: { createdAt: "asc" },
            select: {
              consentRecordId: true,
              fromStatus: true,
              toStatus: true,
              channel: true,
              noticeVersionId: true,
              noticeContentHash: true,
              actorType: true,
              actorLabel: true,
              createdAt: true,
            },
          })
        : [],
      purposeIds.length
        ? this.prisma.scoped.processingPurpose.findMany({
            where: { id: { in: purposeIds } },
            select: { id: true, code: true, name: true },
          })
        : [],
      requestIds.length
        ? this.prisma.scoped.requestEvent.findMany({
            where: { requestId: { in: requestIds } },
            orderBy: { createdAt: "asc" },
            select: {
              requestId: true,
              fromStatus: true,
              toStatus: true,
              actorType: true,
              actorLabel: true,
              note: true,
              visibleToPrincipal: true,
              createdAt: true,
            },
          })
        : [],
    ]);

    const purposeById = new Map(purposes.map((purpose) => [purpose.id, purpose]));
    const recordPurposeById = new Map(
      consentRecords.map((record) => [record.id, record.purposeId]),
    );

    const consentEvents: EvidenceConsentEvent[] = events.map((event) => {
      const purposeId = recordPurposeById.get(event.consentRecordId) ?? "";
      const purpose = purposeById.get(purposeId);
      return {
        purposeId,
        purposeCode: purpose?.code ?? null,
        purposeName: purpose?.name ?? null,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        channel: event.channel,
        noticeVersionId: event.noticeVersionId,
        noticeContentHash: event.noticeContentHash,
        actorType: event.actorType,
        actorLabel: event.actorLabel,
        createdAt: event.createdAt,
      };
    });

    const noticeVersionIds = [
      ...new Set(
        events
          .map((event) => event.noticeVersionId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const noticeVersions = noticeVersionIds.length
      ? await this.prisma.scoped.noticeVersion.findMany({
          where: { id: { in: noticeVersionIds } },
          select: {
            id: true,
            version: true,
            contentHash: true,
            publishedAt: true,
            notice: { select: { code: true, name: true } },
          },
        })
      : [];
    const noticeVersionsShown: EvidenceNoticeVersionShown[] = noticeVersions.map(
      (version) => ({
        noticeVersionId: version.id,
        noticeCode: version.notice?.code ?? null,
        noticeName: version.notice?.name ?? null,
        version: version.version,
        contentHash: version.contentHash,
        publishedAt: version.publishedAt,
      }),
    );

    const requestEventsByRequest = new Map<string, EvidenceRequestEvent[]>();
    for (const event of requestEvents) {
      const list = requestEventsByRequest.get(event.requestId) ?? [];
      list.push({
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorType: event.actorType,
        actorLabel: event.actorLabel,
        note: event.note,
        visibleToPrincipal: event.visibleToPrincipal,
        createdAt: event.createdAt,
      });
      requestEventsByRequest.set(event.requestId, list);
    }
    const requestsOut: EvidenceRequest[] = requests.map((request) => ({
      id: request.id,
      reference: request.reference,
      type: request.type,
      status: request.status,
      submittedAt: request.submittedAt,
      dueAt: request.dueAt,
      completedAt: request.completedAt,
      outcomeCode: request.outcomeCode,
      outcome: request.outcome,
      rejectionReason: request.rejectionReason,
      events: requestEventsByRequest.get(request.id) ?? [],
    }));

    const messagesReceived: EvidenceMessageReceived[] = campaignRecipients.map(
      (recipient) => ({
        campaignReference: recipient.campaign.reference,
        campaignName: recipient.campaign.name,
        category: recipient.campaign.category,
        channel: recipient.channel,
        status: recipient.status,
        suppressReason: recipient.suppressReason,
        renderedSubject: recipient.renderedSubject,
        sentAt: recipient.sentAt,
      }),
    );

    const breachInclusions: EvidenceBreachInclusion[] = breachAffected.map((row) => ({
      breachReference: row.breach.reference,
      breachTitle: row.breach.title,
      breachStatus: row.breach.status,
      becameAwareAt: row.breach.becameAwareAt,
      notifiedAt: row.notifiedAt,
      notificationChannel: row.notificationChannel,
    }));

    return this.prisma.scoped.$transaction(async (tx) => {
      const { visible: governmentRequests, suppressedCount } =
        await splitNonDisclosureRequests(
          tx,
          this.auditService,
          dataPrincipalId,
          "EVIDENCE_FILE",
        );

      // This evidence file embeds this principal's full personal-data
      // trail -- see AccessLogService's doc comment on evidence exports.
      await this.accessLogService.recordPersonalDataViewed(tx, {
        subjectPrincipalId: dataPrincipalId,
        resourceType: "DataPrincipal",
        resourceId: dataPrincipalId,
        context: { view: "evidence-file" },
      });

      await this.auditService.record(tx, {
        action: "EVIDENCE_EXPORTED",
        resourceType: "DataPrincipal",
        resourceId: dataPrincipalId,
        subjectPrincipalId: dataPrincipalId,
        metadata: {
          exportType: "PRINCIPAL_EVIDENCE_FILE",
          consentEventCount: consentEvents.length,
          requestCount: requestsOut.length,
          messageCount: messagesReceived.length,
          breachInclusionCount: breachInclusions.length,
          suppressedRequestCount: suppressedCount,
        },
      });

      return {
        principal,
        organizationName: organization.name,
        generatedAt: new Date(),
        consentEvents,
        noticeVersionsShown,
        requests: requestsOut,
        messagesReceived,
        breachInclusions,
        governmentRequests,
        suppressedRequestCount: suppressedCount,
      };
    });
  }
}
