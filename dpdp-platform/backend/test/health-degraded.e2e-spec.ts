import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { getQueueToken } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { AppModule } from "../src/app.module";
import { SYNC_QUEUE_NAME } from "../src/queues/sync.queue";
import { SyncProcessor } from "../src/queues/sync.processor";

/**
 * Both describe blocks below point Redis at a closed port, so their
 * BullMQ `Queue`/`Worker` connections retry indefinitely by design
 * (`maxRetriesPerRequest: null`, required for BullMQ's own connections --
 * see `redis-connection.util.ts`). Explicitly closing them in `afterAll`
 * is what lets this file exit cleanly under a plain `jest` run instead of
 * leaving Jest to report a lingering open handle.
 */
async function closeQueueAndWorker(app: INestApplication): Promise<void> {
  const queue = app.get<Queue>(getQueueToken(SYNC_QUEUE_NAME));
  const processor = app.get(SyncProcessor);
  await processor.worker.close();
  await queue.close();
}

/**
 * Forces real connection failures (closed ports) rather than mocking the
 * probes, so this exercises the same pg.Pool / ioredis error paths that a
 * genuine outage would hit — including the 'error' event listeners added
 * to prevent an unhandled-error crash on a dropped/reset connection.
 */
describe("Health (e2e) - degraded datastores", () => {
  let app: INestApplication;
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalRedisUrl = process.env["REDIS_URL"];

  beforeAll(async () => {
    // Port 1 is a privileged, never-listening port on any dev/CI host -
    // connections to it are refused immediately (ECONNREFUSED), simulating
    // a datastore that is down without depending on any real service.
    process.env["DATABASE_URL"] = "postgresql://dpdp:dpdp@127.0.0.1:1/dpdp";
    process.env["REDIS_URL"] = "redis://127.0.0.1:1";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    // A generous but still finite timeout (default 15000ms is too tight):
    // Postgres being unreachable makes ScheduleReconciliationService's own
    // Postgres read fail fast, but Redis being unreachable independently
    // bounds EACH of DeadlineScanQueueService's and RetentionScanQueueService's
    // `onModuleInit` at up to `RECONCILE_BOOT_TIMEOUT_MS` (5s) apiece --
    // both MVP 2 additions, both registered in their own Nest module, and
    // Nest awaits every module's `onModuleInit` in sequence, not in
    // parallel -- so this hook's worst case is roughly two back-to-back
    // 5s timeouts plus normal startup overhead.
  }, 20000);

  afterAll(async () => {
    await closeQueueAndWorker(app);
    await app.close();
    process.env["DATABASE_URL"] = originalDatabaseUrl;
    process.env["REDIS_URL"] = originalRedisUrl;
  });

  it("GET /api/health returns 503 with a degraded status when datastores are unreachable", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "error",
      db: "down",
      redis: "down",
    });
  });
});

/**
 * Task 18 review round 2, Important 2: distinct from the describe block
 * above (both datastores down, where Prisma rejects fast for
 * `ScheduleReconciliationService`'s own read) -- here Postgres is
 * genuinely healthy and ONLY Redis is unreachable. Before this round's
 * fix, `ScheduleReconciliationService.onModuleInit` awaited
 * `SyncQueueService.upsertSchedule` on a BullMQ connection built with
 * `maxRetriesPerRequest: null`, which (confirmed against ioredis's own
 * connection handling) never times out and never flushes its offline
 * command queue for that option -- so `onModuleInit` never resolved,
 * Nest's bootstrap sequence never finished awaiting it, and the process
 * never reached `app.listen()` at all: `/health` could not even be
 * asked the question. MVP 2 later added two more `onModuleInit`s with
 * the identical failure mode (`DeadlineScanQueueService`,
 * `RetentionScanQueueService`) -- each now bounded the same way, by the
 * same `RECONCILE_BOOT_TIMEOUT_MS` / `withBootTimeout` this service
 * established. Because Nest awaits every module's `onModuleInit` in
 * sequence rather than in parallel, this hook's worst case is now
 * roughly THREE back-to-back 5s timeouts (reconciliation, deadline-scan,
 * retention-scan+pre-erasure-notice combined) plus normal startup
 * overhead, not one -- hence the explicit, longer hook timeout below.
 */
describe("Health (e2e) - Redis down, Postgres up (boot must not hang)", () => {
  let app: INestApplication;
  const originalRedisUrl = process.env["REDIS_URL"];

  beforeAll(async () => {
    process.env["REDIS_URL"] = "redis://127.0.0.1:1";

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // A generous but still FINITE timeout: this is the empirical proof
    // that boot completes at all. Before the fix, this hook would hang
    // until Jest's own hook-timeout error fired; after the fix it
    // resolves within roughly three sequential `RECONCILE_BOOT_TIMEOUT_MS`
    // (5s) windows -- one per `onModuleInit` this Redis outage bounds
    // (`ScheduleReconciliationService`, `DeadlineScanQueueService`,
    // `RetentionScanQueueService`) -- plus normal startup overhead.
    await app.init();
  }, 25000);

  afterAll(async () => {
    await closeQueueAndWorker(app);
    await app.close();
    process.env["REDIS_URL"] = originalRedisUrl;
  });

  it("boots and serves /health (db up, redis down) instead of hanging forever on ScheduleReconciliationService", async () => {
    const response = await request(app.getHttpServer()).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "error",
      db: "up",
      redis: "down",
    });
  });
});
