import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { BootRegistrationRegistry } from "./boot-registration.registry";

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
 * Registers itself with `BootRegistrationRegistry` from its constructor
 * rather than awaiting its own registration in its own `onModuleInit`
 * (task 18 review round 2, Important 2 established `withBootTimeout` for
 * exactly this per-service case; a later regression showed that bounding
 * each queue module's `onModuleInit` INDIVIDUALLY still let worst-case
 * boot time scale linearly with the number of queue modules, since Nest
 * awaits `onModuleInit` sequentially across modules -- see
 * `BootRegistrationRegistry`'s doc comment): an unreachable Redis at
 * boot would otherwise leave `upsertJobScheduler` sitting in ioredis's
 * offline command queue forever (`maxRetriesPerRequest: null`, required
 * for BullMQ's own connections); the registry now bounds this alongside
 * every other queue module's registration under ONE shared budget rather
 * than awaiting each in series. On failure this logs and lets boot
 * continue regardless.
 */
@Injectable()
export class ConsentBackfillQueueService {
  constructor(
    @InjectQueue(CONSENT_BACKFILL_QUEUE_NAME) private readonly queue: Queue<ConsentBackfillJobData>,
    bootRegistrations: BootRegistrationRegistry,
  ) {
    bootRegistrations.register("consent-backfill schedule", () => this.queue.upsertJobScheduler(
      CONSENT_BACKFILL_SCHEDULER_ID, { pattern: CONSENT_BACKFILL_CRON },
      { name: CONSENT_BACKFILL_QUEUE_NAME, data: { triggeredBy: CONSENT_BACKFILL_SCHEDULE_TRIGGERED_BY } },
    ).then(() => undefined));
  }
}
