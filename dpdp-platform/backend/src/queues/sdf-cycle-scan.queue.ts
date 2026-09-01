import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { BootRegistrationRegistry } from "./boot-registration.registry";

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
 * bootstrap. Registers itself with `BootRegistrationRegistry` from its
 * constructor rather than awaiting its own registration in its own
 * `onModuleInit` (task 18 review round 2, Important 2 established
 * `withBootTimeout` for exactly this per-service case; a later
 * regression showed that bounding each queue module's `onModuleInit`
 * INDIVIDUALLY still let worst-case boot time scale linearly with the
 * number of queue modules, since Nest awaits `onModuleInit` sequentially
 * across modules -- see `BootRegistrationRegistry`'s doc comment): an
 * unreachable Redis at boot would otherwise leave `upsertJobScheduler`
 * sitting in ioredis's offline command queue forever
 * (`maxRetriesPerRequest: null`, required for BullMQ's own connections);
 * the registry now bounds this alongside every other queue module's
 * registration under ONE shared budget rather than awaiting each in
 * series. On failure this logs and lets boot continue regardless; a
 * schedule that fails to register on a Redis blip is corrected by the
 * next successful boot, never by throwing out of this one.
 */
@Injectable()
export class SdfCycleScanQueueService {
  constructor(
    @InjectQueue(SDF_CYCLE_SCAN_QUEUE_NAME) private readonly queue: Queue<SdfCycleScanJobData>,
    bootRegistrations: BootRegistrationRegistry,
  ) {
    bootRegistrations.register("sdf-cycle-scan schedule", () => this.queue.upsertJobScheduler(
      SDF_CYCLE_SCAN_SCHEDULER_ID, { pattern: SDF_CYCLE_SCAN_CRON_PATTERN },
      { name: SDF_CYCLE_SCAN_JOB_NAME, data: { triggeredBy: SDF_CYCLE_SCAN_SCHEDULE_TRIGGERED_BY } },
    ).then(() => undefined));
  }
}
