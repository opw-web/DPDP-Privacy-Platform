import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import { PRINCIPALS_PAGE_SIZE } from "../src/modules/principals/dto/list-principals.dto";
import { buildPrincipalSearchQuery } from "../src/modules/principals/principal-search-query";

/**
 * Task 20 endpoint gate. Fixtures are deliberately assembled directly at
 * the persistence layer: these tests prove the read API's safety even when
 * it encounters an old/corrupt field whose recorded source no longer exists.
 */
describe("Principals API (e2e)", () => {
  let app: INestApplication;
  let appPrisma: PrismaService;
  const prisma = new PrismaService();
  const organizationIds: string[] = [];
  let captureQueries = false;
  let queryCount = 0;

  type EmployeeSession = { accessToken: string };
  type Fixture = {
    organizationId: string;
    principalId: string;
    childPrincipalId: string;
    unattributedNamePrincipalId: string;
    unresolvedNamePrincipalId: string;
    twoPrimaryNamesPrincipalId: string;
    otherOrganizationPrincipalId: string;
    full: EmployeeSession;
    auditor: EmployeeSession;
  };
  let fixture: Fixture;

  // Only "Index Scan" / "Index Only Scan" / "Bitmap Index Scan" nodes carry
  // an "Index Name" in Postgres's EXPLAIN (FORMAT JSON) output, so in
  // practice this already implied a scan -- but Task 20 fix round 3
  // (Important 3) asked for the check to say so explicitly, so a future
  // plan shape that merely *mentions* an index name somewhere else in the
  // tree (a constraint, a comment-like field) cannot silently satisfy it.
  const INDEX_SCAN_NODE_TYPES = new Set([
    "Index Scan",
    "Index Only Scan",
    "Bitmap Index Scan",
  ]);

  function indexScanNames(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap(indexScanNames);
    }
    if (!value || typeof value !== "object") {
      return [];
    }
    const record = value as Record<string, unknown>;
    const nodeType =
      typeof record["Node Type"] === "string" ? record["Node Type"] : "";
    const isIndexScanNode = INDEX_SCAN_NODE_TYPES.has(nodeType);
    return [
      ...(isIndexScanNode && typeof record["Index Name"] === "string"
        ? [record["Index Name"]]
        : []),
      ...Object.values(record).flatMap(indexScanNames),
    ];
  }

  async function ensurePermission(code: string): Promise<void> {
    const permission = PERMISSIONS.find((row) => row.code === code);
    if (!permission) {
      throw new Error(`Missing real seeded permission ${code}`);
    }
    await prisma.permission.upsert({
      where: { code },
      create: permission,
      update: {},
    });
  }

  async function employeeSession(
    organizationId: string,
    permissions: string[],
    label: string,
  ): Promise<EmployeeSession> {
    await Promise.all(
      permissions.map((permission) => ensurePermission(permission)),
    );
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `${label}-${randomUUID()}`,
        name: label,
        permissions: {
          create: permissions.map((permissionCode) => ({ permissionCode })),
        },
      },
    });
    const password = "CorrectHorseBattery9!";
    const email = `${randomUUID()}@principals.example.test`;
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: label,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        status: "ACTIVE",
        roleId: role.id,
      },
    });
    const response = await request(app.getHttpServer())
      .post("/api/auth/employee/login")
      .send({ email, password });
    expect(response.status).toBe(200);
    return { accessToken: response.body.accessToken as string };
  }

  async function createSource(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const source = await prisma.dataSource.create({
      data: {
        organizationId,
        name,
        systemType: "PRINCIPALS_TEST",
        baseUrl: "https://principals.example.test",
        recordsPath: "data",
        externalIdField: "id",
      },
    });
    return source.id;
  }

  async function createPrincipal(
    organizationId: string,
    displayName: string,
    ageStatus: "ADULT" | "CHILD",
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName,
        ageStatus,
      },
    });
    return principal.id;
  }

  async function createFixture(): Promise<Fixture> {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    organizationIds.push(organizationId, otherOrganizationId);
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: `Principals ${organizationId}` },
        { id: otherOrganizationId, name: `Other ${otherOrganizationId}` },
      ],
    });
    const ecommerceId = await createSource(organizationId, "E-commerce");
    const marketingId = await createSource(organizationId, "Marketing DB");
    const otherSourceId = await createSource(
      otherOrganizationId,
      "Other source",
    );
    const principalId = await createPrincipal(
      organizationId,
      "Aman Verma",
      "ADULT",
    );
    const childPrincipalId = await createPrincipal(
      organizationId,
      "Asha Nair",
      "CHILD",
    );
    const unattributedNamePrincipalId = await createPrincipal(
      organizationId,
      "Unattributed Display Name",
      "ADULT",
    );
    const unresolvedNamePrincipalId = await createPrincipal(
      organizationId,
      "Unresolved Stored Display Name",
      "ADULT",
    );
    const twoPrimaryNamesPrincipalId = await createPrincipal(
      organizationId,
      "Two Primary Names Filler",
      "ADULT",
    );
    const otherOrganizationPrincipalId = await createPrincipal(
      otherOrganizationId,
      "Other Aman",
      "ADULT",
    );

    await prisma.principalDataField.createMany({
      data: [
        {
          organizationId,
          dataPrincipalId: principalId,
          canonicalField: "FULL_NAME",
          value: "Aman Verma",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: principalId,
          canonicalField: "EMAIL",
          value: "aman@example.com",
          dataCategory: "CONTACT",
          sourceIds: [ecommerceId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: principalId,
          canonicalField: "PHONE",
          value: "+919876543210",
          dataCategory: "CONTACT",
          sourceIds: [marketingId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: principalId,
          canonicalField: "CUSTOMER_ID",
          value: "cust-aman-44",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceId],
          isPrimary: true,
        },
        // Simulates stale data after a source was removed. It must never
        // leak out as an apparently-attributed value.
        {
          organizationId,
          dataPrincipalId: principalId,
          canonicalField: "ADDRESS_LINE1",
          value: "42 Unattributable Lane",
          dataCategory: "LOCATION",
          sourceIds: [randomUUID()],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: childPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Asha Nair",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceId],
          isPrimary: true,
        },
        // The durable profile row contains a name, but its provenance is
        // broken. Detail must not fall back to DataPrincipal.displayName.
        {
          organizationId,
          dataPrincipalId: unresolvedNamePrincipalId,
          canonicalField: "FULL_NAME",
          value: "Unresolved Field Name",
          dataCategory: "IDENTITY",
          sourceIds: [randomUUID()],
          isPrimary: true,
        },
        // Two primary FULL_NAME rows for the same principal, permitted by
        // the @@unique([dataPrincipalId, canonicalField, value]) constraint.
        // "Aarti Rao" sorts alphabetically first but its source is stale;
        // "Zoya Khan" sorts second but is fully attributable. Task 20 fix
        // round 3 (Important 6) found list() picked the alphabetically-first
        // candidate BEFORE checking whether it resolved, while detail
        // resolved first and picked second -- so list showed null while
        // detail showed "Zoya Khan" for the same principal. Both paths must
        // now resolve provenance before the tie-break and agree on
        // "Zoya Khan".
        {
          organizationId,
          dataPrincipalId: twoPrimaryNamesPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Aarti Rao",
          dataCategory: "IDENTITY",
          sourceIds: [randomUUID()],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: twoPrimaryNamesPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Zoya Khan",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceId],
          isPrimary: true,
        },
        {
          organizationId: otherOrganizationId,
          dataPrincipalId: otherOrganizationPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Other Aman",
          dataCategory: "IDENTITY",
          sourceIds: [otherSourceId],
          isPrimary: true,
        },
      ],
    });

    const sourceRecord = await prisma.sourceRecord.create({
      data: {
        organizationId,
        dataSourceId: ecommerceId,
        sourceRecordKey: "aman-source-record",
        rawPayload: { email: "aman@example.com", name: "Aman Verma" },
        payloadHash: randomUUID(),
      },
    });
    const normalized = await prisma.normalizedRecord.create({
      data: {
        organizationId,
        sourceRecordId: sourceRecord.id,
        fullName: "Aman Verma",
      },
    });
    await prisma.identityLink.create({
      data: {
        organizationId,
        dataPrincipalId: principalId,
        normalizedRecordId: normalized.id,
        confidence: "EXACT",
        matchedOn: { fixture: true },
      },
    });

    const ecommerceRecipient = await prisma.dataRecipient.create({
      data: {
        organizationId,
        name: "Ecom Processor",
        type: "DATA_PROCESSOR",
        contractExists: true,
      },
    });
    const marketingRecipient = await prisma.dataRecipient.create({
      data: {
        organizationId,
        name: "Marketing Processor",
        type: "DATA_PROCESSOR",
        contractExists: true,
      },
    });
    const foreignRecipient = await prisma.dataRecipient.create({
      data: {
        organizationId: otherOrganizationId,
        name: "Foreign recipient",
        type: "DATA_PROCESSOR",
        contractExists: true,
      },
    });
    const purpose = await prisma.processingPurpose.create({
      data: {
        organizationId,
        code: `PURPOSE-${randomUUID()}`,
        name: "Fixture purpose",
        description: "A fixture processing purpose",
        lawfulBasis: "CONSENT",
        basisJustification: "Fixture consent record",
      },
    });
    await prisma.sharingActivity.createMany({
      data: [
        {
          organizationId,
          recipientId: ecommerceRecipient.id,
          purposeId: purpose.id,
          dataCategories: ["CONTACT"],
          description: "E-commerce order communications",
          sourceIds: [ecommerceId],
          startedAt: new Date(),
        },
        {
          organizationId,
          recipientId: marketingRecipient.id,
          purposeId: purpose.id,
          dataCategories: ["CONTACT"],
          description: "Marketing messages",
          sourceIds: [marketingId],
          startedAt: new Date(),
        },
        // A corrupt scalar FK can be inserted outside the scoped service.
        // The recipient endpoint must still not serialize Org B's row.
        {
          organizationId,
          recipientId: foreignRecipient.id,
          purposeId: purpose.id,
          dataCategories: ["CONTACT"],
          description: "Corrupt cross-tenant recipient reference",
          sourceIds: [ecommerceId],
          startedAt: new Date(),
        },
      ],
    });

    const full = await employeeSession(
      organizationId,
      ["CAN_VIEW_PRINCIPALS", "CAN_VIEW_ALL_PERSONAL_DATA"],
      "Full viewer",
    );
    const auditor = await employeeSession(
      organizationId,
      ["CAN_VIEW_PRINCIPALS"],
      "Auditor",
    );
    return {
      organizationId,
      principalId,
      childPrincipalId,
      unattributedNamePrincipalId,
      unresolvedNamePrincipalId,
      twoPrimaryNamesPrincipalId,
      otherOrganizationPrincipalId,
      full,
      auditor,
    };
  }

  beforeAll(async () => {
    process.env["PRISMA_QUERY_LOG"] = "1";
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    appPrisma = app.get(PrismaService);
    (
      appPrisma as unknown as {
        $on(event: "query", listener: (event: Prisma.QueryEvent) => void): void;
      }
    ).$on("query", () => {
      if (captureQueries) {
        queryCount += 1;
      }
    });
    await prisma.$connect();
    fixture = await createFixture();
  });

  afterAll(async () => {
    if (organizationIds.length) {
      await prisma.sharingActivity.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataRecipient.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.processingPurpose.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.identityLink.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalDataField.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataPrincipal.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.normalizedRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.sourceRecord.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.counter.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await app.close();
    await prisma.$disconnect();
    delete process.env["PRISMA_QUERY_LOG"];
    // This hook also deletes the 50k DataPrincipal + 50k PrincipalDataField
    // rows the trigram-search test above creates. Jest's default hook
    // timeout is the same global testTimeout (15_000ms) as a test's, and
    // under full-suite CPU contention that cleanup alone can outrun it --
    // same load-sensitivity as that test's own timeout above, so it gets
    // the same generous treatment rather than a fixture shrink.
  }, 120_000);

  const authenticated = (session: EmployeeSession) => ({
    Authorization: `Bearer ${session.accessToken}`,
  });

  it("searches a profile by partial name, email and phone, and filters age status", async () => {
    for (const q of ["man Ver", "aman@example", "987654"]) {
      const response = await request(app.getHttpServer())
        .get("/api/principals")
        .query({ q })
        .set(authenticated(fixture.full));
      expect(response.status).toBe(200);
      expect(
        response.body.items.map((row: { id: string }) => row.id),
      ).toContain(fixture.principalId);
    }
    const childResponse = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ ageStatus: "CHILD" })
      .set(authenticated(fixture.full));
    expect(childResponse.status).toBe(200);
    expect(
      childResponse.body.items.map((row: { id: string }) => row.id),
    ).toEqual([fixture.childPrincipalId]);
  });

  it("uses both tenant-bound trigram indexes for populated search candidates", async () => {
    const searchTerm = "zzprincipalsearchneedle";
    const totalSyntheticPrincipals = 50_000;
    const syntheticPrincipalIds = Array.from(
      { length: totalSyntheticPrincipals },
      () => randomUUID(),
    );
    await prisma.dataPrincipal.createMany({
      data: syntheticPrincipalIds.map((id, index) => ({
        id,
        organizationId: fixture.organizationId,
        reference: `DP-SEARCH-FILLER-${index}-${randomUUID()}`,
        displayName:
          index === 0
            ? `${searchTerm} visible name`
            : `Synthetic principal ${index} ${randomUUID()}`,
        ageStatus: "ADULT",
      })),
    });
    const source = await prisma.dataSource.findFirstOrThrow({
      where: { organizationId: fixture.organizationId },
      select: { id: true },
    });
    await prisma.principalDataField.createMany({
      data: syntheticPrincipalIds.map((dataPrincipalId, index) => ({
        organizationId: fixture.organizationId,
        dataPrincipalId,
        canonicalField: "EMAIL",
        value:
          index === 0
            ? `${searchTerm}@example.test`
            : `filler-${index}-${randomUUID()}@example.test`,
        dataCategory: "CONTACT",
        sourceIds: [source.id],
        isPrimary: true,
      })),
    });
    // Make the planner account for this deliberately non-trivial fixture
    // before asserting the exact candidate query used by PrincipalsService.
    await prisma.$executeRawUnsafe('ANALYZE "DataPrincipal"');
    await prisma.$executeRawUnsafe('ANALYZE "PrincipalDataField"');
    // Built through the SAME `buildPrincipalSearchQuery` the service calls,
    // with the SAME arguments an unfiltered, page-1 HTTP request for this
    // term would produce -- not a hand-copied SQL string. Task 20 fix round
    // 3 (Important 2) found the previous copy had drifted (LIMIT 50 vs the
    // service's real PRINCIPALS_PAGE_SIZE of 25, and a literal
    // `NULL::"AgeStatus"` where the service binds a parameter -- literal vs
    // parameter is exactly what can change the planner's choice), so it
    // could stay green after the service's query changed underneath it.
    // Sharing the builder makes that drift impossible: EXPLAIN-ing its
    // output is provably EXPLAIN-ing what production runs.
    const searchQuery = buildPrincipalSearchQuery({
      organizationId: fixture.organizationId,
      term: searchTerm,
      ageStatus: null,
      limit: PRINCIPALS_PAGE_SIZE,
      offset: 0,
    });
    const explain = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>(
      Prisma.sql`EXPLAIN (FORMAT JSON, COSTS FALSE) ${searchQuery}`,
    );
    const indexes = indexScanNames(explain[0]?.["QUERY PLAN"]);
    expect(indexes).toContain("principal_name_trgm");
    expect(indexes).toContain("pdf_value_trgm");

    const startedAt = performance.now();
    const response = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: searchTerm })
      .set(authenticated(fixture.full));
    const elapsedMs = performance.now() - startedAt;
    expect(response.status).toBe(200);
    expect(
      response.body.items.map((item: { id: string }) => item.id),
    ).toContain(syntheticPrincipalIds[0]);
    expect(elapsedMs).toBeLessThan(300);
    // Measured this test's own body (the two 50k-row `createMany` calls,
    // both ANALYZEs, the EXPLAIN, and the HTTP round trip) at ~14.4s on an
    // idle database -- the previous 20_000 budget left under 30% headroom,
    // and under the full suite's real contention that margin was consumed
    // outright: observed both a bare Jest timeout AND, once, a genuine
    // Postgres deadlock (`40P01`) between this test's still-running
    // `principalDataField.createMany` and `afterAll`'s `deleteMany` for the
    // same organization, once the timed-out test body kept executing in
    // the background past its own reported failure (Jest cannot cancel an
    // in-flight promise). 60_000 turned out to still be load-sensitive:
    // under full-suite CPU contention this test alone was observed to take
    // ~86s (it passes in ~86s run alone, well past 60s), so it needs
    // headroom well above the idle-system baseline, not just above it.
    // 180_000 gives that headroom without shrinking the 50k-row fixture or
    // loosening the sub-300ms query-latency assertion above, both of which
    // are the actual point of this test.
  }, 180_000);

  it("does not match a search term against a non-searchable canonical field, even when the same principal also owns a contact identifier", async () => {
    // fixture.principalId has both an EMAIL field (a searchable canonical
    // field) and an ADDRESS_LINE1 field containing "42 Unattributable Lane"
    // (not searchable per the brief -- only EMAIL/PHONE/CUSTOMER_ID are).
    // Task 20 fix round 3 (Important 1) found the previous query's
    // canonical-field restriction was never actually tied to the row that
    // matched: `INTERSECT` combined two independently-computed id sets, so
    // "any field value matched" INTERSECT "tenant has a contact identifier"
    // let an address match through as long as the principal also had an
    // email -- widening the masked-field equality oracle to every canonical
    // field. This search must return nothing.
    const response = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: "Unattributable Lane" })
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    expect(
      response.body.items.map((item: { id: string }) => item.id),
    ).not.toContain(fixture.principalId);
  });

  it("never returns another tenant's principal from the raw-SQL search query", async () => {
    // otherOrganizationPrincipalId ("Other Aman") lives in a second
    // organization and would match `q: "Aman"` on name alone. The raw
    // search query bypasses the Prisma tenant-scoping extension entirely
    // (see the class doc comment), so its own explicit tenant predicates
    // are the only thing standing between one org's search and another's
    // principals -- and, per Task 20 fix round 3 (Important 7), nothing in
    // this suite asserted that before now. Deleting a tenant predicate from
    // `buildPrincipalSearchQuery` must fail this test.
    const response = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: "Aman" })
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    const ids = response.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(fixture.principalId);
    expect(ids).not.toContain(fixture.otherOrganizationPrincipalId);
  });

  it("uses an attributable FULL_NAME for list display or emits no name", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: "Unattributed Display" })
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        id: fixture.unattributedNamePrincipalId,
        displayName: null,
        sources: [],
      }),
    ]);
  });

  it("picks the same attributable name on list and detail when a principal has two primary FULL_NAME fields", async () => {
    // fixture.twoPrimaryNamesPrincipalId carries "Aarti Rao" (alphabetically
    // first, unattributable source) and "Zoya Khan" (alphabetically second,
    // fully attributable). Both read paths must filter to provenance-
    // complete candidates BEFORE the tie-break, so both must land on
    // "Zoya Khan" -- see Task 20 fix round 3, Important 6.
    const list = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: "Two Primary Names Filler" })
      .set(authenticated(fixture.full));
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({
        id: fixture.twoPrimaryNamesPrincipalId,
        displayName: "Zoya Khan",
        sources: [{ id: expect.any(String), name: "E-commerce" }],
      }),
    ]);

    const detail = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.twoPrimaryNamesPrincipalId}`)
      .set(authenticated(fixture.full));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      displayName: "Zoya Khan",
      displayNameSources: [{ id: expect.any(String), name: "E-commerce" }],
    });
  });

  it("never serializes an unproven stored detail display name", async () => {
    const authorized = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}`)
      .set(authenticated(fixture.full));
    expect(authorized.status).toBe(200);
    expect(authorized.body).toMatchObject({
      displayName: "Aman Verma",
      displayNameSources: [{ id: expect.any(String), name: "E-commerce" }],
    });
    const auditor = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}`)
      .set(authenticated(fixture.auditor));
    expect(auditor.status).toBe(200);
    expect(auditor.body.displayName).not.toBe("Aman Verma");
    expect(auditor.body.displayNameSources).toEqual([
      { id: expect.any(String), name: "E-commerce" },
    ]);

    const unresolved = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.unresolvedNamePrincipalId}`)
      .set(authenticated(fixture.full));
    expect(unresolved.status).toBe(200);
    expect(unresolved.body).toMatchObject({
      id: fixture.unresolvedNamePrincipalId,
      displayName: null,
      displayNameSources: [],
    });
    expect(JSON.stringify(unresolved.body)).not.toContain(
      "Unresolved Stored Display Name",
    );
    expect(JSON.stringify(unresolved.body)).not.toContain(
      "Unresolved Field Name",
    );
  });

  it("returns complete source names on each detail value and omits unresolved provenance", async () => {
    const before = await prisma.auditEvent.count({
      where: {
        subjectPrincipalId: fixture.principalId,
        action: "PERSONAL_DATA_VIEWED",
      },
    });
    const response = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}`)
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    expect(response.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalField: "EMAIL",
          value: "aman@example.com",
          sources: [{ id: expect.any(String), name: "E-commerce" }],
        }),
        expect.objectContaining({
          canonicalField: "PHONE",
          value: "+919876543210",
          sources: [{ id: expect.any(String), name: "Marketing DB" }],
        }),
      ]),
    );
    expect(
      response.body.fields.some(
        (field: { canonicalField: string }) =>
          field.canonicalField === "ADDRESS_LINE1",
      ),
    ).toBe(false);
    expect(
      response.body.fields.every(
        (field: { sources: unknown[] }) => field.sources.length > 0,
      ),
    ).toBe(true);
    const after = await prisma.auditEvent.count({
      where: {
        subjectPrincipalId: fixture.principalId,
        action: "PERSONAL_DATA_VIEWED",
      },
    });
    expect(after - before).toBe(1);
  });

  it("masks list and detail values for an actor without CAN_VIEW_ALL_PERSONAL_DATA", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: "Aman" })
      .set(authenticated(fixture.auditor));
    expect(list.status).toBe(200);
    expect(
      list.body.items.find(
        (item: { id: string }) => item.id === fixture.principalId,
      ).displayName,
    ).not.toBe("Aman Verma");
    const detail = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}`)
      .set(authenticated(fixture.auditor));
    expect(detail.status).toBe(200);
    expect(
      detail.body.fields.find(
        (field: { canonicalField: string }) => field.canonicalField === "EMAIL",
      ).value,
    ).not.toBe("aman@example.com");
    expect(
      detail.body.fields.find(
        (field: { canonicalField: string }) => field.canonicalField === "PHONE",
      ).value,
    ).not.toBe("+919876543210");
    expect(
      detail.body.fields.find(
        (field: { canonicalField: string }) =>
          field.canonicalField === "CUSTOMER_ID",
      ).value,
    ).not.toBe("cust-aman-44");
    expect(JSON.stringify(list.body)).not.toContain("cust-aman-44");
    const customerIdSearch = await request(app.getHttpServer())
      .get("/api/principals")
      .query({ q: "cust-aman-44" })
      .set(authenticated(fixture.auditor));
    expect(customerIdSearch.status).toBe(200);
    expect(JSON.stringify(customerIdSearch.body)).not.toContain("cust-aman-44");
  });

  it("returns only recipients whose sharing sources intersect the profile's contributing sources", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.childPrincipalId}/recipients`)
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    expect(
      response.body.map(
        (activity: { recipient: { name: string } }) => activity.recipient.name,
      ),
    ).toEqual(["Ecom Processor"]);
  });

  it("returns lineage topology without exposing another unmasked value surface", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}/lineage`)
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    expect(response.body.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalField: "EMAIL",
          sources: [{ id: expect.any(String), name: "E-commerce" }],
        }),
      ]),
    );
    expect(
      response.body.fields.every(
        (field: Record<string, unknown>) => !("value" in field),
      ),
    ).toBe(true);
  });

  it("makes cross-tenant principals indistinguishable from absent principals", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.otherOrganizationPrincipalId}`)
      .set(authenticated(fixture.full));
    expect(response.status).toBe(404);
  });

  it("protects source records with the elevated permission and writes exactly one access event", async () => {
    const forbidden = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}/source-records`)
      .set(authenticated(fixture.auditor));
    expect(forbidden.status).toBe(403);
    const before = await prisma.auditEvent.count({
      where: {
        subjectPrincipalId: fixture.principalId,
        action: "PERSONAL_DATA_VIEWED",
      },
    });
    const response = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}/source-records`)
      .set(authenticated(fixture.full));
    expect(response.status).toBe(200);
    expect(response.body.records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rawPayload: { email: "aman@example.com", name: "Aman Verma" },
          source: { name: "E-commerce", id: expect.any(String) },
        }),
      ]),
    );
    const after = await prisma.auditEvent.count({
      where: {
        subjectPrincipalId: fixture.principalId,
        action: "PERSONAL_DATA_VIEWED",
      },
    });
    expect(after - before).toBe(1);
  });

  it("keeps the detail route below the SQL query budget", async () => {
    queryCount = 0;
    captureQueries = true;
    const startedAt = performance.now();
    const response = await request(app.getHttpServer())
      .get(`/api/principals/${fixture.principalId}`)
      .set(authenticated(fixture.full));
    const elapsedMs = performance.now() - startedAt;
    captureQueries = false;
    expect(response.status).toBe(200);
    // `queryCount` only increments through the $on("query") listener, which
    // fires only if PRISMA_QUERY_LOG=1 was read before PrismaService's
    // constructor ran. Without this floor, a broken listener leaves
    // queryCount at 0 forever and `toBeLessThan(15)` passes while proving
    // nothing was measured -- Task 20 fix round 3, Important 5.
    expect(queryCount).toBeGreaterThan(0);
    expect(queryCount).toBeLessThan(15);
    // The test database is intentionally not the 500-record demo dataset,
    // so this is evidence the route itself stays comfortably within the
    // endpoint objective rather than a substitute for the demo-dataset run.
    expect(elapsedMs).toBeLessThan(500);
  });
});
