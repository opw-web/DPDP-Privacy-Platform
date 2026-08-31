import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/configuration";
import { toRedisConnectionOptions } from "./redis-connection.util";
import { SYNC_QUEUE_NAME } from "./sync.queue";
import { SyncQueueService } from "./sync.queue";
import { SyncLockService } from "./sync-lock.service";
import { ScheduleReconciliationService } from "./schedule-reconciliation.service";

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
 * or the `sync` `Queue` directly.
 */
@Module({
  imports: [
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
  ],
  providers: [SyncQueueService, SyncLockService, ScheduleReconciliationService],
  exports: [BullModule, SyncQueueService, SyncLockService],
})
export class QueuesModule {}
