import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { SdfCycleScanService } from "../modules/sdf/sdf-cycle-scan.service";
import { SDF_CYCLE_SCAN_QUEUE_NAME } from "./sdf-cycle-scan.queue";
import type { SdfCycleScanJobData } from "./sdf-cycle-scan.queue";

/**
 * The BullMQ worker side of the `sdf-cycle-scan` queue (spec line 587,
 * daily 02:00 -- SD-03): every job (the repeatable schedule registered by
 * `SdfCycleScanQueueService`, or a future ad-hoc trigger) lands here and
 * is handed straight to `SdfCycleScanService.runForAllOrganizations`,
 * which walks every declared-SDF organization in its own bound
 * `TenantContext`. Same `@Processor` + `WorkerHost` shape as
 * `retention-scan.processor.ts` / `sync.processor.ts`.
 */
@Processor(SDF_CYCLE_SCAN_QUEUE_NAME)
export class SdfCycleScanProcessor extends WorkerHost {
  private readonly logger = new Logger(SdfCycleScanProcessor.name);

  constructor(private readonly sdfCycleScanService: SdfCycleScanService) {
    super();
  }

  async process(job: Job<SdfCycleScanJobData>): Promise<void> {
    try {
      await this.sdfCycleScanService.runForAllOrganizations();
    } catch (err) {
      this.logger.error(
        `sdf-cycle-scan job (triggeredBy: ${job.data.triggeredBy}) threw: ` +
          `${err instanceof Error ? err.message : "unknown error"}`,
      );
      throw err;
    }
  }
}
