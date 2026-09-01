import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/configuration";
import { toRedisConnectionOptions } from "./redis-connection.util";
import { SYNC_QUEUE_NAME } from "./sync.queue";
import { SyncQueueService } from "./sync.queue";
import { SyncLockService } from "./sync-lock.service";
import { ScheduleReconciliationService } from "./schedule-reconciliation.service";
import { BootRegistrationRegistry } from "./boot-registration.registry";
import { Mvp2ScheduleReconciliationService } from "./mvp2-schedules";
import { DeadlineScanQueueService, DEADLINE_SCAN_QUEUE_NAME } from "./deadline-scan.queue";
import { RetentionScanQueueService, RETENTION_SCAN_QUEUE_NAME, PRE_ERASURE_NOTICE_QUEUE_NAME } from "./retention-scan.queue";
import { ConsentBackfillQueueService, CONSENT_BACKFILL_QUEUE_NAME } from "./consent-backfill.queue";
import { SdfCycleScanQueueService, SDF_CYCLE_SCAN_QUEUE_NAME } from "./sdf-cycle-scan.queue";
import { BREACH_CLOCK_QUEUE_NAME } from "./breach-clock.processor";
import { AuditChainVerifyProcessor, AUDIT_CHAIN_VERIFY_QUEUE_NAME, ACCESS_LOG_RETENTION_QUEUE_NAME } from "./audit-chain-verify.processor";
import { AccessLogRetentionProcessor } from "./access-log-retention.processor";
import { EvidenceModule } from "../modules/evidence/evidence.module";
import { NotificationsModule } from "../modules/notifications/notifications.module";

/**
 * BullMQ plumbing (spec §2.8's sync queue) plus the two things this
 * task's review added on top of it: `SyncLockService` (the real
 * per-source mutex -- see that class's doc comment for why the BullMQ
 * job id alone cannot serve this role) and `ScheduleReconciliationService`
 * (keeps Redis's repeatable-schedule cache in line with Postgres at
 * boot).
 *
 * `forRootAsync` registers globally (`@nestjs/bullmq`'s own behaviour --
 * see that call's return value), so every other module in the app can
 * `registerQueue`/`@Processor` against the same Redis connection config
 * without re-importing this module; feature modules still need to import
 * `QueuesModule` itself to inject `SyncQueueService`, `SyncLockService`,
 * `BootRegistrationRegistry`, or the `sync` `Queue` directly.
 *
 * `BootRegistrationRegistry` (see that class's doc comment) is the
 * shared boot-safety registry every queue module's schedule-registering
 * service registers itself with, from its own constructor, instead of
 * each awaiting its own registration in its own `onModuleInit` --
 * without it, Nest's sequential `onModuleInit` await across modules made
 * worst-case boot time scale linearly with the number of queue modules.
 * It is provided (and exported) HERE rather than in its own module so
 * every feature module that already imports `QueuesModule` for
 * `SyncQueueService` et al. gets it for free.
 */
@Module({
  imports: [
    EvidenceModule,
    NotificationsModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<AppConfig>("app");
        return {
          connection: toRedisConnectionOptions(appConfig?.redisUrl ?? ""),
        };
      },
    }),
    BullModule.registerQueue({
      name: SYNC_QUEUE_NAME,
      defaultJobOptions: {
        // A settled job's Redis record no longer being the source of
        // truth for "is this source's sync in flight" (that is now
        // `SyncLockService` -- task 18 review, Critical 1) makes this
        // purely a housekeeping setting: nothing depends on BullMQ
        // retaining finished job records, so there is no reason to keep
        // them. `SyncJob` (Postgres) is the durable, queryable run
        // history.
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
    BullModule.registerQueue(
      { name: DEADLINE_SCAN_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: BREACH_CLOCK_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: RETENTION_SCAN_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: PRE_ERASURE_NOTICE_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: CONSENT_BACKFILL_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: SDF_CYCLE_SCAN_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: AUDIT_CHAIN_VERIFY_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
      { name: ACCESS_LOG_RETENTION_QUEUE_NAME, defaultJobOptions: { removeOnComplete: true, removeOnFail: true } },
    ),
  ],
  providers: [
    SyncQueueService,
    SyncLockService,
    ScheduleReconciliationService,
    BootRegistrationRegistry,
    Mvp2ScheduleReconciliationService,
    DeadlineScanQueueService,
    RetentionScanQueueService,
    ConsentBackfillQueueService,
    SdfCycleScanQueueService,
    AuditChainVerifyProcessor,
    AccessLogRetentionProcessor,
  ],
  exports: [BullModule, SyncQueueService, SyncLockService, BootRegistrationRegistry],
})
export class QueuesModule {}
