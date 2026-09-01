import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditModule } from "../../common/audit/audit.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { QueuesModule } from "../../queues/queues.module";
import { SdfController } from "./sdf.controller";
import { SdfAssessmentService } from "./sdf-assessment.service";
import { AlgorithmRegisterService } from "./algorithm-register.service";
import { SdfGapsService } from "./sdf-gaps.service";
import { SdfCycleScanService } from "./sdf-cycle-scan.service";
import {
  SdfCycleScanQueueService,
  SDF_CYCLE_SCAN_QUEUE_NAME,
} from "../../queues/sdf-cycle-scan.queue";
import { SdfCycleScanProcessor } from "../../queues/sdf-cycle-scan.processor";

/**
 * The SDF pack (SD-01...SD-07): `SdfAssessmentService` (the DPIA/audit
 * cycle, SD-02/SD-04 completion gates), `AlgorithmRegisterService`
 * (SD-05), `SdfGapsService` (`GET /api/sdf/gaps`), plus the
 * `sdf-cycle-scan` BullMQ queue and its worker (SD-03, daily 02:00).
 *
 * `BullModule.registerQueue({ name: SDF_CYCLE_SCAN_QUEUE_NAME })` is
 * called HERE, inside this module's own `imports` -- same precedent
 * `RequestsModule` (task 6) and `RetentionModule` (task 9) already
 * established for their own queues: a feature module registers its own
 * queue via `BullModule.registerQueue()` rather than waiting on
 * `src/queues/queues.module.ts`. `BullModule.forRootAsync` (the shared
 * Redis connection config) is registered globally by `QueuesModule`
 * elsewhere in the app and does not need to be imported here for
 * `registerQueue` to attach to it. `SdfCycleScanProcessor` is provided
 * here (not in `queues.module.ts`) for the identical reason
 * `RetentionScanProcessor` lives in `RetentionModule`: it needs
 * `SdfCycleScanService` in scope, and this avoids a circular import
 * between this module and `queues.module.ts`.
 *
 * Not registered in `app.module.ts` by a prior task -- this task adds it
 * itself per its own verification instructions, and leaves it in place.
 *
 * `QueuesModule` is imported (health-degraded boot-time regression fix,
 * not this task originally) so `SdfCycleScanQueueService` can inject
 * `BootRegistrationRegistry` -- the shared boot-safety registry every
 * queue module's schedule-registering service now registers itself with,
 * instead of each awaiting its own registration in its own
 * `onModuleInit` (see `BootRegistrationRegistry`'s doc comment).
 */
@Module({
  imports: [
    AuditModule,
    ComplianceModule,
    NotificationsModule,
    QueuesModule,
    BullModule.registerQueue({
      name: SDF_CYCLE_SCAN_QUEUE_NAME,
      defaultJobOptions: {
        // No durable BullMQ job history needed -- `SdfAssessment` /
        // `AuditEvent` (Postgres) are the durable, queryable record of
        // every scan cycle's effects, same reasoning `RETENTION_SCAN_QUEUE_NAME`'s
        // registration documents.
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [SdfController],
  providers: [
    SdfAssessmentService,
    AlgorithmRegisterService,
    SdfGapsService,
    SdfCycleScanService,
    SdfCycleScanQueueService,
    SdfCycleScanProcessor,
  ],
  exports: [SdfAssessmentService, AlgorithmRegisterService, SdfGapsService],
})
export class SdfModule {}
