import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ConsentChannel, ConsentStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import { AuditService } from "../../common/audit/audit.service";
import type { AuditAction } from "../../common/audit/audit-actions";
import { TenantContext } from "../../common/tenant/tenant-context";
import { GuardiansService } from "../children/guardians.service";
import { NoticesService } from "../notices/notices.service";
import { ErasureTaskService } from "../retention/erasure-task.service";

/**
 * The ONLY shape of `ConsentRecord` this service (or a controller behind
 * it) ever returns. `organizationId` deliberately absent -- same
 * discipline as `PURPOSE_PUBLIC_SELECT` / `RECIPIENT_PUBLIC_SELECT`.
 */
export const CONSENT_RECORD_PUBLIC_SELECT = {
  id: true,
  dataPrincipalId: true,
  purposeId: true,
  status: true,
  grantedAt: true,
  withdrawnAt: true,
  deniedAt: true,
  channel: true,
  noticeVersionId: true,
  noticeContentHash: true,
  givenByGuardianId: true,
  consentManagerRef: true,
  evidence: true,
  updatedAt: true,
} satisfies Prisma.ConsentRecordSelect;

export type PublicConsentRecord = Prisma.ConsentRecordGetPayload<{
  select: typeof CONSENT_RECORD_PUBLIC_SELECT;
}>;

/** `listForPrincipal`'s row shape: the record plus enough of its purpose to render a toggle (LB-06: never for a LEGITIMATE_USE purpose). */
export type ConsentRecordWithPurpose = PublicConsentRecord & {
  /** PrivacyNotice shell id used by the consent action; the record stores
   * the immutable NoticeVersion id separately for evidence. */
  noticeId: string | null;
  /** Most recent consent-request delivery for an UNKNOWN/legacy record.
   * This is presentation evidence, not consent evidence until she acts. */
  presentedNoticeId: string | null;
  presentedNoticeVersionId: string | null;
  presentedCampaignId: string | null;
  purpose: { id: string; code: string; name: string };
  events: Array<{
    id: string;
    fromStatus: ConsentStatus | null;
    toStatus: ConsentStatus;
    channel: ConsentChannel;
    noticeVersionId: string | null;
    noticeContentHash: string | null;
    evidence: Prisma.JsonValue;
    actorType: string;
    actorLabel: string;
    createdAt: Date;
  }>;
};

export interface ConsentStatsResponse {
  purposeId: string;
  total: number;
  granted: number;
  denied: number;
  withdrawn: number;
  unknown: number;
}

/** Never a write target: absence of evidence is UNKNOWN forever (Global Constraint 9), and NOT_REQUIRED has no writer -- a ConsentRecord only exists for a CONSENT-basis purpose. */
export type WritableConsentStatus = Extract<
  ConsentStatus,
  "GRANTED" | "DENIED" | "WITHDRAWN"
>;

/** ErasureTask states that mean "still open" -- mirrors `ErasureTaskService`'s own `TERMINAL_STATES` (ERASED, CANCELLED); an open CONSENT_WITHDRAWN task for this principal must never be duplicated. */
const OPEN_ERASURE_TASK_STATES = [
  "EVALUATED",
  "NOTICE_SENT",
  "DEFERRED_RETENTION_FLOOR",
  "ON_LEGAL_HOLD",
  "READY_FOR_ERASURE",
] as const;

export interface ApplyStatusChangeInput {
  dataPrincipalId: string;
  purposeId: string;
  targetStatus: WritableConsentStatus;
  channel: ConsentChannel;
  noticeId?: string;
  presentedNoticeVersionId?: string;
  givenByGuardianId?: string;
  ip?: string;
  userAgent?: string;
  evidenceExtra?: { campaignId?: string; sessionRef?: string };
  auditAction: AuditAction;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

@Injectable()
export class ConsentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly guardiansService: GuardiansService,
    private readonly noticesService: NoticesService,
    private readonly erasureTaskService: ErasureTaskService,
  ) {}

  /**
   * `GET /api/principals/:id/consents` and `GET /api/me/consents`
   * (self-service reads its own `dataPrincipalId`, never a parameter).
   * Every row's `purposeId` names a `CONSENT`-basis purpose -- a
   * `ConsentRecord` is never written for a `LEGITIMATE_USE` purpose in
   * the first place (LB-06, Check 11), and this method defensively
   * re-filters on `lawfulBasis` regardless, so a purpose whose basis
   * later changed can never leak a stale toggle here.
   */
  async listForPrincipal(
    dataPrincipalId: string,
  ): Promise<ConsentRecordWithPurpose[]> {
    const records = await this.prisma.scoped.consentRecord.findMany({
      where: { dataPrincipalId },
      select: CONSENT_RECORD_PUBLIC_SELECT,
      orderBy: { updatedAt: "desc" },
    });
    if (records.length === 0) {
      return [];
    }
    const purposeIds = [...new Set(records.map((r) => r.purposeId))];
    const noticeVersionIds = [
      ...new Set(
        records
          .map((record) => record.noticeVersionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const [purposes, events, noticeVersions, presentedDeliveries] = await Promise.all([
      this.prisma.scoped.processingPurpose.findMany({
        where: { id: { in: purposeIds }, lawfulBasis: "CONSENT" },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.scoped.consentEvent.findMany({
        where: { consentRecordId: { in: records.map((record) => record.id) } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          consentRecordId: true,
          fromStatus: true,
          toStatus: true,
          channel: true,
          noticeVersionId: true,
          noticeContentHash: true,
          evidence: true,
          actorType: true,
          actorLabel: true,
          createdAt: true,
        },
      }),
      noticeVersionIds.length
        ? this.prisma.scoped.noticeVersion.findMany({
            where: { id: { in: noticeVersionIds }, publishedAt: { not: null } },
            select: { id: true, noticeId: true },
          })
        : Promise.resolve([] as Array<{ id: string; noticeId: string }>),
      this.prisma.scoped.campaignRecipient.findMany({
        where: {
          dataPrincipalId,
          status: "DELIVERED",
          campaign: {
            category: "CONSENT_REQUEST",
            purposeId: { in: purposeIds },
            noticeVersionId: { not: null },
          },
        },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        select: {
          campaignId: true,
          campaign: {
            select: {
              purposeId: true,
              noticeVersionId: true,
            },
          },
        },
      }),
    ]);
    const purposeById = new Map(purposes.map((p) => [p.id, p]));
    const noticeIdByVersion = new Map(
      noticeVersions.map((version) => [version.id, version.noticeId]),
    );
    const presentedVersionIds = [
      ...new Set(
        presentedDeliveries
          .map((delivery) => delivery.campaign.noticeVersionId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const presentedVersions = presentedVersionIds.length
      ? await this.prisma.scoped.noticeVersion.findMany({
          where: { id: { in: presentedVersionIds }, publishedAt: { not: null } },
          select: { id: true, noticeId: true },
        })
      : [];
    const presentedNoticeIdByVersion = new Map(
      presentedVersions.map((version) => [version.id, version.noticeId]),
    );
    const presentationByPurpose = new Map<
      string,
      { campaignId: string; noticeVersionId: string; noticeId: string }
    >();
    for (const delivery of presentedDeliveries) {
      const { purposeId, noticeVersionId } = delivery.campaign;
      if (!purposeId || !noticeVersionId || presentationByPurpose.has(purposeId)) continue;
      const presentedNoticeId = presentedNoticeIdByVersion.get(noticeVersionId);
      if (!presentedNoticeId) continue;
      presentationByPurpose.set(purposeId, {
        campaignId: delivery.campaignId,
        noticeVersionId,
        noticeId: presentedNoticeId,
      });
    }
    const eventsByRecord = new Map<string, typeof events>();
    for (const event of events) {
      const history = eventsByRecord.get(event.consentRecordId) ?? [];
      history.push(event);
      eventsByRecord.set(event.consentRecordId, history);
    }
    return records
      .filter((r) => purposeById.has(r.purposeId))
      .map((r) => {
        const presentation = presentationByPurpose.get(r.purposeId);
        return {
          ...r,
          noticeId: r.noticeVersionId
            ? (noticeIdByVersion.get(r.noticeVersionId) ?? null)
            : null,
          presentedNoticeId: presentation?.noticeId ?? null,
          presentedNoticeVersionId: presentation?.noticeVersionId ?? null,
          presentedCampaignId: presentation?.campaignId ?? null,
          purpose: purposeById.get(r.purposeId)!,
          events: eventsByRecord.get(r.id) ?? [],
        };
      });
  }

  /**
   * `GET /api/purposes/:id/consent-stats`. Throws `BadRequestException`
   * for a `LEGITIMATE_USE` purpose -- there is no consent population to
   * report stats on (LB-06).
   */
  async getConsentStats(purposeId: string): Promise<ConsentStatsResponse> {
    const purpose = await this.prisma.scoped.processingPurpose.findFirst({
      where: { id: purposeId },
      select: { id: true, lawfulBasis: true },
    });
    if (!purpose) {
      throw new NotFoundException(
        `Processing purpose "${purposeId}" not found.`,
      );
    }
    if (purpose.lawfulBasis !== "CONSENT") {
      throw new BadRequestException(
        `Processing purpose "${purposeId}" has lawfulBasis ` +
          `${purpose.lawfulBasis}, not CONSENT -- it has no consent ` +
          "records and no consent-stats to report (LB-06).",
      );
    }
    const grouped = await this.prisma.scoped.consentRecord.groupBy({
      by: ["status"],
      where: { purposeId },
      _count: { _all: true },
    });
    const countOf = (status: ConsentStatus): number =>
      grouped.find((g) => g.status === status)?._count._all ?? 0;
    const granted = countOf("GRANTED");
    const denied = countOf("DENIED");
    const withdrawn = countOf("WITHDRAWN");
    const unknown = countOf("UNKNOWN");
    return {
      purposeId,
      total: granted + denied + withdrawn + unknown,
      granted,
      denied,
      withdrawn,
      unknown,
    };
  }

  /**
   * `POST /api/principals/:id/consents/:purposeId` (imported consent) --
   * an employee recording a decision that happened elsewhere. Always
   * audited as `CONSENT_IMPORTED`, regardless of `dto.status`.
   */
  async recordImportedConsent(
    dataPrincipalId: string,
    purposeId: string,
    input: {
      status: WritableConsentStatus;
      channel: ConsentChannel;
      noticeId?: string;
      givenByGuardianId?: string;
      evidence?: { campaignId?: string; sessionRef?: string };
    },
    meta: { ip?: string; userAgent?: string },
  ): Promise<PublicConsentRecord> {
    return this.applyStatusChange({
      dataPrincipalId,
      purposeId,
      targetStatus: input.status,
      channel: input.channel,
      noticeId: input.noticeId,
      givenByGuardianId: input.givenByGuardianId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      evidenceExtra: input.evidence,
      auditAction: "CONSENT_IMPORTED",
    });
  }

  /**
   * `POST /api/me/consents/:purposeId`. `channel` is always `PORTAL` --
   * the caller (`MeConsentsController`) never accepts one from the
   * client. Audited as `CONSENT_GRANTED` / `CONSENT_DENIED` /
   * `CONSENT_WITHDRAWN` per `input.status`.
   */
  async setMyConsentStatus(
    dataPrincipalId: string,
    purposeId: string,
    input: {
      status: WritableConsentStatus;
      noticeId?: string;
      givenByGuardianId?: string;
      evidence?: { campaignId?: string; sessionRef?: string };
    },
    meta: { ip?: string; userAgent?: string },
  ): Promise<PublicConsentRecord> {
    const auditAction: AuditAction =
      input.status === "GRANTED"
        ? "CONSENT_GRANTED"
        : input.status === "DENIED"
          ? "CONSENT_DENIED"
          : "CONSENT_WITHDRAWN";
    let presentedNoticeVersionId: string | undefined;
    if (input.status !== "WITHDRAWN" && input.evidence?.campaignId) {
      const delivery = await this.prisma.scoped.campaignRecipient.findFirst({
        where: {
          campaignId: input.evidence.campaignId,
          dataPrincipalId,
          status: "DELIVERED",
          campaign: {
            category: "CONSENT_REQUEST",
            purposeId,
            noticeVersionId: { not: null },
          },
        },
        select: { campaign: { select: { noticeVersionId: true } } },
      });
      presentedNoticeVersionId = delivery?.campaign.noticeVersionId ?? undefined;
      if (!presentedNoticeVersionId) {
        throw new BadRequestException(
          "The consent-request campaign is not evidenced as delivered to this principal for this purpose.",
        );
      }
    }
    return this.applyStatusChange({
      dataPrincipalId,
      purposeId,
      targetStatus: input.status,
      channel: "PORTAL",
      noticeId: input.noticeId,
      presentedNoticeVersionId,
      givenByGuardianId: input.givenByGuardianId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      evidenceExtra: input.evidence,
      auditAction,
    });
  }

  /**
   * PUBLISHED INTERFACE (see task-10-report.md "Interfaces published"):
   * the `CONSENT_REQUEST`/`MARKETING` audience compiler's read of consent
   * state. Returns `null` when no `ConsentRecord` row exists yet (never
   * treated as GRANTED). Throws `BadRequestException` for a
   * `LEGITIMATE_USE` purpose -- LB-06/Check 11: such a purpose must never
   * be consulted by a consent audience filter at all, so a caller asking
   * anyway is a bug at the call site, not a silent `null`.
   */
  async getConsentStatus(
    dataPrincipalId: string,
    purposeId: string,
  ): Promise<ConsentStatus | null> {
    await this.assertConsentPurpose(purposeId);
    const record = await this.prisma.scoped.consentRecord.findFirst({
      where: { dataPrincipalId, purposeId },
      select: { status: true },
    });
    return record?.status ?? null;
  }

  /**
   * PUBLISHED INTERFACE: every `dataPrincipalId` with `status: GRANTED`
   * for `purposeId`, for an audience compiler to intersect with its
   * other filters. Withdrawal's suppression of a purpose in future
   * audiences (spec line 646) falls out of this structurally -- a
   * `WITHDRAWN` (or `DENIED`/`UNKNOWN`) record is never returned here,
   * no separate suppression flag exists or is needed.
   */
  async findGrantedPrincipalIds(purposeId: string): Promise<string[]> {
    await this.assertConsentPurpose(purposeId);
    const records = await this.prisma.scoped.consentRecord.findMany({
      where: { purposeId, status: "GRANTED" },
      select: { dataPrincipalId: true },
    });
    return records.map((r) => r.dataPrincipalId);
  }

  private async assertConsentPurpose(purposeId: string): Promise<void> {
    const purpose = await this.prisma.scoped.processingPurpose.findFirst({
      where: { id: purposeId },
      select: { lawfulBasis: true },
    });
    if (!purpose) {
      throw new NotFoundException(
        `Processing purpose "${purposeId}" not found.`,
      );
    }
    if (purpose.lawfulBasis !== "CONSENT") {
      throw new BadRequestException(
        `Processing purpose "${purposeId}" has lawfulBasis ` +
          `${purpose.lawfulBasis}, not CONSENT -- it never renders a ` +
          "consent toggle and must never appear in a consent audience " +
          "filter (LB-06).",
      );
    }
  }

  /**
   * The single writer of `ConsentRecord`/`ConsentEvent` rows for a live
   * status change (backfill's UNKNOWN rows are written by
   * `ConsentBackfillService` instead, which never calls this -- it never
   * writes DENIED/GRANTED/WITHDRAWN, only the UNKNOWN default).
   *
   * One transaction: (1) validate the purpose is CONSENT-basis (LB-06),
   * (2) for `targetStatus: GRANTED`, `GuardiansService
   * .assertGuardianConsentEligible` (Rule 10 -- never reimplemented
   * here), (3) resolve the notice version + content hash to freeze onto
   * this write (CN-09; required for GRANTED/DENIED, reused from the
   * existing record for WITHDRAWN when `noticeId` is omitted), (4) write
   * the `ConsentRecord` status (idempotent no-op for a WITHDRAWN target
   * when already WITHDRAWN -- Check: withdrawing twice creates no second
   * ConsentEvent and no second ErasureTask), (5) append the
   * `ConsentEvent`, (6) audit, (7) for a REAL transition into WITHDRAWN,
   * `ErasureTaskService.createFromTrigger` -- deduplicated against any
   * already-open CONSENT_WITHDRAWN task for this principal, since that
   * service does not deduplicate itself (its own documented contract).
   */
  private async applyStatusChange(
    input: ApplyStatusChangeInput,
  ): Promise<PublicConsentRecord> {
    const {
      dataPrincipalId,
      purposeId,
      targetStatus,
      channel,
      noticeId,
      presentedNoticeVersionId,
      givenByGuardianId,
      ip,
      userAgent,
      evidenceExtra,
      auditAction,
    } = input;

    return this.prisma.scoped.$transaction(async (tx) => {
      const principal = await tx.dataPrincipal.findFirst({
        where: { id: dataPrincipalId },
        select: { id: true },
      });
      if (!principal) {
        throw new NotFoundException(
          `Data principal "${dataPrincipalId}" not found.`,
        );
      }

      const purpose = await tx.processingPurpose.findFirst({
        where: { id: purposeId },
        select: { lawfulBasis: true },
      });
      if (!purpose) {
        throw new NotFoundException(
          `Processing purpose "${purposeId}" not found.`,
        );
      }
      if (purpose.lawfulBasis !== "CONSENT") {
        throw new BadRequestException(
          `Processing purpose "${purposeId}" has lawfulBasis ` +
            `${purpose.lawfulBasis}, not CONSENT -- it never renders a ` +
            "consent toggle and can never carry a ConsentRecord (LB-06).",
        );
      }

      if (targetStatus === "GRANTED") {
        // Rule 10 -- the ONE call site permitted to enforce this; never
        // reimplemented locally.
        await this.guardiansService.assertGuardianConsentEligible(
          dataPrincipalId,
          givenByGuardianId,
          tx,
        );
      }

      const existing = await this.getOrCreateRecord(
        tx,
        dataPrincipalId,
        purposeId,
      );

      // CN-09: resolve the notice version + content hash to freeze onto
      // this write. Required for GRANTED/DENIED (NT-01: she must have
      // been shown something before deciding). WITHDRAWN reuses the
      // record's existing reference when no fresh noticeId is supplied
      // -- a withdrawal is not a fresh "what did she see" moment, it is
      // taking back what she already saw and agreed to.
      let noticeVersionId: string | null = existing.noticeVersionId;
      let noticeContentHash: string | null = existing.noticeContentHash;
      if (presentedNoticeVersionId) {
        const presented = await tx.noticeVersion.findFirst({
          where: {
            id: presentedNoticeVersionId,
            publishedAt: { not: null },
            ...(noticeId ? { noticeId } : {}),
          },
          select: { id: true, contentHash: true },
        });
        if (!presented) {
          throw new BadRequestException(
            "The delivered consent request does not match the submitted published notice.",
          );
        }
        noticeVersionId = presented.id;
        noticeContentHash = presented.contentHash;
      } else if (noticeId) {
        const published =
          await this.noticesService.getPublishedVersion(noticeId);
        if (!published) {
          throw new BadRequestException(
            `Notice "${noticeId}" has no currently published version -- ` +
              "cannot record consent evidence against it (NT-01).",
          );
        }
        noticeVersionId = published.noticeVersionId;
        noticeContentHash = published.contentHash;
      } else if (targetStatus !== "WITHDRAWN") {
        throw new BadRequestException(
          "noticeId is required to record a GRANTED or DENIED consent " +
            "-- CN-09 requires every such event to freeze the exact " +
            "notice content hash she was shown.",
        );
      }

      const evidence = {
        ...(ip ? { ip } : {}),
        ...(userAgent ? { userAgent } : {}),
        ...(evidenceExtra ?? {}),
      };

      const { actorType, actorLabel } = TenantContext.get();
      const now = new Date();

      if (targetStatus === "WITHDRAWN") {
        // Idempotency guard: only proceed if this is a REAL transition.
        // `updateMany`'s WHERE clause makes "already WITHDRAWN" atomic --
        // no separate read-then-write race window.
        const result = await tx.consentRecord.updateMany({
          where: { id: existing.id, status: { not: "WITHDRAWN" } },
          data: {
            status: "WITHDRAWN",
            withdrawnAt: now,
            channel,
            noticeVersionId,
            noticeContentHash,
            evidence,
          },
        });
        if (result.count === 0) {
          // Already withdrawn -- one action, idempotent no-op. No new
          // ConsentEvent, no second ErasureTask.
          const current = await tx.consentRecord.findFirstOrThrow({
            where: { id: existing.id },
            select: CONSENT_RECORD_PUBLIC_SELECT,
          });
          return current;
        }

        await tx.consentEvent.create({
          data: {
            consentRecordId: existing.id,
            fromStatus: existing.status,
            toStatus: "WITHDRAWN",
            channel,
            noticeVersionId,
            noticeContentHash,
            evidence,
            actorType,
            actorLabel,
          } as never,
        });

        await this.auditService.record(tx, {
          action: auditAction,
          resourceType: "ConsentRecord",
          resourceId: existing.id,
          subjectPrincipalId: dataPrincipalId,
          metadata: {
            purposeId,
            fromStatus: existing.status,
            toStatus: "WITHDRAWN",
            channel,
          },
          ipAddress: ip,
          userAgent,
        });

        // CN-05/spec line 646: dedupe against any already-open
        // CONSENT_WITHDRAWN erasure task for this principal --
        // `ErasureTaskService.createFromTrigger` explicitly does not do
        // this itself.
        const openTask = await tx.erasureTask.findFirst({
          where: {
            dataPrincipalId,
            trigger: "CONSENT_WITHDRAWN",
            state: { in: [...OPEN_ERASURE_TASK_STATES] },
          },
          select: { id: true },
        });
        if (!openTask) {
          await this.erasureTaskService.createFromTrigger(tx, {
            trigger: "CONSENT_WITHDRAWN",
            dataPrincipalId,
          });
        }
      } else {
        // GRANTED / DENIED -- always a fresh, logged decision; no
        // idempotency guard (she is always allowed to change her mind
        // again and have it recorded).
        await tx.consentRecord.update({
          where: { id: existing.id },
          data: {
            status: targetStatus,
            grantedAt: targetStatus === "GRANTED" ? now : existing.grantedAt,
            deniedAt: targetStatus === "DENIED" ? now : existing.deniedAt,
            channel,
            noticeVersionId,
            noticeContentHash,
            givenByGuardianId: givenByGuardianId ?? existing.givenByGuardianId,
            evidence,
          },
        });

        await tx.consentEvent.create({
          data: {
            consentRecordId: existing.id,
            fromStatus: existing.status,
            toStatus: targetStatus,
            channel,
            noticeVersionId,
            noticeContentHash,
            evidence,
            actorType,
            actorLabel,
          } as never,
        });

        await this.auditService.record(tx, {
          action: auditAction,
          resourceType: "ConsentRecord",
          resourceId: existing.id,
          subjectPrincipalId: dataPrincipalId,
          metadata: {
            purposeId,
            fromStatus: existing.status,
            toStatus: targetStatus,
            channel,
          },
          ipAddress: ip,
          userAgent,
        });
      }

      return tx.consentRecord.findFirstOrThrow({
        where: { id: existing.id },
        select: CONSENT_RECORD_PUBLIC_SELECT,
      });
    });
  }

  /**
   * Finds the (dataPrincipalId, purposeId) ConsentRecord row, or creates
   * it at its schema default (`status: UNKNOWN`) if `ConsentBackfillService`
   * has not yet caught up (e.g. a purpose or principal created between
   * backfill sweeps). `organizationId` deliberately omitted from `create`
   * -- the tenant extension injects it.
   */
  private async getOrCreateRecord(
    tx: ScopedTransactionClient,
    dataPrincipalId: string,
    purposeId: string,
  ): Promise<PublicConsentRecord> {
    const existing = await tx.consentRecord.findFirst({
      where: { dataPrincipalId, purposeId },
      select: CONSENT_RECORD_PUBLIC_SELECT,
    });
    if (existing) {
      return existing;
    }
    try {
      return await tx.consentRecord.create({
        data: { dataPrincipalId, purposeId } as never,
        select: CONSENT_RECORD_PUBLIC_SELECT,
      });
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        // Lost a create race against a concurrent backfill/import --
        // the row exists now, read it back.
        return tx.consentRecord.findFirstOrThrow({
          where: { dataPrincipalId, purposeId },
          select: CONSENT_RECORD_PUBLIC_SELECT,
        });
      }
      throw err;
    }
  }
}
