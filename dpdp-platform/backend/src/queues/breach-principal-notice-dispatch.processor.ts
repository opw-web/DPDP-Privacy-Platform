import { Logger } from "@nestjs/common";
import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job, Queue } from "bullmq";
import { PrismaService } from "../common/prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import type { TenantStore } from "../common/tenant/tenant-context";
import { BreachService } from "../modules/breaches/breach.service";
import {
  CAMPAIGN_SEND_MAX_ATTEMPTS,
  CAMPAIGN_SEND_QUEUE_NAME,
  campaignSendJobId,
  type CampaignSendJobData,
} from "./campaign-send.queue";
import {
  BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME,
  type BreachPrincipalNoticeDispatchJobData,
} from "./breach-principal-notice-dispatch.queue";

/**
 * Bridges the Postgres-backed breach lifecycle intent to the existing
 * campaign outbox. It never trusts the organization in a Redis payload: the
 * tenant is re-derived from the named campaign before scoped work begins.
 *
 * If CampaignsService committed `SENDING` recipients but crashed before it
 * could enqueue all campaign jobs, `recoverPendingCampaignRecipients()`
 * re-adds the canonical per-recipient jobs. Their stable job IDs plus the
 * recipient PENDING guard make this recovery safe to run repeatedly.
 */
@Processor(BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME)
export class BreachPrincipalNoticeDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(
    BreachPrincipalNoticeDispatchProcessor.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly breachService: BreachService,
    @InjectQueue(CAMPAIGN_SEND_QUEUE_NAME)
    private readonly campaignSendQueue: Queue<CampaignSendJobData>,
  ) {
    super();
  }

  async process(job: Job<BreachPrincipalNoticeDispatchJobData>): Promise<void> {
    const campaign = await this.prisma.messageCampaign.findUnique({
      where: { id: job.data.campaignId },
      select: { id: true, organizationId: true, breachId: true },
    });
    if (!campaign || campaign.breachId !== job.data.breachId) {
      this.logger.warn(
        `breach dispatch job for breach "${job.data.breachId}" campaign ` +
          `"${job.data.campaignId}" has no matching campaign -- skipping.`,
      );
      return;
    }
    const store: TenantStore = {
      organizationId: campaign.organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "BREACH_PRINCIPAL_NOTICE_DISPATCH",
    };
    await TenantContext.run(store, async () => {
      const result = await this.breachService.dispatchPrincipalNoticeCampaign(
        campaign.id,
      );
      if (result !== "SENDING") return;
      await this.recoverPendingCampaignRecipients(
        campaign.id,
        campaign.organizationId,
      );
    });
  }

  private async recoverPendingCampaignRecipients(
    campaignId: string,
    organizationId: string,
  ): Promise<void> {
    const recipients = await this.prisma.scoped.campaignRecipient.findMany({
      where: { campaignId, status: "PENDING" },
      select: { dataPrincipalId: true, channel: true },
    });
    for (const recipient of recipients) {
      const data: CampaignSendJobData = {
        campaignId,
        dataPrincipalId: recipient.dataPrincipalId,
        channel: recipient.channel,
        organizationId,
        triggeredBy: "SYSTEM_BREACH_DISPATCH",
      };
      await this.campaignSendQueue.add(CAMPAIGN_SEND_QUEUE_NAME, data, {
        jobId: campaignSendJobId(
          campaignId,
          recipient.dataPrincipalId,
          recipient.channel,
        ),
        attempts: CAMPAIGN_SEND_MAX_ATTEMPTS,
        backoff: { type: "fixed", delay: 500 },
      });
    }
  }
}
