import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditModule } from "../../common/audit/audit.module";
import { ReferenceModule } from "../../common/reference/reference.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CampaignsModule } from "../messaging/campaigns/campaigns.module";
import { QueuesModule } from "../../queues/queues.module";
import { BreachesController } from "./breaches.controller";
import { BreachService } from "./breach.service";
import {
  BreachClockProcessor,
  BREACH_CLOCK_QUEUE_NAME,
} from "../../queues/breach-clock.processor";
import { BreachPrincipalNoticeDispatchProcessor } from "../../queues/breach-principal-notice-dispatch.processor";
import {
  BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME,
  BreachPrincipalNoticeDispatchQueueService,
} from "../../queues/breach-principal-notice-dispatch.queue";
import { CAMPAIGN_SEND_QUEUE_NAME } from "../../queues/campaign-send.queue";

@Module({
  imports: [
    AuditModule,
    ReferenceModule,
    ComplianceModule,
    NotificationsModule,
    CampaignsModule,
    QueuesModule,
    BullModule.registerQueue({
      name: BREACH_CLOCK_QUEUE_NAME,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    }),
    BullModule.registerQueue({
      name: BREACH_PRINCIPAL_NOTICE_DISPATCH_QUEUE_NAME,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    }),
    // This consumer only repairs the existing campaign outbox. Registering
    // the named queue makes its injection token available without taking
    // ownership of CampaignsModule's sender/worker implementation.
    BullModule.registerQueue({ name: CAMPAIGN_SEND_QUEUE_NAME }),
  ],
  controllers: [BreachesController],
  providers: [
    BreachService,
    BreachClockProcessor,
    BreachPrincipalNoticeDispatchQueueService,
    BreachPrincipalNoticeDispatchProcessor,
  ],
  exports: [BreachService],
})
export class BreachesModule {}
