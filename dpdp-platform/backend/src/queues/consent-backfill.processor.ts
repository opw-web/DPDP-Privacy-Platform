import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ConsentBackfillService } from "../modules/consents/consent-backfill.service";
import { CONSENT_BACKFILL_QUEUE_NAME } from "./consent-backfill.queue";
import type { ConsentBackfillJobData } from "./consent-backfill.queue";

/**
 * The BullMQ worker side of the `consent-backfill` queue: every job
 * (repeatable, via `ConsentBackfillQueueService`, or a future ad-hoc
 * trigger) lands here and is handed straight to
 * `ConsentBackfillService.runForAllOrganizations`, which walks every
 * organization's principal x consent-purpose matrix in its own bound
 * `TenantContext`. Same `@Processor` + `WorkerHost` shape as
 * `retention-scan.processor.ts` / `sync.processor.ts`.
 */
@Processor(CONSENT_BACKFILL_QUEUE_NAME)
export class ConsentBackfillProcessor extends WorkerHost {
  private readonly logger = new Logger(ConsentBackfillProcessor.name);

  constructor(private readonly consentBackfillService: ConsentBackfillService) {
    super();
  }

  async process(job: Job<ConsentBackfillJobData>): Promise<void> {
    try {
      await this.consentBackfillService.runForAllOrganizations();
    } catch (err) {
      this.logger.error(
        `consent-backfill job (triggeredBy: ${job.data.triggeredBy}) ` +
          `threw: ${err instanceof Error ? err.message : "unknown error"}`,
      );
      throw err;
    }
  }
}
