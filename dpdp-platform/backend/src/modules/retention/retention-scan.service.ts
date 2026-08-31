import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TenantContext, type TenantStore } from "../../common/tenant/tenant-context";
import { ComplianceService, addByDeadlineUnit } from "../compliance/compliance.service";
import { legalHoldCovers, type LegalHoldScope } from "./legal-hold-scope.util";
import { ErasureTaskService } from "./erasure-task.service";

const RETENTION_INACTIVITY_APPLIES_TO = "RETENTION:INACTIVITY";
const PRE_ERASURE_NOTICE_APPLIES_TO = "RETENTION:PRE_ERASURE_NOTICE";

/** `TenantContext.actorLabel` for every write this scan makes -- never a specific employee, the run is unattended (same convention as `SYNC_ACTOR_LABEL` in `sync-pipeline.service.ts`). */
const RETENTION_SCAN_ACTOR_LABEL = "retention-scan";

const OPEN_ERASURE_TASK_STATES = [
  "EVALUATED",
  "NOTICE_SENT",
  "DEFERRED_RETENTION_FLOOR",
] as const;

export interface RetentionScanSummary {
  inactivityTasksCreated: number;
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
  ) {}

  async runForAllOrganizations(): Promise<void> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
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
   * Known gap (reported in task-9-report.md): `PURPOSE_SERVED` scanning
   * is NOT implemented here -- the spec (line 719) describes it only as
   * "from a policy-defined signal" without naming what that signal is
   * anywhere in the schema this task inherited, and inventing one was
   * judged riskier than leaving it unimplemented and documented.
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
      const hasOpenInactivityTask = await this.prisma.scoped.erasureTask.findFirst({
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
      const lastInboundEvent = await this.prisma.scoped.principalContactEvent.aggregate({
        where: { dataPrincipalId: principal.id, direction: "INBOUND" },
        _max: { occurredAt: true },
      });
      const lastInboundContactAt = lastInboundEvent._max.occurredAt ?? principal.createdAt;
      const dueAt = this.complianceService.computeDeadline(rule, lastInboundContactAt).dueAt;
      if (dueAt > now) {
        continue;
      }

      await this.prisma.scoped.$transaction((tx) =>
        this.erasureTaskService.createFromTrigger(tx, {
          trigger: "INACTIVITY",
          dataPrincipalId: principal.id,
        }),
      );
      created += 1;
    }
    return created;
  }

  /** Applies any active `LegalHold` to open tasks it covers but does not yet reference (a hold created/widened, or a task created, since the last scan). */
  private async applyLegalHolds(now: Date): Promise<number> {
    const holds = await this.prisma.scoped.legalHold.findMany({
      where: { startedAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
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
        ? (
            await this.prisma.scoped.retentionPolicy.findFirst({
              where: { id: task.retentionPolicyId },
              select: { purposeId: true },
            })
          )?.purposeId ?? null
        : null;
      const hold = holds.find((h) =>
        legalHoldCovers(h.scope as LegalHoldScope, task.dataPrincipalId, purposeId),
      );
      if (!hold) {
        continue;
      }
      await this.prisma.scoped.erasureTask.update({
        where: { id: task.id },
        data: { state: "ON_LEGAL_HOLD", legalHoldId: hold.id },
      });
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
      await this.prisma.scoped.erasureTask.update({
        where: { id: task.id },
        data: { state: "EVALUATED", legalHoldId: null },
      });
      released += 1;
    }
    return released;
  }

  /** RE-07: once the floor releases a deferred task, promote it to `EVALUATED` and (re)compute its pre-erasure notice date -- it was left `null` at creation time (see `ErasureTaskService.createFromTrigger`). */
  private async promoteFromFloor(now: Date): Promise<number> {
    const tasks = await this.prisma.scoped.erasureTask.findMany({
      where: { state: "DEFERRED_RETENTION_FLOOR", retentionFloorUntil: { lte: now } },
      select: { id: true, erasureDueAt: true },
    });
    if (tasks.length === 0) {
      return 0;
    }

    const noticeRule = await this.complianceService.resolveRule(
      PRE_ERASURE_NOTICE_APPLIES_TO,
      now,
    );
    for (const task of tasks) {
      const preErasureNoticeDueAt =
        noticeRule && task.erasureDueAt
          ? addByDeadlineUnit(task.erasureDueAt, -noticeRule.deadlineValue, noticeRule.deadlineUnit)
          : null;
      await this.prisma.scoped.erasureTask.update({
        where: { id: task.id },
        data: { state: "EVALUATED", preErasureNoticeDueAt },
      });
    }
    return tasks.length;
  }

  /** Once a task's notice has been sent and `erasureDueAt` has arrived (and it is not on hold), it is ready for the human checklist. */
  private async promoteNoticeSentToReady(now: Date): Promise<number> {
    const result = await this.prisma.scoped.erasureTask.updateMany({
      where: { state: "NOTICE_SENT", erasureDueAt: { lte: now } },
      data: { state: "READY_FOR_ERASURE" },
    });
    return result.count;
  }
}
