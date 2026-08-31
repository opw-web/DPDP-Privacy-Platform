import { ConflictException, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { SyncFrequency } from "@prisma/client";
import { SyncLockService } from "./sync-lock.service";

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
 * BullMQ "job scheduler" id prefix for a data source's repeatable sync
 * (distinct namespace from `syncJobId` above -- a job scheduler and an
 * ad-hoc triggered job are different BullMQ entities that happen to run
 * the same queue, and giving them visibly different id shapes keeps that
 * distinction obvious to anyone inspecting Redis or these logs). Pulled
 * out as its own constant (not just inlined in `syncSchedulerId` below)
 * so `listScheduledDataSourceIds`, further down this same class, can
 * recover the `dataSourceId` half of an existing scheduler's key -- see
 * that method's doc comment.
 */
const SYNC_SCHEDULER_KEY_PREFIX = "sync-schedule:";

function syncSchedulerId(dataSourceId: string): string {
  return `${SYNC_SCHEDULER_KEY_PREFIX}${dataSourceId}`;
}

/** Spec §2.8, transcribed verbatim: the three non-MANUAL sync frequencies and their cron patterns. */
const FREQUENCY_CRON_PATTERNS: Partial<Record<SyncFrequency, string>> = {
  EVERY_15_MIN: "*/15 * * * *",
  HOURLY: "0 * * * *",
  DAILY: "0 2 * * *",
};

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
    private readonly syncLockService: SyncLockService,
  ) {}

  /**
   * Enqueues an ad-hoc sync for `dataSourceId`, or throws `ConflictException`
   * (409) if one is already queued or running.
   *
   * DETECTING "IN FLIGHT" (task 18 review, Critical 1): a BullMQ job id is
   * NOT the source of truth here -- `Queue.upsertJobScheduler` mints its
   * own job ids for repeatable runs (`repeat:{schedulerId}:{millis}`),
   * entirely unrelated to `syncJobId(dataSourceId)`, so a scheduled run in
   * progress would be invisible to any check keyed off THIS job id alone.
   * The real mutex is `SyncLockService`'s Redis lock, acquired by
   * `SyncPipelineService` at the moment a run actually starts (manual OR
   * scheduled) -- this method consults that SAME lock, which is what
   * keeps a manual trigger's 409 truthful against a scheduled run too.
   *
   * ACCEPTED RACE: there is a check-then-act gap between `isLocked` and
   * `add` below -- two callers racing this method concurrently could both
   * observe "not locked" and both enqueue. `SyncPipelineService` itself
   * re-attempts the lock at the moment it actually starts running (see
   * that class), so even in that race only ONE of the two enqueued runs
   * ever executes the pipeline; the other fails fast with a `FAILED`
   * `SyncJob` row rather than silently double-running. Closing this
   * narrow window at the HTTP layer too would need a second Redis round
   * trip with no correctness upside over that ruling; not built here.
   */
  async trigger(dataSourceId: string, triggeredBy: string): Promise<void> {
    if (await this.syncLockService.isLocked(dataSourceId)) {
      throw new ConflictException(
        `A sync is already running for data source "${dataSourceId}".`,
      );
    }

    const jobId = syncJobId(dataSourceId);
    const added = await this.queue.add(
      SYNC_QUEUE_NAME,
      { dataSourceId, triggeredBy },
      { jobId },
    );

    // Task 18 review, Important 2: `queue.add()` for an EXISTING jobId
    // does not throw and does not create a second job -- BullMQ's
    // `addStandardJob` script sees the key already exists and takes its
    // `handleDuplicatedJob` branch, which returns the SAME jobId as a
    // normal-looking success WITHOUT enqueueing anything. This is
    // invisible today only because `removeOnComplete`/`removeOnFail` are
    // `true` (QueuesModule), so a finished job's key is gone before this
    // could ever collide -- but that is an operational setting, not a
    // guarantee this method can rely on staying true forever. A job
    // OBSERVED as already `completed`/`failed` immediately after `add()`
    // resolves is exactly that silent-duplicate signature (a genuinely
    // fresh job cannot realistically finish running -- a full connector
    // fetch plus DB transactions -- in the microseconds between this
    // `add()` call and the very next line): treat it as "nothing was
    // actually enqueued" and report the same 409 a truthful check would
    // have given.
    const state = await added.getState();
    if (state === "completed" || state === "failed") {
      throw new ConflictException(
        `A sync is already running for data source "${dataSourceId}".`,
      );
    }
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

  /**
   * The `dataSourceId` half of every currently-registered repeatable sync
   * scheduler's key. Task 18 review round 2, Important 3:
   * `ScheduleReconciliationService` uses this to make reconciliation
   * BIDIRECTIONAL -- not just "ensure every current `DataSource` has the
   * schedule its `syncFrequency` implies" (the forward direction this
   * class already did) but also "remove any schedule whose `DataSource`
   * no longer exists" (the direction that used to be missing). Without
   * this, a data source deleted during a Redis blip (which
   * `DataSourcesService.removeScheduleBestEffort` now swallows, per
   * Important 4+5) leaves an orphaned scheduler firing forever with no
   * boot ever able to notice and clean it up.
   */
  async listScheduledDataSourceIds(): Promise<string[]> {
    const schedulers = await this.queue.getJobSchedulers();
    return schedulers
      .map((scheduler) => scheduler.key)
      .filter(
        (key): key is string =>
          typeof key === "string" && key.startsWith(SYNC_SCHEDULER_KEY_PREFIX),
      )
      .map((key) => key.slice(SYNC_SCHEDULER_KEY_PREFIX.length));
  }
}
