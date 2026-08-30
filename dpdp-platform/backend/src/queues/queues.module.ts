import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { RedisOptions } from "ioredis";
import type { AppConfig } from "../config/configuration";
import { SYNC_QUEUE_NAME } from "./sync.queue";
import { SyncQueueService } from "./sync.queue";

/**
 * Parses `REDIS_URL` (already validated non-empty by `env.validation.ts`)
 * into the plain connection-options object BullMQ wants, rather than
 * handing it a live `ioredis.Redis` instance.
 *
 * This is deliberate, not a style choice: `@nestjs/bullmq` builds a
 * SEPARATE underlying ioredis client per `Queue`/`Worker`/`QueueEvents`
 * when given connection OPTIONS, but reuses a single shared client
 * verbatim when given an already-constructed instance. A `Worker` issues
 * blocking Redis commands (BRPOPLPUSH-family) that would otherwise starve
 * a `Queue`'s ordinary (non-blocking) commands sharing the same
 * connection -- and vice versa. Passing options here, not an instance,
 * is what keeps `SyncProcessor`'s worker connection independent of the
 * `Queue` connection `SyncQueueService` uses.
 *
 * `maxRetriesPerRequest: null` is BullMQ's own documented requirement
 * for any connection it manages (https://docs.bullmq.io/guide/going-to-production#maxretriesperrequest):
 * without it, ioredis's default finite retry count can abort one of
 * BullMQ's own blocking commands mid-wait, which BullMQ surfaces as a
 * hard connection error rather than a normal retry. This is why the
 * connection here is NOT built the same way `HealthService`'s Redis probe
 * client is (that one deliberately wants a FAST, finite-retry failure for
 * a health check, exactly the opposite requirement).
 */
function toBullConnectionOptions(redisUrl: string): RedisOptions {
  const parsed = new URL(redisUrl);
  const db = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: db ? Number(db) : undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * BullMQ plumbing (spec §2.8's sync queue). `forRootAsync` registers
 * globally (`@nestjs/bullmq`'s own behaviour -- see that call's return
 * value), so every other module in the app can `registerQueue`/`@Processor`
 * against the same Redis connection config without re-importing this
 * module; feature modules still need to import `QueuesModule` itself to
 * inject `SyncQueueService` or the `sync` `Queue` directly.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appConfig = configService.get<AppConfig>("app");
        return {
          connection: toBullConnectionOptions(appConfig?.redisUrl ?? ""),
        };
      },
    }),
    BullModule.registerQueue({
      name: SYNC_QUEUE_NAME,
      defaultJobOptions: {
        // A settled job's Redis record is what `SyncQueueService.trigger`'s
        // 409 check relies on being ABSENT once a run is no longer in
        // flight -- see that method's doc comment. `SyncJob` (Postgres) is
        // the durable, queryable run history; nothing about the pipeline
        // depends on BullMQ retaining finished job records.
        removeOnComplete: true,
        removeOnFail: true,
      },
    }),
  ],
  providers: [SyncQueueService],
  exports: [BullModule, SyncQueueService],
})
export class QueuesModule {}
