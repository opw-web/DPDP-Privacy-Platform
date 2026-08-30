import { randomUUID } from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import * as argon2 from "argon2";
import { Client as PgClient } from "pg";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";

/**
 * Task 14: the five compliance registers -- recipients, sharing
 * activities, cross-border transfers, retention policies, security
 * measures.
 *
 * Every negative (400/403/409) assertion below has a POSITIVE CONTROL in
 * the same test -- the identical payload/request with only the thing
 * under test corrected, asserted to succeed -- per this project's own
 * "green for the wrong reason" warning (task dispatch, purposes.e2e-spec.ts
 * precedent).
 *
 * Check 13 (spec lines 1068-1071): a DATA_PROCESSOR recipient cannot go
 * live without a contract. Covered TWICE, deliberately: once through the
 * API (`assertProcessorRule` in RecipientsService.create/update) and once
 * by forcing the row in via raw SQL, bypassing the API and the Nest app
 * entirely, to prove the database's own `processor_requires_contract`
 * CHECK constraint (already migrated in
 * `20260829183100_constraints_and_triggers`) holds independently.
 */
describe("Registers (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const createdOrgIds: string[] = [];

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

  async function createEmployeeWithPermissions(
    organizationId: string,
    permissionCodes: string[],
  ): Promise<{ email: string; accessToken: string; employeeId: string }> {
    for (const code of permissionCodes) {
      await ensurePermission(code);
    }
    const role = await prisma.role.create({
      data: {
        organizationId,
        code: `ROLE_${randomUUID()}`,
        name: "Test Role",
        isSystem: false,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({
            permissionCode,
          })),
        },
      },
    });
    const email = `${randomUUID()}@example.com`;
    const password = "CorrectHorseBattery9!";
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId,
        email,
        fullName: "Test Employee",
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
    return {
      email,
      accessToken: loginRes.body.accessToken as string,
      employeeId: employee.id,
    };
  }

  /** One organization with one employee whose role holds every permission these tests need. */
  async function createOrgWithManager(): Promise<{
    organizationId: string;
    accessToken: string;
    employeeId: string;
  }> {
    const organizationId = randomUUID();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: `Registers Test Org ${organizationId}`,
      },
    });
    createdOrgIds.push(organizationId);

    const { accessToken, employeeId } = await createEmployeeWithPermissions(
      organizationId,
      [
        "CAN_MANAGE_REGISTERS",
        "CAN_VIEW_PRINCIPALS",
        "CAN_MANAGE_PURPOSES",
        "CAN_MANAGE_DATA_SOURCES",
      ],
    );
    return { organizationId, accessToken, employeeId };
  }

  function authed(accessToken: string) {
    return {
      get: (url: string) =>
        request(app.getHttpServer())
          .get(url)
          .set("Authorization", `Bearer ${accessToken}`),
      post: (url: string, body: object) =>
        request(app.getHttpServer())
          .post(url)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(body),
      patch: (url: string, body: object) =>
        request(app.getHttpServer())
          .patch(url)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(body),
    };
  }

  async function createPurpose(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await authed(accessToken).post("/api/purposes", {
      code: `PURPOSE_${randomUUID()}`,
      name: "Order Fulfilment",
      description: "Fulfil customer orders.",
      lawfulBasis: "CONSENT",
      basisJustification: "Customer opts in at checkout.",
      dataCategories: ["IDENTITY", "CONTACT"],
      ...overrides,
    });
    if (res.status !== 201) {
      throw new Error(`Purpose fixture failed: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  async function createDataSource(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await authed(accessToken).post("/api/data-sources", {
      name: `Source ${randomUUID()}`,
      systemType: "TEST",
      baseUrl: "https://example.test",
      recordsPath: "data",
      externalIdField: "id",
      ...overrides,
    });
    if (res.status !== 201) {
      throw new Error(
        `Data source fixture failed: ${JSON.stringify(res.body)}`,
      );
    }
    return res.body;
  }

  function recipientPayload(overrides: Record<string, unknown> = {}) {
    return {
      name: `Recipient ${randomUUID()}`,
      type: "OTHER_DATA_FIDUCIARY",
      ...overrides,
    };
  }

  async function createRecipient(
    accessToken: string,
    overrides: Record<string, unknown> = {},
  ) {
    const res = await authed(accessToken).post(
      "/api/registers/recipients",
      recipientPayload(overrides),
    );
    if (res.status !== 201) {
      throw new Error(`Recipient fixture failed: ${JSON.stringify(res.body)}`);
    }
    return res.body;
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
    await app.close();
    if (createdOrgIds.length > 0) {
      await prisma.$executeRaw`DELETE FROM "Counter" WHERE "organizationId" = ANY(${createdOrgIds})`;
      await prisma.refreshToken.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.securityMeasure.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.sharingActivity.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.crossBorderTransfer.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.retentionPolicy.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataRecipient.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.dataSourceField.deleteMany({
        where: { dataSource: { organizationId: { in: createdOrgIds } } },
      });
      await prisma.sourceFieldMapping.deleteMany({
        where: { dataSource: { organizationId: { in: createdOrgIds } } },
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

  // ───────────────────────── Recipients ─────────────────────────

  describe("Recipients", () => {
    it("POST an active DATA_PROCESSOR with no contract returns 400 naming DATA_PROCESSOR/contractExists; the corrected payload succeeds", async () => {
      const { accessToken } = await createOrgWithManager();

      // NEGATIVE
      const badRes = await authed(accessToken).post(
        "/api/registers/recipients",
        recipientPayload({
          type: "DATA_PROCESSOR",
          active: true,
          contractExists: false,
        }),
      );
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain("DATA_PROCESSOR");
      expect(JSON.stringify(badRes.body)).toContain("contractExists");

      // POSITIVE CONTROL: identical payload, contractExists true.
      const okRes = await authed(accessToken).post(
        "/api/registers/recipients",
        recipientPayload({
          type: "DATA_PROCESSOR",
          active: true,
          contractExists: true,
        }),
      );
      expect(okRes.status).toBe(201);
      expect(okRes.body.active).toBe(true);
      expect(okRes.body.contractExists).toBe(true);
    });

    /**
     * The positive control for the processor rule itself (task dispatch):
     * without this test, the 400 test above would still pass even if
     * `assertProcessorRule` rejected EVERY active recipient regardless of
     * type -- this proves the rule is DATA_PROCESSOR-specific.
     */
    it("POST an active OTHER_DATA_FIDUCIARY with no contract succeeds (positive control: the processor rule is type-specific)", async () => {
      const { accessToken } = await createOrgWithManager();

      const res = await authed(accessToken).post(
        "/api/registers/recipients",
        recipientPayload({
          type: "OTHER_DATA_FIDUCIARY",
          active: true,
          contractExists: false,
        }),
      );
      expect(res.status).toBe(201);
      expect(res.body.type).toBe("OTHER_DATA_FIDUCIARY");
      expect(res.body.active).toBe(true);
      expect(res.body.contractExists).toBe(false);
    });

    /**
     * Effective-state PATCH case (task brief): a PATCH that flips
     * `active` to true on an existing contract-less processor must be
     * rejected exactly like a bad POST -- the rule is evaluated against
     * the RESULTING state, not just the fields present in the patch
     * body.
     */
    it("PATCH flipping active=true on a contract-less DATA_PROCESSOR is rejected; also setting contractExists=true succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const recipient = await createRecipient(accessToken, {
        type: "DATA_PROCESSOR",
        active: false,
        contractExists: false,
      });

      // NEGATIVE: existing contractExists=false carries forward.
      const badRes = await authed(accessToken).patch(
        `/api/registers/recipients/${recipient.id}`,
        { active: true },
      );
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain("contractExists");

      // Confirm the rejected PATCH did not partially apply.
      const unchangedRes = await authed(accessToken).get(
        `/api/registers/recipients/${recipient.id}`,
      );
      expect(unchangedRes.body.active).toBe(false);

      // POSITIVE CONTROL: same PATCH, contractExists supplied too.
      const okRes = await authed(accessToken).patch(
        `/api/registers/recipients/${recipient.id}`,
        { active: true, contractExists: true },
      );
      expect(okRes.status).toBe(200);
      expect(okRes.body.active).toBe(true);
    });

    /**
     * The other effective-state direction: an existing ACTIVE processor
     * with a contract cannot have `contractExists` flipped to false
     * while staying active.
     */
    it("PATCH flipping contractExists=false on an active DATA_PROCESSOR is rejected; also setting active=false succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const recipient = await createRecipient(accessToken, {
        type: "DATA_PROCESSOR",
        active: true,
        contractExists: true,
      });

      // NEGATIVE: existing active=true carries forward.
      const badRes = await authed(accessToken).patch(
        `/api/registers/recipients/${recipient.id}`,
        { contractExists: false },
      );
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain("DATA_PROCESSOR");

      // POSITIVE CONTROL: same PATCH, active also turned off.
      const okRes = await authed(accessToken).patch(
        `/api/registers/recipients/${recipient.id}`,
        { contractExists: false, active: false },
      );
      expect(okRes.status).toBe(200);
      expect(okRes.body.contractExists).toBe(false);
      expect(okRes.body.active).toBe(false);
    });

    /**
     * Check 13's database half. Bypasses the API and the Nest app
     * entirely: a raw INSERT against Postgres, through node-postgres
     * directly (not the Prisma Client, which strips the constraint name
     * off raw-query errors -- same technique as
     * `schema-constraints.e2e-spec.ts`'s `identity_link_one_active`
     * test), so this asserts the ACTUAL Postgres constraint fires, not
     * merely that some error occurs.
     */
    it("a raw SQL INSERT of an active DATA_PROCESSOR with no contract is rejected by the processor_requires_contract CHECK constraint", async () => {
      const organizationId = randomUUID();
      createdOrgIds.push(organizationId);
      await prisma.organization.create({
        data: { id: organizationId, name: `Raw SQL Org ${organizationId}` },
      });

      const pg = new PgClient({
        connectionString: process.env["DATABASE_URL"],
      });
      await pg.connect();
      try {
        await expect(
          pg.query(
            `INSERT INTO "DataRecipient"
               (id, "organizationId", name, type, active, "contractExists", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 'DATA_PROCESSOR'::"RecipientType", true, false, now(), now())`,
            [randomUUID(), organizationId, `Uncontracted ${randomUUID()}`],
          ),
        ).rejects.toMatchObject({ constraint: "processor_requires_contract" });

        // POSITIVE CONTROL: identical raw INSERT, contractExists true --
        // proves the constraint is READ/WRITE distinguishing on
        // contractExists, not simply rejecting every DATA_PROCESSOR row.
        const okInsert = await pg.query(
          `INSERT INTO "DataRecipient"
             (id, "organizationId", name, type, active, "contractExists", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'DATA_PROCESSOR'::"RecipientType", true, true, now(), now())
           RETURNING id`,
          [randomUUID(), organizationId, `Contracted ${randomUUID()}`],
        );
        expect(okInsert.rowCount).toBe(1);
      } finally {
        await pg.end();
      }
    });

    it("a duplicate recipient name within the same org returns 409; a different name succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const name = `Dup Recipient ${randomUUID()}`;
      const first = await authed(accessToken).post(
        "/api/registers/recipients",
        recipientPayload({ name }),
      );
      expect(first.status).toBe(201);

      // NEGATIVE
      const dupRes = await authed(accessToken).post(
        "/api/registers/recipients",
        recipientPayload({ name }),
      );
      expect(dupRes.status).toBe(409);
      expect(JSON.stringify(dupRes.body)).toContain(name);

      // POSITIVE CONTROL
      const okRes = await authed(accessToken).post(
        "/api/registers/recipients",
        recipientPayload({ name: `${name}_OTHER` }),
      );
      expect(okRes.status).toBe(201);
    });

    it("a successful POST and PATCH each write their own audit event (RECIPIENT_CREATED, RECIPIENT_UPDATED)", async () => {
      const { accessToken, organizationId } = await createOrgWithManager();
      const recipient = await createRecipient(accessToken);

      const createdEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "RECIPIENT_CREATED",
          resourceId: recipient.id,
        },
      });
      expect(createdEvent).not.toBeNull();

      const patchRes = await authed(accessToken).patch(
        `/api/registers/recipients/${recipient.id}`,
        { contactEmail: "dpo@example.com" },
      );
      expect(patchRes.status).toBe(200);

      const updatedEvent = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "RECIPIENT_UPDATED",
          resourceId: recipient.id,
        },
      });
      expect(updatedEvent).not.toBeNull();
    });

    it("GET /api/registers/recipients/:id 404s for an unknown id", async () => {
      const { accessToken } = await createOrgWithManager();
      const res = await authed(accessToken).get(
        `/api/registers/recipients/${randomUUID()}`,
      );
      expect(res.status).toBe(404);
    });
  });

  // ───────────────────────── RBAC (across all five registers) ─────────────────────────

  describe("RBAC: writes need CAN_MANAGE_REGISTERS, reads need CAN_VIEW_PRINCIPALS", () => {
    it("an employee holding only CAN_VIEW_PRINCIPALS gets 403 on every register's POST; a CAN_MANAGE_REGISTERS employee (positive control) succeeds", async () => {
      const { organizationId, accessToken: managerToken } =
        await createOrgWithManager();
      const { accessToken: viewerToken } = await createEmployeeWithPermissions(
        organizationId,
        ["CAN_VIEW_PRINCIPALS"],
      );
      const purpose = await createPurpose(managerToken);
      const recipient = await createRecipient(managerToken);
      const dataSource = await createDataSource(managerToken);

      const cases: Array<{ url: string; body: object }> = [
        { url: "/api/registers/recipients", body: recipientPayload() },
        {
          url: "/api/registers/sharing",
          body: {
            recipientId: recipient.id,
            purposeId: purpose.id,
            dataCategories: ["CONTACT"],
            description: "RBAC test sharing",
            sourceIds: [dataSource.id],
            startedAt: new Date().toISOString(),
          },
        },
        {
          url: "/api/registers/transfers",
          body: {
            recipientId: recipient.id,
            destinationCountry: "US",
            purposeDescription: "RBAC test transfer",
          },
        },
        {
          url: "/api/registers/retention",
          body: {
            purposeId: purpose.id,
            name: `RBAC Policy ${randomUUID()}`,
            triggerType: "PURPOSE_SERVED",
            retentionValue: 3,
            retentionUnit: "YEARS",
            legalBasisForRetention: "Companies Act 2013 s.128",
            legalBasisType: "STATUTORY",
          },
        },
        {
          url: "/api/registers/security",
          body: {
            ruleReference: "Rule 6(1)(a)",
            measureType: "ENCRYPTION",
            description: "RBAC test measure",
          },
        },
      ];

      for (const { url, body } of cases) {
        // NEGATIVE
        const deniedRes = await authed(viewerToken).post(url, body);
        expect(deniedRes.status).toBe(403);
        expect(deniedRes.body.message).toContain(
          "Missing required permission: CAN_MANAGE_REGISTERS",
        );

        // POSITIVE CONTROL: identical request, manager token.
        const okRes = await authed(managerToken).post(url, body);
        expect(okRes.status).toBe(201);
      }
    });

    it("an employee with no permissions gets 403 on every register's GET list; the manager (positive control) succeeds", async () => {
      const { organizationId, accessToken: managerToken } =
        await createOrgWithManager();
      const { accessToken: noPermToken } = await createEmployeeWithPermissions(
        organizationId,
        [],
      );

      const urls = [
        "/api/registers/recipients",
        "/api/registers/sharing",
        "/api/registers/transfers",
        "/api/registers/retention",
        "/api/registers/security",
      ];

      for (const url of urls) {
        // NEGATIVE
        const deniedRes = await authed(noPermToken).get(url);
        expect(deniedRes.status).toBe(403);
        expect(deniedRes.body.message).toContain(
          "Missing required permission: CAN_VIEW_PRINCIPALS",
        );

        // POSITIVE CONTROL
        const okRes = await authed(managerToken).get(url);
        expect(okRes.status).toBe(200);
      }
    });
  });

  // ───────────────────────── Sharing activities ─────────────────────────

  describe("Sharing activities", () => {
    it("POST without a description returns 400 naming description; adding one succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const recipient = await createRecipient(accessToken);
      const dataSource = await createDataSource(accessToken);
      const basePayload = {
        recipientId: recipient.id,
        purposeId: purpose.id,
        dataCategories: ["CONTACT"],
        sourceIds: [dataSource.id],
        startedAt: new Date().toISOString(),
      };

      // NEGATIVE: description omitted entirely.
      const badRes = await authed(accessToken).post(
        "/api/registers/sharing",
        basePayload,
      );
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain("description");

      // POSITIVE CONTROL
      const okRes = await authed(accessToken).post("/api/registers/sharing", {
        ...basePayload,
        description:
          "Contact details shared with CloudMail for email delivery.",
      });
      expect(okRes.status).toBe(201);
      expect(okRes.body.description).toBe(
        "Contact details shared with CloudMail for email delivery.",
      );
      expect(okRes.body.sourceIds).toEqual([dataSource.id]);
    });

    it("PATCH blanking description to whitespace returns 400 naming description; a real description succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const recipient = await createRecipient(accessToken);
      const dataSource = await createDataSource(accessToken);
      const createRes = await authed(accessToken).post(
        "/api/registers/sharing",
        {
          recipientId: recipient.id,
          purposeId: purpose.id,
          dataCategories: ["CONTACT"],
          description: "Initial description.",
          sourceIds: [dataSource.id],
          startedAt: new Date().toISOString(),
        },
      );
      expect(createRes.status).toBe(201);
      const activityId = createRes.body.id as string;

      // NEGATIVE
      const badRes = await authed(accessToken).patch(
        `/api/registers/sharing/${activityId}`,
        { description: "   " },
      );
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain("description");

      // POSITIVE CONTROL
      const okRes = await authed(accessToken).patch(
        `/api/registers/sharing/${activityId}`,
        { description: "Updated description." },
      );
      expect(okRes.status).toBe(200);
      expect(okRes.body.description).toBe("Updated description.");
    });

    it("POST with a sourceIds entry from another organization (unknown to this org) returns 400; a real data source id succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const recipient = await createRecipient(accessToken);
      const dataSource = await createDataSource(accessToken);
      const foreignId = randomUUID();
      const basePayload = {
        recipientId: recipient.id,
        purposeId: purpose.id,
        dataCategories: ["CONTACT"],
        description: "Sourced data test.",
        startedAt: new Date().toISOString(),
      };

      // NEGATIVE: sourceIds names an id this org has no DataSource for.
      const badRes = await authed(accessToken).post("/api/registers/sharing", {
        ...basePayload,
        sourceIds: [foreignId],
      });
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain(foreignId);

      // POSITIVE CONTROL: a real data source id from this org.
      const okRes = await authed(accessToken).post("/api/registers/sharing", {
        ...basePayload,
        sourceIds: [dataSource.id],
      });
      expect(okRes.status).toBe(201);
    });

    it("a successful POST writes a SHARING_ACTIVITY_CREATED audit event", async () => {
      const { accessToken, organizationId } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const recipient = await createRecipient(accessToken);
      const dataSource = await createDataSource(accessToken);

      const res = await authed(accessToken).post("/api/registers/sharing", {
        recipientId: recipient.id,
        purposeId: purpose.id,
        dataCategories: ["CONTACT"],
        description: "Audit test sharing.",
        sourceIds: [dataSource.id],
        startedAt: new Date().toISOString(),
      });
      expect(res.status).toBe(201);

      const event = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "SHARING_ACTIVITY_CREATED",
          resourceId: res.body.id,
        },
      });
      expect(event).not.toBeNull();
    });

    it("PATCH writes an UPDATED-discriminator audit event atomically with the sharing change", async () => {
      const { accessToken, organizationId } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const recipient = await createRecipient(accessToken);
      const dataSource = await createDataSource(accessToken);
      const created = await authed(accessToken).post("/api/registers/sharing", {
        recipientId: recipient.id,
        purposeId: purpose.id,
        dataCategories: ["CONTACT"],
        description: "Before update.",
        sourceIds: [dataSource.id],
        startedAt: new Date().toISOString(),
      });
      expect(created.status).toBe(201);

      const patched = await authed(accessToken).patch(
        `/api/registers/sharing/${created.body.id}`,
        { description: "After update." },
      );
      expect(patched.status).toBe(200);
      const event = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "SHARING_ACTIVITY_CREATED",
          resourceId: created.body.id,
          metadata: { path: ["change"], equals: "UPDATED" },
        },
      });
      expect(event).not.toBeNull();
    });
  });

  // ───────────────────────── Cross-border transfers ─────────────────────────

  describe("Cross-border transfers", () => {
    it("records what a human checked, without approving or blocking anything, and writes TRANSFER_CREATED", async () => {
      const { accessToken, organizationId } = await createOrgWithManager();
      const recipient = await createRecipient(accessToken);

      const res = await authed(accessToken).post("/api/registers/transfers", {
        recipientId: recipient.id,
        destinationCountry: "US",
        dataCategories: ["CONTACT"],
        purposeDescription: "Support ticketing hosted in the US.",
        govtRestrictionChecked: true,
        sectoralRestrictionNotes: "No RBI restriction applies (not a bank).",
        localisationRequired: false,
      });
      expect(res.status).toBe(201);
      expect(res.body.destinationCountry).toBe("US");
      expect(res.body.govtRestrictionChecked).toBe(true);
      expect(res.body.localisationRequired).toBe(false);
      // No lawfulness verdict of any kind is ever returned -- the
      // platform records what a human checked, it does not decide.
      expect(res.body.isLawful).toBeUndefined();
      expect(res.body.approved).toBeUndefined();

      const event = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "TRANSFER_CREATED",
          resourceId: res.body.id,
        },
      });
      expect(event).not.toBeNull();
    });

    it("POST with an unknown recipientId returns 400; a real recipient succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const foreignId = randomUUID();

      // NEGATIVE
      const badRes = await authed(accessToken).post(
        "/api/registers/transfers",
        {
          recipientId: foreignId,
          destinationCountry: "US",
          purposeDescription: "Unknown recipient test.",
        },
      );
      expect(badRes.status).toBe(400);
      expect(JSON.stringify(badRes.body)).toContain(foreignId);

      // POSITIVE CONTROL
      const recipient = await createRecipient(accessToken);
      const okRes = await authed(accessToken).post("/api/registers/transfers", {
        recipientId: recipient.id,
        destinationCountry: "US",
        purposeDescription: "Known recipient test.",
      });
      expect(okRes.status).toBe(201);
    });

    it("validates supplied reviewers, clears nullable review fields, and audits PATCH", async () => {
      const { accessToken, organizationId, employeeId } =
        await createOrgWithManager();
      const recipient = await createRecipient(accessToken);
      const created = await authed(accessToken).post(
        "/api/registers/transfers",
        {
          recipientId: recipient.id,
          destinationCountry: "US",
          purposeDescription: "Reviewed transfer.",
          govtRestrictionNotes: "Checked.",
          reviewedByEmployeeId: employeeId,
          reviewedAt: new Date().toISOString(),
        },
      );
      expect(created.status).toBe(201);

      const unknownReviewer = await authed(accessToken).patch(
        `/api/registers/transfers/${created.body.id}`,
        { reviewedByEmployeeId: randomUUID() },
      );
      expect(unknownReviewer.status).toBe(400);

      const { employeeId: foreignEmployeeId } = await createOrgWithManager();
      const foreignReviewer = await authed(accessToken).patch(
        `/api/registers/transfers/${created.body.id}`,
        { reviewedByEmployeeId: foreignEmployeeId },
      );
      expect(foreignReviewer.status).toBe(400);

      const patched = await authed(accessToken).patch(
        `/api/registers/transfers/${created.body.id}`,
        {
          govtRestrictionNotes: null,
          reviewedByEmployeeId: null,
          reviewedAt: null,
        },
      );
      expect(patched.status).toBe(200);
      expect(patched.body.govtRestrictionNotes).toBeNull();
      expect(patched.body.reviewedByEmployeeId).toBeNull();
      expect(patched.body.reviewedAt).toBeNull();
      const event = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "TRANSFER_CREATED",
          resourceId: created.body.id,
          metadata: { path: ["change"], equals: "UPDATED" },
        },
      });
      expect(event).not.toBeNull();
    });
  });

  // ───────────────────────── Retention policies ─────────────────────────

  describe("Retention policies", () => {
    it("round-trips its legal-basis fields and applies the schema's Rule 8(2)/8(3) defaults when they are omitted", async () => {
      const { accessToken } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);

      const res = await authed(accessToken).post("/api/registers/retention", {
        purposeId: purpose.id,
        name: `Order Records ${randomUUID()}`,
        triggerType: "PURPOSE_SERVED",
        retentionValue: 3,
        retentionUnit: "YEARS",
        legalBasisForRetention: "Companies Act 2013, s.128",
        legalBasisType: "STATUTORY",
      });
      expect(res.status).toBe(201);
      expect(res.body.legalBasisForRetention).toBe("Companies Act 2013, s.128");
      expect(res.body.legalBasisType).toBe("STATUTORY");
      expect(res.body.retentionValue).toBe(3);
      expect(res.body.retentionUnit).toBe("YEARS");
      // Schema defaults (@default(1) / @default("YEARS") / @default(48)),
      // NOT a literal restated in RetentionService -- see that file's
      // create() comment.
      expect(res.body.minimumRetentionValue).toBe(1);
      expect(res.body.minimumRetentionUnit).toBe("YEARS");
      expect(res.body.preErasureNoticeHours).toBe(48);

      const getRes = await authed(accessToken).get(
        `/api/registers/retention/${res.body.id}`,
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.legalBasisForRetention).toBe(
        "Companies Act 2013, s.128",
      );
      expect(getRes.body.legalBasisType).toBe("STATUTORY");
    });

    it("a duplicate (purposeId, name) pair returns 409; a different name for the same purpose succeeds", async () => {
      const { accessToken } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const name = `Dup Policy ${randomUUID()}`;
      const payload = {
        purposeId: purpose.id,
        name,
        triggerType: "FIXED_PERIOD",
        retentionValue: 1,
        retentionUnit: "YEARS",
        legalBasisForRetention: "Org policy.",
        legalBasisType: "ORG_POLICY",
      };

      const first = await authed(accessToken).post(
        "/api/registers/retention",
        payload,
      );
      expect(first.status).toBe(201);

      // NEGATIVE
      const dupRes = await authed(accessToken).post(
        "/api/registers/retention",
        payload,
      );
      expect(dupRes.status).toBe(409);
      expect(JSON.stringify(dupRes.body)).toContain(name);

      // POSITIVE CONTROL
      const okRes = await authed(accessToken).post("/api/registers/retention", {
        ...payload,
        name: `${name}_OTHER`,
      });
      expect(okRes.status).toBe(201);
    });

    it("writes a RETENTION_POLICY_CREATED audit event", async () => {
      const { accessToken, organizationId } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);

      const res = await authed(accessToken).post("/api/registers/retention", {
        purposeId: purpose.id,
        name: `Audit Policy ${randomUUID()}`,
        triggerType: "PURPOSE_SERVED",
        retentionValue: 2,
        retentionUnit: "YEARS",
        legalBasisForRetention: "Org policy.",
        legalBasisType: "ORG_POLICY",
      });
      expect(res.status).toBe(201);

      const event = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "RETENTION_POLICY_CREATED",
          resourceId: res.body.id,
        },
      });
      expect(event).not.toBeNull();
    });

    it("rejects null for required fields and audits a successful PATCH", async () => {
      const { accessToken, organizationId } = await createOrgWithManager();
      const purpose = await createPurpose(accessToken);
      const created = await authed(accessToken).post(
        "/api/registers/retention",
        {
          purposeId: purpose.id,
          name: `Patch Policy ${randomUUID()}`,
          triggerType: "PURPOSE_SERVED",
          retentionValue: 2,
          retentionUnit: "YEARS",
          legalBasisForRetention: "Org policy.",
          legalBasisType: "ORG_POLICY",
        },
      );
      expect(created.status).toBe(201);

      const nullRequired = await authed(accessToken).patch(
        `/api/registers/retention/${created.body.id}`,
        { name: null },
      );
      expect(nullRequired.status).toBe(400);

      const patched = await authed(accessToken).patch(
        `/api/registers/retention/${created.body.id}`,
        { name: `${created.body.name} Updated` },
      );
      expect(patched.status).toBe(200);
      const event = await prisma.auditEvent.findFirst({
        where: {
          organizationId,
          action: "RETENTION_POLICY_CREATED",
          resourceId: created.body.id,
          metadata: { path: ["change"], equals: "UPDATED" },
        },
      });
      expect(event).not.toBeNull();
    });
  });

  // ───────────────────────── Security measures ─────────────────────────

  describe("Security measures", () => {
    it("GET lists measures grouped by ruleReference with per-group implemented counts", async () => {
      const { accessToken } = await createOrgWithManager();
      const dataSource = await createDataSource(accessToken);

      const ruleA1 = await authed(accessToken).post("/api/registers/security", {
        dataSourceId: dataSource.id,
        ruleReference: "Rule 6(1)(a)",
        measureType: "ENCRYPTION",
        implemented: true,
        description: "AES-256-GCM at rest.",
      });
      expect(ruleA1.status).toBe(201);
      const ruleA2 = await authed(accessToken).post("/api/registers/security", {
        dataSourceId: dataSource.id,
        ruleReference: "Rule 6(1)(a)",
        measureType: "MASKING",
        implemented: false,
        description: "Field masking not yet applied to legacy exports.",
      });
      expect(ruleA2.status).toBe(201);
      const ruleF = await authed(accessToken).post("/api/registers/security", {
        ruleReference: "Rule 6(1)(f)",
        measureType: "CONTRACT_CLAUSE",
        implemented: false,
        description: "Contract clause pending processor sign-off.",
      });
      expect(ruleF.status).toBe(201);

      const listRes = await authed(accessToken).get("/api/registers/security");
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);

      const groupA = listRes.body.find(
        (g: { ruleReference: string }) => g.ruleReference === "Rule 6(1)(a)",
      );
      expect(groupA).toBeDefined();
      expect(groupA.totalCount).toBe(2);
      expect(groupA.implementedCount).toBe(1);
      expect(groupA.measures).toHaveLength(2);

      const groupF = listRes.body.find(
        (g: { ruleReference: string }) => g.ruleReference === "Rule 6(1)(f)",
      );
      expect(groupF).toBeDefined();
      expect(groupF.totalCount).toBe(1);
      expect(groupF.implementedCount).toBe(0);
    });

    it("explicit null creates an organization-wide measure and clears a source association", async () => {
      const { accessToken } = await createOrgWithManager();
      const res = await authed(accessToken).post("/api/registers/security", {
        dataSourceId: null,
        ruleReference: "Rule 6(1)(c)",
        measureType: "LOGGING",
        implemented: true,
        description: "Access logs retained for one year (Rule 6(1)(e)/(c)).",
      });
      expect(res.status).toBe(201);
      expect(res.body.dataSourceId).toBeNull();

      const source = await createDataSource(accessToken);
      const sourceSpecific = await authed(accessToken).post(
        "/api/registers/security",
        {
          dataSourceId: source.id,
          ruleReference: "Rule 6(1)(d)",
          measureType: "ACCESS_CONTROL",
          description: "Source-specific controls.",
        },
      );
      expect(sourceSpecific.status).toBe(201);
      const cleared = await authed(accessToken).patch(
        `/api/registers/security/${sourceSpecific.body.id}`,
        { dataSourceId: null },
      );
      expect(cleared.status).toBe(200);
      expect(cleared.body.dataSourceId).toBeNull();
    });

    it("an unknown ruleReference value returns 400; a valid one succeeds", async () => {
      const { accessToken } = await createOrgWithManager();

      // NEGATIVE
      const badRes = await authed(accessToken).post("/api/registers/security", {
        ruleReference: "Rule 99(9)(z)",
        measureType: "ENCRYPTION",
        description: "Invalid rule reference test.",
      });
      expect(badRes.status).toBe(400);

      // POSITIVE CONTROL
      const okRes = await authed(accessToken).post("/api/registers/security", {
        ruleReference: "Rule 6(1)(b)",
        measureType: "ACCESS_CONTROL",
        description: "RBAC enforced on every mutating route.",
      });
      expect(okRes.status).toBe(201);
    });

    it("POST and PATCH each write a SECURITY_MEASURE_UPDATED audit event", async () => {
      const { accessToken, organizationId, employeeId } =
        await createOrgWithManager();

      const createRes = await authed(accessToken).post(
        "/api/registers/security",
        {
          ruleReference: "Rule 6(1)(g)",
          measureType: "ORG_MEASURE",
          description: "Annual security review.",
          reviewedByEmployeeId: employeeId,
        },
      );
      expect(createRes.status).toBe(201);
      const measureId = createRes.body.id as string;

      const createdEvents = await prisma.auditEvent.findMany({
        where: {
          organizationId,
          action: "SECURITY_MEASURE_UPDATED",
          resourceId: measureId,
        },
      });
      expect(createdEvents.length).toBeGreaterThanOrEqual(1);

      const patchRes = await authed(accessToken).patch(
        `/api/registers/security/${measureId}`,
        { implemented: true },
      );
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.implemented).toBe(true);

      const eventsAfterPatch = await prisma.auditEvent.findMany({
        where: {
          organizationId,
          action: "SECURITY_MEASURE_UPDATED",
          resourceId: measureId,
        },
      });
      expect(eventsAfterPatch.length).toBeGreaterThan(createdEvents.length);
      const createdEvent = createdEvents.find(
        (event) => (event.metadata as { change?: string }).change === "CREATED",
      );
      const updatedEvent = eventsAfterPatch.find(
        (event) => (event.metadata as { change?: string }).change === "UPDATED",
      );
      expect(createdEvent).toBeDefined();
      expect(updatedEvent).toBeDefined();

      const badReviewer = await authed(accessToken).patch(
        `/api/registers/security/${measureId}`,
        { reviewedByEmployeeId: randomUUID() },
      );
      expect(badReviewer.status).toBe(400);
    });
  });
});
