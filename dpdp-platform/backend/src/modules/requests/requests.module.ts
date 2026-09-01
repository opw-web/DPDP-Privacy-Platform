import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditModule } from "../../common/audit/audit.module";
import { ReferenceModule } from "../../common/reference/reference.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RetentionModule } from "../retention/retention.module";
import { EvidenceModule } from "../evidence/evidence.module";
import { QueuesModule } from "../../queues/queues.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";
import { DeadlineScanQueueService, DEADLINE_SCAN_QUEUE_NAME } from "../../queues/deadline-scan.queue";
import { DeadlineScanProcessor } from "../../queues/deadline-scan.processor";

/**
 * Task 6: the rights request engine (`RequestsService`, exported for the
 * principal-portal task to call `create()`) plus the `deadline-scan`
 * BullMQ queue and its worker.
 *
 * `BullModule.registerQueue({ name: DEADLINE_SCAN_QUEUE_NAME })` is
 * called HERE, inside this module's own `imports`, rather than in
 * `src/queues/queues.module.ts` -- this task's owned paths are
 * `src/modules/requests/**` and `src/queues/deadline-scan.{queue,
 * processor}.ts` only, not `queues.module.ts`. `BullModule.forRootAsync`
 * (the shared Redis connection config) is registered globally by
 * `QueuesModule` elsewhere in the app and does not need to be imported
 * here for `registerQueue` to attach to it -- `@nestjs/bullmq`'s
 * `forRootAsync` marks that config module global, the same fact
 * `queues.module.ts`'s own doc comment relies on. `DeadlineScanProcessor`
 * lives here (not in `queues.module.ts`) for the identical reason
 * `SyncProcessor` lives in `SyncModule`: it needs `RequestsService` in
 * scope, and this avoids a circular import between this module and
 * `queues.module.ts`.
 *
 * Not registered in `app.module.ts` by this task (that file was under
 * concurrent edit by three other live implementers and is reserved for
 * the wave integrator) -- once it is, no further queue wiring is needed:
 * this module registers its own queue and worker completely.
 *
 * `QueuesModule` is imported (health-degraded boot-time regression fix,
 * not this task originally) so `DeadlineScanQueueService` can inject
 * `BootRegistrationRegistry` -- the shared boot-safety registry every
 * queue module's schedule-registering service now registers itself with,
 * instead of each awaiting its own registration in its own
 * `onModuleInit` (see `BootRegistrationRegistry`'s doc comment).
 * `RetentionModule` (imported above) does not re-export it, so it must
 * be imported here directly.
 */
@Module({
  imports: [
    AuditModule,
    ReferenceModule,
    ComplianceModule,
    NotificationsModule,
    RetentionModule,
    EvidenceModule,
    QueuesModule,
    BullModule.registerQueue({
      name: DEADLINE_SCAN_QUEUE_NAME,
      defaultJobOptions: {
        // No durable BullMQ job history needed -- `RequestEvent` /
        // `AuditEvent` (Postgres) are the durable, queryable record of
        // every scan cycle's effects, same reasoning `SYNC_QUEUE_NAME`'s
        // registration documents.
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [RequestsController],
  providers: [RequestsService, DeadlineScanQueueService, DeadlineScanProcessor],
  exports: [RequestsService],
})
export class RequestsModule {}
