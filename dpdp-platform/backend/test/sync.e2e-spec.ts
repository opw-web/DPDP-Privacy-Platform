import { randomUUID } from "crypto";
import * as http from "node:http";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import type { Queue } from "bullmq";
import { getQueueToken } from "@nestjs/bullmq";
import type { CanonicalField, DataCategory } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import { MockHttpServer } from "../src/modules/connectors/test-support/mock-http-server";
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
import { SyncLockService } from "../src/queues/sync-lock.service";
import { ScheduleReconciliationService } from "../src/queues/schedule-reconciliation.service";

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
  let syncLockService: SyncLockService;
  let scheduleReconciliationService: ScheduleReconciliationService;
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
    {
      sourceField: "name",
      canonicalField: "FULL_NAME" as const,
      dataCategory: "IDENTITY" as const,
    },
    {
      sourceField: "email",
      canonicalField: "EMAIL" as const,
      dataCategory: "CONTACT" as const,
    },
    {
      sourceField: "city",
      canonicalField: "CITY" as const,
      dataCategory: "LOCATION" as const,
    },
  ];

  type FieldMapping = {
    sourceField: string;
    canonicalField: CanonicalField;
    dataCategory: DataCategory;
  };

  async function createDataSource(
    organizationId: string,
    baseUrl: string,
    pageSize = 100,
    mappings: readonly FieldMapping[] = commonMappings,
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
        mappings.map((mapping) =>
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
    syncLockService = app.get(SyncLockService);
    scheduleReconciliationService = app.get(ScheduleReconciliationService);
    queue = app.get(getQueueToken(SYNC_QUEUE_NAME));
    processor = app.get(SyncProcessor);
  });

  // Explicit 30000ms hook timeout: Jest's 5000ms default applies to
  // hooks exactly as it does to tests, and a hook timeout fails the
  // ENTIRE suite, not just one test. This hook closes the app/worker/
  // queue (real network round trips) and then runs ~14 sequential
  // delete queries scoped across every org this file's tests created --
  // including the identifier-ownership-race test's org, which alone
  // leaves 50 SourceRecords, 50 NormalizedRecords, 25 DataPrincipals,
  // 50 IdentityLinks and 25 PrincipalIdentifiers behind. Real headroom
  // over what that actually costs, not a value tuned to just clear it.
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
  }, 30000);

  it("runs a full sync creating source records, normalized records, principals and links with matching counters", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
      {
        id: "2",
        name: "Priya Singh",
        email: "priya@example.test",
        city: "Mumbai",
      },
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
      prisma.scoped.syncJob.findFirstOrThrow({
        where: { id: summary.syncJobId },
      }),
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
      {
        id: "2",
        name: "Priya Singh",
        email: "priya@example.test",
        city: "Mumbai",
      },
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
      {
        id: "1",
        name: "Aman Verma",
        email: "aman@example.test",
        city: "Mumbai",
      },
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

  it("attaches an identifier that first appears on a RESYNC of an already-linked record, so a later source does not create a duplicate principal (I-3, final whole-branch review)", async () => {
    // Final whole-branch review, I-3: `attachAvailableIdentifiers` used
    // to be guarded on `!activeLink`, so an identifier appearing for the
    // first time on a resync (not the initial sync) was never attached.
    // This test is exactly the failure scenario the review describes:
    // a support-system record is first synced with only a phone number,
    // then a resync adds an email to the SAME record, then a second,
    // independent source syncs a record keyed only on that email. Before
    // the fix, the email was never attached to the phone-linked
    // principal, so the marketing source's sync found it unowned and
    // created a second `DataPrincipal` for the same person.
    const org = await organization();
    const identifierMappings = [
      {
        sourceField: "name",
        canonicalField: "FULL_NAME" as const,
        dataCategory: "IDENTITY" as const,
      },
      {
        sourceField: "phone",
        canonicalField: "PHONE" as const,
        dataCategory: "CONTACT" as const,
      },
      {
        sourceField: "email",
        canonicalField: "EMAIL" as const,
        dataCategory: "CONTACT" as const,
      },
    ];

    const { server: supportServer, baseUrl: supportBaseUrl } =
      await startServer([
        { id: "SUP-1", name: "Neha Gupta", phone: "9876543210" },
      ]);
    const supportSourceId = await createDataSource(
      org,
      supportBaseUrl,
      100,
      identifierMappings,
    );

    const firstRun = await pipeline.run(supportSourceId, "support-first-run");
    expect(firstRun.status).toBe("SUCCESS");
    expect(firstRun.principalsCreated).toBe(1);

    const principal = await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataPrincipal.findFirstOrThrow({}),
    );
    const phoneIdentifierAfterFirstRun = await TenantContext.run(
      tenant(org),
      () =>
        prisma.scoped.principalIdentifier.findFirst({
          where: { dataPrincipalId: principal.id, type: "PHONE" },
        }),
    );
    expect(phoneIdentifierAfterFirstRun?.value).toBe("+919876543210");
    const emailIdentifierAfterFirstRun = await TenantContext.run(
      tenant(org),
      () =>
        prisma.scoped.principalIdentifier.findFirst({
          where: { dataPrincipalId: principal.id, type: "EMAIL" },
        }),
    );
    // Positive control: the email genuinely has no identifier row yet --
    // it was never present in the payload the first sync read.
    expect(emailIdentifierAfterFirstRun).toBeNull();

    // The support agent adds Neha's email to the SAME ticket; the next
    // sync of the SAME external id sees a changed payload and re-runs
    // NORMALIZE/MATCH/LINK for an already-linked record.
    await supportServer.close();
    servers.splice(servers.indexOf(supportServer), 1);
    const { baseUrl: supportBaseUrl2 } = await startServer([
      {
        id: "SUP-1",
        name: "Neha Gupta",
        phone: "9876543210",
        email: "neha@example.test",
      },
    ]);
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataSource.update({
        where: { id: supportSourceId },
        data: { baseUrl: supportBaseUrl2 },
      }),
    );

    const resync = await pipeline.run(supportSourceId, "support-resync");
    expect(resync.status).toBe("SUCCESS");
    expect(resync.recordsUpdated).toBe(1);
    // Still resolves to the SAME principal -- no new link, no new
    // principal -- only the identifier set grew.
    expect(resync.principalsCreated).toBe(0);

    const principalCountAfterResync = await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataPrincipal.count({}),
    );
    expect(principalCountAfterResync).toBe(1);

    // The fix, directly: the EMAIL identifier now exists and is owned by
    // the SAME principal the phone-only first sync created.
    const emailIdentifierAfterResync = await TenantContext.run(
      tenant(org),
      () =>
        prisma.scoped.principalIdentifier.findFirst({
          where: { dataPrincipalId: principal.id, type: "EMAIL" },
        }),
    );
    expect(emailIdentifierAfterResync?.value).toBe("neha@example.test");

    // A second, independent data source (marketing) now syncs a record
    // for the SAME person, keyed only on that email. Without the fix,
    // rule 2 (exact email) would find no owner and this would create a
    // SECOND DataPrincipal for Neha -- the platform's headline "records
    // become people" promise silently degrading.
    const { baseUrl: marketingBaseUrl } = await startServer([
      { id: "MKT-1", name: "Neha G.", email: "neha@example.test" },
    ]);
    const marketingSourceId = await createDataSource(
      org,
      marketingBaseUrl,
      100,
      [
        {
          sourceField: "name",
          canonicalField: "FULL_NAME" as const,
          dataCategory: "IDENTITY" as const,
        },
        {
          sourceField: "email",
          canonicalField: "EMAIL" as const,
          dataCategory: "CONTACT" as const,
        },
      ],
    );

    const marketingRun = await pipeline.run(
      marketingSourceId,
      "marketing-first-run",
    );
    expect(marketingRun.status).toBe("SUCCESS");
    // The definitive regression check: no duplicate principal.
    expect(marketingRun.principalsCreated).toBe(0);
    expect(marketingRun.principalsLinked).toBe(1);

    const finalPrincipalCount = await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataPrincipal.count({}),
    );
    expect(finalPrincipalCount).toBe(1);

    const marketingSourceRecord = await TenantContext.run(tenant(org), () =>
      prisma.scoped.sourceRecord.findFirstOrThrow({
        where: { dataSourceId: marketingSourceId },
      }),
    );
    const marketingNormalizedRecord = await TenantContext.run(tenant(org), () =>
      prisma.scoped.normalizedRecord.findFirstOrThrow({
        where: { sourceRecordId: marketingSourceRecord.id },
      }),
    );
    const marketingActiveLink = await TenantContext.run(tenant(org), () =>
      prisma.scoped.identityLink.findFirstOrThrow({
        where: {
          normalizedRecordId: marketingNormalizedRecord.id,
          status: "ACTIVE",
        },
      }),
    );
    expect(marketingActiveLink.dataPrincipalId).toBe(principal.id);
  });

  it("a record missing its external id field finishes the run PARTIAL with a sanitized errorLog entry", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([
      { id: "1", name: "Aman Verma", email: "aman@example.test", city: "Pune" },
      { name: "No Id Person", email: "noid@example.test", city: "Delhi" },
      {
        id: "3",
        name: "Priya Singh",
        email: "priya@example.test",
        city: "Mumbai",
      },
    ]);
    const dataSourceId = await createDataSource(org, baseUrl);

    const summary = await pipeline.run(dataSourceId, "partial-run");

    expect(summary.status).toBe("PARTIAL");
    expect(summary.recordsRead).toBe(3);
    expect(summary.recordsFailed).toBe(1);
    expect(summary.recordsCreated).toBe(2);

    const job = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findFirstOrThrow({
        where: { id: summary.syncJobId },
      }),
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

  it("a FETCH failure reached after some records were already read finishes PARTIAL, not FAILED (Important 6 regression)", async () => {
    // The FETCH-stage catch (sync-pipeline.service.ts) is a DIFFERENT
    // code path from the per-record catch the "missing external id
    // field" test above exercises -- that test never reaches this
    // branch at all. This test forces pagination (pageSize=1) so page 1
    // succeeds and is durably persisted, then page 2 returns malformed
    // JSON, which RestApiConnector throws on -- proving the run is
    // reported PARTIAL (records were read) rather than FAILED (nothing
    // was read), with the FETCH failure recorded in errorLog.
    const org = await organization();
    const server = new MockHttpServer((req, res) => {
      const url = new URL(req.url ?? "", "http://127.0.0.1");
      const page = Number(url.searchParams.get("page") ?? "1");
      res.writeHead(200, { "Content-Type": "application/json" });
      if (page === 1) {
        res.end(
          JSON.stringify({
            data: [
              {
                id: "1",
                name: "Page One Person",
                email: "page1@example.test",
              },
            ],
          }),
        );
      } else {
        // Deliberately malformed: RestApiConnector.fetchPage throws
        // trying to JSON.parse this, and (unlike a non-2xx status) a
        // 200 response is never retried by ReadOnlyHttpClient -- the
        // failure is immediate and deterministic.
        res.end("this is not valid json");
      }
    });
    servers.push(server);
    const port = await server.listen();
    const baseUrl = `http://127.0.0.1:${port}/records`;
    // pageSize=1: page 1 returns exactly 1 record, which RestApiConnector
    // treats as a FULL page (not short), so it fetches page 2 next.
    const dataSourceId = await createDataSource(org, baseUrl, 1);

    const summary = await pipeline.run(dataSourceId, "partial-fetch-failure");

    expect(summary.status).toBe("PARTIAL");
    expect(summary.recordsRead).toBe(1);
    expect(summary.recordsCreated).toBe(1);
    expect(summary.recordsFailed).toBe(0);

    const job = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findFirstOrThrow({
        where: { id: summary.syncJobId },
      }),
    );
    expect(job.status).toBe("PARTIAL");
    const errorLog = job.errorLog as Array<Record<string, unknown>>;
    expect(errorLog).toHaveLength(1);
    expect(errorLog[0]).toMatchObject({ scope: "FETCH" });

    const audits = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.findMany({
        where: { resourceId: summary.syncJobId },
        select: { action: true },
      }),
    );
    // PARTIAL uses SYNC_COMPLETED, never SYNC_FAILED -- FAILED is
    // reserved for zero records read.
    expect(audits.map((a) => a.action).sort()).toEqual([
      "SYNC_COMPLETED",
      "SYNC_STARTED",
    ]);
  });

  it("a FETCH failure before any record was read finishes FAILED (Important 6, zero-records branch)", async () => {
    const org = await organization();
    // Reuses a real, immediate connector-level failure -- page 1 itself
    // is malformed, so ZERO records are ever read before the run fails.
    const server = new MockHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("this is not valid json either");
    });
    servers.push(server);
    const port = await server.listen();
    const baseUrl = `http://127.0.0.1:${port}/records`;
    const dataSourceId = await createDataSource(org, baseUrl);

    const summary = await pipeline.run(dataSourceId, "failed-run");

    expect(summary.status).toBe("FAILED");
    expect(summary.recordsRead).toBe(0);

    const job = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findFirstOrThrow({
        where: { id: summary.syncJobId },
      }),
    );
    expect(job.status).toBe("FAILED");
    expect(job.finishedAt).not.toBeNull();

    // The lock this run held is released -- the source is not wedged.
    expect(await syncLockService.isLocked(dataSourceId)).toBe(false);
  });

  it("a run that cannot acquire the lock creates no SyncJob row and no SYNC_STARTED audit (Critical 1 regression N-1)", async () => {
    // Before round 2's fix, SyncLockService.acquire() ran AFTER
    // startJob() -- a lock that could not be acquired left a RUNNING
    // SyncJob row (and its SYNC_STARTED audit) permanently stranded,
    // with no terminal event ever written for it. Acquiring the lock
    // FIRST means a rejected run touches Postgres not at all.
    const org = await organization();
    const { baseUrl } = await startServer([]);
    const dataSourceId = await createDataSource(org, baseUrl);

    const heldLock = await syncLockService.acquire(dataSourceId);
    expect(heldLock).not.toBeNull();

    await expect(pipeline.run(dataSourceId, "blocked-run")).rejects.toThrow(
      /sync lock/i,
    );

    const jobs = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findMany({ where: { dataSourceId } }),
    );
    expect(jobs).toHaveLength(0);

    const startedAudits = await TenantContext.run(tenant(org), () =>
      prisma.scoped.auditEvent.count({ where: { action: "SYNC_STARTED" } }),
    );
    expect(startedAudits).toBe(0);

    await heldLock?.release();
  });

  it("rejects a caller without CAN_RUN_SYNC with 403, and a second trigger while the first is genuinely ACTIVE with 409", async () => {
    const org = await organization();
    const { baseUrl } = await startServer(
      [
        {
          id: "1",
          name: "Slow Person",
          email: "slow@example.test",
          city: "Pune",
        },
      ],
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

    // Prove the run is genuinely IN PROGRESS -- specifically, that
    // `SyncPipelineService` has acquired the per-source Redis lock, which
    // is what `trigger()`'s 409 check actually consults (task 18 review,
    // Critical 1) -- not merely "a BullMQ job exists somewhere". Waiting
    // on BullMQ's own job state here would race: a job can be `active`
    // (dequeued, `process()` called) slightly BEFORE
    // `SyncPipelineService` reaches its lock-acquire call, which is
    // exactly the gap that made this assertion flaky when it checked
    // job state instead.
    const jobId = syncJobId(dataSourceId);
    await waitUntil(async () => syncLockService.isLocked(dataSourceId), 5000);

    const second = await request(app.getHttpServer())
      .post(`/api/data-sources/${dataSourceId}/sync`)
      .set("Authorization", `Bearer ${runner.accessToken}`)
      .send();
    expect(second.status).toBe(409);

    // Let the first run actually finish before the suite moves on, and
    // confirm the lock clears once it does (queue.getJob returns
    // undefined -- see SyncQueueService's removeOnComplete/removeOnFail).
    await waitUntil(
      async () => (await queue.getJob(jobId)) === undefined,
      8000,
    );
    // This predicate is already true by the time execution reaches here
    // in practice: `finalize()` writes the non-RUNNING status BEFORE
    // `SyncProcessor.process()` resolves, and the wait above already
    // blocked until that resolution. The 5000 below is `waitUntil`'s own
    // poll ceiling, not a Jest test/hook timeout -- it happened to be
    // pinned to the exact same number as Jest's default by coincidence,
    // not by any shared mechanism. Bumped to match the sibling wait
    // above (8000) purely to remove that coincidence, not because this
    // one was observed to need it.
    await waitUntil(async () => {
      const jobs = await TenantContext.run(tenant(org), () =>
        prisma.scoped.syncJob.findMany({ where: { dataSourceId } }),
      );
      return jobs.length === 1 && jobs[0]?.status !== "RUNNING";
    }, 8000);
  }, 20000);

  it("a genuinely in-flight SCHEDULED run rejects a manual trigger with 409 (Critical 1)", async () => {
    const org = await organization();
    const { baseUrl } = await startServer(
      [{ id: "1", name: "Scheduled Person", email: "scheduled@example.test" }],
      1500,
    );
    const dataSourceId = await createDataSource(org, baseUrl);
    const testSchedulerId = `test-scheduled-${dataSourceId}`;
    // Task 18 review round 2, timing-fragile test fix: created BEFORE
    // the scheduled run is even armed, not inside the ~1.5s window while
    // the lock is held. `employeeWithPermissions` does an argon2 hash
    // plus role/permission/employee inserts plus a login round trip
    // doing an argon2 verify -- on a loaded machine that can exceed the
    // mock server's 1500ms delay, letting the scheduled run release the
    // lock before the manual trigger ever fires and turning the 409
    // assertion below into a flake (the manual-vs-manual test above hit
    // exactly this shape of bug once already).
    const runner = await employeeWithPermissions(org, ["CAN_RUN_SYNC"]);

    try {
      // A due repeatable job, fired via BullMQ's OWN scheduler mechanism
      // (`immediately: true`) -- this produces a `repeat:...` job id,
      // never `syncJobId(dataSourceId)` ("sync:{id}"). Before the
      // Critical-1 fix, NOTHING checked this id shape for in-flight
      // status, so a manual trigger racing this would have sailed
      // through with 202 and silently double-run the pipeline.
      await queue.upsertJobScheduler(
        testSchedulerId,
        { every: 60_000, immediately: true },
        {
          name: SYNC_QUEUE_NAME,
          data: { dataSourceId, triggeredBy: "SCHEDULE" },
        },
      );

      // Prove the scheduled run has genuinely acquired the per-source
      // lock (SyncPipelineService.run has started, not merely "a job
      // exists somewhere") before firing the manual trigger.
      await waitUntil(async () => syncLockService.isLocked(dataSourceId), 5000);

      const manualAttempt = await request(app.getHttpServer())
        .post(`/api/data-sources/${dataSourceId}/sync`)
        .set("Authorization", `Bearer ${runner.accessToken}`)
        .send();
      expect(manualAttempt.status).toBe(409);

      // Let the scheduled run finish and confirm the lock actually
      // clears (the source is not left permanently wedged).
      await waitUntil(
        async () => !(await syncLockService.isLocked(dataSourceId)),
        8000,
      );
    } finally {
      // Stop the `every: 60_000` scheduler so it does not keep firing
      // sync runs against this test's data source for the rest of the
      // suite.
      await queue.removeJobScheduler(testSchedulerId);
    }
  }, 20000);

  it("a lock left behind by a killed worker expires on its own and does not wedge the source forever (Critical 1)", async () => {
    const dataSourceId = randomUUID();
    // A TTL far shorter than the heartbeat interval simulates a worker
    // that crashed the instant after acquiring the lock: the heartbeat
    // that would normally renew it never gets a chance to fire even
    // once, so the ONLY thing that can ever free this lock is the TTL
    // itself expiring. This exercises the real `SyncLockService.acquire`
    // production code path -- not a hand-crafted Redis key.
    // Task 18 review round 2: widened from 300ms to ~1s -- a 300ms TTL
    // left this assertion vulnerable to a GC pause or scheduler jitter
    // between acquiring the lock and the very next `isLocked` check
    // below. 1s removes that risk without weakening what the test
    // proves (the lock still expires and self-heals; only the margin
    // changed).
    const shortTtlMs = 1_000;
    const neverFiresWithinThisTestMs = 60_000;

    const crashedHandle = await syncLockService.acquire(
      dataSourceId,
      shortTtlMs,
      neverFiresWithinThisTestMs,
    );
    expect(crashedHandle).not.toBeNull();
    expect(await syncLockService.isLocked(dataSourceId)).toBe(true);

    // A trigger arriving while the crashed lock is still technically
    // valid correctly sees the source as busy.
    await expect(syncLockService.isLocked(dataSourceId)).resolves.toBe(true);

    // Wait past the TTL WITHOUT ever calling release() and without the
    // heartbeat ever renewing it -- empirically, not by reasoning about
    // the TTL, prove the lock self-heals.
    await new Promise((resolve) => setTimeout(resolve, shortTtlMs + 500));

    expect(await syncLockService.isLocked(dataSourceId)).toBe(false);

    // And the source is genuinely usable again: a fresh acquire succeeds.
    const recovered = await syncLockService.acquire(dataSourceId);
    expect(recovered).not.toBeNull();
    await recovered?.release();

    // Cleanup: stop the crashed handle's still-running (but never firing
    // within this test's window) heartbeat timer.
    await crashedHandle?.release();
  });

  it("a lock-release failure does not turn a successful run into a thrown error or a FAILED job (T-2, final whole-branch review)", async () => {
    // T-2: `release()` is awaited inside `runInTenantContext`'s
    // `finally`, which is the SOLE exit path out of a run whose
    // `SyncJob` row may already durably read SUCCESS. Before the fix, a
    // `finally` block that throws replaces whatever the `try` block was
    // about to return -- so a Redis blip at exactly the release instant
    // would make `pipeline.run()` REJECT even though Postgres already
    // committed SUCCESS, and BullMQ would then record the job FAILED:
    // two systems of record disagreeing about whether the sync ran.
    const org = await organization();
    const { baseUrl } = await startServer([
      { id: "1", name: "Lock Release Test", email: "lockrelease@example.test" },
    ]);
    const dataSourceId = await createDataSource(org, baseUrl);

    const originalAcquire = syncLockService.acquire.bind(syncLockService);
    const acquireSpy = jest
      .spyOn(syncLockService, "acquire")
      .mockImplementation(async (...args) => {
        const handle = await originalAcquire(...args);
        if (!handle) {
          return handle;
        }
        // Simulate the exact failure mode: the real lock/heartbeat is
        // still cleaned up underneath (so this test does not itself
        // leak a lock or a live heartbeat timer), but the handle
        // `runInTenantContext` awaits throws, as a genuine Redis EVAL
        // failure would.
        return {
          ...handle,
          release: async () => {
            await handle.release();
            throw new Error("simulated Redis blip during lock release");
          },
        };
      });

    let result: Awaited<ReturnType<typeof pipeline.run>> | undefined;
    let thrown: unknown;
    try {
      result = await pipeline.run(dataSourceId, "t2-lock-release-failure");
    } catch (err) {
      thrown = err;
    } finally {
      acquireSpy.mockRestore();
    }

    // The fix, directly: `run()` resolves -- it does not reject just
    // because releasing the lock afterward failed.
    expect(thrown).toBeUndefined();
    expect(result?.status).toBe("SUCCESS");

    // And Postgres's own record of the run agrees -- no contradiction
    // between what `run()` returned and what was persisted.
    const job = await TenantContext.run(tenant(org), () =>
      prisma.scoped.syncJob.findFirstOrThrow({ where: { dataSourceId } }),
    );
    expect(job.status).toBe("SUCCESS");
  });

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
      (list.body as Array<{ id: string }>).some(
        (j) => j.id === summary.syncJobId,
      ),
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/api/sync-jobs/${summary.syncJobId}`)
      .set("Authorization", `Bearer ${reader.accessToken}`)
      .send();
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      id: summary.syncJobId,
      status: "SUCCESS",
    });

    // Task 18 review, Minor 8: a random UUID proves nothing about tenant
    // scoping (it would 404 even with no scoping at all, since no row
    // anywhere has that id). The case that actually matters is a REAL
    // SyncJob belonging to a DIFFERENT organization -- that must also
    // 404 (never 403, which would disclose that the row exists).
    const otherOrg = await organization();
    const { baseUrl: otherBaseUrl } = await startServer([
      { id: "1", name: "Other Org Person", email: "other@example.test" },
    ]);
    const otherDataSourceId = await createDataSource(otherOrg, otherBaseUrl);
    const otherSummary = await pipeline.run(
      otherDataSourceId,
      "other-org-test",
    );

    const crossOrg = await request(app.getHttpServer())
      .get(`/api/sync-jobs/${otherSummary.syncJobId}`)
      .set("Authorization", `Bearer ${reader.accessToken}`)
      .send();
    expect(crossOrg.status).toBe(404);
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
    // Task 18 review, Minor 7: the org timezone is an explicit spec
    // requirement (Organization.timezone default "Asia/Kolkata") -- a
    // regression to UTC (or any other zone) must fail this test, not
    // slip through because only the pattern was checked.
    expect(thisSourceSchedulers[0]?.tz).toBe("Asia/Kolkata");

    const toManual = await request(app.getHttpServer())
      .patch(`/api/data-sources/${dataSourceId}`)
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send({ syncFrequency: "MANUAL" });
    expect(toManual.status).toBe(200);
    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(0);
  });

  it("reconciliation prunes an orphaned scheduler whose DataSource no longer exists (Important 3 regression N-3)", async () => {
    const org = await organization();
    const { baseUrl } = await startServer([]);
    const dataSourceId = await createDataSource(org, baseUrl);
    await syncQueueService.upsertSchedule(
      dataSourceId,
      "HOURLY",
      "Asia/Kolkata",
    );
    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(1);

    // Simulate exactly the drift Important 3 exists for: the DataSource
    // row is gone (e.g. `DELETE /api/data-sources/:id` during a Redis
    // blip that made `removeScheduleBestEffort` swallow the cleanup
    // call), but its repeatable scheduler is still registered in Redis.
    await TenantContext.run(tenant(org), () =>
      prisma.scoped.dataSource.delete({ where: { id: dataSourceId } }),
    );
    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(1);
    expect(await syncQueueService.listScheduledDataSourceIds()).toContain(
      dataSourceId,
    );

    await scheduleReconciliationService.reconcile();

    expect(await syncQueueService.schedulerCount(dataSourceId)).toBe(0);
    expect(await syncQueueService.listScheduledDataSourceIds()).not.toContain(
      dataSourceId,
    );
  });

  it("reads the Redis schedule snapshot BEFORE the Postgres data-source snapshot, so a source created in between is never pruned (I-4 / T-1, final whole-branch review)", async () => {
    // The old code took both snapshots via one `Promise.all`, so a data
    // source created concurrently with reconciliation could commit to
    // Postgres AND register its Redis scheduler strictly BETWEEN the two
    // reads finishing -- the review's exact failure scenario: instance
    // A's Postgres read misses it, its still-in-flight Redis read
    // catches it, and the backward pass then PERMANENTLY prunes a live
    // customer's just-created schedule. This asserts the actual
    // guarantee the fix makes -- the Postgres read is not even ISSUED
    // until the Redis read has fully resolved -- by making the Redis
    // read artificially slow and checking the Postgres call does not
    // start until that delay has elapsed. The old `Promise.all` code
    // fires both calls in the same tick, so this fails against it with a
    // near-zero gap; the fix's sequential `await` cannot start the
    // Postgres call until the delayed Redis promise settles.
    const injectedPrisma = app.get(PrismaService);
    const originalListScheduledDataSourceIds =
      syncQueueService.listScheduledDataSourceIds.bind(syncQueueService);
    const originalFindMany = injectedPrisma.dataSource.findMany.bind(
      injectedPrisma.dataSource,
    );
    const artificialDelayMs = 200;
    const startedAt = Date.now();

    const redisSpy = jest
      .spyOn(syncQueueService, "listScheduledDataSourceIds")
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, artificialDelayMs));
        return originalListScheduledDataSourceIds();
      });
    let postgresCalledAfterMs: number | null = null;
    const pgSpy = jest
      .spyOn(injectedPrisma.dataSource, "findMany")
      .mockImplementation((...args: Parameters<typeof originalFindMany>) => {
        postgresCalledAfterMs = Date.now() - startedAt;
        return originalFindMany(...args);
      });

    try {
      await scheduleReconciliationService.reconcile();
    } finally {
      redisSpy.mockRestore();
      pgSpy.mockRestore();
    }

    if (postgresCalledAfterMs === null) {
      throw new Error(
        "prisma.dataSource.findMany was never called by reconcile()",
      );
    }
    expect(postgresCalledAfterMs).toBeGreaterThanOrEqual(artificialDelayMs);
  });

  /**
   * MVP1 evaluation Check 4/6 finding: running two DIFFERENT sources'
   * syncs concurrently, where a record in each shares the same email
   * (a normal occurrence -- the same person appearing in two systems),
   * used to race on `PrincipalIdentifier` ownership. The per-source lock
   * (`SyncLockService`) only ever serializes a source against itself, so
   * two concurrent transactions from DIFFERENT sources could each read
   * "no principal owns this email yet", each create a new principal, and
   * whichever committed second hit an ownership conflict that aborted
   * its ENTIRE per-record transaction -- silently discarding a
   * `SourceRecord` that had already been written earlier in that same
   * transaction, with no `MatchCandidate` raised to surface it.
   *
   * No timing hook is needed to make this reliable: with enough
   * colliding pairs processed by two genuinely concurrent
   * `pipeline.run()` calls, real interleaving of their per-record
   * transactions triggers the race on its own, every run.
   *
   * Explicit 20000ms test timeout (this file's own convention for its
   * other heavy tests, e.g. the two above closing `}, 20000);`):
   * 50 real record-transactions (25 pairs x 2 sources), each taking an
   * advisory lock, matching, linking, and -- for the half of each pair
   * that loses the lock race -- blocking until the winner commits,
   * measured at ~5.3s on this machine against Jest's 5000ms default,
   * which fails this test on any run a shade slower and never lets it
   * reach its own assertions. 20000ms is chosen for real headroom over
   * that measurement, not merely to clear it.
   */
  it("concurrent syncs across two sources sharing identifiers never drop a record (cross-source identifier-ownership race)", async () => {
    const org = await organization();
    const PAIRS = 25;
    const sourceARecords = Array.from({ length: PAIRS }, (_, i) => ({
      id: `a-${i}`,
      name: `Race Person A${i}`,
      email: `race${i}@example.test`,
      city: "Pune",
    }));
    const sourceBRecords = Array.from({ length: PAIRS }, (_, i) => ({
      id: `b-${i}`,
      name: `Race Person B${i}`,
      email: `race${i}@example.test`,
      city: "Mumbai",
    }));
    const { baseUrl: baseUrlA } = await startServer(sourceARecords);
    const { baseUrl: baseUrlB } = await startServer(sourceBRecords);
    const dataSourceA = await createDataSource(org, baseUrlA);
    const dataSourceB = await createDataSource(org, baseUrlB);

    const [summaryA, summaryB] = await Promise.all([
      pipeline.run(dataSourceA, "race-A"),
      pipeline.run(dataSourceB, "race-B"),
    ]);

    // The pipeline read PAIRS records from each source -- every single one
    // of those 2*PAIRS records MUST land in SourceRecord. Losing a race for
    // identifier ownership is never grounds for discarding someone's
    // personal data.
    const [sourceCountA, sourceCountB] = await TenantContext.run(
      tenant(org),
      () =>
        Promise.all([
          prisma.scoped.sourceRecord.count({
            where: { dataSourceId: dataSourceA },
          }),
          prisma.scoped.sourceRecord.count({
            where: { dataSourceId: dataSourceB },
          }),
        ]),
    );
    expect(summaryA.recordsRead).toBe(PAIRS);
    expect(summaryB.recordsRead).toBe(PAIRS);
    expect(sourceCountA).toBe(PAIRS);
    expect(sourceCountB).toBe(PAIRS);
    expect(summaryA.recordsFailed).toBe(0);
    expect(summaryB.recordsFailed).toBe(0);

    // Not merely "nothing was dropped" -- identity resolution under
    // concurrency reaches the SAME correct outcome sequential syncing
    // would: every colliding pair resolves to exactly one shared
    // principal (25 links total across the pair that created it and the
    // pair that exact-matched onto it), with zero spurious duplicate
    // principals and nothing left needing human review.
    const [principalCount, activeLinkCount, candidateCount] =
      await TenantContext.run(tenant(org), () =>
        Promise.all([
          prisma.scoped.dataPrincipal.count({}),
          prisma.scoped.identityLink.count({ where: { status: "ACTIVE" } }),
          prisma.scoped.matchCandidate.count({}),
        ]),
      );
    expect(principalCount).toBe(PAIRS);
    expect(activeLinkCount).toBe(PAIRS * 2);
    expect(candidateCount).toBe(0);
  }, 20000);
});
