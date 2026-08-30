import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { SyncPipelineService } from "../modules/sync/sync-pipeline.service";
import type { SyncRunSummary } from "../modules/sync/sync-pipeline.service";
import { SYNC_QUEUE_NAME, SYNC_WORKER_CONCURRENCY } from "./sync.queue";
import type { SyncJobData } from "./sync.queue";

/**
 * The BullMQ worker side of the `sync` queue: every job (ad-hoc,
 * triggered via `SyncQueueService.trigger`, or repeatable, via
 * `upsertSchedule`) lands here and is handed straight to
 * `SyncPipelineService.run`, which is the ONLY place FETCH -> PERSIST ->
 * ... -> AUDIT actually executes (spec §2.8).
 *
 * Declared as a provider of `SyncModule` (which has `SyncPipelineService`
 * in scope), even though this file lives under `src/queues/` alongside
 * the rest of the BullMQ plumbing per the task's file layout -- NestJS's
 * `@Processor` discovery (via `DiscoveryService`) finds a decorated
 * provider anywhere in the app's module graph, so this class does not
 * need to sit in the same module that called `BullModule.registerQueue`.
 * Keeping it out of `QueuesModule` avoids a circular import
 * (`QueuesModule` -> `SyncModule` -> `QueuesModule`) that putting
 * `SyncPipelineService`'s dependency here directly would otherwise force.
 *
 * `SyncPipelineService.run` never throws for a per-record or FETCH-stage
 * failure -- those are caught internally and turned into a `PARTIAL` or
 * `FAILED` `SyncJob` row plus an `errorLog` entry (see that service's doc
 * comment for the exact rule). If `run` DOES throw here, it is something
 * that happened before or after the pipeline's own try/catch coverage
 * (e.g. the `SyncJob` row itself could not be created) -- logged so it is
 * visible in process logs, then rethrown so BullMQ records the job as
 * failed (visible via `Job.getState()`, and clears the
 * `sync:{dataSourceId}` lock per `SyncQueueService.trigger`'s
 * `removeOnFail` configuration).
 */
@Processor(SYNC_QUEUE_NAME, { concurrency: SYNC_WORKER_CONCURRENCY })
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(private readonly pipeline: SyncPipelineService) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<SyncRunSummary> {
    try {
      return await this.pipeline.run(
        job.data.dataSourceId,
        job.data.triggeredBy,
      );
    } catch (err) {
      this.logger.error(
        `Sync pipeline threw outside its own error handling for data ` +
          `source "${job.data.dataSourceId}": ${
            err instanceof Error ? err.message : "unknown error"
          }`,
      );
      throw err;
    }
  }
}
