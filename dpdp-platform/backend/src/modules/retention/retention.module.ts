import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditModule } from "../../common/audit/audit.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { QueuesModule } from "../../queues/queues.module";
import {
  RetentionScanQueueService,
  RETENTION_SCAN_QUEUE_NAME,
  PRE_ERASURE_NOTICE_QUEUE_NAME,
} from "../../queues/retention-scan.queue";
import { RetentionScanProcessor } from "../../queues/retention-scan.processor";
import { PreErasureNoticeProcessor } from "../../queues/pre-erasure-notice.processor";
import { RetentionController } from "./retention.controller";
import { ErasureTaskService } from "./erasure-task.service";
import { LegalHoldService } from "./legal-hold.service";
import { RetentionScanService } from "./retention-scan.service";
import { PreErasureNoticeService } from "./pre-erasure-notice.service";

/**
 * Wires the retention feature together: the HTTP surface
 * (`RetentionController`, `ErasureTaskService`, `LegalHoldService`), the
 * two scheduled jobs' domain logic (`RetentionScanService`,
 * `PreErasureNoticeService`), and the BullMQ plumbing that drives them
 * (`RetentionScanQueueService`'s schedule registration plus both
 * `WorkerHost` processors -- filed under `src/queues/` per this task's
 * owned-files list, registered as providers HERE rather than in
 * `QueuesModule`, same precedent as `SyncModule` registering
 * `SyncProcessor`).
 *
 * `BullModule.registerQueue(...)` for both `RETENTION_SCAN_QUEUE_NAME`
 * and `PRE_ERASURE_NOTICE_QUEUE_NAME` is called HERE, inside this
 * module's own `imports` -- changed from the version this task inherited,
 * which imported `QueuesModule` but registered neither queue name
 * anywhere, on the assumption the wave integrator would add both to
 * `queues.module.ts` (the task brief's Integrator I2 line: "Register
 * four modules and three new queues in `app.module.ts`/`QueuesModule`").
 * That left `RetentionScanQueueService`'s `@InjectQueue` calls unable to
 * resolve -- the module could not boot at all, integrator or not. Fixed
 * here by copying the EXACT precedent `RequestsModule` (task 6, already
 * shipped) already established for this identical situation: a feature
 * module registers its own queue via `BullModule.registerQueue()`
 * inside its own `imports`, and does not wait on `queues.module.ts`.
 * `BullModule.forRootAsync` (the shared Redis connection config) is
 * registered globally by `QueuesModule` elsewhere in the app and does
 * not need to be imported here for `registerQueue` to attach to it --
 * `QueuesModule` is still imported anyway (harmless, and keeps this
 * module's other assumptions about the DI tree unchanged). See
 * task-9-report.md, "What I changed in the inherited source".
 *
 * Exports `ErasureTaskService`: Wave 3's consent-withdrawal task imports
 * `RetentionModule` to inject it and call
 * `createFromTrigger(tx, {trigger: "CONSENT_WITHDRAWN", dataPrincipalId})`
 * from inside its own transaction. Not registered in `app.module.ts` by
 * this task under normal circumstances (task brief: the wave integrator
 * does that) -- temporarily added there anyway, per this task's explicit
 * verification instructions, to prove the module boots and its routes
 * are reachable; left in place for the integrator to normalise (see
 * `app.module.ts`'s `TEMP-TASK9-VERIFY` comment and task-9-report.md).
 */
@Module({
  imports: [
    AuditModule,
    ComplianceModule,
    NotificationsModule,
    QueuesModule,
    BullModule.registerQueue(
      {
        name: RETENTION_SCAN_QUEUE_NAME,
        defaultJobOptions: {
          // No durable BullMQ job history needed -- `ErasureTask` /
          // `AuditEvent` (Postgres) are the durable, queryable record of
          // every scan cycle's effects, same reasoning `SYNC_QUEUE_NAME`'s
          // and `DEADLINE_SCAN_QUEUE_NAME`'s registrations document.
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
      {
        name: PRE_ERASURE_NOTICE_QUEUE_NAME,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    ),
  ],
  controllers: [RetentionController],
  providers: [
    ErasureTaskService,
    LegalHoldService,
    RetentionScanService,
    PreErasureNoticeService,
    RetentionScanQueueService,
    RetentionScanProcessor,
    PreErasureNoticeProcessor,
  ],
  exports: [ErasureTaskService],
})
export class RetentionModule {}
