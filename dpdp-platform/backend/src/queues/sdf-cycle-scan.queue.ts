import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import {
  RECONCILE_BOOT_TIMEOUT_MS,
  withBootTimeout,
} from "./schedule-reconciliation.service";

/**
 * The BullMQ queue backing `sdf-cycle-scan` (spec line 587: daily
 * 02:00 -- SD-03). Registered by `SdfModule` via
 * `BullModule.registerQueue({ name: SDF_CYCLE_SCAN_QUEUE_NAME })` --
 * self-contained there rather than in `src/queues/queues.module.ts`,
 * same precedent `RequestsModule`/`RetentionModule` already established
 * for `deadline-scan`/`retention-scan`. `BullModule.forRootAsync`'s
 * connection config (registered once, globally, by `QueuesModule`) is
 * what this reuses; this file adds no second Redis connection.
 */
export const SDF_CYCLE_SCAN_QUEUE_NAME = "sdf-cycle-scan";

/** Name every job on this queue is added under. */
export const SDF_CYCLE_SCAN_JOB_NAME = "sdf-cycle-scan";

/** BullMQ job-scheduler id for the repeatable run -- there is exactly
 * one of these per process; `SdfCycleScanProcessor` iterates every SDF
 * organization itself on each firing (same global-job shape as
 * `deadline-scan`, not a per-tenant schedule like `sync`). */
export const SDF_CYCLE_SCAN_SCHEDULER_ID = "sdf-cycle-scan:daily-02-00";

/** Spec line 587, transcribed verbatim: daily 02:00. */
export const SDF_CYCLE_SCAN_CRON_PATTERN = "0 2 * * *";

/** `SdfCycleScanJobData.triggeredBy` recorded for a run started by the
 * repeatable schedule, never a specific employee -- same convention as
 * `RETENTION_SCHEDULE_TRIGGERED_BY`. */
export const SDF_CYCLE_SCAN_SCHEDULE_TRIGGERED_BY = "SCHEDULE";

export interface SdfCycleScanJobData {
  triggeredBy: string;
}

/**
 * Registers (idempotently) the one fixed nightly schedule at module
 * bootstrap, bounded by `RECONCILE_BOOT_TIMEOUT_MS` via `withBootTimeout`
 * -- same boot-safety policy `ScheduleReconciliationService` established
 * (task 18 review round 2, Important 2), reused rather than mirrored: an
 * unreachable Redis at boot would otherwise leave `upsertJobScheduler`
 * sitting in ioredis's offline command queue forever
 * (`maxRetriesPerRequest: null`, required for BullMQ's own connections),
 * so `onModuleInit` -- which Nest's bootstrap AWAITS for every module --
 * would simply hang. On timeout or failure this logs and lets boot
 * continue regardless; a schedule that fails to register on a Redis blip
 * is corrected by the next successful boot, never by throwing out of
 * this one.
 */
@Injectable()
export class SdfCycleScanQueueService implements OnModuleInit {
  private readonly logger = new Logger(SdfCycleScanQueueService.name);

  constructor(
    @InjectQueue(SDF_CYCLE_SCAN_QUEUE_NAME)
    private readonly queue: Queue<SdfCycleScanJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await withBootTimeout(
        this.queue.upsertJobScheduler(
          SDF_CYCLE_SCAN_SCHEDULER_ID,
          { pattern: SDF_CYCLE_SCAN_CRON_PATTERN },
          {
            name: SDF_CYCLE_SCAN_JOB_NAME,
            data: { triggeredBy: SDF_CYCLE_SCAN_SCHEDULE_TRIGGERED_BY },
          },
        ),
        RECONCILE_BOOT_TIMEOUT_MS,
      );
      this.logger.log(
        `sdf-cycle-scan repeatable schedule registered (${SDF_CYCLE_SCAN_CRON_PATTERN}).`,
      );
    } catch (err) {
      this.logger.warn(
        "sdf-cycle-scan repeatable schedule did not register at startup " +
          `(timed out after ${RECONCILE_BOOT_TIMEOUT_MS}ms, or failed) -- ` +
          "continuing to boot regardless; the scan will not run on " +
          "schedule until a future boot successfully registers it: " +
          `${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
  }
}
