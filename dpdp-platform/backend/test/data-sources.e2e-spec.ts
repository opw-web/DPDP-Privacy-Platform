import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import {
  MockHttpServer,
  jsonHandler,
} from "../src/modules/connectors/test-support/mock-http-server";

/**
 * Task 12 gate (Check 14, spec lines 1073-1076): credentials are
 * encrypted at rest and `credentialCipher` never leaves the backend in
 * any API response.
 *
 * Every negative assertion below has a POSITIVE CONTROL in the same
 * test, and the "no credentialCipher in the response" assertions first
 * prove the response is a genuinely populated success (never a 401 or an
 * empty body passing `not.toHaveProperty` trivially) before walking the
 * full JSON tree for the forbidden key. `MockHttpServer` (Task 11) is
 * used for every real network call this file makes -- never a literal
 * "localhost:5001" or the demo company server.
 */
describe("Data sources (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const createdOrgIds: string[] = [];
  const servers: MockHttpServer[] = [];

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

  async function createOrgWithRole(
    roleName: string,
    permissionCodes: string[],
  ): Promise<{ organizationId: string; accessToken: string }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `DS Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);

    for (const code of permissionCodes) {
      await ensurePermission(code);
    }

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

    const email = `${roleName.toLowerCase()}-${randomUUID()}@example.com`;
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

    return { organizationId, accessToken: loginRes.body.accessToken as string };
  }

  async function createManager(): Promise<{
    organizationId: string;
    accessToken: string;
  }> {
    return createOrgWithRole("DATA_SOURCE_MANAGER", [
      "CAN_MANAGE_DATA_SOURCES",
    ]);
  }

  async function startRecordsServer(records: unknown[]): Promise<{
    server: MockHttpServer;
    baseUrl: string;
  }> {
    const server = new MockHttpServer(jsonHandler(200, { data: records }));
    servers.push(server);
    const port = await server.listen();
    return { server, baseUrl: `http://127.0.0.1:${port}/records` };
  }

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `Source ${randomUUID()}`,
      systemType: "REST_TEST_SYSTEM",
      baseUrl: "http://127.0.0.1:1/records",
      recordsPath: "data",
      externalIdField: "id",
      authType: "BEARER",
      credential: "super-secret-token-ABCD",
      paginationStyle: "PAGE",
      pageSize: 10,
      ...overrides,
    };
  }

  /**
   * Walks a full JSON-decoded response tree and fails if any key is
   * `credentialCipher` (case-insensitive) OR any string value equals a
   * known-forbidden literal (the raw cipher pulled straight from
   * Postgres for the same row). Used on every route that can return a
   * data source.
   */
  function assertNoCipherInTree(
    value: unknown,
    forbiddenLiterals: string[],
    path = "$",
  ): void {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) =>
        assertNoCipherInTree(item, forbiddenLiterals, `${path}[${i}]`),
      );
      return;
    }
    if (typeof value === "string") {
      for (const forbidden of forbiddenLiterals) {
        if (forbidden.length > 0 && value === forbidden) {
          throw new Error(
            `Found forbidden ciphertext literal at ${path}: ${value}`,
          );
        }
      }
      return;
    }
    if (typeof value === "object") {
      for (const [key, child] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (key.toLowerCase() === "credentialcipher") {
          throw new Error(
            `Found forbidden key "credentialCipher" at ${path}.${key}`,
          );
        }
        assertNoCipherInTree(child, forbiddenLiterals, `${path}.${key}`);
      }
    }
  }

  async function getStoredCipher(id: string): Promise<string | null> {
    const row = await prisma.dataSource.findUniqueOrThrow({ where: { id } });
    return row.credentialCipher;
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
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    await app.close();
    if (createdOrgIds.length > 0) {
      // AuditEvent rows are immutable by design (append-only triggers
      // reject DELETE) and carry no FK to Organization -- deliberately
      // left in place rather than "cleaned up", same convention as
      // audit.e2e-spec.ts.
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSourceField.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.rolePermission.deleteMany({
        where: { role: { organizationId: { in: createdOrgIds } } },
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

  it("POST /api/data-sources: response is a populated success with credentialHint, and credentialCipher never appears anywhere in list, detail, or create responses", async () => {
    const { accessToken } = await createManager();
    const payload = validPayload();

    const createRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    // POSITIVE CONTROL: a genuinely populated 201, not an error or empty body.
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toEqual(expect.any(String));
    expect(createRes.body.credentialHint).toBe("ABCD");
    expect(createRes.body.name).toBe(payload.name);

    const cipher = await getStoredCipher(createRes.body.id as string);
    expect(cipher).not.toBeNull();
    // The stored cipher is unreadable base64, not the plaintext credential.
    expect(cipher).not.toContain(payload.credential);

    // NEGATIVE, walking the full response tree: no credentialCipher key,
    // and the real cipher string never appears as a value.
    assertNoCipherInTree(createRes.body, [cipher as string]);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/data-sources/${createRes.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.credentialHint).toBe("ABCD");
    assertNoCipherInTree(detailRes.body, [cipher as string]);

    const listRes = await request(app.getHttpServer())
      .get("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const listed = (listRes.body as Array<Record<string, unknown>>).find(
      (row) => row["id"] === createRes.body.id,
    );
    expect(listed).toBeDefined();
    expect(listed?.["credentialHint"]).toBe("ABCD");
    assertNoCipherInTree(listRes.body, [cipher as string]);
  });

  it("PATCH without a credential leaves the stored cipher byte-for-byte unchanged; PATCH with a credential rotates it and writes DATA_SOURCE_CREDENTIALS_ROTATED", async () => {
    const { accessToken, organizationId } = await createManager();
    const createRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload());
    const id = createRes.body.id as string;
    const cipherBeforeAnyPatch = await getStoredCipher(id);

    // NEGATIVE: patching an unrelated field must not touch the cipher.
    const noCredPatch = await request(app.getHttpServer())
      .patch(`/api/data-sources/${id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ hostingCountry: "SG" });
    expect(noCredPatch.status).toBe(200);
    expect(noCredPatch.body.hostingCountry).toBe("SG");
    const cipherAfterNoCredPatch = await getStoredCipher(id);
    expect(cipherAfterNoCredPatch).toBe(cipherBeforeAnyPatch);

    // POSITIVE CONTROL: sending a new credential DOES change the stored cipher.
    const rotatePatch = await request(app.getHttpServer())
      .patch(`/api/data-sources/${id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ credential: "brand-new-secret-WXYZ" });
    expect(rotatePatch.status).toBe(200);
    expect(rotatePatch.body.credentialHint).toBe("WXYZ");
    assertNoCipherInTree(rotatePatch.body, [cipherAfterNoCredPatch as string]);
    const cipherAfterRotation = await getStoredCipher(id);
    expect(cipherAfterRotation).not.toBe(cipherAfterNoCredPatch);

    const rotationEvents = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: "DATA_SOURCE_CREDENTIALS_ROTATED",
        resourceId: id,
      },
    });
    expect(rotationEvents).toHaveLength(1);
    expect(JSON.stringify(rotationEvents[0]?.metadata)).not.toContain(
      "brand-new-secret-WXYZ",
    );

    // NEGATIVE control on the audit trail: the plain PATCH above did not
    // also write a rotation event (only the credentialed one did).
    const updateEvents = await prisma.auditEvent.findMany({
      where: { organizationId, action: "DATA_SOURCE_UPDATED", resourceId: id },
    });
    expect(updateEvents.length).toBeGreaterThanOrEqual(2);
  });

  it("containsOnlyPubliclyAvailableData=true without a justification returns 400 naming the field; supplying one succeeds", async () => {
    const { accessToken } = await createManager();
    const payload = validPayload({ containsOnlyPubliclyAvailableData: true });

    // NEGATIVE
    const badRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    expect(badRes.status).toBe(400);
    expect(JSON.stringify(badRes.body)).toContain(
      "publiclyAvailableJustification",
    );

    // POSITIVE CONTROL: identical payload plus the justification.
    const okRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        ...payload,
        publiclyAvailableJustification:
          "Data principal published this profile publicly on the storefront (SC-03).",
      });
    expect(okRes.status).toBe(201);
    expect(okRes.body.containsOnlyPubliclyAvailableData).toBe(true);
  });

  it("an AUDITOR (no CAN_MANAGE_DATA_SOURCES) gets 403 on POST /api/data-sources; the SAME payload succeeds for a manager", async () => {
    const auditor = await createOrgWithRole("AUDITOR", [
      "CAN_VIEW_PRINCIPALS",
      "CAN_VIEW_AUDIT_LOG",
    ]);
    const payload = validPayload();

    // NEGATIVE
    const deniedRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${auditor.accessToken}`)
      .send(payload);
    expect(deniedRes.status).toBe(403);

    // POSITIVE CONTROL: same payload, an actor holding the real permission.
    const manager = await createManager();
    const okRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${manager.accessToken}`)
      .send(payload);
    expect(okRes.status).toBe(201);
  });

  it("POST /api/data-sources/:id/test-connection updates status to CONNECTED on success and to ERROR with lastError on failure", async () => {
    const { accessToken } = await createManager();
    const { baseUrl: goodUrl } = await startRecordsServer([{ id: "1" }]);

    const createRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload({ baseUrl: goodUrl }));
    const id = createRes.body.id as string;

    // POSITIVE CONTROL: a reachable mock server flips status to CONNECTED.
    const okRes = await request(app.getHttpServer())
      .post(`/api/data-sources/${id}/test-connection`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(okRes.status).toBe(201);
    expect(okRes.body.ok).toBe(true);
    expect(okRes.body.dataSource.status).toBe("CONNECTED");
    expect(okRes.body.dataSource.lastError).toBeNull();
    assertNoCipherInTree(okRes.body, [(await getStoredCipher(id)) as string]);

    // NEGATIVE: pointing the same data source at a closed port fails and
    // records lastError.
    const closedServer = new MockHttpServer(jsonHandler(200, { data: [] }));
    const closedPort = await closedServer.listen();
    await closedServer.close();

    await request(app.getHttpServer())
      .patch(`/api/data-sources/${id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ baseUrl: `http://127.0.0.1:${closedPort}/records` });

    const failRes = await request(app.getHttpServer())
      .post(`/api/data-sources/${id}/test-connection`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(failRes.status).toBe(201);
    expect(failRes.body.ok).toBe(false);
    expect(failRes.body.dataSource.status).toBe("ERROR");
    expect(typeof failRes.body.dataSource.lastError).toBe("string");
    expect(
      (failRes.body.dataSource.lastError as string).length,
    ).toBeGreaterThan(0);
  });

  it("POST /api/data-sources/:id/discover-schema persists DataSourceField rows readable via GET /:id/fields", async () => {
    const { accessToken } = await createManager();
    const { baseUrl } = await startRecordsServer([
      { id: "1", email: "person@example.com", age: 30 },
      { id: "2", email: "other@example.com", age: 41 },
    ]);

    const createRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload({ baseUrl }));
    const id = createRes.body.id as string;

    const discoverRes = await request(app.getHttpServer())
      .post(`/api/data-sources/${id}/discover-schema`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(discoverRes.status).toBe(201);
    const fieldNames = (discoverRes.body as Array<{ fieldName: string }>).map(
      (f) => f.fieldName,
    );
    expect(fieldNames.sort()).toEqual(["age", "email", "id"]);

    const fieldsRes = await request(app.getHttpServer())
      .get(`/api/data-sources/${id}/fields`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(fieldsRes.status).toBe(200);
    expect((fieldsRes.body as unknown[]).length).toBe(3);
    const emailField = (fieldsRes.body as Array<Record<string, unknown>>).find(
      (f) => f["fieldName"] === "email",
    );
    expect(emailField?.["sampleValue"]).toBe("person@example.com");
  });

  it("DELETE /api/data-sources/:id removes the row and writes DATA_SOURCE_DELETED", async () => {
    const { accessToken, organizationId } = await createManager();
    const createRes = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(validPayload());
    const id = createRes.body.id as string;

    const deleteRes = await request(app.getHttpServer())
      .delete(`/api/data-sources/${id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleteRes.status).toBe(204);

    // POSITIVE CONTROL: it genuinely existed and is genuinely gone now.
    const getAfterDelete = await request(app.getHttpServer())
      .get(`/api/data-sources/${id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(getAfterDelete.status).toBe(404);

    const deleteEvents = await prisma.auditEvent.findMany({
      where: { organizationId, action: "DATA_SOURCE_DELETED", resourceId: id },
    });
    expect(deleteEvents).toHaveLength(1);
  });
});
