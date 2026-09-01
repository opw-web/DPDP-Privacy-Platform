import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { BootRegistrationRegistry } from "./boot-registration.registry";

/** The BullMQ queue backing `deadline-scan` (spec §2.5 / line 581: every
 * 15 minutes). Registered by `RequestsModule` via
 * `BullModule.registerQueue({ name: DEADLINE_SCAN_QUEUE_NAME })` --
 * self-contained there rather than in `src/queues/queues.module.ts`,
 * which this task does not own (see task-6-report.md's "Interfaces
 * published" for why). `BullModule.forRootAsync`'s connection config
 * (registered once, globally, by `QueuesModule`) is what this reuses;
 * this file adds no second Redis connection. */
export const DEADLINE_SCAN_QUEUE_NAME = "deadline-scan";

/** Name every job on this queue is added under. */
export const DEADLINE_SCAN_JOB_NAME = "deadline-scan";

/** BullMQ job-scheduler id for the repeatable run -- distinct namespace
 * from any ad-hoc job id, matching `SYNC_SCHEDULER_KEY_PREFIX`'s
 * reasoning in `sync.queue.ts`. There is exactly one of these per
 * process, not one per organization: `DeadlineScanProcessor` iterates
 * every organization itself on each firing (spec: a global job, not a
 * per-tenant one, unlike `sync`). */
export const DEADLINE_SCAN_SCHEDULER_ID = "deadline-scan:every-15-min";

/** Spec §2.5, transcribed verbatim: every 15 minutes. */
export const DEADLINE_SCAN_CRON_PATTERN = "*/15 * * * *";

/** `DeadlineScanJobData.triggeredBy` recorded for a run started by the
 * repeatable schedule, never a specific employee -- same convention as
 * `SYNC_SCHEDULE_TRIGGERED_BY`. */
export const DEADLINE_SCAN_SCHEDULE_TRIGGERED_BY = "SCHEDULE";

/** Payload carried by every job on the `deadline-scan` queue. */
export interface DeadlineScanJobData {
  triggeredBy: string;
}

/**
 * Registers (once, at boot) the repeatable `deadline-scan` job. There is
 * no per-organization or per-frequency configuration to reconcile here
 * (unlike `SyncQueueService`) -- the cadence is fixed by the spec, so
 * this simply upserts the one scheduler this process needs.
 * `upsertJobScheduler` on an id that already exists (e.g. a process
 * restart) replaces the prior rule rather than stacking a second one --
 * same BullMQ primitive `SyncQueueService.upsertSchedule` relies on.
 *
 * Registers itself with `BootRegistrationRegistry` from its constructor
 * rather than awaiting its own registration in its own `onModuleInit`
 * (task 18 review round 2, Important 2 established `withBootTimeout` for
 * exactly this per-service case; a later regression showed that bounding
 * each queue module's `onModuleInit` INDIVIDUALLY still let worst-case
 * boot time scale linearly with the number of queue modules, since Nest
 * awaits `onModuleInit` sequentially across modules -- see
 * `BootRegistrationRegistry`'s doc comment). An unreachable Redis at
 * boot would otherwise leave `upsertJobScheduler` sitting in ioredis's
 * offline command queue forever (`maxRetriesPerRequest: null`, required
 * for BullMQ's own connections -- see `redis-connection.util.ts`); the
 * registry now bounds this alongside every other queue module's
 * registration under ONE shared budget rather than awaiting each in
 * series. On failure this logs and lets boot continue regardless; a
 * schedule that fails to register on a Redis blip is corrected by the
 * next successful boot, never by throwing out of this one.
 */
@Injectable()
export class DeadlineScanQueueService {
  constructor(
    @InjectQueue(DEADLINE_SCAN_QUEUE_NAME) private readonly queue: Queue<DeadlineScanJobData>,
    bootRegistrations: BootRegistrationRegistry,
  ) {
    bootRegistrations.register("deadline-scan schedule", () => this.queue.upsertJobScheduler(
      DEADLINE_SCAN_SCHEDULER_ID,
      { pattern: DEADLINE_SCAN_CRON_PATTERN },
      { name: DEADLINE_SCAN_JOB_NAME, data: { triggeredBy: DEADLINE_SCAN_SCHEDULE_TRIGGERED_BY } },
    ).then(() => undefined));
  }
}
