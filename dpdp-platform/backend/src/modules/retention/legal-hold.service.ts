import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../../common/audit/audit.service";
import type { AccessTokenPayload } from "../auth/token.service";
import { legalHoldCovers, type LegalHoldScope } from "./legal-hold-scope.util";
import { CreateLegalHoldDto } from "./dto/create-legal-hold.dto";
import { lockRetentionWorkflow } from "./retention-transaction-lock.util";

/** The ONLY shape a `LegalHold` row is ever returned in from this service. `organizationId` deliberately absent, same discipline as elsewhere. */
export const LEGAL_HOLD_PUBLIC_SELECT = {
  id: true,
  name: true,
  reason: true,
  legalCitation: true,
  scope: true,
  startedAt: true,
  endsAt: true,
  createdByEmployeeId: true,
} satisfies Prisma.LegalHoldSelect;

export type PublicLegalHold = Prisma.LegalHoldGetPayload<{
  select: typeof LEGAL_HOLD_PUBLIC_SELECT;
}>;

const OPEN_ERASURE_TASK_STATES = [
  "EVALUATED",
  "NOTICE_SENT",
  "DEFERRED_RETENTION_FLOOR",
  "READY_FOR_ERASURE",
] as const;

@Injectable()
export class LegalHoldService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(): Promise<PublicLegalHold[]> {
    return this.prisma.scoped.legalHold.findMany({
      orderBy: { startedAt: "desc" },
      select: LEGAL_HOLD_PUBLIC_SELECT,
    });
  }

  /**
   * Creates the hold and, in the SAME transaction, applies it immediately
   * to every currently-open `ErasureTask` it covers -- "legal holds
   * override everything" (spec line 721) is read here as taking effect
   * the moment the hold exists, not waiting for `retention-scan`'s next
   * nightly run (which also re-applies/releases holds continuously, for
   * tasks created or holds narrowed/widened after this call -- see
   * `RetentionScanService.applyLegalHolds`).
   */
  async create(
    dto: CreateLegalHoldDto,
    actor: AccessTokenPayload,
  ): Promise<PublicLegalHold> {
    // Category-scoped holds are not representable by ErasureTask: its
    // checklist is source/processor based while categories live on
    // PrincipalDataField. Silently accepting `categories` would create a
    // hold that appears valid but protects nothing. Reject it explicitly
    // until a category-aware task model exists.
    if (dto.scope?.categories && dto.scope.categories.length > 0) {
      throw new BadRequestException(
        "Category-scoped legal holds are not supported; scope by principalIds or purposeIds.",
      );
    }
    return this.prisma.scoped.$transaction(async (tx) => {
      const now = new Date();
      const scope = (dto.scope ?? {}) as Prisma.InputJsonValue;
      const created = await tx.legalHold.create({
        data: {
          name: dto.name,
          reason: dto.reason,
          legalCitation: dto.legalCitation,
          scope,
          startedAt: now,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          createdByEmployeeId: actor.sub,
          // organizationId deliberately omitted -- the tenant-scoping
          // extension supplies it at runtime.
        } as never,
        select: LEGAL_HOLD_PUBLIC_SELECT,
      });

      await this.auditService.record(tx, {
        action: "LEGAL_HOLD_CREATED",
        resourceType: "LegalHold",
        resourceId: created.id,
        metadata: {
          name: created.name,
          legalCitation: created.legalCitation,
          scope: created.scope as Prisma.JsonValue,
        },
      });

      const openTasks = await tx.erasureTask.findMany({
        where: { state: { in: [...OPEN_ERASURE_TASK_STATES] } },
        select: { id: true },
      });
      for (const task of openTasks) {
        // The create request and a background scan can otherwise observe
        // the same task concurrently. Serialize each task transition and
        // re-read its current state under the same lock before both the
        // conditional write and its audit record.
        await lockRetentionWorkflow(tx, `erasure-task:${task.id}`);
        const current = await tx.erasureTask.findFirst({
          where: { id: task.id, state: { in: [...OPEN_ERASURE_TASK_STATES] } },
          select: {
            id: true,
            dataPrincipalId: true,
            retentionPolicyId: true,
            state: true,
          },
        });
        if (!current) {
          continue;
        }
        const purposeId = current.retentionPolicyId
          ? ((
              await tx.retentionPolicy.findFirst({
                where: { id: current.retentionPolicyId },
                select: { purposeId: true },
              })
            )?.purposeId ?? null)
          : null;
        if (
          legalHoldCovers(
            created.scope as LegalHoldScope,
            current.dataPrincipalId,
            purposeId,
          )
        ) {
          const applied = await tx.erasureTask.updateMany({
            where: { id: current.id, state: current.state },
            data: { state: "ON_LEGAL_HOLD", legalHoldId: created.id },
          });
          if (applied.count !== 1) {
            continue;
          }
          await this.auditService.record(tx, {
            action: "ERASURE_TASK_LEGAL_HOLD_APPLIED",
            resourceType: "ErasureTask",
            resourceId: current.id,
            subjectPrincipalId: current.dataPrincipalId,
            metadata: {
              fromState: current.state,
              toState: "ON_LEGAL_HOLD",
              legalHoldId: created.id,
              source: "legal-hold-create",
            },
          });
        }
      }

      return created;
    });
  }
}
