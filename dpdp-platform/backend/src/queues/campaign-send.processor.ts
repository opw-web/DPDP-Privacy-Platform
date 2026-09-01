import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import type { TenantStore } from "../common/tenant/tenant-context";
import { NotificationsService } from "../modules/notifications/notifications.service";
import { CampaignsService } from "../modules/messaging/campaigns/campaigns.service";
import {
  CAMPAIGN_SEND_QUEUE_NAME,
  CAMPAIGN_SEND_MAX_ATTEMPTS,
  CAMPAIGN_SEND_WORKER_CONCURRENCY,
} from "./campaign-send.queue";
import type { CampaignSendJobData } from "./campaign-send.queue";

/** `TenantStore.actorLabel` for every write this worker makes -- same
 * convention `SYNC_ACTOR_LABEL`/`DEADLINE_SCAN_ACTOR_LABEL` establish for
 * a SYSTEM-actor background job. */
const CAMPAIGN_SEND_ACTOR_LABEL = "CAMPAIGN_SEND";

/**
 * The BullMQ worker side of the `campaign-send` queue (spec §2.5: "One
 * recipient per job, concurrency 10, 3 retries then FAILED"; §4.8 guard
 * 8). Every job carries `organizationId` in its payload, but that value
 * comes from a BullMQ job payload read out of Redis -- data OUTSIDE any
 * request context -- so, per the identical tenant-isolation discipline
 * `SyncPipelineService.run` documents for its own single unscoped read,
 * it is not trusted directly. This worker instead re-derives
 * `organizationId` from the `MessageCampaign` row the job names, via the
 * one raw (unscoped) `PrismaService` read below, and binds
 * `TenantContext` to THAT value before calling
 * `CampaignsService.deliverRecipient` -- every other read/write in the
 * delivery path goes through `prisma.scoped`, resolved against this
 * context.
 *
 * `CampaignsService.deliverRecipient` is itself idempotent (guard 8: a
 * `CampaignRecipient` row not in `PENDING` status is a no-op) -- this
 * class does not need its own additional dedupe beyond the BullMQ job id
 * (`campaign:{campaignId}:{principalId}:{channel}`, set by
 * `CampaignSendQueueService.enqueue`) and the DB's own unique constraint.
 *
 * `isFinalAttempt` is derived from `job.attemptsMade`: BullMQ increments
 * `attemptsMade` only AFTER `process()` returns/throws (see
 * `Job.moveToFinished`/`moveToFailed` in `bullmq`'s own source), so
 * inside `process()` it still holds the count of attempts already
 * COMPLETED before this one -- `attemptsMade + 1` is this attempt's
 * ordinal, and it is the last allowed attempt exactly when
 * `attemptsMade + 1 >= job.opts.attempts` (the same comparison BullMQ's
 * own `shouldRetryJob` makes to decide whether to retry at all). Only on
 * that last attempt does a delivery failure get written back to
 * `CampaignRecipient` as a terminal `FAILED` row.
 *
 * Declared as a provider of `CampaignsModule` (physically filed under
 * `src/queues/` alongside the rest of the BullMQ plumbing, per this
 * task's owned paths) -- same reasoning `SyncProcessor`/
 * `DeadlineScanProcessor` document for living alongside their owning
 * feature module rather than `QueuesModule`: it needs `CampaignsService`
 * in scope, and this avoids a circular import.
 */
@Processor(CAMPAIGN_SEND_QUEUE_NAME, { concurrency: CAMPAIGN_SEND_WORKER_CONCURRENCY })
export class CampaignSendProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<CampaignSendJobData>): Promise<void> {
    const { campaignId, dataPrincipalId, channel, triggeredBy } = job.data;

    const campaignRow = await this.prisma.messageCampaign.findUnique({
      where: { id: campaignId },
      select: { organizationId: true },
    });
    if (!campaignRow) {
      // Unreachable in practice -- `CampaignsService.send()` only
      // enqueues a job after its own transaction (which creates this
      // `MessageCampaign` row's recipients) has committed. Nothing to
      // deliver if the campaign itself is gone.
      this.logger.warn(
        `campaign-send job for campaign "${campaignId}" found no such campaign -- skipping.`,
      );
      return;
    }

    const store: TenantStore = {
      organizationId: campaignRow.organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: CAMPAIGN_SEND_ACTOR_LABEL,
    };

    const maxAttempts =
      typeof job.opts.attempts === "number" && job.opts.attempts > 0
        ? job.opts.attempts
        : CAMPAIGN_SEND_MAX_ATTEMPTS;
    const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;

    try {
      await TenantContext.run(store, () =>
        this.campaignsService.deliverRecipient(
          job.data,
          isFinalAttempt,
          this.notificationsService,
        ),
      );
    } catch (err) {
      this.logger.error(
        `campaign-send job failed for campaign "${campaignId}" principal ` +
          `"${dataPrincipalId}" channel "${channel}" (attempt ` +
          `${job.attemptsMade + 1}/${maxAttempts}, triggeredBy ` +
          `"${triggeredBy}"): ${err instanceof Error ? err.message : "unknown error"}`,
      );
      throw err;
    }
  }
}
