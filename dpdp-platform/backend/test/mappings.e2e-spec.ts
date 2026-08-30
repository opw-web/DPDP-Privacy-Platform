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
 * Task 13 gate: field mapping, purpose attachment, and the CN-02
 * data-minimisation warning.
 *
 * Every negative assertion below has a POSITIVE CONTROL in the same
 * test -- an otherwise-identical request that differs only in the one
 * dimension under test, asserted to succeed / not warn / not persist the
 * old value -- so a test cannot pass for the wrong reason (route missing,
 * permission guard rejected first, or a mechanism that fires
 * unconditionally instead of on the specific condition it claims to
 * check). `MockHttpServer` (Task 11) is used for the one test that needs
 * a live discovery read -- never a literal "localhost:5001" or the demo
 * company server.
 */
describe("Field mappings and purpose attachment (e2e)", () => {
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

  async function createOrg(): Promise<string> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: { id: organizationId, name: `Mappings Test Org ${organizationId}` },
    });
    createdOrgIds.push(organizationId);
    return organizationId;
  }

  /** One employee, in an existing org, whose role holds exactly `permissionCodes`. */
  async function createEmployee(
    organizationId: string,
    roleCode: string,
    permissionCodes: string[],
  ): Promise<string> {
    for (const code of permissionCodes) {
      await ensurePermission(code);
    }

    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `${roleCode}_${randomUUID()}`,
        name: roleCode,
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({ permissionCode })),
        },
      },
    });

    const email = `${roleCode.toLowerCase()}-${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: roleCode,
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
    return loginRes.body.accessToken as string;
  }

  /** One org with a single employee holding BOTH Task 13 permissions -- the common case for tests not exercising the RBAC asymmetry itself. */
  async function createOrgWithBothPermissions(): Promise<{
    organizationId: string;
    accessToken: string;
  }> {
    const organizationId = await createOrg();
    const accessToken = await createEmployee(organizationId, "SOURCE_MANAGER", [
      "CAN_MANAGE_DATA_SOURCES",
      "CAN_MANAGE_PURPOSES",
    ]);
    return { organizationId, accessToken };
  }

  async function startRecordsServer(records: unknown[]): Promise<string> {
    const server = new MockHttpServer(jsonHandler(200, { data: records }));
    servers.push(server);
    const port = await server.listen();
    return `http://127.0.0.1:${port}/records`;
  }

  async function createDataSource(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const payload = {
      name: `Source ${randomUUID()}`,
      systemType: "REST_TEST_SYSTEM",
      baseUrl: "http://127.0.0.1:1/records",
      recordsPath: "data",
      externalIdField: "id",
      authType: "BEARER",
      credential: "super-secret-token-ABCD",
      ...overrides,
    };
    const res = await request(app.getHttpServer())
      .post("/api/data-sources")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    if (res.status !== 201) {
      throw new Error(
        `Fixture data source creation failed: ${JSON.stringify(res.body)}`,
      );
    }
    return res.body.id as string;
  }

  async function createPurpose(
    accessToken: string,
    dataCategories: string[],
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; code: string }> {
    const payload = {
      code: `PURPOSE_${randomUUID()}`,
      name: "Order Fulfilment",
      description: "Fulfil customer orders placed on the storefront.",
      lawfulBasis: "CONSENT",
      basisJustification: "Customer opts in at checkout.",
      dataCategories,
      ...overrides,
    };
    const res = await request(app.getHttpServer())
      .post("/api/purposes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);
    if (res.status !== 201) {
      throw new Error(
        `Fixture purpose creation failed: ${JSON.stringify(res.body)}`,
      );
    }
    return { id: res.body.id as string, code: res.body.code as string };
  }

  function putMappings(
    accessToken: string,
    dataSourceId: string,
    mappings: unknown[],
  ) {
    return request(app.getHttpServer())
      .put(`/api/data-sources/${dataSourceId}/mappings`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ mappings });
  }

  function putPurposes(
    accessToken: string,
    dataSourceId: string,
    purposeIds: string[],
  ) {
    return request(app.getHttpServer())
      .put(`/api/data-sources/${dataSourceId}/purposes`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ purposeIds });
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
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.sourceFieldMapping.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSourcePurpose.deleteMany({
        where: { dataSource: { organizationId: { in: createdOrgIds } } },
      });
      await prisma.dataSourceField.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSource.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.processingPurpose.deleteMany({
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

  it("full mapping replacement is transactional: a mid-set failure (a real @@unique([dataSourceId, sourceField]) violation, not a fake) leaves the PREVIOUS, non-empty mapping set intact", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);

    // First, a genuinely successful, NON-EMPTY mapping set -- this is
    // the "previous" state the failed replacement below must not lose.
    // (Testing this against an empty starting set would be a no-op
    // disguised as a pass -- the task brief's own warning.)
    const firstRes = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
      {
        sourceField: "name",
        canonicalField: "FULL_NAME",
        dataCategory: "IDENTITY",
      },
    ]);
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.mappings).toHaveLength(2);

    // A REAL mid-set failure: this payload repeats "phone" as a
    // sourceField, which the underlying `@@unique([dataSourceId,
    // sourceField])` constraint rejects on the SECOND occurrence, after
    // Postgres has already accepted the first "phone" row and the
    // "age" row inside this same transaction.
    const failingRes = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "phone",
        canonicalField: "PHONE",
        dataCategory: "CONTACT",
      },
      { sourceField: "age", canonicalField: "IGNORE" },
      {
        sourceField: "phone",
        canonicalField: "PHONE",
        dataCategory: "CONTACT",
      },
    ]);
    expect(failingRes.status).toBe(409);

    // THE ROLLBACK ASSERTION: queried straight from Postgres (there is
    // no GET /mappings route), the PREVIOUS set (email, name) is still
    // exactly there -- not empty, not the failed new set.
    const persisted = await prisma.sourceFieldMapping.findMany({
      where: { dataSourceId },
      orderBy: { sourceField: "asc" },
    });
    expect(persisted.map((m) => m.sourceField).sort()).toEqual([
      "email",
      "name",
    ]);
  });

  it("two isVerifiedCustomerId mappings on one source -> 400; exactly one succeeds (positive control)", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);

    const twoVerified = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "custId1",
        canonicalField: "CUSTOMER_ID",
        isVerifiedCustomerId: true,
      },
      {
        sourceField: "custId2",
        canonicalField: "CUSTOMER_ID",
        isVerifiedCustomerId: true,
      },
    ]);
    expect(twoVerified.status).toBe(400);
    expect(JSON.stringify(twoVerified.body)).toContain("isVerifiedCustomerId");

    // POSITIVE CONTROL: identical shape, only ONE mapping verified.
    const oneVerified = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "custId1",
        canonicalField: "CUSTOMER_ID",
        isVerifiedCustomerId: true,
      },
      { sourceField: "custId2", canonicalField: "CUSTOMER_ID" },
    ]);
    expect(oneVerified.status).toBe(200);
  });

  it("isVerifiedCustomerId on an EMAIL mapping -> 400; on a CUSTOMER_ID mapping (positive control) -> 200", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);

    const onEmail = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "emailField",
        canonicalField: "EMAIL",
        isVerifiedCustomerId: true,
      },
    ]);
    expect(onEmail.status).toBe(400);
    expect(JSON.stringify(onEmail.body)).toContain("CUSTOMER_ID");

    // POSITIVE CONTROL: identical flag, correct canonicalField.
    const onCustomerId = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "custIdField",
        canonicalField: "CUSTOMER_ID",
        isVerifiedCustomerId: true,
      },
    ]);
    expect(onCustomerId.status).toBe(200);
    expect(onCustomerId.body.mappings[0].isVerifiedCustomerId).toBe(true);
  });

  it("a DataCategory outside every attached purpose's list warns (CN-02) but persists with 200; a category IN the list does not warn (positive control)", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);
    const purpose = await createPurpose(accessToken, ["CONTACT"]);

    const attachRes = await putPurposes(accessToken, dataSourceId, [
      purpose.id,
    ]);
    expect(attachRes.status).toBe(200);

    const res = await putMappings(accessToken, dataSourceId, [
      // Covered by the purpose's dataCategories -- must NOT warn.
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
      // NOT covered -- must warn.
      {
        sourceField: "fullName",
        canonicalField: "FULL_NAME",
        dataCategory: "IDENTITY",
      },
    ]);

    // It warns; it does NOT block.
    expect(res.status).toBe(200);
    expect(res.body.mappings).toHaveLength(2);

    expect(res.body.warnings).toHaveLength(1);
    const warning = res.body.warnings[0];
    expect(warning.type).toBe("CATEGORY_OUTSIDE_PURPOSES");
    expect(warning.sourceField).toBe("fullName");
    expect(warning.dataCategory).toBe("IDENTITY");
    expect(warning.attachedPurposes).toHaveLength(1);
    expect(warning.attachedPurposes[0].code).toBe(purpose.code);

    // POSITIVE CONTROL, explicit: no warning names the covered field.
    expect(
      (res.body.warnings as Array<{ sourceField: string }>).some(
        (w) => w.sourceField === "email",
      ),
    ).toBe(false);
  });

  it("a source with no purposes attached maps and persists WITHOUT error, warning every personal-data field as NO_PURPOSES_ATTACHED; IGNORE and non-personal-data fields are exempt (positive controls)", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);

    const res = await putMappings(accessToken, dataSourceId, [
      // Personal data, no purposes attached at all -> must warn.
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
      // IGNORE means "not carried forward" -- must NOT warn even though
      // containsPersonalData defaults to true.
      {
        sourceField: "internalFlag",
        canonicalField: "IGNORE",
        dataCategory: "OTHER",
      },
      // Explicitly not personal data -- must NOT warn.
      {
        sourceField: "note",
        canonicalField: "FULL_NAME",
        dataCategory: "IDENTITY",
        containsPersonalData: false,
      },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.mappings).toHaveLength(3);

    expect(res.body.warnings).toHaveLength(1);
    expect(res.body.warnings[0].type).toBe("NO_PURPOSES_ATTACHED");
    expect(res.body.warnings[0].sourceField).toBe("email");
    expect(res.body.warnings[0].attachedPurposes).toEqual([]);

    const warnedFields = (
      res.body.warnings as Array<{ sourceField: string }>
    ).map((w) => w.sourceField);
    expect(warnedFields).not.toContain("internalFlag");
    expect(warnedFields).not.toContain("note");
  });

  it("marking containsPersonalData: true re-scrubs the field's stored sampleValue; a field left containsPersonalData: false keeps its sample (positive control)", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const baseUrl = await startRecordsServer([
      { id: "1", email: "person@example.com" },
      { id: "2", email: "other@example.com" },
    ]);
    const dataSourceId = await createDataSource(accessToken, { baseUrl });

    const discoverRes = await request(app.getHttpServer())
      .post(`/api/data-sources/${dataSourceId}/discover-schema`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(discoverRes.status).toBe(201);

    const beforeScrub = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "email" },
    });
    expect(beforeScrub.sampleValue).toBe("person@example.com");
    const idFieldBefore = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "id" },
    });
    expect(idFieldBefore.sampleValue).toBe("1");

    const mapRes = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
      // Explicitly non-personal -- must NOT be scrubbed.
      {
        sourceField: "id",
        canonicalField: "EXTERNAL_ID",
        dataCategory: "OTHER",
        containsPersonalData: false,
      },
    ]);
    expect(mapRes.status).toBe(200);

    const afterScrub = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "email" },
    });
    expect(afterScrub.sampleValue).toBeNull();

    // POSITIVE CONTROL: the field marked containsPersonalData: false
    // keeps its live sample -- the scrub is targeted, not a blanket wipe.
    const idFieldAfter = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "id" },
    });
    expect(idFieldAfter.sampleValue).toBe("1");
  });

  it("Ruling 1: the scrub runs INSIDE the mapping write's own transaction -- a rolled-back mapping set leaves the sample UNSCRUBBED, not scrubbed-then-orphaned on its own connection", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const baseUrl = await startRecordsServer([
      { id: "1", email: "person@example.com" },
    ]);
    const dataSourceId = await createDataSource(accessToken, { baseUrl });

    const discoverRes = await request(app.getHttpServer())
      .post(`/api/data-sources/${dataSourceId}/discover-schema`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(discoverRes.status).toBe(201);

    const beforeAttempt = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "email" },
    });
    expect(beforeAttempt.sampleValue).toBe("person@example.com");

    // A payload that (a) marks the DISCOVERED "email" field
    // containsPersonalData: true -- which calls `rescrubFieldSample`
    // INSIDE this same PUT's transaction, on a row `discoverSchema`
    // above actually created -- and (b) repeats "email" as a
    // sourceField later in the array, which hits the real
    // `@@unique([dataSourceId, sourceField])` violation and rolls the
    // WHOLE transaction back, mapping write and scrub together.
    const failingRes = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
        containsPersonalData: true,
      },
      { sourceField: "id", canonicalField: "IGNORE" },
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
        containsPersonalData: true,
      },
    ]);
    expect(failingRes.status).toBe(409);

    // THE ASSERTION RULING 1 EXISTS FOR: the scrub must NOT have
    // survived the rollback. If `rescrubFieldSample` fell back to its
    // default (non-transactional) `this.prisma.scoped` argument instead
    // of receiving this write's own `tx`, the scrub would have
    // committed on its own separate connection the instant it ran --
    // BEFORE the later duplicate-sourceField row threw -- and
    // `sampleValue` would now be null even though the mapping write
    // that triggered it was rolled back. Verified empirically: removing
    // the third `tx` argument from the `rescrubFieldSample` call in
    // `mappings.service.ts` makes THIS assertion fail (`sampleValue`
    // comes back `null`) while every other test in this file still
    // passes -- confirming this is the one assertion in the suite that
    // actually exercises Ruling 1, not just the fact that scrubbing
    // happens at all (see the positive control below for that).
    const afterFailedAttempt = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "email" },
    });
    expect(afterFailedAttempt.sampleValue).toBe("person@example.com");

    // POSITIVE CONTROL: the identical mapping, without the duplicate
    // sourceField, succeeds AND scrubs -- proving the mechanism fires at
    // all, so the assertion above demonstrates "rolled back", not
    // "rescrubFieldSample never ran".
    const okRes = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
        containsPersonalData: true,
      },
      { sourceField: "id", canonicalField: "IGNORE" },
    ]);
    expect(okRes.status).toBe(200);
    const afterSuccess = await prisma.dataSourceField.findFirstOrThrow({
      where: { dataSourceId, fieldName: "email" },
    });
    expect(afterSuccess.sampleValue).toBeNull();
  });

  it("PUT /mappings writes exactly one FIELD_MAPPING_UPDATED audit event per call", async () => {
    const { accessToken, organizationId } =
      await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);

    const res = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
    ]);
    expect(res.status).toBe(200);

    const events = await prisma.auditEvent.findMany({
      where: {
        organizationId,
        action: "FIELD_MAPPING_UPDATED",
        resourceId: dataSourceId,
      },
    });
    expect(events).toHaveLength(1);
  });

  it("PUT /purposes replaces the FULL DataSourcePurpose set for the source; an unknown purposeId -> 400 (with a real id as positive control)", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);
    const purposeA = await createPurpose(accessToken, ["CONTACT"]);
    const purposeB = await createPurpose(accessToken, ["IDENTITY"]);

    const unknownRes = await putPurposes(accessToken, dataSourceId, [
      randomUUID(),
    ]);
    expect(unknownRes.status).toBe(400);

    // POSITIVE CONTROL: a real purpose id succeeds.
    const firstAttach = await putPurposes(accessToken, dataSourceId, [
      purposeA.id,
    ]);
    expect(firstAttach.status).toBe(200);
    expect(firstAttach.body.purposes).toHaveLength(1);
    expect(firstAttach.body.purposes[0].id).toBe(purposeA.id);

    // REPLACEMENT: attaching B alone must DETACH A, not add to it.
    const secondAttach = await putPurposes(accessToken, dataSourceId, [
      purposeB.id,
    ]);
    expect(secondAttach.status).toBe(200);
    expect(secondAttach.body.purposes).toHaveLength(1);
    expect(secondAttach.body.purposes[0].id).toBe(purposeB.id);

    const links = await prisma.dataSourcePurpose.findMany({
      where: { dataSourceId },
    });
    expect(links.map((l) => l.purposeId)).toEqual([purposeB.id]);
  });

  it("Important-2: CN-02 is a STANDING property of (mappings x purposes) -- PUT /purposes recomputes warnings against the mapping set as it stands, without a single mapping row changing", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);
    const orderFulfilment = await createPurpose(
      accessToken,
      ["CONTACT", "IDENTITY"],
      { name: "Order Fulfilment" },
    );
    const support = await createPurpose(accessToken, ["CONTACT"], {
      name: "Support",
    });

    // Attach Order Fulfilment (covers CONTACT + IDENTITY) BEFORE mapping.
    const initialAttach = await putPurposes(accessToken, dataSourceId, [
      orderFulfilment.id,
    ]);
    expect(initialAttach.status).toBe(200);

    // Map email/CONTACT + dob/IDENTITY -- both covered, so zero warnings.
    const mapRes = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
      {
        sourceField: "dob",
        canonicalField: "DATE_OF_BIRTH",
        dataCategory: "IDENTITY",
      },
    ]);
    expect(mapRes.status).toBe(200);
    expect(mapRes.body.warnings).toEqual([]);

    // DIRECTION 1 (detach): replace Order Fulfilment with Support, which
    // covers CONTACT but NOT IDENTITY. No `SourceFieldMapping` row is
    // touched by this call -- yet `dob`/IDENTITY must now warn, because
    // the purpose that used to cover it is gone.
    const detachRes = await putPurposes(accessToken, dataSourceId, [
      support.id,
    ]);
    expect(detachRes.status).toBe(200);
    expect(detachRes.body.warnings).toHaveLength(1);
    expect(detachRes.body.warnings[0].type).toBe("CATEGORY_OUTSIDE_PURPOSES");
    expect(detachRes.body.warnings[0].sourceField).toBe("dob");
    // POSITIVE CONTROL, same response: "email"/CONTACT is still covered
    // by Support and must NOT appear -- proving this isn't "warn on
    // everything after any purpose change".
    expect(
      (detachRes.body.warnings as Array<{ sourceField: string }>).some(
        (w) => w.sourceField === "email",
      ),
    ).toBe(false);

    // Confirm the underlying mapping set genuinely did not change --
    // the warning above came from the purpose change alone.
    const mappingsAfterDetach = await prisma.sourceFieldMapping.findMany({
      where: { dataSourceId },
      orderBy: { sourceField: "asc" },
    });
    expect(mappingsAfterDetach.map((m) => m.sourceField)).toEqual([
      "dob",
      "email",
    ]);

    // DIRECTION 2 (positive control): re-attaching a purpose that covers
    // IDENTITY again makes the SAME warning go away, with no mapping
    // write in between.
    const reattachRes = await putPurposes(accessToken, dataSourceId, [
      orderFulfilment.id,
      support.id,
    ]);
    expect(reattachRes.status).toBe(200);
    expect(reattachRes.body.warnings).toEqual([]);
  });

  it("RBAC asymmetry: CAN_MANAGE_DATA_SOURCES alone can write mappings but not purposes; CAN_MANAGE_PURPOSES alone can write purposes but not mappings", async () => {
    const organizationId = await createOrg();
    const dsOnlyToken = await createEmployee(organizationId, "DS_ONLY", [
      "CAN_MANAGE_DATA_SOURCES",
    ]);
    const purposeOnlyToken = await createEmployee(
      organizationId,
      "PURPOSE_ONLY",
      ["CAN_MANAGE_PURPOSES"],
    );
    const dataSourceId = await createDataSource(dsOnlyToken);
    const purpose = await createPurpose(purposeOnlyToken, ["CONTACT"]);

    // POSITIVE CONTROL + NEGATIVE, same actor: dsOnly can map, cannot attach purposes.
    const dsOnlyMapsRes = await putMappings(dsOnlyToken, dataSourceId, [
      {
        sourceField: "email",
        canonicalField: "EMAIL",
        dataCategory: "CONTACT",
      },
    ]);
    expect(dsOnlyMapsRes.status).toBe(200);
    const dsOnlyPurposesRes = await putPurposes(dsOnlyToken, dataSourceId, [
      purpose.id,
    ]);
    expect(dsOnlyPurposesRes.status).toBe(403);

    // POSITIVE CONTROL + NEGATIVE, the other actor: purposeOnly can
    // attach purposes, cannot map.
    const purposeOnlyPurposesRes = await putPurposes(
      purposeOnlyToken,
      dataSourceId,
      [purpose.id],
    );
    expect(purposeOnlyPurposesRes.status).toBe(200);
    const purposeOnlyMapsRes = await putMappings(
      purposeOnlyToken,
      dataSourceId,
      [
        {
          sourceField: "name",
          canonicalField: "FULL_NAME",
          dataCategory: "IDENTITY",
        },
      ],
    );
    expect(purposeOnlyMapsRes.status).toBe(403);
  });

  it("CanonicalField.IGNORE mappings persist (so the wizard can show them) but are excluded from CN-02 warnings regardless of dataCategory", async () => {
    const { accessToken } = await createOrgWithBothPermissions();
    const dataSourceId = await createDataSource(accessToken);
    // No purposes attached -- if IGNORE were not exempt, this would
    // trivially warn (every containsPersonalData field does, per the
    // NO_PURPOSES_ATTACHED test above).

    const res = await putMappings(accessToken, dataSourceId, [
      {
        sourceField: "internalNotes",
        canonicalField: "IGNORE",
        dataCategory: "HEALTH",
      },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.mappings).toHaveLength(1);
    expect(res.body.mappings[0].canonicalField).toBe("IGNORE");
    expect(res.body.warnings).toEqual([]);
  });
});
