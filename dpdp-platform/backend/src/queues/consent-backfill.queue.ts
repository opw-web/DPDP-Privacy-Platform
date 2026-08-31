import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  RECONCILE_BOOT_TIMEOUT_MS,
  withBootTimeout,
} from "./schedule-reconciliation.service";

/**
 * The `consent-backfill` BullMQ queue (spec §4.3, task 10 brief):
 * "`consent-backfill` creates `UNKNOWN` rows for every principal when a
 * consent purpose is created, and for every new principal at creation."
 * Neither event is directly observable from this task's owned paths (see
 * `ConsentBackfillService`'s own doc comment), so this is built as a
 * repeatable, idempotent, full reconciliation sweep -- the exact shape
 * `RetentionScanQueueService`/`ScheduleReconciliationService` already
 * established for the identical "some other module's write needs a
 * downstream side effect this task cannot safely hook" problem.
 *
 * The queue NAME is declared here; the worker lives in
 * `consent-backfill.processor.ts`, per this task's owned-files list.
 * `BullModule.registerQueue()` for this name is called in
 * `consents.module.ts`'s own `imports`, the same precedent
 * `RequestsModule`/`RetentionModule` established -- never in
 * `queues.module.ts`, which this task does not own.
 */
export const CONSENT_BACKFILL_QUEUE_NAME = "consent-backfill";

export interface ConsentBackfillJobData {
  triggeredBy: string;
}

/** `triggeredBy` recorded for a run started by the repeatable schedule, never a specific employee -- same convention as `RETENTION_SCHEDULE_TRIGGERED_BY`/`SYNC_SCHEDULE_TRIGGERED_BY`. */
export const CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY = "SCHEDULE";

const CONSENT_BACKFILL_SCHEDULER_ID = "consent-backfill:nightly";

/**
 * No fixed cadence is pinned in the spec text for this sweep (unlike
 * `retention-scan`'s 01:00 / `pre-erasure-notice`'s 01:30, spec lines
 * 583-584) -- run it hourly, on the hour, frequently enough that a
 * principal or purpose created between sweeps is caught well within any
 * reasonable consent-toggle SLA, while `ConsentsService.getOrCreateRecord`
 * lazily fills the exact gap for anyone who reaches a consent route before
 * the next sweep regardless.
 */
const CONSENT_BACKFILL_CRON = "0 * * * *";

/**
 * Registers (idempotently) the hourly `consent-backfill` schedule at
 * module bootstrap. `Queue.upsertJobScheduler` replaces any existing
 * scheduler of the same id rather than stacking a duplicate on every app
 * restart -- same primitive `RetentionScanQueueService`/`SyncQueueService`
 * use.
 *
 * `onModuleInit` bounds the upsert by `RECONCILE_BOOT_TIMEOUT_MS` via the
 * SHARED `withBootTimeout` helper (task 18 review round 2, Important 2;
 * reused here per this task's explicit instruction, not reimplemented) --
 * an unreachable Redis at boot would otherwise leave
 * `upsertJobScheduler` sitting in ioredis's offline command queue forever
 * (`maxRetriesPerRequest: null`, required for BullMQ's own connections),
 * hanging `onModuleInit` and, with it, application boot. On timeout or
 * failure this logs and lets boot continue regardless.
 */
@Injectable()
export class ConsentBackfillQueueService implements OnModuleInit {
  private readonly logger = new Logger(ConsentBackfillQueueService.name);

  constructor(
    @InjectQueue(CONSENT_BACKFILL_QUEUE_NAME)
    private readonly consentBackfillQueue: Queue<ConsentBackfillJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await withBootTimeout(this.registerSchedule(), RECONCILE_BOOT_TIMEOUT_MS);
    } catch (err) {
      this.logger.warn(
        "consent-backfill repeatable schedule did not register at " +
          `startup (timed out after ${RECONCILE_BOOT_TIMEOUT_MS}ms, or ` +
          "failed) -- continuing to boot regardless; the sweep will not " +
          "run on schedule until a future boot successfully registers " +
          `it: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }

  async registerSchedule(): Promise<void> {
    await this.consentBackfillQueue.upsertJobScheduler(
      CONSENT_BACKFILL_SCHEDULER_ID,
      { pattern: CONSENT_BACKFILL_CRON },
      {
        name: CONSENT_BACKFILL_QUEUE_NAME,
        data: { triggeredBy: CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY },
      },
    );
    this.logger.log("consent-backfill repeatable schedule registered.");
  }
}
