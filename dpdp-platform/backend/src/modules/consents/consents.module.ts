import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuditModule } from "../../common/audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ChildrenModule } from "../children/children.module";
import { NoticesModule } from "../notices/notices.module";
import { RetentionModule } from "../retention/retention.module";
import { QueuesModule } from "../../queues/queues.module";
import {
  ConsentBackfillQueueService,
  CONSENT_BACKFILL_QUEUE_NAME,
} from "../../queues/consent-backfill.queue";
import { ConsentBackfillProcessor } from "../../queues/consent-backfill.processor";
import { ConsentsController } from "./consents.controller";
import { MeConsentsController } from "./me-consents.controller";
import { ConsentsService } from "./consents.service";
import { ConsentBackfillService } from "./consent-backfill.service";

/**
 * Wires the consent feature together: the HTTP surface
 * (`ConsentsController` for the employee-facing routes,
 * `MeConsentsController` for the Data Principal's own portal routes),
 * `ConsentsService` (the single writer of live `ConsentRecord`/
 * `ConsentEvent` status changes), `ConsentBackfillService` (the UNKNOWN-row
 * reconciliation sweep), and the BullMQ plumbing that drives the sweep on
 * a schedule.
 *
 * `BullModule.registerQueue({ name: CONSENT_BACKFILL_QUEUE_NAME })` is
 * called HERE, inside this module's own `imports`, rather than in
 * `src/queues/queues.module.ts` -- the exact precedent `RequestsModule`
 * (task 6) and `RetentionModule` (task 9) already established: a feature
 * module registers its own queue via `BullModule.registerQueue()`, and
 * does not wait on `queues.module.ts`, which this task does not own and
 * whose `QueuesModule` import here is otherwise harmless (it only
 * provides the already-global `BullModule.forRootAsync` Redis connection
 * config). `ConsentBackfillProcessor` lives here (not in
 * `queues.module.ts`) for the identical reason `RetentionScanProcessor`
 * lives in `RetentionModule`: it needs `ConsentBackfillService` in scope,
 * and this avoids a circular import.
 *
 * Imports `AuthModule` for exactly the reason `PrincipalPortalModule`
 * documents on itself: `MeConsentsController`'s
 * `@UseGuards(JwtPrincipalGuard)` needs `JwtPrincipalGuard`'s own
 * constructor dependency `TokenService` resolvable in THIS module's DI
 * context (Nest instantiates a guard referenced by class using the
 * enclosing module's visible providers); `PrismaService` resolves on its
 * own since `PrismaModule` is `@Global()`, but `TokenService` is not and
 * is only exported by `AuthModule`.
 *
 * Imports `ChildrenModule` (for `GuardiansService.assertGuardianConsentEligible`,
 * Rule 10), `NoticesModule` (for `NoticesService.getPublishedVersion`,
 * CN-09/NT-01) and `RetentionModule` (for
 * `ErasureTaskService.createFromTrigger`, CONSENT_WITHDRAWN/s.8(7)) --
 * the three published interfaces this task consumes but does not own.
 *
 * Exports `ConsentsService`: the campaign task's `MARKETING`/
 * `CONSENT_REQUEST` audience compiler needs `getConsentStatus` /
 * `findGrantedPrincipalIds` (see task-10-report.md, "Interfaces
 * published").
 *
 * Not registered in `app.module.ts` by this task under normal
 * circumstances (the wave integrator does that) -- added there anyway per
 * this task's explicit verification instructions, to prove the module
 * boots and its routes are reachable; left in place for the integrator to
 * normalise.
 */
@Module({
  imports: [
    AuditModule,
    AuthModule,
    ChildrenModule,
    NoticesModule,
    RetentionModule,
    QueuesModule,
    BullModule.registerQueue({
      name: CONSENT_BACKFILL_QUEUE_NAME,
      defaultJobOptions: {
        // No durable BullMQ job history needed -- `ConsentRecord` /
        // `AuditEvent` (Postgres) are the durable, queryable record of
        // every sweep's effects, same reasoning `RETENTION_SCAN_QUEUE_NAME`'s
        // registration documents.
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  controllers: [ConsentsController, MeConsentsController],
  providers: [
    ConsentsService,
    ConsentBackfillService,
    ConsentBackfillQueueService,
    ConsentBackfillProcessor,
  ],
  exports: [ConsentsService, ConsentBackfillService],
})
export class ConsentsModule {}
