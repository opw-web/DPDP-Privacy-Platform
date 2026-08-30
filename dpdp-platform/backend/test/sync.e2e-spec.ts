import { randomUUID } from "crypto";
import * as http from "node:http";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { Queue } from "bullmq";
import { getQueueToken } from "@nestjs/bullmq";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import {
  MockHttpServer,
} from "../src/modules/connectors/test-support/mock-http-server";
import {
  TenantContext,
  type TenantStore,
} from "../src/common/tenant/tenant-context";
import { SyncPipelineService } from "../src/modules/sync/sync-pipeline.service";
import {
  SYNC_QUEUE_NAME,
  SyncQueueService,
  syncJobId,
  type SyncJobData,
} from "../src/queues/sync.queue";
import { SyncProcessor } from "../src/queues/sync.processor";

/**
 * Task 18: the full FETCH -> PERSIST -> NORMALIZE -> MATCH -> LINK ->
 * ASSEMBLE -> AGE -> AUDIT pipeline, its BullMQ scheduling/locking, and
 * the two HTTP surfaces (`POST /api/data-sources/:id/sync`,
 * `GET /api/sync-jobs...`). A local mock HTTP server stands in for the
 * source system throughout -- never the demo server (brief is explicit).
 *
 * Pipeline-correctness tests (idempotency, PARTIAL/errorLog, the Task 17
 * carried-forward defect) call `SyncPipelineService.run()` directly for
 * deterministic, non-flaky assertions on counts and DB state. The 409
 * lock and the repeatable-schedule dedup genuinely need the real BullMQ
 * queue/worker wiring and go through HTTP.
 */
describe("Sync pipeline (e2e)", () => {
  let app: INestApplication;
  let pipeline: SyncPipelineService;
  let syncQueueService: SyncQueueService;
  let queue: Queue<SyncJobData>;
  let processor: SyncProcessor;
  const prisma = new PrismaService();
  const createdOrgIds: string[] = [];
  const servers: MockHttpServer[] = [];

  function tenant(organizationId: string): TenantStore {
    return {
      organizationId,
      actorType: "SYSTEM",
      actorId: null,
      actorLabel: "sync-e2e",
    };
  }

  async function ensurePermission(code: string): Promise<void> {
    const catalogueEntry = PERMISSIONS.find((p) => p.code === code);
    if (!catalogueEntry) {
      throw new Error(
        `Test requested permission code "${code}" which is not in the ` +
          "real seed catalogue (prisma/seed/permissions.ts).",
      );
    }
    await prisma.permission.upsert({
      where: { code },
      create: catalogueEntry,
      update: {},
    });
  }

  async function organization(): Promise<string> {
    const id = randomUUID();
    createdOrgIds.push(id);
    await prisma.organization.create({
      data: { id, name: `Sync Test Org ${id}`, country: "IN" },
    });
    return id;
  }

  async function employeeWithPermissions(
    organizationId: string,
    permissionCodes: string[],
  ): Promise<{ accessToken: string }> {
    for (const code of permissionCodes) {
      await ensurePermission(code);
    }
    const roleName = `SYNC_ROLE_${randomUUID().replace(/-/g, "")}`;
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: roleName,
        name: roleName,
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const email = `${roleName.toLowerCase()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: roleName,
        roleId: role.id,
        passwordHash,
        status: "ACTIVE",
      },
    });
    const loginRes = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    if (loginRes.status !== 200) {
      throw new Error(
        `Fixture login failed for ${email}: ${JSON.stringify(loginRes.body)}`,
      );
    }
    return { accessToken: loginRes.body.accessToken as string };
  }

  /** A local, paginated (PAGE-style `?page=&limit=`) mock API. `delayMs` lets a test hold the worker in the ACTIVE state on purpose. */
  function pagedHandler(
    records: readonly unknown[],
    delayMs = 0,
  ): http.RequestListener {
    return (req, res) => {
      const url = new URL(req.url ?? "", "http://127.0.0.1");
      const page = Number(url.searchParams.get("page") ?? "1");
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const start = (page - 1) * limit;
      const slice = records.slice(start, start + limit);
      const respond = () => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: slice }));
      };
      if (delayMs > 0) {
        setTimeout(respond, delayMs);
      } else {
        respond();
      }
    };
  }

  async function startServer(
    records: readonly unknown[],
    delayMs = 0,
  ): Promise<{ baseUrl: string; server: MockHttpServer }> {
    const server = new MockHttpServer(pagedHandler(records, delayMs));
    servers.push(server);
    const port = await server.listen();
    return { server, baseUrl: `http://127.0.0.1:${port}/records` };
  }

  const commonMappings = [
    { sourceField: "name", canonicalField: "FULL_NAME" as const, dataCategory: "IDENTITY" as const },
    { sourceField: "email", canonicalField: "EMAIL" as const, dataCategory: "CONTACT" as const },
    { sourceField: "city", canonicalField: "CITY" as const, dataCategory: "LOCATION" as const },
  ];

  async function createDataSource(
    organizationId: string,
    baseUrl: string,
    pageSize = 100,
  ): Promise<string> {
    return TenantContext.run(tenant(organizationId), async () => {
      const dataSource = await prisma.scoped.dataSource.create({
        data: {
          name: `Sync source ${randomUUID()}`,
          systemType: "SYNC_TEST",
          baseUrl,
          recordsPath: "data",
          externalIdField: "id",
          pageSize,
        } as never,
      });
      await Promise.all(
        commonMappings.map((mapping) =>
          prisma.scoped.sourceFieldMapping.create({
            data: { dataSourceId: dataSource.id, ...mapping } as never,
          }),
        ),
      );
      return dataSource.id;
    });
  }

  async function waitUntil(
    predicate: () => Promise<boolean>,
    timeoutMs = 8000,
    intervalMs = 25,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await predicate()) {
        return;
      }
      if (Date.now() > deadline) {
        throw new Error("waitUntil: timed out waiting for condition");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  beforeAll(async () => {
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
    await prisma.$connect();
    pipeline = app.get(SyncPipelineService);
    syncQueueService = app.get(SyncQueueService);
    queue = app.get(getQueueToken(SYNC_QUEUE_NAME));
    processor = app.get(SyncProcessor);
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    // Explicit, ordered shutdown of BullMQ's Redis connections so this
    // file exits cleanly under a plain `jest` run, without relying on
    // `--forceExit` (task brief: "make sure your tests close the
    // queue/worker/Redis connections").
    await processor.worker.close();
    await queue.close();
    await app.close();
    if (createdOrgIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.principalDataField.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.matchCandidate.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.identityLink.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.principalIdentifier.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.normalizedRecord.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.sourceRecord.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.syncJob.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.sourceFieldMapping.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("runs a full sync creating source records, normalized records, principals and links with matching counters", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
      { id: "2", name: "Priya Singh", email: "priya@example.test", city: "Mumbai" },
    ]);
    const dataSourceId = await createDataSource(org, baseUrl);

    const summary = await pipeline.run(dataSourceId, "test-trigger");

    expect(summary.status).toBe("SUCCESS");
    expect(summary).toMatchObject({
      recordsRead: 2,
      recordsCreated: 2,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      principalsCreated: 2,
      principalsLinked: 0,
      candidatesRaised: 0,
    });

    const job = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findFirstOrThrow({ where: { id: summary.syncJobId } }),
    );
    expect(job.status).toBe("SUCCESS");
    expect(job.errorLog).toEqual([]);

    const [sourceRecordCount, normalizedCount, principalCount, linkCount] =
      await TenantContext.run(tenant(org), () =>
        Promise.all([
          prisma.scoped.sourceRecord.count({ where: { dataSourceId } }),
          prisma.scoped.normalizedRecord.count({}),
          prisma.scoped.dataPrincipal.count({}),
          prisma.scoped.identityLink.count({ where: { status: "ACTIVE" } }),
        ]),
      );
    expect(sourceRecordCount).toBe(2);
    expect(normalizedCount).toBe(2);
    expect(principalCount).toBe(2);
    expect(linkCount).toBe(2);

    const auditActions = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.findMany({
        where: { resourceId: summary.syncJobId },
        select: { action: true },
      }),
    );
    expect(auditActions.map((a) => a.action).sort()).toEqual([
      "SYNC_COMPLETED",
      "SYNC_STARTED",
    ]);
  });

  it("re-running the same sync changes no counts and reports recordsCreated: 0 with recordsSkipped ≈ recordsRead", async () => {
    const org = await organization();
    const records = [
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
      { id: "2", name: "Priya Singh", email: "priya@example.test", city: "Mumbai" },
    ];
    const { baseUrl } = await startServer(records);
    const dataSourceId = await createDataSource(org, baseUrl);

    const first = await pipeline.run(dataSourceId, "first-run");
    expect(first.status).toBe("SUCCESS");

    const [sourceCountBefore, principalCountBefore] = await TenantContext.run(
      tenant(org),
      () =>
        Promise.all([
          prisma.scoped.sourceRecord.count({ where: { dataSourceId } }),
          prisma.scoped.dataPrincipal.count({}),
        ]),
    );

    const second = await pipeline.run(dataSourceId, "second-run");

    expect(second.status).toBe("SUCCESS");
    expect(second.recordsCreated).toBe(0);
    expect(second.recordsUpdated).toBe(0);
    expect(second.recordsFailed).toBe(0);
    expect(second.recordsSkipped).toBe(second.recordsRead);
    expect(second.recordsRead).toBe(2);

    const [sourceCountAfter, principalCountAfter] = await TenantContext.run(
      tenant(org),
      () =>
        Promise.all([
          prisma.scoped.sourceRecord.count({ where: { dataSourceId } }),
          prisma.scoped.dataPrincipal.count({}),
        ]),
    );
    expect(sourceCountAfter).toBe(sourceCountBefore);
    expect(principalCountAfter).toBe(principalCountBefore);
  });

  it("resyncing a changed value on an already-linked record updates the assembled profile (Task 17 carried-forward defect)", async () => {
    const org = await organization();
    const server1Records = [
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
    ];
    const { server: server1, baseUrl } = await startServer(server1Records);
    const dataSourceId = await createDataSource(org, baseUrl);

    const first = await pipeline.run(dataSourceId, "first-run");
    expect(first.principalsCreated).toBe(1);

    const principalBefore = await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataPrincipal.findFirstOrThrow({}),
    );
    const cityBefore = await TenantContext.run(tenant(org), () =>
      prisma.scoped.principalDataField.findFirst({
        where: { dataPrincipalId: principalBefore.id, canonicalField: "CITY" },
      }),
    );
    expect(cityBefore?.value).toBe("Pune");

    // Same external id and email (so it resolves to the SAME principal via
    // the EMAIL exact-match rule and therefore does NOT create a new
    // link), but the city genuinely changed.
    await server1.close();
    servers.splice(servers.indexOf(server1), 1);
    const { baseUrl: baseUrl2 } = await startServer([
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Mumbai" },
    ]);
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataSource.update({
        where: { id: dataSourceId },
        data: { baseUrl: baseUrl2 },
      }),
    );

    const second = await pipeline.run(dataSourceId, "second-run");
    expect(second.recordsUpdated).toBe(1);
    expect(second.principalsCreated).toBe(0);
    expect(second.principalsLinked).toBe(0);

    const principalAfter = await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataPrincipal.findFirstOrThrow({}),
    );
    expect(principalAfter.id).toBe(principalBefore.id);
    const cityAfter = await TenantContext.run(tenant(org), () =>
      prisma.scoped.principalDataField.findFirst({
        where: { dataPrincipalId: principalBefore.id, canonicalField: "CITY" },
      }),
    );
    expect(cityAfter?.value).toBe("Mumbai");
  });

  it("a record missing its external id field finishes the run PARTIAL with a sanitized errorLog entry", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
      { name: "No Id Person", email: "noid@example.test", city: "Delhi" },
      { id: "3", name: "Priya Singh", email: "priya@example.test", city: "Mumbai" },
    ]);
    const dataSourceId = await createDataSource(org, baseUrl);

    const summary = await pipeline.run(dataSourceId, "partial-run");

    expect(summary.status).toBe("PARTIAL");
    expect(summary.recordsRead).toBe(3);
    expect(summary.recordsFailed).toBe(1);
    expect(summary.recordsCreated).toBe(2);

    const job = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findFirstOrThrow({ where: { id: summary.syncJobId } }),
    );
    expect(job.status).toBe("PARTIAL");
    const errorLog = job.errorLog as Array<Record<string, unknown>>;
    expect(errorLog).toHaveLength(1);
    expect(errorLog[0]).toMatchObject({
      scope: "RECORD",
      recordKey: null,
      errorClass: "MissingRecordKeyError",
    });
    // No personal data anywhere in the persisted errorLog: never the
    // failed record's name, email, or city.
    const serialized = JSON.stringify(errorLog);
    expect(serialized).not.toContain("noid@example.test");
    expect(serialized).not.toContain("No Id Person");
    expect(serialized).not.toContain("Delhi");

    const finalStatusAudit = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.findFirst({
        where: { resourceId: summary.syncJobId, action: "SYNC_COMPLETED" },
      }),
    );
    expect(finalStatusAudit).not.toBeNull();
  });

  it("rejects a caller without CAN_RUN_SYNC with 403, and a second trigger while the first is genuinely ACTIVE with 409", async () => {
    const org = await organization();
    const { baseUrl } = await startServer(
      [{ id: "1", name: "Slow Person", email: "slow@example.test", city: "Pune" }],
      1500,
    );
    const dataSourceId = await createDataSource(org, baseUrl);

    const noPermission = await employeeWithPermissions(org, []);
    const forbidden = await request(app.getHttpServer())
      .post(`/api/data-sources/${dataSourceId}/sync`)
      .set("Authorization", `Bearer ${noPermission.accessToken}`)
      .send();
    expect(forbidden.status).toBe(403);

    const runner = await employeeWithPermissions(org, ["CAN_RUN_SYNC"]);
    const first = await request(app.getHttpServer())
      .post(`/api/data-sources/${dataSourceId}/sync`)
      .set("Authorization", `Bearer ${runner.accessToken}`)
      .send();
    expect(first.status).toBe(202);
    expect(first.body).toEqual({ queued: true, dataSourceId });

    // Prove the job is genuinely ACTIVE (being processed by the worker
    // right now), not merely present-but-unstarted, before firing the
    // second trigger -- this is what makes the 409 assertion below mean
    // "rejected a concurrent run in progress" rather than "two adds with
    // the same jobId happened to collapse".
    const jobId = syncJobId(dataSourceId);
    await waitUntil(async () => {
      const job = await queue.getJob(jobId);
      return (await job?.getState()) === "active";
    }, 5000);

    const second = await request(app.getHttpServer())
      .post(`/api/data-sources/${dataSourceId}/sync`)
      .set("Authorization", `Bearer ${runner.accessToken}`)
      .send();
    expect(second.status).toBe(409);

    // Let the first run actually finish before the suite moves on, and
    // confirm the lock clears once it does (queue.getJob returns
    // undefined -- see SyncQueueService's removeOnComplete/removeOnFail).
    await waitUntil(async () => (await queue.getJob(jobId)) === undefined, 8000);
    await waitUntil(async () => {
      const jobs = await TenantContext.run(tenant(org), () =>
        prisma.scoped.syncJob.findMany({ where: { dataSourceId } }),
      );
      return jobs.length === 1 && jobs[0]?.status !== "RUNNING";
    }, 5000);
  }, 20000);

  it("lists and reads back sync jobs via GET /api/sync-jobs, tenant-scoped", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
    ]);
    const dataSourceId = await createDataSource(org, baseUrl);
    const summary = await pipeline.run(dataSourceId, "list-test");

    const reader = await employeeWithPermissions(org, ["CAN_RUN_SYNC"]);
    const list = await request(app.getHttpServer())
      .get(`/api/sync-jobs?dataSourceId=${dataSourceId}`)
      .set("Authorization", `Bearer ${reader.accessToken}`)
      .send();
    expect(list.status).toBe(200);
    expect(
      (list.body as Array<{ id: string }>).some((j) => j.id === summary.syncJobId),
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/sync-jobs/${summary.syncJobId}`)
      .set("Authorization", `Bearer ${reader.accessToken}`)
      .send();
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ id: summary.syncJobId, status: "SUCCESS" });

    const missing = await request(app.getHttpServer())
      .get(`/api/sync-jobs/${randomUUID()}`)
      .set("Authorization", `Bearer ${reader.accessToken}`)
      .send();
    expect(missing.status).toBe(404);
  });

  it("changing frequency from HOURLY to DAILY leaves exactly one repeatable job for the data source", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([]);
    const dataSourceId = await createDataSource(org, baseUrl);
    const manager = await employeeWithPermissions(org, [
      "CAN_MANAGE_DATA_SOURCES",
    ]);

    const toHourly = await request(app.getHttpServer())
      .patch(`/api/data-sources/${dataSourceId}`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ syncFrequency: "HOURLY" });
    expect(toHourly.status).toBe(200);
    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(1);

    const toDaily = await request(app.getHttpServer())
      .patch(`/api/data-sources/${dataSourceId}`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ syncFrequency: "DAILY" });
    expect(toDaily.status).toBe(200);
    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(1);

    const schedulers = await queue.getJobSchedulers();
    const thisSourceSchedulers = schedulers.filter((scheduler) =>
      scheduler.key.endsWith(dataSourceId),
    );
    expect(thisSourceSchedulers).toHaveLength(1);
    expect(thisSourceSchedulers[0]?.pattern).toBe("0 2 * * *");

    const toManual = await request(app.getHttpServer())
      .patch(`/api/data-sources/${dataSourceId}`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ syncFrequency: "MANUAL" });
    expect(toManual.status).toBe(200);
    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(0);
  });
});
