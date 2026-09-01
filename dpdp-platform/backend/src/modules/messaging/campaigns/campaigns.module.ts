import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditModule } from "../../../common/audit/audit.module";
import { ReferenceModule } from "../../../common/reference/reference.module";
import { TemplatesModule } from "../templates/templates.module";
import { NoticesModule } from "../../notices/notices.module";
import { ConsentsModule } from "../../consents/consents.module";
import { NotificationsModule } from "../../notifications/notifications.module";
import {
  CampaignSendQueueService,
  CAMPAIGN_SEND_QUEUE_NAME,
} from "../../../queues/campaign-send.queue";
import { CampaignSendProcessor } from "../../../queues/campaign-send.processor";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";

/**
 * There is no `messaging.module.ts` -- like `templates.module.ts` and
 * `audience.module.ts`, this registers directly in `app.module.ts`.
 *
 * `BullModule.registerQueue({ name: CAMPAIGN_SEND_QUEUE_NAME })` is
 * called HERE, in this module's own `imports`, per the exact precedent
 * `RequestsModule`/`RetentionModule`/`ConsentsModule` already
 * established for a feature module's own on-demand or scheduled queue --
 * never in `queues.module.ts`, which this task does not own. Unlike
 * those queues, `campaign-send` has no repeatable schedule and therefore
 * no `onModuleInit` scheduler registration anywhere in this module or
 * `CampaignSendQueueService` (see that file's own doc comment) --
 * nothing here needs `QueuesModule`'s `BootRegistrationRegistry`, so
 * `QueuesModule` itself is not imported (`BullModule.forRootAsync`'s
 * Redis connection config is already global once anything calls it, the
 * same fact `queues.module.ts` documents on itself).
 *
 * `CampaignSendProcessor` lives under `src/queues/` (this task's owned
 * path for it) but is registered as a PROVIDER of this module, not
 * `QueuesModule` -- identical reasoning `SyncProcessor`/
 * `DeadlineScanProcessor`/`ConsentBackfillProcessor` document on
 * themselves: it needs `CampaignsService` in scope, and this avoids a
 * circular import between this module and `queues.module.ts`.
 *
 * Imports `TemplatesModule` (`TemplatesService.get`, snapshotting a
 * campaign's subject/body/requiredVariables), `NoticesModule`
 * (`NoticesService.getPublishedVersion`, guard 4 / NT-01),
 * `ConsentsModule` (`ConsentsService.getConsentStatus` /
 * `findGrantedPrincipalIds`, guard 1) and `NotificationsModule`
 * (`NotificationsService.send`, portal-first delivery) -- the four
 * published interfaces this task consumes but does not own. Does NOT
 * import `AudienceModule`: `compileAudience` is a bare function exported
 * directly from `audience/compile-audience.ts`, not through
 * `AudienceService`, so no DI wiring is needed for it (see
 * `audience.module.ts`'s own doc comment, which anticipates exactly this
 * import).
 */
@Module({
  imports: [
    AuditModule,
    ReferenceModule,
    TemplatesModule,
    NoticesModule,
    ConsentsModule,
    NotificationsModule,
    BullModule.registerQueue({
      name: CAMPAIGN_SEND_QUEUE_NAME,
      defaultJobOptions: {
        // No durable BullMQ job history needed -- `CampaignRecipient` /
        // `AuditEvent` (Postgres) are the durable, queryable record of
        // every delivery attempt's effects, same reasoning every other
        // queue registration in this codebase documents.
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignSendQueueService, CampaignSendProcessor],
  exports: [CampaignsService],
})
export class CampaignsModule {}
