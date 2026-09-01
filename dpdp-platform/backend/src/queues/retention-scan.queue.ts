import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { BootRegistrationRegistry } from "./boot-registration.registry";

/**
 * The two BullMQ queues this task owns (spec lines 583-584): `retention-scan`
 * (daily 01:00) and `pre-erasure-notice` (daily 01:30). Both queue NAMES
 * are declared here; each queue's WORKER lives in its own processor file
 * (`retention-scan.processor.ts` / `pre-erasure-notice.processor.ts`) per
 * this task's owned-files list.
 *
 * Neither queue is registered via `BullModule.registerQueue()` in this
 * file -- both queue NAMES declared here are registered by
 * `retention.module.ts`, inside that module's own `imports`, the same
 * precedent `RequestsModule` (task 6) already established for
 * `DEADLINE_SCAN_QUEUE_NAME` rather than `queues.module.ts`. (An earlier
 * version of this comment assumed the wave integrator would add both
 * names to `queues.module.ts` instead -- that left the module unable to
 * boot at all, integrator or not; see `retention.module.ts`'s doc
 * comment and task-9-report.md for the fix.) `test/retention.e2e-spec.ts`
 * boots the real `AppModule` via `test/support/e2e-harness.ts`, same as
 * every other MVP 2 e2e spec, and relies on `retention.module.ts`'s own
 * registration for these two queues to resolve.
 */
export const RETENTION_SCAN_QUEUE_NAME = "retention-scan";
export const PRE_ERASURE_NOTICE_QUEUE_NAME = "pre-erasure-notice";

export interface RetentionScanJobData {
  triggeredBy: string;
}

export interface PreErasureNoticeJobData {
  triggeredBy: string;
}

/** `triggeredBy` recorded for a run started by the repeatable schedule, never a specific employee -- same convention as `SYNC_SCHEDULE_TRIGGERED_BY`. */
export const RETENTION_SCHEDULE_TRIGGERED_BY = "SCHEDULE";

const RETENTION_SCAN_SCHEDULER_ID = "retention-scan:nightly";
const PRE_ERASURE_NOTICE_SCHEDULER_ID = "pre-erasure-notice:nightly";

/** Spec lines 583-584, transcribed verbatim: retention-scan daily 01:00, pre-erasure-notice daily 01:30 (org's own configured timezone is not modelled here -- same server-local cron pattern `FREQUENCY_CRON_PATTERNS` in `sync.queue.ts` uses). */
const RETENTION_SCAN_CRON = "0 1 * * *";
const PRE_ERASURE_NOTICE_CRON = "30 1 * * *";

/**
 * Registers (idempotently) the two fixed nightly schedules at module
 * bootstrap. `Queue.upsertJobScheduler` replaces any existing scheduler
 * of the same id rather than stacking a duplicate on every app restart --
 * same primitive, same idempotency guarantee as
 * `SyncQueueService.upsertSchedule`.
 *
 * Registers itself with `BootRegistrationRegistry` from its constructor
 * rather than awaiting `registerSchedules()` (both upserts together) in
 * its own `onModuleInit` (task 18 review round 2, Important 2
 * established `withBootTimeout` for exactly this per-service case,
 * applied once per module rather than once per upsert; a later
 * regression showed that bounding each queue module's `onModuleInit`
 * INDIVIDUALLY still let worst-case boot time scale linearly with the
 * number of queue modules, since Nest awaits `onModuleInit` sequentially
 * across modules -- see `BootRegistrationRegistry`'s doc comment). An
 * unreachable Redis at boot would otherwise leave `upsertJobScheduler`
 * sitting in ioredis's offline command queue forever
 * (`maxRetriesPerRequest: null`, required for BullMQ's own connections --
 * see `redis-connection.util.ts`); the registry now bounds this
 * alongside every other queue module's registration under ONE shared
 * budget rather than awaiting each in series. On failure this logs and
 * lets boot continue regardless; a schedule that fails to register on a
 * Redis blip is corrected by the next successful boot, never by throwing
 * out of this one.
 */
@Injectable()
export class RetentionScanQueueService {
  constructor(
    @InjectQueue(RETENTION_SCAN_QUEUE_NAME) private readonly retentionQueue: Queue<RetentionScanJobData>,
    @InjectQueue(PRE_ERASURE_NOTICE_QUEUE_NAME) private readonly noticeQueue: Queue<PreErasureNoticeJobData>,
    bootRegistrations: BootRegistrationRegistry,
  ) {
    bootRegistrations.register("retention-scan schedules", () => Promise.all([
      this.retentionQueue.upsertJobScheduler(
        RETENTION_SCAN_SCHEDULER_ID, { pattern: RETENTION_SCAN_CRON },
        { name: RETENTION_SCAN_QUEUE_NAME, data: { triggeredBy: RETENTION_SCHEDULE_TRIGGERED_BY } },
      ),
      this.noticeQueue.upsertJobScheduler(
        PRE_ERASURE_NOTICE_SCHEDULER_ID, { pattern: PRE_ERASURE_NOTICE_CRON },
        { name: PRE_ERASURE_NOTICE_QUEUE_NAME, data: { triggeredBy: RETENTION_SCHEDULE_TRIGGERED_BY } },
      ),
    ]).then(() => undefined));
  }
}
