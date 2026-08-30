import { ConflictException, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { SyncFrequency } from "@prisma/client";

/** The one BullMQ queue this platform runs (spec §2.8). */
export const SYNC_QUEUE_NAME = "sync";

/**
 * How many data sources may sync concurrently within one backend process.
 * Not a statutory number -- purely an operational throughput knob -- but
 * named per this codebase's "no bare literals" convention anyway. BullMQ's
 * per-queue default Worker concurrency is 1, which would otherwise
 * serialize every organization's syncs behind a single global queue even
 * though the `sync:{dataSourceId}` lock already scopes concurrency
 * correctly per source.
 */
export const SYNC_WORKER_CONCURRENCY = 5;

/** Payload carried by every job on the `sync` queue, one-off or repeatable. */
export interface SyncJobData {
  dataSourceId: string;
  triggeredBy: string;
}

/** `SyncJob.triggeredBy` recorded for a run started by a repeatable schedule, never a specific employee. */
export const SYNC_SCHEDULE_TRIGGERED_BY = "SCHEDULE";

/** Spec §2.8: "BullMQ job id = sync:{dataSourceId}" -- verbatim, so a data source can never have two jobs in flight at once. */
export function syncJobId(dataSourceId: string): string {
  return `sync:${dataSourceId}`;
}

/**
 * BullMQ "job scheduler" id for a data source's repeatable sync (distinct
 * namespace from `syncJobId` above -- a job scheduler and an ad-hoc
 * triggered job are different BullMQ entities that happen to run the same
 * queue, and giving them visibly different id shapes keeps that
 * distinction obvious to anyone inspecting Redis or these logs).
 */
function syncSchedulerId(dataSourceId: string): string {
  return `sync-schedule:${dataSourceId}`;
}

/** Spec §2.8, transcribed verbatim: the three non-MANUAL sync frequencies and their cron patterns. */
const FREQUENCY_CRON_PATTERNS: Partial<Record<SyncFrequency, string>> = {
  EVERY_15_MIN: "*/15 * * * *",
  HOURLY: "0 * * * *",
  DAILY: "0 2 * * *",
};

/** A job in one of these BullMQ states is genuinely in flight -- see `trigger()`'s doc comment for the full 409 design. */
const IN_FLIGHT_JOB_STATES: ReadonlySet<string> = new Set([
  "waiting",
  "active",
  "delayed",
  "waiting-children",
  "prioritized",
]);

/**
 * Wraps the `sync` BullMQ queue: triggering an ad-hoc run (with the
 * per-source 409 lock) and managing each data source's repeatable
 * schedule. `SyncProcessor` (src/queues/sync.processor.ts) is the only
 * consumer of jobs this service adds; this service never runs pipeline
 * logic itself.
 */
@Injectable()
export class SyncQueueService {
  constructor(
    @InjectQueue(SYNC_QUEUE_NAME) private readonly queue: Queue<SyncJobData>,
  ) {}

  /**
   * Enqueues an ad-hoc sync for `dataSourceId`, or throws `ConflictException`
   * (409) if one is already queued or running.
   *
   * DETECTING "IN FLIGHT" (task 18 brief's ambiguity to resolve): the
   * queue is configured (see `QueuesModule`) with `removeOnComplete: true`
   * and `removeOnFail: true`, so a job's Redis record is deleted the
   * instant it settles -- a completed or failed run leaves NO job behind
   * under `syncJobId(dataSourceId)`. That makes "a job exists under this
   * id" and "a sync for this source is currently queued or running"
   * effectively the same fact, which is what lets this method answer the
   * question with a single `getJob` + state check instead of having to
   * reason about a retained-but-finished job's stale presence.
   *
   * The state check on top of existence is defence in depth for the tiny
   * window between a job settling and its removal actually completing:
   * only WAITING/ACTIVE/DELAYED/WAITING-CHILDREN/PRIORITIZED count as
   * in-flight; a job somehow observed as COMPLETED or FAILED (or
   * `getState()`'s `"unknown"`) is treated as not-blocking, so a rare
   * removal-lag race fails open to "let the new sync through" rather than
   * wedging a source behind a ghost lock forever.
   *
   * ACCEPTED RACE: there is a check-then-act gap between this `getJob`
   * and the `add` below -- two callers racing this method concurrently
   * could both observe "not found" and both call `add()`. That is safe,
   * not merely tolerable: BullMQ's job creation for a fixed, explicit
   * `jobId` is idempotent -- a second `add()` for an id that has just been
   * created returns a reference to that SAME job rather than creating a
   * second one, so the pipeline still runs exactly once. The only
   * user-visible cost of losing this race is that the second caller gets
   * a 200 instead of the 409 a slightly-later check would have produced --
   * never a duplicate run. A Redis-side lock (e.g. `SET NX`) would close
   * this window entirely; not built here as it is unneeded for a
   * single-employee-triggers-a-button action, and documented here instead
   * of silently assumed away.
   */
  async trigger(dataSourceId: string, triggeredBy: string): Promise<void> {
    const jobId = syncJobId(dataSourceId);
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (IN_FLIGHT_JOB_STATES.has(state)) {
        throw new ConflictException(
          `A sync is already running for data source "${dataSourceId}".`,
        );
      }
    }
    await this.queue.add(
      SYNC_QUEUE_NAME,
      { dataSourceId, triggeredBy },
      { jobId },
    );
  }

  /**
   * Registers (or replaces) `dataSourceId`'s repeatable sync per its
   * current `syncFrequency`, or removes any existing schedule when the
   * frequency is `MANUAL`.
   *
   * `Queue.upsertJobScheduler(schedulerId, ...)` is BullMQ's own
   * replace-by-id primitive: calling it again for the SAME `schedulerId`
   * with a different cron pattern atomically replaces the prior
   * scheduler's repeat rule rather than registering a second one
   * alongside it. That is what satisfies the brief's "changing frequency
   * removes the old repeatable job first, or you silently stack
   * duplicates" -- there is no separate "remove then add" call sequence
   * for a frequency-to-frequency change to get wrong or skip a step on.
   */
  async upsertSchedule(
    dataSourceId: string,
    frequency: SyncFrequency,
    timezone: string,
  ): Promise<void> {
    const schedulerId = syncSchedulerId(dataSourceId);
    const pattern = FREQUENCY_CRON_PATTERNS[frequency];
    if (!pattern) {
      // MANUAL (or any future frequency this map doesn't cover): no
      // schedule should exist. Idempotent -- removing a scheduler id that
      // doesn't exist is a no-op, not an error.
      await this.queue.removeJobScheduler(schedulerId);
      return;
    }
    await this.queue.upsertJobScheduler(
      schedulerId,
      { pattern, tz: timezone },
      {
        name: SYNC_QUEUE_NAME,
        data: {
          dataSourceId,
          triggeredBy: SYNC_SCHEDULE_TRIGGERED_BY,
        },
      },
    );
  }

  /** Removes `dataSourceId`'s repeatable schedule entirely, e.g. when the data source itself is deleted. */
  async removeSchedule(dataSourceId: string): Promise<void> {
    await this.queue.removeJobScheduler(syncSchedulerId(dataSourceId));
  }

  /** Test/inspection helper: how many repeatable schedulers currently exist for this data source (should never exceed 1). */
  async schedulerCount(dataSourceId: string): Promise<number> {
    const schedulerId = syncSchedulerId(dataSourceId);
    const schedulers = await this.queue.getJobSchedulers();
    // `key` is the id `upsertJobScheduler`/`removeJobScheduler` were
    // called with (BullMQ's `JobSchedulerJson.key`) -- `id` is a
    // DIFFERENT field (an optional custom job id template), always null
    // here since this codebase never sets one.
    return schedulers.filter((scheduler) => scheduler.key === schedulerId)
      .length;
  }
}
