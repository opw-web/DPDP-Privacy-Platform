import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import type { Prisma } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

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
    otherOrganizationPrincipalId: string;
    full: EmployeeSession;
    auditor: EmployeeSession;
  };
  let fixture: Fixture;

  function indexNamesFromPlan(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap(indexNamesFromPlan);
    }
    if (!value || typeof value !== "object") {
      return [];
    }
    const record = value as Record<string, unknown>;
    return [
      ...(typeof record["Index Name"] === "string"
        ? [record["Index Name"]]
        : []),
      ...Object.values(record).flatMap(indexNamesFromPlan),
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
  });

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
    const explain = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (FORMAT JSON, COSTS FALSE)
      WITH "nameMatches" AS MATERIALIZED (
        SELECT "id"
        FROM "DataPrincipal"
        WHERE "displayName" ILIKE '%' || ${searchTerm} || '%'
      ), "fieldValueMatches" AS MATERIALIZED (
        SELECT "dataPrincipalId" AS "id"
        FROM "PrincipalDataField"
        WHERE "value" ILIKE '%' || ${searchTerm} || '%'
      ), "candidateIds" AS MATERIALIZED (
        (
          SELECT "id" FROM "nameMatches"
          INTERSECT
          SELECT "id" FROM "DataPrincipal" WHERE "organizationId" = ${fixture.organizationId}
        )
        UNION
        (
          SELECT "id" FROM "fieldValueMatches"
          INTERSECT
          SELECT "dataPrincipalId" AS "id"
          FROM "PrincipalDataField"
          WHERE "organizationId" = ${fixture.organizationId}
            AND "canonicalField" IN ('EMAIL'::"CanonicalField", 'PHONE'::"CanonicalField", 'CUSTOMER_ID'::"CanonicalField")
        )
      )
      SELECT principal."id", principal."reference", principal."ageStatus", principal."createdAt"
      FROM "DataPrincipal" AS principal
      INNER JOIN "candidateIds" AS candidate ON candidate."id" = principal."id"
      WHERE principal."organizationId" = ${fixture.organizationId}
        AND (NULL::"AgeStatus" IS NULL OR principal."ageStatus" = NULL::"AgeStatus")
      ORDER BY principal."displayName" ASC, principal."id" ASC
      OFFSET 0
      LIMIT 50
    `;
    const indexes = indexNamesFromPlan(explain[0]?.["QUERY PLAN"]);
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
  }, 20_000);

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
    expect(queryCount).toBeLessThan(15);
    // The test database is intentionally not the 500-record demo dataset,
    // so this is evidence the route itself stays comfortably within the
    // endpoint objective rather than a substitute for the demo-dataset run.
    expect(elapsedMs).toBeLessThan(500);
  });
});
