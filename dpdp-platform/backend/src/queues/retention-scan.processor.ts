import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { RetentionScanService } from "../modules/retention/retention-scan.service";
import { RETENTION_SCAN_QUEUE_NAME } from "./retention-scan.queue";
import type { RetentionScanJobData } from "./retention-scan.queue";

/**
 * The BullMQ worker side of the `retention-scan` queue (spec §4.6, daily
 * 01:00): every job (repeatable, via `RetentionScanQueueService`, or a
 * future ad-hoc trigger) lands here and is handed straight to
 * `RetentionScanService.runForAllOrganizations`, which walks every
 * organization's retention state in its own bound `TenantContext`. Same
 * `@Processor` + `WorkerHost` shape as `sync.processor.ts`.
 */
@Processor(RETENTION_SCAN_QUEUE_NAME)
export class RetentionScanProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionScanProcessor.name);

  constructor(private readonly retentionScanService: RetentionScanService) {
    super();
  }

  async process(job: Job<RetentionScanJobData>): Promise<void> {
    try {
      await this.retentionScanService.runForAllOrganizations();
    } catch (err) {
      this.logger.error(
        `retention-scan job (triggeredBy: ${job.data.triggeredBy}) threw: ` +
          `${err instanceof Error ? err.message : "unknown error"}`,
      );
      throw err;
    }
  }
}
