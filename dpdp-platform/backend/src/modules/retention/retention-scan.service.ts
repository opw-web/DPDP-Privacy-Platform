import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../../common/audit/audit.service";
import type { AuditAction } from "../../common/audit/audit-actions";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  TenantContext,
  type TenantStore,
} from "../../common/tenant/tenant-context";
import {
  ComplianceService,
  addByDeadlineUnit,
} from "../compliance/compliance.service";
import { legalHoldCovers, type LegalHoldScope } from "./legal-hold-scope.util";
import { ErasureTaskService } from "./erasure-task.service";
import { lockRetentionWorkflow } from "./retention-transaction-lock.util";

const RETENTION_INACTIVITY_APPLIES_TO = "RETENTION:INACTIVITY";
const PRE_ERASURE_NOTICE_APPLIES_TO = "RETENTION:PRE_ERASURE_NOTICE";

/** `TenantContext.actorLabel` for every write this scan makes -- never a specific employee, the run is unattended (same convention as `SYNC_ACTOR_LABEL` in `sync-pipeline.service.ts`). */
const RETENTION_SCAN_ACTOR_LABEL = "retention-scan";

const OPEN_ERASURE_TASK_STATES = [
  "EVALUATED",
  "NOTICE_SENT",
  "DEFERRED_RETENTION_FLOOR",
  "READY_FOR_ERASURE",
] as const;

export interface RetentionScanSummary {
  inactivityTasksCreated: number;
  purposeServedTasksCreated: number;
  legalHoldsApplied: number;
  legalHoldsReleased: number;
  promotedFromFloor: number;
  promotedToReady: number;
}

/**
 * The `retention-scan` job's domain logic (spec §4.6, daily 01:00). Kept
 * as a plain injectable service, separate from
 * `src/queues/retention-scan.processor.ts`'s `WorkerHost`, so an e2e test
 * can call `runForCurrentOrganization()` directly against a tenant
 * context it controls instead of waiting on BullMQ's cron scheduler --
 * exactly how `runForAllOrganizations()` (the one the processor actually
 * calls) is built on top of it, one `TenantContext.run(...)` per
 * organization (`NotificationsService`'s own doc comment: callers running
 * outside an HTTP request are responsible for establishing their own
 * tenant context, "exactly like sync-pipeline.service.ts already does").
 */
@Injectable()
export class RetentionScanService {
  private readonly logger = new Logger(RetentionScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly complianceService: ComplianceService,
    private readonly erasureTaskService: ErasureTaskService,
    private readonly auditService: AuditService,
  ) {}

  async runForAllOrganizations(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true },
    });
    for (const org of orgs) {
      const store: TenantStore = {
        organizationId: org.id,
        actorType: "SYSTEM",
        actorId: null,
        actorLabel: RETENTION_SCAN_ACTOR_LABEL,
      };
      try {
        await TenantContext.run(store, () => this.runForCurrentOrganization());
      } catch (err) {
        this.logger.error(
          `retention-scan failed for organization "${org.id}": ` +
            `${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }
  }

  /** Must be called inside a bound `TenantContext` (see class doc comment). */
  async runForCurrentOrganization(): Promise<RetentionScanSummary> {
    const now = new Date();
    return {
      inactivityTasksCreated: await this.createInactivityTasks(now),
      purposeServedTasksCreated: await this.createPurposeServedTasks(now),
      legalHoldsApplied: await this.applyLegalHolds(now),
      legalHoldsReleased: await this.releaseLegalHolds(now),
      promotedFromFloor: await this.promoteFromFloor(now),
      promotedToReady: await this.promoteNoticeSentToReady(now),
    };
  }

  /**
   * RE-03/Check 25: `RETENTION_INACTIVITY` resolves `null` unless
   * `Organization.thirdScheduleClass !== NONE` -- that gate lives inside
   * `ComplianceService.resolveRule` itself (Wave 1), not reimplemented
   * here; a `null` rule here means "skip inactivity scanning entirely for
   * this organization", never a fallback literal.
   *
   * PURPOSE_SERVED is deliberately evaluated from the durable,
   * principal-specific `PurposeServedSignal` created by the business
   * workflow. An inactive ProcessingPurpose is organization-wide and is
   * therefore never treated as evidence that any one principal's purpose
   * has been served.
   */
  private async createInactivityTasks(now: Date): Promise<number> {
    const rule = await this.complianceService.resolveRule(
      RETENTION_INACTIVITY_APPLIES_TO,
      now,
    );
    if (!rule) {
      return 0;
    }

    const principals = await this.prisma.scoped.dataPrincipal.findMany({
      select: { id: true, createdAt: true },
    });

    let created = 0;
    for (const principal of principals) {
      const hasOpenInactivityTask =
        await this.prisma.scoped.erasureTask.findFirst({
          where: {
            dataPrincipalId: principal.id,
            trigger: "INACTIVITY",
            state: { notIn: ["CANCELLED", "ERASED"] },
          },
          select: { id: true },
        });
      if (hasOpenInactivityTask) {
        continue;
      }

      // GO-09: INBOUND only.
      const lastInboundEvent =
        await this.prisma.scoped.principalContactEvent.aggregate({
          where: { dataPrincipalId: principal.id, direction: "INBOUND" },
          _max: { occurredAt: true },
        });
      const lastInboundContactAt =
        lastInboundEvent._max.occurredAt ?? principal.createdAt;
      const dueAt = this.complianceService.computeDeadline(
        rule,
        lastInboundContactAt,
      ).dueAt;
      if (dueAt > now) {
        continue;
      }

      const createdForPrincipal = await this.prisma.scoped.$transaction(
        async (tx) => {
          // A retry/multi-node scan cannot create a second open task between
          // the initial read above and task creation.
          await lockRetentionWorkflow(tx, `inactivity:${principal.id}`);
          const existing = await tx.erasureTask.findFirst({
            where: {
              dataPrincipalId: principal.id,
              trigger: "INACTIVITY",
              state: { notIn: ["CANCELLED", "ERASED"] },
            },
            select: { id: true },
          });
          if (existing) return false;
          await this.erasureTaskService.createFromTrigger(tx, {
            trigger: "INACTIVITY",
            dataPrincipalId: principal.id,
          });
          return true;
        },
      );
      if (createdForPrincipal) created += 1;
    }
    return created;
  }

  /** Consumes each policy-owned served signal exactly once, atomically with task creation. */
  private async createPurposeServedTasks(now: Date): Promise<number> {
    const signals = await this.prisma.scoped.purposeServedSignal.findMany({
      where: { scheduledAt: null },
      select: { id: true },
    });
    let created = 0;
    for (const signal of signals) {
      const scheduled = await this.prisma.scoped.$transaction(async (tx) => {
        await lockRetentionWorkflow(tx, `purpose-served:${signal.id}`);
        const current = await tx.purposeServedSignal.findFirst({
          where: { id: signal.id, scheduledAt: null },
          select: {
            id: true,
            dataPrincipalId: true,
            retentionPolicyId: true,
            servedAt: true,
          },
        });
        if (!current) return false;
        const policy = await tx.retentionPolicy.findFirst({
          where: {
            id: current.retentionPolicyId,
            active: true,
            triggerType: "PURPOSE_SERVED",
          },
          select: { id: true },
        });
        if (!policy) return false;
        await this.erasureTaskService.createFromTrigger(tx, {
          trigger: "PURPOSE_SERVED",
          dataPrincipalId: current.dataPrincipalId,
          retentionPolicyId: current.retentionPolicyId,
          triggeredAt: current.servedAt,
        });
        const marked = await tx.purposeServedSignal.updateMany({
          where: { id: current.id, scheduledAt: null },
          data: { scheduledAt: now },
        });
        if (marked.count !== 1) {
          throw new Error(
            `Purpose-served signal "${current.id}" could not be claimed.`,
          );
        }
        return true;
      });
      if (scheduled) created += 1;
    }
    return created;
  }

  /** Applies any active `LegalHold` to open tasks it covers but does not yet reference (a hold created/widened, or a task created, since the last scan). */
  private async applyLegalHolds(now: Date): Promise<number> {
    const holds = await this.prisma.scoped.legalHold.findMany({
      where: {
        startedAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true, scope: true },
    });
    if (holds.length === 0) {
      return 0;
    }

    const openTasks = await this.prisma.scoped.erasureTask.findMany({
      where: { state: { in: [...OPEN_ERASURE_TASK_STATES] } },
      select: { id: true, dataPrincipalId: true, retentionPolicyId: true },
    });

    let applied = 0;
    for (const task of openTasks) {
      const purposeId = task.retentionPolicyId
        ? ((
            await this.prisma.scoped.retentionPolicy.findFirst({
              where: { id: task.retentionPolicyId },
              select: { purposeId: true },
            })
          )?.purposeId ?? null)
        : null;
      const hold = holds.find((h) =>
        legalHoldCovers(
          h.scope as LegalHoldScope,
          task.dataPrincipalId,
          purposeId,
        ),
      );
      if (!hold) {
        continue;
      }
      if (
        await this.transitionTask(
          task.id,
          task.dataPrincipalId,
          {
            state: { in: [...OPEN_ERASURE_TASK_STATES] },
          },
          {
            state: "ON_LEGAL_HOLD",
            legalHoldId: hold.id,
          },
          "ERASURE_TASK_LEGAL_HOLD_APPLIED",
          { legalHoldId: hold.id },
        )
      )
        applied += 1;
    }
    return applied;
  }

  /**
   * Reverts `ON_LEGAL_HOLD` tasks whose referenced hold has expired
   * (`endsAt` passed) or no longer exists. Reverts to `EVALUATED`
   * unconditionally rather than reconstructing the exact prior state
   * (`NOTICE_SENT`/`DEFERRED_RETENTION_FLOOR`) -- the schema carries no
   * "state before hold" column, so this is a deliberate simplification:
   * the next scan cycle's floor/notice-sent promotion steps naturally
   * re-derive the correct downstream state from the task's still-intact
   * `erasureDueAt`/`retentionFloorUntil`/`preErasureNoticeSentAt` fields.
   */
  private async releaseLegalHolds(now: Date): Promise<number> {
    const heldTasks = await this.prisma.scoped.erasureTask.findMany({
      where: { state: "ON_LEGAL_HOLD" },
      select: { id: true, legalHoldId: true },
    });

    let released = 0;
    for (const task of heldTasks) {
      if (!task.legalHoldId) {
        continue;
      }
      const stillActive = await this.prisma.scoped.legalHold.findFirst({
        where: {
          id: task.legalHoldId,
          startedAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: { id: true },
      });
      if (stillActive) {
        continue;
      }
      if (
        await this.transitionTask(
          task.id,
          undefined,
          {
            state: "ON_LEGAL_HOLD",
            legalHoldId: task.legalHoldId,
          },
          {
            state: "EVALUATED",
            legalHoldId: null,
          },
          "ERASURE_TASK_LEGAL_HOLD_RELEASED",
          { legalHoldId: task.legalHoldId },
        )
      )
        released += 1;
    }
    return released;
  }

  /** RE-07: once the floor releases a deferred task, promote it to `EVALUATED` and (re)compute its pre-erasure notice date -- it was left `null` at creation time (see `ErasureTaskService.createFromTrigger`). */
  private async promoteFromFloor(now: Date): Promise<number> {
    const tasks = await this.prisma.scoped.erasureTask.findMany({
      where: {
        state: "DEFERRED_RETENTION_FLOOR",
        retentionFloorUntil: { lte: now },
      },
      select: { id: true, erasureDueAt: true },
    });
    if (tasks.length === 0) {
      return 0;
    }

    const noticeRule = await this.complianceService.resolveRule(
      PRE_ERASURE_NOTICE_APPLIES_TO,
      now,
    );
    let promoted = 0;
    for (const task of tasks) {
      const preErasureNoticeDueAt =
        noticeRule && task.erasureDueAt
          ? addByDeadlineUnit(
              task.erasureDueAt,
              -noticeRule.deadlineValue,
              noticeRule.deadlineUnit,
            )
          : null;
      const transitioned = await this.transitionTask(
        task.id,
        undefined,
        {
          state: "DEFERRED_RETENTION_FLOOR",
          retentionFloorUntil: { lte: now },
        },
        { state: "EVALUATED", preErasureNoticeDueAt },
        "ERASURE_TASK_RETENTION_FLOOR_RELEASED",
      );
      if (!transitioned) continue;
      // Count only the conditional transition actually won by this worker.
      // (The no-op retry path has no audit event.)
      promoted += 1;
    }
    return promoted;
  }

  /** Once a task's notice has been sent and `erasureDueAt` has arrived (and it is not on hold), it is ready for the human checklist. */
  private async promoteNoticeSentToReady(now: Date): Promise<number> {
    const tasks = await this.prisma.scoped.erasureTask.findMany({
      where: { state: "NOTICE_SENT", erasureDueAt: { lte: now } },
      select: { id: true, dataPrincipalId: true },
    });
    let promoted = 0;
    for (const task of tasks) {
      if (
        await this.transitionTask(
          task.id,
          task.dataPrincipalId,
          {
            state: "NOTICE_SENT",
            erasureDueAt: { lte: now },
          },
          { state: "READY_FOR_ERASURE" },
          "ERASURE_TASK_READY_FOR_ERASURE",
        )
      )
        promoted += 1;
    }
    return promoted;
  }

  private async transitionTask(
    id: string,
    subjectPrincipalId: string | undefined,
    expected: Prisma.ErasureTaskWhereInput,
    data: Prisma.ErasureTaskUpdateManyMutationInput,
    action: AuditAction,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    return this.prisma.scoped.$transaction(async (tx) => {
      await lockRetentionWorkflow(tx, `erasure-task:${id}`);
      const current = await tx.erasureTask.findFirst({
        where: { id, ...expected },
        select: { dataPrincipalId: true, state: true },
      });
      if (!current) return false;
      const result = await tx.erasureTask.updateMany({
        where: { id, state: current.state, ...expected },
        data,
      });
      if (result.count !== 1) return false;
      await this.auditService.record(tx, {
        action,
        resourceType: "ErasureTask",
        resourceId: id,
        subjectPrincipalId: subjectPrincipalId ?? current.dataPrincipalId,
        metadata: {
          fromState: current.state,
          toState: data.state,
          ...metadata,
        },
      });
      return true;
    });
  }
}
