import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, BreachStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import { ReferenceService } from "../../common/reference/reference.service";
import { ComplianceService } from "../compliance/compliance.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { compileAudience } from "../messaging/audience/compile-audience";
import { AudienceFilterError } from "../messaging/audience/audience-filter.error";
import { NotificationsService } from "../notifications/notifications.service";
import { CampaignsService } from "../messaging/campaigns/campaigns.service";
import { BreachPrincipalNoticeDispatchQueueService } from "../../queues/breach-principal-notice-dispatch.queue";
import { CreateBreachDto } from "./dto/create-breach.dto";
import { UpdateBreachDto } from "./dto/update-breach.dto";
import { AffectedPrincipalsDto } from "./dto/affected-principals.dto";
import { CompleteObligationDto } from "./dto/complete-obligation.dto";
import { ExtensionDto } from "./dto/extension.dto";
import type { AffectedPreview, PublicBreach } from "./breach.types";
const BREACH_RULES = [
  { code: "PRINCIPAL_NOTICE", appliesTo: "BREACH:PRINCIPAL_NOTICE" },
  { code: "BOARD_INITIAL", appliesTo: "BREACH:BOARD_INITIAL" },
  { code: "BOARD_DETAIL", appliesTo: "BREACH:BOARD_DETAIL" },
  { code: "CERT_IN_INCIDENT", appliesTo: "BREACH:CERT_IN_INCIDENT" },
] as const;

const TRANSITIONS: Record<BreachStatus, readonly BreachStatus[]> = {
  DETECTED: ["INVESTIGATING", "CONTAINED"],
  INVESTIGATING: ["CONTAINED", "DETECTED"],
  CONTAINED: ["PRINCIPALS_NOTIFIED", "INVESTIGATING"],
  PRINCIPALS_NOTIFIED: ["BOARD_NOTIFIED", "CONTAINED"],
  BOARD_NOTIFIED: ["CLOSED", "PRINCIPALS_NOTIFIED"],
  CLOSED: [],
};

const BREACH_PUBLIC_SELECT = {
  id: true,
  reference: true,
  title: true,
  description: true,
  occurredAt: true,
  becameAwareAt: true,
  discoveredByEmployeeId: true,
  affectedSourceIds: true,
  dataCategories: true,
  involvesChildren: true,
  natureExtentTiming: true,
  consequences: true,
  mitigationMeasures: true,
  safetyMeasuresForPrincipals: true,
  responderContact: true,
  boardBroadFacts: true,
  boardMitigation: true,
  boardPerpetratorFindings: true,
  boardRemedialMeasures: true,
  boardExtensionRequestedAt: true,
  boardExtensionGrantedUntil: true,
  boardExtensionReference: true,
  status: true,
  closedAt: true,
  closureNote: true,
  createdAt: true,
  updatedAt: true,
  obligations: {
    orderBy: { dueAt: "asc" as const },
    select: {
      id: true,
      code: true,
      ruleCodeSnapshot: true,
      ruleVersionSnapshot: true,
      legalSourceSnapshot: true,
      basisSnapshot: true,
      dueAt: true,
      originalDueAt: true,
      warningAt: true,
      status: true,
      completedAt: true,
      completedByEmployeeId: true,
      evidenceReference: true,
      waiverReason: true,
    },
  },
  affected: {
    orderBy: { addedAt: "asc" as const },
    select: {
      id: true,
      dataPrincipalId: true,
      notifiedAt: true,
      notificationChannel: true,
      campaignRecipientId: true,
      addedAt: true,
    },
  },
} satisfies Prisma.BreachIncidentSelect;

export interface BoardBreachReport {
  breach: PublicBreach;
  organizationName: string;
  generatedAt: Date;
  affectedCount: number;
  obligations: PublicBreach["obligations"];
  deliveryStatusCounts: Record<string, number>;
}

function asDate(value: string | Date | undefined, field: string): Date {
  const date = value instanceof Date ? value : new Date(value ?? "");
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`${field} must be a valid ISO-8601 date.`);
  return date;
}

function parseIds(dto: AffectedPrincipalsDto): string[] {
  const csvIds = (dto.csv ?? "")
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim() ?? "")
    .filter(Boolean)
    .filter(
      (id) =>
        id.toLowerCase() !== "id" &&
        id.toLowerCase() !== "principalid" &&
        id.toLowerCase() !== "dataPrincipalId".toLowerCase(),
    );
  return [...new Set([...(dto.principalIds ?? []), ...csvIds])];
}

@Injectable()
export class BreachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly referenceService: ReferenceService,
    private readonly complianceService: ComplianceService,
    private readonly notificationsService: NotificationsService,
    private readonly campaignsService: CampaignsService,
    private readonly breachPrincipalNoticeDispatchQueue: BreachPrincipalNoticeDispatchQueueService,
  ) {}

  private public(
    row: Prisma.BreachIncidentGetPayload<{
      select: typeof BREACH_PUBLIC_SELECT;
    }>,
  ): PublicBreach {
    return row as unknown as PublicBreach;
  }

  async list(): Promise<PublicBreach[]> {
    const rows = await this.prisma.scoped.breachIncident.findMany({
      orderBy: { createdAt: "desc" },
      select: BREACH_PUBLIC_SELECT,
    });
    return rows.map((row) => this.public(row));
  }

  async get(id: string): Promise<PublicBreach> {
    const row = await this.prisma.scoped.breachIncident.findFirst({
      where: { id },
      select: BREACH_PUBLIC_SELECT,
    });
    if (!row) throw new NotFoundException(`Breach incident "${id}" not found.`);
    return this.public(row);
  }

  private candidateWhere(
    dto: AffectedPrincipalsDto,
  ): Prisma.DataPrincipalWhereInput {
    const clauses: Prisma.DataPrincipalWhereInput[] = [];
    const ids = parseIds(dto);
    if (ids.length) clauses.push({ id: { in: ids } });
    if (dto.audienceFilter) {
      try {
        clauses.push(compileAudience(dto.audienceFilter as never));
      } catch (error) {
        if (error instanceof AudienceFilterError)
          throw new BadRequestException(error.message);
        throw error;
      }
    }
    if (dto.sourceIds?.length)
      clauses.push({
        fields: { some: { sourceIds: { hasSome: dto.sourceIds } } },
      });
    if (clauses.length === 0)
      throw new BadRequestException(
        "Provide principalIds, CSV, audienceFilter or sourceIds to select affected principals.",
      );
    return clauses.length === 1 ? clauses[0]! : { AND: clauses };
  }

  async previewAffected(dto: AffectedPrincipalsDto): Promise<AffectedPreview> {
    const rows = await this.prisma.scoped.dataPrincipal.findMany({
      where: this.candidateWhere(dto),
      select: { id: true, ageStatus: true },
    });
    return {
      count: rows.length,
      principalIds: rows.map((row) => row.id),
      includesChildren: rows.some((row) => row.ageStatus === "CHILD"),
    };
  }

  async create(
    dto: CreateBreachDto,
    actor: AccessTokenPayload,
  ): Promise<PublicBreach> {
    const occurredAt = asDate(dto.occurredAt, "occurredAt");
    const becameAwareAt = asDate(dto.becameAwareAt, "becameAwareAt");
    if (dto.affectedSourceIds.length === 0)
      throw new BadRequestException("affectedSourceIds cannot be empty.");
    const selector: AffectedPrincipalsDto = {
      principalIds: dto.affectedPrincipalIds,
      csv: dto.csv,
      audienceFilter: dto.audienceFilter,
      sourceIds:
        dto.affectedPrincipalIds?.length || dto.csv || dto.audienceFilter
          ? undefined
          : dto.affectedSourceIds,
    };
    const affected =
      dto.affectedPrincipalIds?.length ||
      dto.csv ||
      dto.audienceFilter ||
      dto.affectedSourceIds.length
        ? await this.previewAffected(selector)
        : { count: 0, principalIds: [], includesChildren: false };
    const rules = (
      await Promise.all(
        BREACH_RULES.map(async (entry) => ({
          entry,
          rule: await this.complianceService.resolveRule(
            entry.appliesTo,
            becameAwareAt,
          ),
        })),
      )
    ).filter(
      (item): item is typeof item & { rule: NonNullable<typeof item.rule> } =>
        item.rule !== null,
    );
    const reference = `BR-${(await this.referenceService.next("BREACH")).toString().padStart(6, "0")}`;
    const row = await this.prisma.scoped.$transaction(async (tx) => {
      const created = await tx.breachIncident.create({
        data: {
          reference,
          title: dto.title,
          description: dto.description,
          occurredAt,
          becameAwareAt,
          discoveredByEmployeeId: actor.sub,
          affectedSourceIds: dto.affectedSourceIds,
          dataCategories: dto.dataCategories,
          involvesChildren: affected.includesChildren,
          natureExtentTiming: dto.natureExtentTiming ?? null,
          consequences: dto.consequences ?? null,
          mitigationMeasures: dto.mitigationMeasures ?? null,
          safetyMeasuresForPrincipals: dto.safetyMeasuresForPrincipals ?? null,
          responderContact: dto.responderContact ?? null,
          boardBroadFacts: dto.boardBroadFacts ?? null,
          boardMitigation: dto.boardMitigation ?? null,
          boardPerpetratorFindings: dto.boardPerpetratorFindings ?? null,
          boardRemedialMeasures: dto.boardRemedialMeasures ?? null,
        } as never,
        select: { id: true },
      });
      if (affected.principalIds.length)
        await tx.breachAffectedPrincipal.createMany({
          data: affected.principalIds.map((dataPrincipalId) => ({
            breachId: created.id,
            dataPrincipalId,
          })) as never,
          skipDuplicates: true,
        });
      for (const { entry, rule } of rules) {
        const deadline = this.complianceService.computeDeadline(
          rule,
          becameAwareAt,
        );
        await tx.breachObligation.create({
          data: {
            breachId: created.id,
            code: entry.code,
            ruleCodeSnapshot: rule.ruleCode,
            ruleVersionSnapshot: rule.version,
            legalSourceSnapshot: rule.legalSource,
            basisSnapshot: rule.basis,
            dueAt: deadline.dueAt,
            warningAt: deadline.warningAt,
          } as never,
        });
      }
      await this.auditService.record(tx, {
        action: "BREACH_CREATED",
        resourceType: "BreachIncident",
        resourceId: created.id,
        metadata: {
          reference,
          occurredAt: occurredAt.toISOString(),
          becameAwareAt: becameAwareAt.toISOString(),
          affectedCount: affected.count,
          involvesChildren: affected.includesChildren,
        },
      });
      return tx.breachIncident.findFirstOrThrow({
        where: { id: created.id },
        select: BREACH_PUBLIC_SELECT,
      });
    });
    return this.public(row);
  }

  async addAffected(
    id: string,
    dto: AffectedPrincipalsDto,
    actor: AccessTokenPayload,
  ): Promise<{
    count: number;
    added: number;
    preview: boolean;
    includesChildren: boolean;
    principalIds: string[];
  }> {
    const breach = await this.prisma.scoped.breachIncident.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!breach)
      throw new NotFoundException(`Breach incident "${id}" not found.`);

    const preview = await this.previewAffected(dto);
    if (dto.preview) return { ...preview, added: 0, preview: true };
    const result = await this.prisma.scoped.$transaction(async (tx) => {
      const before = await tx.breachAffectedPrincipal.count({
        where: { breachId: id },
      });
      await tx.breachAffectedPrincipal.createMany({
        data: preview.principalIds.map((dataPrincipalId) => ({
          breachId: id,
          dataPrincipalId,
        })) as never,
        skipDuplicates: true,
      });
      const after = await tx.breachAffectedPrincipal.count({
        where: { breachId: id },
      });
      if (preview.includesChildren)
        await tx.breachIncident.update({
          where: { id },
          data: { involvesChildren: true },
        });
      await this.auditService.record(tx, {
        action: "BREACH_CREATED",
        resourceType: "BreachAffectedPrincipal",
        resourceId: id,
        metadata: { added: after - before, total: after, actor: actor.sub },
      });
      return { after, added: after - before };
    });
    return {
      count: result.after,
      added: result.added,
      preview: false,
      includesChildren: preview.includesChildren,
      principalIds: preview.principalIds,
    };
  }

  async update(
    id: string,
    dto: UpdateBreachDto,
    actor: AccessTokenPayload,
  ): Promise<PublicBreach> {
    const existing = await this.prisma.scoped.breachIncident.findFirst({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing)
      throw new NotFoundException(`Breach incident "${id}" not found.`);
    if (dto.status && dto.status !== existing.status) {
      if (!TRANSITIONS[existing.status].includes(dto.status))
        throw new ConflictException(
          `Breach cannot move from ${existing.status} to ${dto.status}.`,
        );
      if (dto.status === "CLOSED") {
        const obligations = await this.prisma.scoped.breachObligation.findMany({
          where: { breachId: id },
          select: { status: true, waiverReason: true },
        });
        if (
          obligations.some(
            (obligation) =>
              !["DONE", "WAIVED"].includes(obligation.status) ||
              (obligation.status === "WAIVED" &&
                !obligation.waiverReason?.trim()),
          )
        )
          throw new ConflictException(
            "Every obligation must be DONE or WAIVED with a written reason before closing.",
          );
        if (!dto.closureNote?.trim())
          throw new BadRequestException(
            "closureNote is required to close a breach.",
          );
      }
    }
    const data: Prisma.BreachIncidentUpdateInput = {};
    for (const field of [
      "title",
      "description",
      "natureExtentTiming",
      "consequences",
      "mitigationMeasures",
      "safetyMeasuresForPrincipals",
      "responderContact",
      "boardBroadFacts",
      "boardMitigation",
      "boardPerpetratorFindings",
      "boardRemedialMeasures",
      "closureNote",
    ] as const)
      if (dto[field] !== undefined) data[field] = dto[field] as never;
    if (dto.status) data.status = dto.status;
    if (dto.status === "CLOSED")
      data.closedAt = dto.closedAt
        ? asDate(dto.closedAt, "closedAt")
        : new Date();
    const row = await this.prisma.scoped.$transaction(async (tx) => {
      const updated = await tx.breachIncident.update({
        where: { id },
        data,
        select: { id: true },
      });
      await this.auditService.record(tx, {
        action: dto.status === "CLOSED" ? "BREACH_CLOSED" : "BREACH_CREATED",
        resourceType: "BreachIncident",
        resourceId: id,
        metadata: { status: dto.status ?? existing.status, actor: actor.sub },
      });
      return tx.breachIncident.findFirstOrThrow({
        where: { id: updated.id },
        select: BREACH_PUBLIC_SELECT,
      });
    });
    return this.public(row);
  }

  async completeObligation(
    id: string,
    code: string,
    dto: CompleteObligationDto,
    actor: AccessTokenPayload,
  ): Promise<PublicBreach> {
    const obligation = await this.prisma.scoped.breachObligation.findFirst({
      where: { breachId: id, code },
    });
    if (!obligation)
      throw new NotFoundException(
        `Obligation "${code}" not found for breach "${id}".`,
      );
    const status = dto.status ?? "DONE";
    if (status === "WAIVED" && !dto.waiverReason?.trim())
      throw new BadRequestException(
        "A written waiverReason is required when waiving an obligation.",
      );
    if (status === "DONE" && !dto.evidenceReference?.trim())
      throw new BadRequestException(
        "evidenceReference is required when marking an obligation done.",
      );
    await this.prisma.scoped.$transaction(async (tx) => {
      await tx.breachObligation.update({
        where: { id: obligation.id },
        data: {
          status,
          completedAt: new Date(),
          completedByEmployeeId: actor.sub,
          evidenceReference: dto.evidenceReference?.trim() ?? null,
          waiverReason: dto.waiverReason?.trim() ?? null,
        },
      });
      await this.auditService.record(tx, {
        action: "BREACH_OBLIGATION_COMPLETED",
        resourceType: "BreachObligation",
        resourceId: obligation.id,
        metadata: { code, status, actor: actor.sub },
      });
    });
    return this.get(id);
  }

  async recordExtension(
    id: string,
    dto: ExtensionDto,
    actor: AccessTokenPayload,
  ): Promise<PublicBreach> {
    const grantedUntil = asDate(dto.grantedUntil, "grantedUntil");
    const requestedAt = asDate(dto.requestedAt, "requestedAt");
    const detail = await this.prisma.scoped.breachObligation.findFirst({
      where: { breachId: id, code: "BOARD_DETAIL" },
    });
    if (!detail)
      throw new NotFoundException(
        `BOARD_DETAIL obligation not found for breach "${id}".`,
      );
    if (grantedUntil <= detail.dueAt)
      throw new BadRequestException(
        "The granted extension must be later than the original BOARD_DETAIL due date.",
      );
    await this.prisma.scoped.$transaction(async (tx) => {
      await tx.breachIncident.update({
        where: { id },
        data: {
          boardExtensionRequestedAt: requestedAt,
          boardExtensionGrantedUntil: grantedUntil,
          boardExtensionReference: dto.reference,
        },
      });
      // `originalDueAt` is set only the first time this clock is extended.
      // A second (or third) extension must not overwrite it with the
      // previous extended date -- the ORIGINAL stays the original, not the
      // most recent "previous" value.
      const originalDueAt = detail.originalDueAt ?? detail.dueAt;
      await tx.breachObligation.update({
        where: { id: detail.id },
        data: { dueAt: grantedUntil, originalDueAt },
      });
      await this.auditService.record(tx, {
        action: "BREACH_EXTENSION_RECORDED",
        resourceType: "BreachIncident",
        resourceId: id,
        metadata: {
          code: "BOARD_DETAIL",
          originalDueAt: originalDueAt.toISOString(),
          previousDueAt: detail.dueAt.toISOString(),
          grantedUntil: grantedUntil.toISOString(),
          reference: dto.reference,
          actor: actor.sub,
        },
      });
    });
    return this.get(id);
  }

  async notifyPrincipals(
    id: string,
    actor: AccessTokenPayload,
  ): Promise<PublicBreach> {
    const breach = await this.prisma.scoped.breachIncident.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        title: true,
        reference: true,
        affected: { select: { dataPrincipalId: true } },
      },
    });
    if (!breach)
      throw new NotFoundException(`Breach incident "${id}" not found.`);

    // Notification is a legal lifecycle transition, not an independent
    // delivery shortcut. Containment must be recorded before a dispatch intent
    // can be accepted; otherwise DETECTED/INVESTIGATING incidents could skip
    // the required containment step and become PRINCIPALS_NOTIFIED directly.
    // A later call while PRINCIPALS_NOTIFIED is a recovery retry, not a second
    // delivery request (the durable campaign/recipient records deduplicate it).
    if (
      breach.status !== "CONTAINED" &&
      breach.status !== "PRINCIPALS_NOTIFIED"
    ) {
      throw new ConflictException(
        `Principals cannot be notified while breach is ${breach.status}; ` +
          "move it to CONTAINED first.",
      );
    }

    // A breach notice is a compliance campaign, not a second delivery path.
    // The campaign must have been drafted and approved by another employee
    // first (CampaignsService enforces that guard); this endpoint is the
    // breach-facing trigger that starts that approved campaign. Selecting
    // the newest campaign keeps retries deterministic while allowing a DPO
    // to discard an earlier draft and prepare a replacement.
    const campaign = await this.prisma.scoped.messageCampaign.findFirst({
      where: { breachId: id, category: "BREACH_NOTICE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (!campaign) {
      throw new ConflictException(
        "Create and approve a BREACH_NOTICE campaign for this breach before notifying principals.",
      );
    }

    // Persist the lifecycle edge and its immutable audit evidence BEFORE
    // trying to reach Redis or any delivery provider. The state row is a
    // Postgres-backed outbox intent: the dispatcher below (and the five-minute
    // breach-clock reconciliation) can retry it after process/Redis failure.
    // This deliberately does not hold a database transaction across queue or
    // provider I/O.
    if (breach.status === "CONTAINED") {
      await this.prisma.scoped.$transaction(async (tx) => {
        const currentCampaign = await tx.messageCampaign.findFirst({
          where: { id: campaign.id, breachId: id, category: "BREACH_NOTICE" },
          select: { status: true },
        });
        if (!currentCampaign || currentCampaign.status !== "APPROVED") {
          throw new ConflictException(
            "The BREACH_NOTICE campaign must remain APPROVED while principal notification is recorded.",
          );
        }
        const transitioned = await tx.breachIncident.updateMany({
          where: { id, status: "CONTAINED" },
          data: { status: "PRINCIPALS_NOTIFIED" },
        });
        if (transitioned.count !== 1) {
          throw new ConflictException(
            "Breach is no longer CONTAINED; principal notification was not recorded.",
          );
        }
        await this.auditService.record(tx, {
          action: "BREACH_PRINCIPALS_NOTIFIED",
          resourceType: "BreachIncident",
          resourceId: id,
          metadata: {
            transition: "PRINCIPALS_NOTIFIED",
            delivery: "DISPATCH_QUEUED",
            affectedCount: breach.affected.length,
            campaignId: campaign.id,
            actor: actor.sub,
          },
        });
      });
    }

    // Queue submission is intentionally best-effort: failure here does not
    // roll back the durable lifecycle/outbox intent, and scanClock() will
    // re-enqueue it. The stable breach/campaign job id prevents duplicate
    // dispatches while the recipient-level campaign jobs provide the next
    // layer of delivery deduplication.
    //
    // That "best-effort, swallow and let the clock retry" rule applies
    // ONLY to infra failures (Redis down, provider timeout) that a later
    // retry can plausibly fix. `CampaignsService.send()` -> render can
    // instead throw an `HttpException` (`BadRequestException` for a
    // `MissingRequiredVariableError`/`UnknownTemplateVariableError`/
    // `DisallowedTemplateSyntaxError`/`MissingOrganizationContactError`,
    // `ForbiddenException`/`ConflictException` for a guard) BEFORE any
    // recipient row is written or any provider is called -- that is not
    // a transient condition a retry will ever clear on its own, and
    // swallowing it here is exactly the defect this fix closes: the
    // caller of this endpoint would see 200 PRINCIPALS_NOTIFIED while
    // zero notices were ever queued, and every later retry (this
    // request's own second attempt, and the five-minute clock
    // reconciler) would keep failing the same way, silently, forever.
    // Rethrow it so the employee who triggered notification learns
    // immediately, with the same message a direct `POST
    // /campaigns/:id/send` would give ("Required variable ... has no
    // value."), that nothing was sent and why -- they can fix the
    // breach record (or template) and retry from a PRINCIPALS_NOTIFIED
    // breach without re-running the state transition above.
    try {
      // Stage immediately for the normal request path. This only writes the
      // campaign's durable recipient outbox and hands it to its existing
      // sender; it does not perform recipient/provider I/O in this request.
      await this.dispatchPrincipalNoticeCampaign(campaign.id);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // A failed staging attempt leaves the Postgres intent above intact. The
      // stable-id dispatch job below (and clock reconciliation) retries it.
    }
    try {
      await this.breachPrincipalNoticeDispatchQueue.enqueue({
        breachId: id,
        campaignId: campaign.id,
      });
    } catch {
      // The state/audit transaction has already committed. Returning its
      // evidence is safer than falsely reporting it as rolled back; the clock
      // reconciler will recover the queue wake-up.
    }
    return this.get(id);
  }

  /**
   * Worker entrypoint for the durable principal-notice dispatch intent. A
   * campaign is staged exactly once by CampaignsService; `SENDING` is then
   * recoverable by re-enqueuing only its still-PENDING recipient rows.
   */
  async dispatchPrincipalNoticeCampaign(
    campaignId: string,
  ): Promise<"SENDING" | "SENT" | "SKIPPED"> {
    const campaign = await this.prisma.scoped.messageCampaign.findFirst({
      where: { id: campaignId, category: "BREACH_NOTICE" },
      select: {
        id: true,
        organizationId: true,
        breachId: true,
        status: true,
      },
    });
    if (!campaign || !campaign.breachId) return "SKIPPED";
    // A deliberate later rollback to CONTAINED/INVESTIGATING stops an
    // unstarted approved campaign. Once CampaignsService has staged it as
    // SENDING, existing recipient jobs retain their own durable evidence.
    const breach = await this.prisma.scoped.breachIncident.findFirst({
      where: { id: campaign.breachId },
      select: { status: true },
    });
    if (breach?.status !== "PRINCIPALS_NOTIFIED") return "SKIPPED";

    if (campaign.status === "APPROVED") {
      await this.campaignsService.send(
        campaign.id,
        {
          sub: "SYSTEM_BREACH_DISPATCH",
          organizationId: campaign.organizationId,
          actorLabel: "Breach principal-notice dispatcher",
          aud: "employee",
          iat: 0,
          exp: 0,
        },
        new Set(["CAN_SEND_BREACH_NOTICES"]),
      );
      const staged = await this.prisma.scoped.messageCampaign.findFirstOrThrow({
        where: { id: campaign.id },
        select: { status: true },
      });
      return staged.status === "SENT" ? "SENT" : "SENDING";
    }
    if (campaign.status === "SENDING") return "SENDING";
    if (campaign.status === "SENT") return "SENT";
    // An approved campaign is the only legal dispatch candidate. A campaign
    // cancelled/failed after the lifecycle intent was committed needs human
    // remediation rather than a worker bypassing its campaign guard.
    return "SKIPPED";
  }

  /** Re-enqueues every durable breach dispatch intent. Called by the existing
   * five-minute clock so an API crash or Redis outage after the state commit
   * cannot leave an approved/SENDING campaign stranded. */
  async reconcilePrincipalNoticeDispatches(): Promise<number> {
    const breaches = await this.prisma.scoped.breachIncident.findMany({
      where: { status: "PRINCIPALS_NOTIFIED" },
      select: { id: true },
    });
    let queued = 0;
    for (const breach of breaches) {
      const campaign = await this.prisma.scoped.messageCampaign.findFirst({
        where: {
          breachId: breach.id,
          category: "BREACH_NOTICE",
          status: { in: ["APPROVED", "SENDING"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (!campaign) continue;
      try {
        await this.breachPrincipalNoticeDispatchQueue.enqueue({
          breachId: breach.id,
          campaignId: campaign.id,
        });
        queued += 1;
      } catch {
        // A future clock tick retries this no-loss, stable-id enqueue.
      }
    }
    return queued;
  }

  async boardReport(id: string): Promise<BoardBreachReport> {
    const breach = await this.get(id);
    const [organization, campaigns] = await Promise.all([
      this.prisma.scoped.organization.findFirstOrThrow({
        select: { name: true },
      }),
      this.prisma.scoped.messageCampaign.findMany({
        where: { breachId: id },
        select: { recipients: { select: { status: true } } },
      }),
    ]);
    const deliveryStatusCounts: Record<string, number> = {};
    for (const campaign of campaigns)
      for (const recipient of campaign.recipients)
        deliveryStatusCounts[recipient.status] =
          (deliveryStatusCounts[recipient.status] ?? 0) + 1;
    return {
      breach,
      organizationName: organization.name,
      generatedAt: new Date(),
      affectedCount: breach.affected.length,
      obligations: breach.obligations,
      deliveryStatusCounts,
    };
  }

  async scanClock(now = new Date()): Promise<{
    warningsSent: number;
    overdueMarked: number;
    principalNoticeDispatchesQueued: number;
  }> {
    const obligations = await this.prisma.scoped.breachObligation.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      include: {
        breach: {
          select: {
            id: true,
            reference: true,
            becameAwareAt: true,
            discoveredByEmployeeId: true,
          },
        },
      },
    });
    const dpos = await this.prisma.scoped.employee.findMany({
      where: { role: { code: "DPO" }, status: "ACTIVE" },
      select: { id: true },
    });
    let warningsSent = 0;
    let overdueMarked = 0;
    for (const obligation of obligations) {
      if (obligation.dueAt <= now) {
        await this.prisma.scoped.$transaction(async (tx) => {
          await tx.breachObligation.update({
            where: { id: obligation.id },
            data: { status: "OVERDUE" },
          });
          await this.auditService.record(tx, {
            action: "BREACH_OBLIGATION_COMPLETED",
            resourceType: "BreachObligation",
            resourceId: obligation.id,
            metadata: { code: obligation.code, status: "OVERDUE" },
          });
        });
        overdueMarked += 1;
        continue;
      }
      const total =
        obligation.dueAt.getTime() - obligation.breach.becameAwareAt.getTime();
      const elapsed = now.getTime() - obligation.breach.becameAwareAt.getTime();
      const threshold = elapsed / total;
      const band =
        threshold >= 0.9
          ? "90%"
          : threshold >= 0.75
            ? "75%"
            : threshold >= 0.5
              ? "50%"
              : null;
      if (!band) continue;
      const title = `Breach clock ${band}: ${obligation.breach.reference} ${obligation.code}`;
      const exists = await this.prisma.scoped.notification.findFirst({
        where: { audience: "EMPLOYEE", title },
        select: { id: true },
      });
      if (exists) continue;
      for (const dpo of dpos)
        await this.notificationsService.send({
          audience: "EMPLOYEE",
          employeeId: dpo.id,
          title,
          body: `${obligation.code} is at ${band} of its window from becameAwareAt. Review the breach clock.`,
          severity: band === "90%" ? "CRITICAL" : "WARNING",
          linkPath: `/app/breaches/${obligation.breach.id}`,
        });
      warningsSent += 1;
    }
    const principalNoticeDispatchesQueued =
      await this.reconcilePrincipalNoticeDispatches();
    return { warningsSent, overdueMarked, principalNoticeDispatchesQueued };
  }
}
