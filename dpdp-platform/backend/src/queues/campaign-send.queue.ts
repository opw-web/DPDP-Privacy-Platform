import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { DeliveryChannel } from "@prisma/client";

/**
 * The `campaign-send` BullMQ queue (spec §2.5 table: "One recipient per
 * job, concurrency 10, 3 retries then FAILED"; §4.8 guard 8: job id
 * `campaign:{campaignId}:{principalId}:{channel}`).
 *
 * Purely on-demand -- unlike `retention-scan`/`consent-backfill`, there
 * is no repeatable cron schedule for this queue (spec's job table lists
 * its schedule as "on demand"), so there is no `onModuleInit` scheduler
 * registration here and therefore no need to bound anything with the
 * shared `withBootTimeout()` helper (`schedule-reconciliation.service.ts`)
 * -- that helper exists specifically to bound a boot-time
 * `upsertJobScheduler` call, and this queue never makes one.
 *
 * The queue NAME is declared here; the worker lives in
 * `campaign-send.processor.ts`. `BullModule.registerQueue()` for this
 * name is called in `campaigns.module.ts`'s own `imports`, the same
 * precedent `RequestsModule`/`RetentionModule`/`ConsentsModule`
 * established -- never in `queues.module.ts`, which this task does not
 * own.
 */
export const CAMPAIGN_SEND_QUEUE_NAME = "campaign-send";

/** Spec §4.8 job table: 3 attempts, then the job (and its `CampaignRecipient` row) is left FAILED. */
export const CAMPAIGN_SEND_MAX_ATTEMPTS = 3;

/** Spec §4.8 job table: concurrency 10. */
export const CAMPAIGN_SEND_WORKER_CONCURRENCY = 10;

export interface CampaignSendJobData {
  campaignId: string;
  dataPrincipalId: string;
  channel: DeliveryChannel;
  organizationId: string;
  /** employeeId of whoever called POST /api/campaigns/:id/send. */
  triggeredBy: string;
}

/** Spec §4.8 guard 8, transcribed verbatim: "job id
 * `campaign:{campaignId}:{principalId}:{channel}`" -- this, plus
 * `CampaignRecipient`'s `@@unique([campaignId, dataPrincipalId, channel])`,
 * is what makes re-triggering a send never double-deliver (Check 16). */
export function campaignSendJobId(
  campaignId: string,
  dataPrincipalId: string,
  channel: DeliveryChannel,
): string {
  return `campaign:${campaignId}:${dataPrincipalId}:${channel}`;
}

/**
 * Thin wrapper around the `campaign-send` `Queue`: enqueues one job per
 * `CampaignRecipient` row `CampaignsService.send()` just created (never
 * for a SUPPRESSED row -- there is nothing to deliver). `add()` with an
 * already-in-use `jobId` is a BullMQ no-op (same fact
 * `SyncQueueService.trigger`'s doc comment documents for `sync`), which
 * is exactly the idempotency guard 8 needs at the enqueue layer, on top
 * of the processor's own PENDING-status check and the DB's unique
 * constraint.
 */
@Injectable()
export class CampaignSendQueueService {
  constructor(
    @InjectQueue(CAMPAIGN_SEND_QUEUE_NAME)
    private readonly queue: Queue<CampaignSendJobData>,
  ) {}

  async enqueue(data: CampaignSendJobData): Promise<void> {
    const jobId = campaignSendJobId(
      data.campaignId,
      data.dataPrincipalId,
      data.channel,
    );
    await this.queue.add(CAMPAIGN_SEND_QUEUE_NAME, data, {
      jobId,
      attempts: CAMPAIGN_SEND_MAX_ATTEMPTS,
      backoff: { type: "fixed", delay: 500 },
    });
  }
}
