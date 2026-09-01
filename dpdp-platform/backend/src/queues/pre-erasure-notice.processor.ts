import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PreErasureNoticeService } from "../modules/retention/pre-erasure-notice.service";
import { PRE_ERASURE_NOTICE_QUEUE_NAME } from "./retention-scan.queue";
import type { PreErasureNoticeJobData } from "./retention-scan.queue";

/**
 * The BullMQ worker side of the `pre-erasure-notice` queue (RE-05, daily
 * schedule): sends notices for tasks whose `preErasureNoticeDueAt` has
 * arrived, and cancels tasks whose principal has since made INBOUND
 * contact (see `PreErasureNoticeService`'s own doc comment for exactly
 * what counts). Same `@Processor` + `WorkerHost` shape as
 * `sync.processor.ts` / `retention-scan.processor.ts`.
 */
@Processor(PRE_ERASURE_NOTICE_QUEUE_NAME)
export class PreErasureNoticeProcessor extends WorkerHost {
  private readonly logger = new Logger(PreErasureNoticeProcessor.name);

  constructor(private readonly preErasureNoticeService: PreErasureNoticeService) {
    super();
  }

  async process(job: Job<PreErasureNoticeJobData>): Promise<void> {
    try {
      await this.preErasureNoticeService.runForAllOrganizations();
    } catch (err) {
      this.logger.error(
        `pre-erasure-notice job (triggeredBy: ${job.data.triggeredBy}) threw: ` +
          `${err instanceof Error ? err.message : "unknown error"}`,
      );
      throw err;
    }
  }
}
