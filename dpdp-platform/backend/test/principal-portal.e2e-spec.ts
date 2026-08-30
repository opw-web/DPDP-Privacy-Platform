import { randomUUID } from "crypto";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as argon2 from "argon2";
import request from "supertest";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PERMISSIONS } from "../prisma/seed/permissions";
import { MeController } from "../src/modules/principal-portal/me.controller";
import { PURPOSE_NOT_CONFIGURED } from "../src/modules/principal-portal/me.service";

/**
 * Task 22 gate: the Data Principal self-service portal API, `/api/me/*`.
 *
 * This is the single most important IDOR surface in the product (Check
 * 19): every assertion here either proves the principal-audience token is
 * the ONLY thing that can select whose data a `/me/*` route returns, or
 * proves the read-side rules the brief pins down verbatim ("Purpose not
 * configured", RT-04 source intersection, never-masked values).
 */
describe("Principal portal API (e2e)", () => {
  let app: INestApplication;
  const prisma = new PrismaService();
  const organizationIds: string[] = [];

  type PrincipalSession = { accessToken: string; dataPrincipalId: string };
  type EmployeeSession = { accessToken: string };

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
    const email = `${randomUUID()}@portal.example.test`;
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

  async function principalSession(
    organizationId: string,
    dataPrincipalId: string,
    email: string,
  ): Promise<PrincipalSession> {
    const password = "CorrectHorseBattery9!";
    await prisma.principalAccount.create({
      data: {
        organizationId,
        dataPrincipalId,
        email,
        passwordHash: await argon2.hash(password, {
          type: argon2.argon2id,
        }),
        status: "ACTIVE",
      },
    });
    const response = await request(app.getHttpServer())
      .post("/api/auth/principal/login")
      .send({ email, password });
    expect(response.status).toBe(200);
    return {
      accessToken: response.body.accessToken as string,
      dataPrincipalId,
    };
  }

  async function createSource(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const source = await prisma.dataSource.create({
      data: {
        organizationId,
        name,
        systemType: "PORTAL_TEST",
        baseUrl: "https://portal.example.test",
        recordsPath: "data",
        externalIdField: "id",
      },
    });
    return source.id;
  }

  async function createPrincipal(
    organizationId: string,
    displayName: string,
  ): Promise<string> {
    const principal = await prisma.dataPrincipal.create({
      data: {
        organizationId,
        reference: `DP-${randomUUID()}`,
        displayName,
        ageStatus: "ADULT",
      },
    });
    return principal.id;
  }

  type Fixture = {
    organizationId: string;
    otherOrganizationId: string;
    ecommerceSourceId: string;
    marketingSourceId: string;
    amanPrincipalId: string;
    priyaPrincipalId: string;
    nehaPrincipalId: string;
    otherOrgPrincipalId: string;
    aman: PrincipalSession;
    priya: PrincipalSession;
    otherOrgPrincipal: PrincipalSession;
    employee: EmployeeSession;
  };
  let fixture: Fixture;

  async function createFixture(): Promise<Fixture> {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    organizationIds.push(organizationId, otherOrganizationId);
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: `Portal Org ${organizationId}` },
        {
          id: otherOrganizationId,
          name: `Portal Other ${otherOrganizationId}`,
        },
      ],
    });

    // E-commerce deliberately has NO ProcessingPurpose attached -- the
    // "Purpose not configured" fixture case.
    const ecommerceSourceId = await createSource(organizationId, "E-commerce");
    // Marketing Database has a purpose attached.
    const marketingSourceId = await createSource(
      organizationId,
      "Marketing Database",
    );
    const otherOrgSourceId = await createSource(
      otherOrganizationId,
      "Other org source",
    );

    const purpose = await prisma.processingPurpose.create({
      data: {
        organizationId,
        code: `PURPOSE-${randomUUID()}`,
        name: "Customer Support",
        description: "Fixture purpose",
        lawfulBasis: "CONSENT",
        basisJustification: "Fixture consent record",
      },
    });
    await prisma.dataSourcePurpose.create({
      data: { dataSourceId: marketingSourceId, purposeId: purpose.id },
    });

    const amanPrincipalId = await createPrincipal(organizationId, "Aman Verma");
    // Sourced ONLY from e-commerce -- must see no marketing recipient.
    const priyaPrincipalId = await createPrincipal(
      organizationId,
      "Priya Shah",
    );
    // Exists only so an employee-only route has a valid, distinct target
    // for the "principal token on /api/principals/:id" IDOR test.
    const nehaPrincipalId = await createPrincipal(organizationId, "Neha Rao");
    const otherOrgPrincipalId = await createPrincipal(
      otherOrganizationId,
      "Other Org Person",
    );

    await prisma.principalDataField.createMany({
      data: [
        {
          organizationId,
          dataPrincipalId: amanPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Aman Verma",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceSourceId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: amanPrincipalId,
          canonicalField: "EMAIL",
          value: "aman@example.com",
          dataCategory: "CONTACT",
          sourceIds: [ecommerceSourceId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: amanPrincipalId,
          canonicalField: "PHONE",
          value: "+919876543210",
          dataCategory: "CONTACT",
          sourceIds: [marketingSourceId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: amanPrincipalId,
          canonicalField: "CUSTOMER_ID",
          value: "cust-aman-44",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceSourceId],
          isPrimary: true,
        },
        {
          organizationId,
          dataPrincipalId: priyaPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Priya Shah",
          dataCategory: "IDENTITY",
          sourceIds: [ecommerceSourceId],
          isPrimary: true,
        },
        {
          organizationId: otherOrganizationId,
          dataPrincipalId: otherOrgPrincipalId,
          canonicalField: "FULL_NAME",
          value: "Other Org Person",
          dataCategory: "IDENTITY",
          sourceIds: [otherOrgSourceId],
          isPrimary: true,
        },
      ],
    });

    const ecomRecipient = await prisma.dataRecipient.create({
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
    await prisma.sharingActivity.createMany({
      data: [
        {
          organizationId,
          recipientId: ecomRecipient.id,
          purposeId: purpose.id,
          dataCategories: ["IDENTITY"],
          description: "E-commerce order communications",
          sourceIds: [ecommerceSourceId],
          startedAt: new Date(),
        },
        {
          organizationId,
          recipientId: marketingRecipient.id,
          purposeId: purpose.id,
          dataCategories: ["CONTACT"],
          description: "Marketing messages",
          sourceIds: [marketingSourceId],
          startedAt: new Date(),
        },
      ],
    });

    const aman = await principalSession(
      organizationId,
      amanPrincipalId,
      `aman-${randomUUID()}@portal.example.test`,
    );
    const priya = await principalSession(
      organizationId,
      priyaPrincipalId,
      `priya-${randomUUID()}@portal.example.test`,
    );
    const otherOrgPrincipal = await principalSession(
      otherOrganizationId,
      otherOrgPrincipalId,
      `other-${randomUUID()}@portal.example.test`,
    );
    const employee = await employeeSession(
      organizationId,
      ["CAN_VIEW_PRINCIPALS", "CAN_VIEW_ALL_PERSONAL_DATA"],
      "Portal viewer",
    );

    return {
      organizationId,
      otherOrganizationId,
      ecommerceSourceId,
      marketingSourceId,
      amanPrincipalId,
      priyaPrincipalId,
      nehaPrincipalId,
      otherOrgPrincipalId,
      aman,
      priya,
      otherOrgPrincipal,
      employee,
    };
  }

  beforeAll(async () => {
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
      await prisma.dataSourcePurpose.deleteMany({
        where: { dataSourceId: { in: [fixture.marketingSourceId] } },
      });
      await prisma.processingPurpose.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalDataField.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalContactEvent.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.principalAccount.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.dataPrincipal.deleteMany({
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
      // AuditEvent rows are immutable by design (a DB trigger rejects
      // DELETE -- the hash chain must never be tampered with), so they are
      // never cleaned up here. Every other e2e spec in this codebase
      // leaves them in place for the same reason.
      await prisma.counter.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  const authed = (session: { accessToken: string }) => ({
    Authorization: `Bearer ${session.accessToken}`,
  });

  describe("route-table assertion: no /api/me route can select a subject", () => {
    it("declares no @Param()/@Query()/@Body() on any MeController handler", () => {
      const forbiddenPrefixes = [
        `${RouteParamtypes.QUERY}:`,
        `${RouteParamtypes.PARAM}:`,
        `${RouteParamtypes.BODY}:`,
      ];
      const handlerNames = ["profile", "data", "sources", "recipients"];
      expect(handlerNames.length).toBeGreaterThan(0);
      for (const name of handlerNames) {
        const method = (
          MeController.prototype as unknown as Record<string, unknown>
        )[name];
        expect(typeof method).toBe("function");
        const metadata: Record<string, unknown> =
          Reflect.getMetadata(ROUTE_ARGS_METADATA, MeController, name) ?? {};
        const keys = Object.keys(metadata);
        // The only param this class is allowed to declare is the custom
        // @CurrentPrincipal() decorator, whose metadata key is prefixed
        // with a random uid, never a RouteParamtypes numeric value -- see
        // @nestjs/common's `createParamDecorator`/`assignCustomParameterMetadata`.
        // A route that later adds @Param()/@Query()/@Body() would add a
        // key starting with one of `forbiddenPrefixes` and this assertion
        // would fail.
        for (const key of keys) {
          for (const prefix of forbiddenPrefixes) {
            expect(key.startsWith(prefix)).toBe(false);
          }
        }
      }
    });

    it("registers no /api/me route with a path parameter in the Express router", async () => {
      const httpAdapter = app.getHttpAdapter().getInstance() as {
        _router: { stack: Array<{ route?: { path?: string } }> };
      };
      const meRoutes = httpAdapter._router.stack
        .map((layer) => layer.route?.path)
        .filter((path): path is string => typeof path === "string")
        .filter((path) => path.startsWith("/api/me"));
      expect(meRoutes.length).toBeGreaterThanOrEqual(4);
      for (const path of meRoutes) {
        expect(path.includes(":")).toBe(false);
      }
    });
  });

  describe("IDOR / audience boundary (Check 19)", () => {
    it("Aman's token on /me/data returns only Aman's values", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/me/data")
        .set(authed(fixture.aman));
      expect(response.status).toBe(200);
      const allValues = (
        response.body as Array<{ values: Array<{ value: string }> }>
      ).flatMap((group) => group.values.map((v) => v.value));
      expect(allValues).toContain("Aman Verma");
      expect(allValues).toContain("aman@example.com");
      expect(allValues).not.toContain("Priya Shah");
      expect(allValues).not.toContain("Other Org Person");
    });

    it("an employee token on /api/me/* is rejected with 401 (audience mismatch)", async () => {
      for (const path of [
        "/api/me/profile",
        "/api/me/data",
        "/api/me/sources",
        "/api/me/recipients",
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set(authed(fixture.employee));
        expect(response.status).toBe(401);
      }
    });

    it("a principal token on /api/principals/:id is rejected with 401 or 403", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/principals/${fixture.nehaPrincipalId}`)
        .set(authed(fixture.aman));
      expect([401, 403]).toContain(response.status);
    });

    it("a request with no token at all is rejected with 401", async () => {
      const response = await request(app.getHttpServer()).get("/api/me/data");
      expect(response.status).toBe(401);
    });

    it("cross-tenant: a principal from another organization is never reachable through Aman's own reads", async () => {
      const dataResponse = await request(app.getHttpServer())
        .get("/api/me/data")
        .set(authed(fixture.aman));
      const dataValues = (
        dataResponse.body as Array<{ values: Array<{ value: string }> }>
      ).flatMap((group) => group.values.map((v) => v.value));
      expect(dataValues).not.toContain("Other Org Person");

      const sourcesResponse = await request(app.getHttpServer())
        .get("/api/me/sources")
        .set(authed(fixture.aman));
      const sourceNames = (sourcesResponse.body as Array<{ name: string }>).map(
        (s) => s.name,
      );
      expect(sourceNames).not.toContain("Other org source");

      // The other-org principal's own token only ever sees her own data.
      const otherOrgResponse = await request(app.getHttpServer())
        .get("/api/me/data")
        .set(authed(fixture.otherOrgPrincipal));
      expect(otherOrgResponse.status).toBe(200);
      const otherOrgValues = (
        otherOrgResponse.body as Array<{ values: Array<{ value: string }> }>
      ).flatMap((group) => group.values.map((v) => v.value));
      expect(otherOrgValues).toContain("Other Org Person");
      expect(otherOrgValues).not.toContain("Aman Verma");
    });
  });

  describe("/me/profile", () => {
    it("returns Aman's own unmasked profile", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/me/profile")
        .set(authed(fixture.aman));
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(fixture.amanPrincipalId);
      // Never masked -- she is entitled to her own data in full.
      expect(response.body.displayName).toBe("Aman Verma");
      const emailField = (
        response.body.fields as Array<{ canonicalField: string; value: string }>
      ).find((f) => f.canonicalField === "EMAIL");
      expect(emailField?.value).toBe("aman@example.com");
    });
  });

  describe("/me/data", () => {
    it("groups values by DataCategory, names holding systems and purposes", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/me/data")
        .set(authed(fixture.aman));
      expect(response.status).toBe(200);
      const groups = response.body as Array<{
        dataCategory: string;
        values: Array<{
          canonicalField: string;
          value: string;
          sources: Array<{ name: string }>;
          purposes: string[];
        }>;
      }>;
      const contactGroup = groups.find((g) => g.dataCategory === "CONTACT");
      expect(contactGroup).toBeDefined();
      const email = contactGroup?.values.find(
        (v) => v.canonicalField === "EMAIL",
      );
      expect(email?.sources.map((s) => s.name)).toEqual(["E-commerce"]);
      // The e-commerce source has no purpose attached -- never a guessed one.
      expect(email?.purposes).toEqual([PURPOSE_NOT_CONFIGURED]);

      const phone = contactGroup?.values.find(
        (v) => v.canonicalField === "PHONE",
      );
      expect(phone?.sources.map((s) => s.name)).toEqual(["Marketing Database"]);
      expect(phone?.purposes).toEqual(["Customer Support"]);
    });
  });

  describe("/me/sources", () => {
    it("lists the distinct systems holding Aman's data", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/me/sources")
        .set(authed(fixture.aman));
      expect(response.status).toBe(200);
      const names = (response.body as Array<{ name: string }>).map(
        (s) => s.name,
      );
      expect(names.sort()).toEqual(["E-commerce", "Marketing Database"]);
    });
  });

  describe("/me/recipients", () => {
    it("Aman (sourced from both systems) sees both recipients", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/me/recipients")
        .set(authed(fixture.aman));
      expect(response.status).toBe(200);
      const names = (
        response.body as Array<{ recipient: { name: string } }>
      ).map((r) => r.recipient.name);
      expect(names.sort()).toEqual(["Ecom Processor", "Marketing Processor"]);
    });

    it("Priya (e-commerce only) sees no marketing recipient", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/me/recipients")
        .set(authed(fixture.priya));
      expect(response.status).toBe(200);
      const names = (
        response.body as Array<{ recipient: { name: string } }>
      ).map((r) => r.recipient.name);
      expect(names).toEqual(["Ecom Processor"]);
      expect(names).not.toContain("Marketing Processor");
    });
  });

  describe("PrincipalContactEvent / PERSONAL_DATA_VIEWED distinction", () => {
    it("does not write a PrincipalContactEvent or PERSONAL_DATA_VIEWED row for /me/* reads beyond the login event", async () => {
      const contactEventsBefore = await prisma.principalContactEvent.count({
        where: { dataPrincipalId: fixture.amanPrincipalId },
      });
      // Exactly the one row PrincipalAuthService.login wrote for the
      // fixture's own login call.
      expect(contactEventsBefore).toBe(1);

      const auditEventsBefore = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "PERSONAL_DATA_VIEWED",
        },
      });
      expect(auditEventsBefore).toBe(0);

      for (const path of [
        "/api/me/profile",
        "/api/me/data",
        "/api/me/sources",
        "/api/me/recipients",
      ]) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set(authed(fixture.aman));
        expect(response.status).toBe(200);
      }

      const contactEventsAfter = await prisma.principalContactEvent.count({
        where: { dataPrincipalId: fixture.amanPrincipalId },
      });
      expect(contactEventsAfter).toBe(contactEventsBefore);

      const auditEventsAfter = await prisma.auditEvent.count({
        where: {
          organizationId: fixture.organizationId,
          action: "PERSONAL_DATA_VIEWED",
        },
      });
      expect(auditEventsAfter).toBe(0);
    });
  });
});
